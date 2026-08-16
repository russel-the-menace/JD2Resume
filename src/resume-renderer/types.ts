export type RenderRevision = number;
export type ResumeLanguage = 'chinese' | 'english';

export interface ResumeBasics {
  fullName?: string; firstName?: string; lastName?: string; role?: string; email?: string;
  phone?: string; location?: string; gender?: string; website?: string; photoUrl?: string;
  wechat?: string; linkedin?: string; whatsapp?: string; telegram?: string;
  headerHeight?: number;
}
export interface ResumeExperience { id: string | number; role?: string; company?: string; location?: string; start?: string; end?: string; current?: boolean; bullets?: string[]; }
export interface ResumeEducation { id: string | number; school?: string; degree?: string; location?: string; start?: string; end?: string; }
export interface ResumeCertificate { id?: string | number; name?: string; issuer?: string; date?: string; }
export interface ResumeSkillCategory { title: string; items: string[]; }
export interface ResumeSkills { expertise?: string; tools?: string; categories?: ResumeSkillCategory[]; titleItemGap?: number; titleOffsetX?: number; [key: string]: unknown; }
export interface ResumeData { basics: ResumeBasics; summary?: string; experience: ResumeExperience[]; education: ResumeEducation[]; skills?: ResumeSkills; certificates?: ResumeCertificate[]; }

export interface RendererResumeDocument {
  id: string;
  documentName: string;
  language: ResumeLanguage;
  data: ResumeData;
  template: 'profile';
  accent: string;
  customSections: string[];
  customContent: Record<string, unknown>;
  sectionOrder: string[];
  sectionOrderCustomized: boolean;
}
export interface RenderSnapshot { revision: RenderRevision; snapshotHash: string; rendererVersion: string; document: RendererResumeDocument; }

export type ResumeBlockKind = 'header' | 'section-heading' | 'summary-paragraph' | 'education-entry' | 'experience-heading' | 'experience-bullet' | 'skill-category-heading' | 'skill-item' | 'certificate-item';
export interface ResumeBlockDescriptor { id: string; kind: ResumeBlockKind; sourcePath: string; order: number; keepWithNext: number; atomic: boolean; gapBeforeToken: string; gapAfterToken: string; }
export interface MeasuredResumeBlock extends ResumeBlockDescriptor { width: number; height: number; naturalTop: number; naturalBottom: number; computedFontSize: number; computedLineHeight: number; }

export type LayoutPolicy = typeof import('./constants').PUPPET_TUNING_STRATEGIES[number]['id'];
export interface LayoutTuningV2 { policy: LayoutPolicy; sectionGapDelta: number; lineHeightDelta: number; fontSizeDelta: number; }
export interface PagePlanBlock { id: string; gapBefore: number; }
export interface PagePlanPage { pageNumber: number; blockIds: string[]; blocks: PagePlanBlock[]; fillRatio: number; contentFillRatio: number; usedHeight: number; contentHeight: number; }
export interface PagePlanV2 { schemaVersion: 2; revision: number; snapshotHash: string; rendererVersion: string; pageWidth: 794; pageHeight: 1123; contentWidth: 694; contentHeight: 1043; tuning: LayoutTuningV2; pages: PagePlanPage[]; blockOrder: string[]; createdAt: number; }
export interface PageQuality { pageNumber: number; fillRatio: number; usedHeight: number; overflowX: number; overflowY: number; orphanBlockIds: string[]; duplicateBlockIds: string[]; missingBlockIds: string[]; }
export interface LayoutAttemptReport { attempt: number; policy: LayoutPolicy; tuning: LayoutTuningV2; pageCount: number; targetPageCount: number; valid: boolean; pages: PageQuality[]; failureCodes: string[]; }
export interface LayoutReportV2 { schemaVersion: 2; revision: number; snapshotHash: string; rendererVersion: string; durationMs: number; fontFamily: string; fontReady: boolean; imageCount: number; attempts: LayoutAttemptReport[]; acceptedAttempt: number | null; failureCode: string | null; }
export interface MeasurementResult { blocks: MeasuredResumeBlock[]; contentBottom: number; expectedBlockIds: string[]; tuning: LayoutTuningV2; }
