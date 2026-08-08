import { ui } from './ui';
import { normalizeLanguage } from './i18n/index';

export type DecisionScenario = 'GENERATE_SCAN' | 'GENERATE_TEXT' | 'REFINE' | 'PROFILE_UPDATE';

export interface DecisionConfig {
  title: string;
  content: string;
  confirmText: string;
  cancelText: string;
  detectedLang: 'chinese' | 'english';
}

export const ResumeDecision = {
  /**
   * Analyze text content to determine language
   * Rule: > 60% Chinese characters (excluding code blocks/symbols) -> Chinese
   */
  analyzeTextLanguage(text: string): 'chinese' | 'english' {
    if (!text) return 'english'; // Default

    // 1. Remove code blocks (```...```)
    let cleanText = text.replace(/```[\s\S]*?```/g, '');
    
    // 2. Remove common special characters/punctuations to focus on words
    cleanText = cleanText.replace(/[0-9\s\r\n`~!@#$%^&*()_+\-=\[\]{};':",./<>?|]/g, '');

    if (cleanText.length === 0) return 'english';

    // 3. Count Chinese characters
    const chineseMatches = cleanText.match(/[\u4e00-\u9fa5]/g);
    const chineseCount = chineseMatches ? chineseMatches.length : 0;
    
    // 4. Calculate ratio
    const ratio = chineseCount / cleanText.length;

    return ratio > 0.6 ? 'chinese' : 'english';
  },

  /**
   * Get Modal Configuration based on scenario and detected language
   */
  getDecisionConfig(scenario: DecisionScenario, detectedLang: 'chinese' | 'english'): DecisionConfig {
    const app = getApp<any>();
    const uiLang = normalizeLanguage(app && app.globalData ? app.globalData.language : 'Chinese');
    const isUIChinese = (uiLang === 'Chinese' || uiLang === 'AIChinese');
    const isContentChinese = detectedLang === 'chinese';

    let config: DecisionConfig = {
      title: '',
      content: '',
      confirmText: '', // Right button (Recommended)
      cancelText: '',  // Left button (Alternative)
      detectedLang
    };

    switch (scenario) {
      case 'GENERATE_SCAN': // 1. 截图生成
      case 'GENERATE_TEXT': // 2. 文字生成
        config.title = isUIChinese ? '生成确认' : 'Generation Confirm';
        
        // Content
        if (scenario === 'GENERATE_TEXT') {
            if (isUIChinese) {
                config.content = isContentChinese 
                  ? '检测到您的职位要求主要是中文。建议生成中文简历以获得最佳匹配。'
                  : '检测到您的职位要求主要是英文。建议生成英文简历以获得最佳匹配。';
            } else {
                config.content = isContentChinese
                  ? 'Detected Chinese content. We recommend generating a Chinese resume.'
                  : 'Detected English content. We recommend generating an English resume.';
            }
        } else {
             if (isUIChinese) {
                config.content = isContentChinese 
                  ? '识别到中文简历内容。建议生成中文简历。'
                  : '识别到英文简历内容。建议生成英文简历。';
             } else {
                config.content = isContentChinese
                  ? 'Detected Chinese resume content. We recommend generating a Chinese resume.'
                  : 'Detected English resume content. We recommend generating an English resume.';
             }
        }

        // Buttons
        if (isUIChinese) {
            // Confirm: Recommended (Same as Content); Cancel: Alternative (Cross)
            config.confirmText = isContentChinese ? '生成中文版' : '生成英文版';
            config.cancelText = isContentChinese ? '生成英文版' : '生成中文版';
        } else {
            config.confirmText = isContentChinese ? 'Gen Chinese' : 'Gen English';
            config.cancelText = isContentChinese ? 'Gen English' : 'Gen Chinese';
        }
        break;

      case 'REFINE': // 3. 简历润色
        config.title = isUIChinese ? '润色模式' : 'Refine Mode';
        
        if (isUIChinese) {
            config.content = isContentChinese
              ? '检测到中文简历。建议进行中文润色与增强。'
              : '检测到英文简历。建议进行英文润色与增强。';
            
            config.confirmText = isContentChinese ? '中文润色' : '英文润色';
            config.cancelText = isContentChinese ? '英文润色' : '中文润色';
        } else {
            config.content = isContentChinese
              ? 'Detected Chinese resume. We recommend Chinese refinement.'
              : 'Detected English resume. We recommend English refinement.';
            
            config.confirmText = isContentChinese ? 'Enhance (CN)' : 'Enhance (EN)';
            config.cancelText = isContentChinese ? 'Enhance (EN)' : 'Enhance (CN)';
        }
        break;

      case 'PROFILE_UPDATE': // 4. 更新资料
        config.title = isUIChinese ? '解析成功' : 'Parse Success';
        
        if (isUIChinese) {
            config.content = isContentChinese
              ? '已提取中文资料。推荐同步更新生成双语档案，以便投递不同外企职位。'
              : '已提取英文资料。推荐同步更新生成双语档案，以便投递不同外企职位。';
            
            config.confirmText = '更新中英双语';
            config.cancelText = isContentChinese ? '仅更新中文' : '仅更新英文';
        } else {
            config.content = isContentChinese
              ? 'Chinese profile extracted. Recommend updating both versions for international opportunities.'
              : 'English profile extracted. Recommend updating both versions for international opportunities.';
            
             config.confirmText = 'Update Both';
             config.cancelText = isContentChinese ? 'Update CN Only' : 'Update EN Only';
        }
        break;
    }

    return config;
  },

  /**
   * Execute the decision flow: Show Modal -> Wait User Input -> Return Result
   */
  async decide(scenario: DecisionScenario, detectedLang: 'chinese' | 'english'): Promise<string | null> {
    const config = this.getDecisionConfig(scenario, detectedLang);
    
    return new Promise((resolve) => {
      ui.showModal({
        title: config.title,
        content: config.content,
        confirmText: config.confirmText,
        cancelText: config.cancelText,
        showCancel: true,
        success: (res) => {
          if (res.confirm) {
            // Right Button: Always "Recommended/Combined/SameLang"
            if (scenario === 'PROFILE_UPDATE') {
              resolve('combined');
            } else {
              resolve(detectedLang);
            }
          } else if (res.cancel) {
            if ((res as any).isMask) {
              resolve(null);
              return;
            }
            // Left Button: Always "Alternative/Single/CrossLang"
            if (scenario === 'PROFILE_UPDATE') {
              resolve('single');
            } else {
              // Swap language
              const otherLang = detectedLang === 'english' ? 'chinese' : 'english';
              resolve(otherLang);
            }
          } else {
             // Dismissed
             resolve(null);
          }
        }
      });
    });
  }
};
