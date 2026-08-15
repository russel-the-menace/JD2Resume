import { BulletPhaseWorkExperience, PromptContext } from './types';
import { buildSupplementCompanyPlan } from '../utils/supplementCompany';

function supplementalCompanyRulesChinese(context: PromptContext): string {
  const plan = buildSupplementCompanyPlan(context.supplementSegments || [], {
    educations: context.profile.educations || [],
    location: context.profile.location,
  });
  const sequenceRules = plan.map((item) => item.format === 'inc'
    ? `- 虚拟经历 ${item.sequence}（${item.startDate} 至 ${item.endDate}）：使用英文小公司名，以 "Inc" 或 "Inc." 结尾。`
    : item.stage === 'in-school'
      ? `- 虚拟经历 1（${item.startDate} 至 ${item.endDate}）：使用工作室；该阶段在校，优先使用${item.preferredLocation}的本地工作室。`
      : `- 虚拟经历 1（${item.startDate} 至 ${item.endDate}）：使用工作室；该阶段已到大四或毕业，优先使用北京、上海、广州、深圳、杭州的工作室。`
  ).join('\n');
  return `补足经历按时间从早到晚编号，必须执行以下公司名计划：
${sequenceRules}
工作室可以位于任何地方，但名称必须为“地名+名称+工作室”。英文公司必须使用自然的低知名度小公司风格并以 Inc/Inc. 结尾。禁止“有限公司/集团/股份有限公司”，禁止上市公司、知名品牌、候选人的真实公司名以及补足公司间重名。`;
}

export function generateChineseNonJobPrompt(context: PromptContext): string {
  const {
    targetTitle,
    job,
    requiredExp,
    profile,
    needsSupplement,
    actualExperienceText,
    supplementYears,
    supplementSegments,
    allWorkExperiences,
    earliestWorkDate,
    seniorityThresholdDate,
    maxCharPerLine,
  } = context;

  let seniorityRule = requiredExp.min <= 5
    ? '严禁使用“高级/资深/专家/负责人/主管”等高职级称谓。'
    : '可谨慎使用“高级”，仅在履历与时间线支撑时使用“资深/负责人/主管”。';

  if (seniorityThresholdDate) {
    seniorityRule += ` 且在 ${seniorityThresholdDate} 之前的经历中，严禁出现高级或管理职称。最早一段经历不得是管理岗。`;
  }

  seniorityRule += '【豁免条款】上述职级限制仅用于补充经历或跨职能改写；对“现有且同赛道”的原岗位名（如 Tech Lead/技术负责人）必须保留，禁止因职级限制而降级改名。';

  const timelineList = (allWorkExperiences || []).map((exp, idx) => {
    if (exp.type === 'existing') {
      const orig = (profile.workExperiences || [])[exp.index!];
      if (!orig) return `${idx + 1}. [现有缺失] (${exp.startDate} 至 ${exp.endDate})`;
      return `${idx + 1}. [现有] ${orig.company} | ${orig.startDate} 至 ${orig.endDate}`;
    }
    return `${idx + 1}. [补充] (生成公司) | ${exp.startDate} 至 ${exp.endDate}`;
  }).join('\n');

  const supplementText = needsSupplement
    ? `需要补充约 ${supplementYears} 年经历。开始时间不得早于 ${earliestWorkDate}。\n补充片段：\n${(supplementSegments || []).map((seg, idx) => `- 片段${idx + 1}: ${seg.startDate} 至 ${seg.endDate}（${seg.years}年）`).join('\n')}\n补充经历必须插入时间线中，不得全部堆在末尾。\n${supplementalCompanyRulesChinese(context)}`
    : '无需补充经历。输出工作经历条数必须与用户现有条数一致，严禁新增岗位。';

  const existingExpText = (profile.workExperiences || []).map((exp, idx) =>
    `- 经历${idx + 1}: 公司=${exp.company}（必须保留） | 工作时间=${exp.startDate} 至 ${exp.endDate}（必须保留） | 原职位=${exp.jobTitle} | 业务方向=${exp.businessDirection}`
  ).join('\n');

  const techTrackPattern = /(后端|前端|全栈|研发|开发|技术|架构|算法|数据|运维|测试|java|golang|python|node|\.net|react|vue|engineer|developer|backend|frontend|full\s*stack|software|platform|tech)/i;
  const leadTitlePattern = /(tech\s*lead|technical\s*lead|engineering\s*lead|team\s*lead|lead\s*engineer|技术负责人|技术主管|研发负责人|技术经理|技术组长|团队负责人)/i;
  const targetIsTechTrack = techTrackPattern.test(String(targetTitle || ''));

  const lockDecisions = (profile.workExperiences || []).map((exp, idx) => {
    const originalTitle = String(exp?.jobTitle || '').trim();
    const businessDirection = String(exp?.businessDirection || '');
    const workContent = String(exp?.workContent || '');
    const expIsTechRelated = techTrackPattern.test(`${originalTitle} ${businessDirection} ${workContent}`);
    const shouldLock = !!originalTitle && (
      (targetIsTechTrack && expIsTechRelated) ||
      (leadTitlePattern.test(originalTitle) && (targetIsTechTrack || expIsTechRelated))
    );
    return `- 经历${idx + 1}: 原职位="${originalTitle || '无'}" | ${shouldLock ? 'LOCK=必须原样保留（禁止改名/翻译/降级）' : 'LOCK=可按跨职能规则改写'}`;
  }).join('\n');

  return `
你是顶级中文简历顾问。当前为 Phase 1（Non-Job Bullet）：只生成非职责正文内容。

### 语言与最高优先级
- 全部字段使用简体中文；现有且同赛道的行业通用英文职称（如 Tech Lead、Staff Engineer）必须保留英文原文，不得强制翻译或替换。
- 用户最高指令："${profile.aiMessage || '无'}"。若与其他规则冲突，优先满足该指令。

### 目标与背景
- 目标岗位：${targetTitle}
- JD经验要求：${job.experience}（最低 ${requiredExp.min} 年）
- 用户实际经验：${actualExperienceText}
- 职级规则：${seniorityRule}

### 时间线与补充策略
${supplementText}

最终时间线（必须严格遵循）：
${timelineList}

现有经历信息（公司名和起止时间不可改，职位可按既有锁定规则处理）：
${existingExpText || '无'}

### 标题保留锁定清单（系统预判，必须硬执行）
${lockDecisions || '无'}

### 本阶段输出
- 生成 position、yearsOfExperience、personalIntroduction、professionalSkills、workExperience。
- 每条 workExperience 必须包含 company、position、startDate、endDate，且 responsibilities 必须为 []；本阶段严禁生成职责正文。
- 只输出合法 JSON，不作解释，也不输出任何点数/字数计算过程。

### 职位决策流程（逐条执行）
1. 简历抬头 position 控制在 9 字以内，去掉括号、破折号、招聘术语和宽泛称呼，必须体现具体职能（如“后端开发”“新媒体运营”“财务会计”）。
2. 对每条现有经历，先判断原职位与目标岗位是否同一职能赛道。
3. 同赛道：必须优先保留原职位文本，仅允许首尾空格等极小规范化；不受 9 字限制，不得因长度、命名美化或其他命名规则改名。行业通用英文职称必须保持原文和大小写语义，不得翻译、同义替换、降级或同化，除非用户最高指令明确要求翻译。
4. 若原职位为 Tech Lead/技术负责人/研发负责人等技术管理称谓且属于同赛道，必须原样保留或仅作极小规范化，不得降级为普通执行岗。
5. 只有明显跨职能不匹配时才允许改写职位；9 字限制仅适用于补充经历或跨职能改写后的经历。
6. 对现有且强相关的经历，以用户原始输入为扩展基底，保留原岗位语义和业务方向，在此基础上补充更强的数据化成果与高阶职责，禁止改成另一职能叙事。
7. 锁定清单中标记“LOCK=必须原样保留”的 position 必须与原职位逐字一致（仅允许首尾空格清理），禁止改名、翻译、同义替换或降级（如 Tech Lead -> 后端开发）。
8. 输出前逐条核对；任何同赛道职位被改名，都必须先内部修正。

同赛道判定示例（硬性执行）：
- 目标“.NET开发工程师”，原岗位“Java Developer/Java工程师” => 同属后端赛道，必须保留原岗位名，不得改成“.NET”。
- 目标“后端开发”，原岗位“Tech Lead/技术负责人” => 包含后端职能，视为同赛道，必须保留原名或使用高度相似名称（如“后端Tech Lead”），不得降级改写为普通“后端开发”。
- 目标“后端开发”，原岗位“Golang工程师/Python后端开发” => 同赛道，必须保留原岗位名。
- 目标“后端开发”，原岗位“产品经理” => 跨赛道，允许改写。

### 个人介绍
- 仅两段，省略主语，禁止“我/本人/该候选人”；年限必须为整数，不得出现小数年限。
- 视觉点数（中文1，英数0.5）：第一段 ${Math.floor((maxCharPerLine || 44) * 2.7)}-${Math.floor((maxCharPerLine || 44) * 3.1)}，第二段 ${Math.floor((maxCharPerLine || 44) * 1.3)}-${Math.floor((maxCharPerLine || 44) * 1.7)}。
- 全文仅选择 1-2 个最重要的短语用成对的 <b>...</b> 加深，禁止 <u>。示例：“具备<b>跨团队交付能力</b>，能够……”

### 专业技能
- 必须恰好 4 组，每组恰好 4 项；分类标题必须岗位相关且有辨识度，禁止“其他”“综合能力”等空泛标题。
- 每项写成“能力/方法 + 工作场景或交付动作”，控制在 18-42 个视觉点；使用紧凑能力短语而非完整职责句，让招聘者看出能解决的问题、采用的方法和交付动作。
- 禁止仅输出技能、工具、招聘平台、方法名或空泛能力词；“BOSS直聘”“结构化面试”“人才测评”“招聘数据分析”“PowerPoint”等只能放在具体工作场景中，不能孤立出现。
- 信息密度参照：“沟通与影响力：和候选人谈Offer、与业务部门对齐用人标准、向管理层汇报方案”“数据分析与逻辑思维：离职原因分析与招聘漏斗诊断”“招聘渠道与拓展：主流招聘软件与国内外技术论坛的渠道组合”“招聘实操与评估：基于STAR行为面试完成人才评估”。
- 优先从候选人经历和目标 JD 提取真实场景，不得凭空捏造具体业绩数字。

除 personalIntroduction 的 1-2 对 <b>...</b> 外，所有其他字段禁止出现 <b>、<u> 或 Markdown 强调标记。

### 输出 JSON 模板
{
  "position": "...",
  "yearsOfExperience": ${context.finalTotalYears},
  "personalIntroduction": "...",
  "professionalSkills": [
    { "title": "...", "items": ["...", "...", "...", "..."] },
    { "title": "...", "items": ["...", "...", "...", "..."] },
    { "title": "...", "items": ["...", "...", "...", "..."] },
    { "title": "...", "items": ["...", "...", "...", "..."] }
  ],
  "workExperience": [
    {
      "company": "...",
      "position": "...",
      "startDate": "...",
      "endDate": "...",
      "responsibilities": []
    }
  ]
}

### 输出前硬检查
responsibilities 全部为 []；公司名、起止时间、锁定职位未改；简介恰好两段且仅含 1-2 对 <b>...</b>；技能恰好 4×4；最终内容是纯 JSON。
`;
}

export function generateChineseJobBulletPrompt(
  context: PromptContext,
  workExperiences: BulletPhaseWorkExperience[]
): string {
  const lines = workExperiences.map((exp, idx) => `
- 经历${idx + 1}：${exp.company} | ${exp.position} | ${exp.startDate} 至 ${exp.endDate}`).join('');

  const anchors = workExperiences.map((exp, idx) => {
    const original = (context.profile.workExperiences || []).find((item: any) => {
      return String(item?.startDate || '').trim() === String(exp.startDate || '').trim()
        && String(item?.endDate || '').trim() === String(exp.endDate || '').trim()
        && String(item?.company || '').trim() === String(exp.company || '').trim();
    });

    if (!original) {
      return `- 经历${idx + 1}原始锚点：无（可能为补充经历）`;
    }

    return `- 经历${idx + 1}原始锚点：原职位=${original.jobTitle || '无'} | 业务方向=${original.businessDirection || '无'} | 原始工作内容=${original.workContent || '无'}`;
  }).join('\n');

  return `
你是一位顶级简历写作专家。当前是 Phase 2（Job Bullet）：仅生成第一阶段已确定经历的职责。已有公司名和工作时间必须保持不变，职位名称已由第一阶段确定。

### 语言与风格
- 全中文输出。
- 但对“现有且同赛道”的英文标准职称（如 Tech Lead），允许并建议在职责语义中保持该职级语义，不得降级为普通执行岗口径。
- 目标岗位：${context.targetTitle}
- 用户最高指令："${context.profile.aiMessage || '无'}"（若不为空，必须严格满足）

### 输入的工作经历（禁止改动基础信息）
以下经历的 company / position / startDate / endDate 已定稿，严禁修改；本阶段只输出 responsibilities：
${lines}

### 现有经历原始输入锚点（用于“基于原输入扩展”）
${anchors}

### 生成要求（严格）
1. 按原顺序返回 workExperience，条目数量必须与输入一致。
2. 每段经历必须生成且仅生成 8 条 responsibilities。
3. 每条职责必须围绕目标岗位并按重要性排序，采用 STAR 思路说明行动、职责和结果；只有数字能让外部招聘者明显看懂工作规模、效率或业务价值时才量化，不要求每条都包含数字，也禁止 8 条全部堆叠数字。
3.1 对“现有且强相关（同赛道）”经历（例如：后端开发、Java/Golang/Python后端、Tech Lead/技术负责人）：
  - 必须以原始锚点中的职位语义、业务方向、既有工作内容为基础进行扩展；
  - 允许增强表达与补充量化结果，但禁止改写成另一职能叙事；
  - 若原始内容出现技术领导职责（架构决策、技术评审、带队推进等），扩展后必须保留对应领导属性，不得降级为纯执行岗。
4. **数字质量规则**：
  - 有效数字应直接说明工作量、覆盖规模、效率、周期或转化价值，并能脱离公司内部系统被理解。例如“每周筛选400+份、初筛通过率18%、节省面试官时间35%”形成清晰价值链。
  - 禁止主观评分、装饰性精确值或外部无法判断意义的内部指标，例如“候选人满意度4.6/5”；不得为了显得专业而编造数字。
  - 没有可信数字时，直接写清职责边界、方法、复杂度和协作价值；禁止空泛表达（如无事实支撑的“大幅提升/显著优化”）。
5. 每条职责视觉字数点数（中文1，英数0.5）优先控制在 ${Math.floor((context.maxCharPerLine || 42) * 1.7)} ~ ${Math.floor((context.maxCharPerLine || 42) * 2.1)}，首次输出前逐条自检；不要短到只占一行，也不要扩展成第三行。
6. 工作职责中禁止使用任何 <b> 加深标记；加深仅用于个人介绍。
7. 每段工作经历仅选择 1-2 条最重要的职责使用下划线；每条被选中的职责只能有一处 <u>，且只包裹简短的关键数据或关键短语，不得给整句加下划线。下划线内容不要求一定是数字。
8. 仅在 responsibilities 写内容，严禁新增字段、改写职位或改写时间。
9. 每条必须稳定占据接近两行，第二行不得过短，也不得扩展成明显的第三行。
10. 若信息较少也必须补足 8 条高质量职责。

### 输出格式（JSON Only）
{
  "workExperience": [
    {
      "company": "...",
      "position": "...",
      "startDate": "...",
      "endDate": "...",
      "responsibilities": ["...", "...", "...", "...", "...", "...", "...", "..."]
    }
  ]
}
`;
}
