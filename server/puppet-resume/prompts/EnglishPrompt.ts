import { BulletPhaseWorkExperience, PromptContext } from './types';
import { buildSupplementCompanyPlan } from '../utils/supplementCompany';

function supplementalCompanyRulesEnglish(context: PromptContext): string {
  const plan = buildSupplementCompanyPlan(context.supplementSegments || [], {
    educations: context.profile.educations || [],
    location: context.profile.location,
  });
  const sequenceRules = plan.map((item) => item.format === 'inc'
    ? `- Supplemental role ${item.sequence} (${item.startDate} to ${item.endDate}): use a low-profile English company name ending in "Inc" or "Inc.".`
    : item.stage === 'in-school'
      ? `- Supplemental role 1 (${item.startDate} to ${item.endDate}): use a studio. This is an in-school period, so prefer a local studio in ${item.preferredLocation}.`
      : `- Supplemental role 1 (${item.startDate} to ${item.endDate}): use a studio. This starts in senior year or after graduation, so prefer a studio in Beijing, Shanghai, Guangzhou, Shenzhen, or Hangzhou.`
  ).join('\n');
  return `Number supplemental roles chronologically from oldest to newest and follow this exact company-name plan:
${sequenceRules}
A studio may be located anywhere, but its Chinese name must use "place name + studio name + 工作室". English companies must use a natural obscure-small-company style and end in Inc/Inc. Never use Chinese limited-company/group suffixes, public or famous companies, the candidate's real companies, or duplicate supplemental company names.`;
}

export function generateEnglishNonJobPrompt(context: PromptContext): string {
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
  } = context;

  const experienceRequirementStr = requiredExp.max !== 999
    ? `${requiredExp.min} years (maximum ${requiredExp.max} years)`
    : `at least ${requiredExp.min} years`;

  const timelineList = (allWorkExperiences || []).map((exp, idx) => {
    if (exp.type === 'existing') {
      const orig = (profile.workExperiences || [])[exp.index!];
      if (!orig) return `${idx + 1}. [Existing Missing] ${exp.startDate} to ${exp.endDate}`;
      return `${idx + 1}. [Existing] ${orig.company} | ${orig.startDate} to ${orig.endDate}`;
    }
    return `${idx + 1}. [Supplement] [Generate Company] | ${exp.startDate} to ${exp.endDate}`;
  }).join('\n');

  const supplementText = needsSupplement
    ? `Supplement is required: approximately ${supplementYears} years. Start date cannot be earlier than ${earliestWorkDate}.\nSegments:\n${(supplementSegments || []).map((seg, idx) => `- Segment ${idx + 1}: ${seg.startDate} to ${seg.endDate} (${seg.years} years)`).join('\n')}\nSupplement entries must be inserted into timeline, not appended blindly.\n${supplementalCompanyRulesEnglish(context)}`
    : 'No supplement is required. Output workExperience count must equal the existing count; no new role is allowed.';

  const seniorityRule = seniorityThresholdDate
    ? `Before ${seniorityThresholdDate}, Senior/Lead/Manager/Expert titles are forbidden. The earliest role cannot be management.`
    : 'Use seniority titles conservatively and only when timeline supports them.';

  const existingExpText = (profile.workExperiences || []).map((exp, idx) =>
    `- Experience ${idx + 1}: Company=${exp.company} (must preserve) | Time=${exp.startDate} to ${exp.endDate} (must preserve) | Original Title=${exp.jobTitle} | Business Direction=${exp.businessDirection}`
  ).join('\n');

  const techTrackPattern = /(backend|frontend|full\s*stack|software|engineer|developer|tech|platform|java|golang|python|node|\.net|react|vue|devops|data|architecture|研发|开发|后端|前端|技术|架构)/i;
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
    return `- Experience ${idx + 1}: originalTitle="${originalTitle || 'N/A'}" | ${shouldLock ? 'LOCK=must keep exactly (no rename/translate/downgrade)' : 'LOCK=rewritable on cross-function mismatch'}`;
  }).join('\n');

  return `
You are a world-class resume writer. This is Phase 1 (Non-Job Bullet): generate only non-bullet content.

### Language and priority
- Output must be strictly in English.
- Highest-priority user instruction: "${profile.aiMessage || 'None'}". If conflict exists, follow it.

### Target and constraints
- Target role: ${targetTitle}
- Experience requirement: ${job.experience} (${experienceRequirementStr})
- Candidate actual experience: ${actualExperienceText}
- Seniority rule: ${seniorityRule}
- Exception: seniority restrictions apply to supplemental or cross-function rewritten roles only; for existing same-track titles (e.g., Tech Lead), preserve original title and leadership level.

### Timeline and supplement policy
${supplementText}

Final timeline (must follow strictly):
${timelineList}

Existing experiences (for title-preservation decision):
${existingExpText || 'None'}

### Title lock list (pre-classified, MUST enforce)
${lockDecisions || 'None'}

### What to generate in this phase
1. Generate complete fields: position, yearsOfExperience, personalIntroduction, professionalSkills, workExperience.
2. Each workExperience item must include company, position, startDate, endDate.
3. Responsibilities are forbidden in this phase: each responsibilities must be [].
4. Position naming must follow old constraints:
  - concise professional title (ideally 3-4 words, <40 chars), remove suffixes/brackets/recruitment tokens.
  - The brevity constraint applies to resume-header position and to supplemental/renamed roles only.
  - For existing roles that are functionally close to the target track, preserve original title text even if it is longer than brevity guidance.
  - avoid direct job-ad style naming; keep resume-header style.
  - [HIGHEST-PRIORITY HARD GATE] if existing title is functionally close, preserve it (at most minimal normalization); even if other naming rules conflict, do not rename.
  - rename is allowed only on clear cross-function mismatch.
  - For existing titles like “Tech Lead / Technical Lead / Engineering Lead” in the same tech track, do not downgrade or homogenize to generic target titles (e.g., “Backend Developer”).
  - For existing and strongly-related roles, use the original user input (title/business direction/work content) as the expansion base; improve depth and metrics, but do not replace the narrative with a different function.
5. Company name handling must follow old constraints:
  - if original company name is already English, preserve exactly.
  - if original company name is Chinese or another language, preserve exactly; do not translate it.
  - do not invent unrelated company entities for existing roles.
6. personalIntroduction must be exactly 2 paragraphs in implied first-person style (no “I/My”), use no decimal years, and contain only 1-2 short <b> emphasis segments. Do not use <u> in the introduction.
7. professionalSkills must have exactly 4 categories with 4 items each. This is not a keyword list: each item must combine a capability or method with a concrete work situation or deliverable, making the candidate's practical value immediately clear.
   - Never return standalone tools, platforms, methodologies, or generic soft-skill labels. Do not output isolated items such as “LinkedIn,” “Structured Interview,” “Talent Assessment,” “Recruitment Analytics,” or “PowerPoint.”
   - Use compact, substantive phrases rather than full responsibility sentences. Aim for the information density of “Offer negotiation, hiring-bar alignment, executive hiring updates, and employee-complaint resolution,” “Attrition analysis and recruiting-funnel diagnosis,” “Blended sourcing across job boards and technical communities,” or “STAR-based behavioral interviewing and candidate evaluation.”
   - Categories must be role-specific and meaningful. Ground them in the candidate's experience and the target JD, and do not invent precise performance numbers in this section.
8. Outside the 1-2 <b> segments in personalIntroduction, do not use <b>, <u>, or markdown emphasis in any phase-one field.
9. Output JSON only.
10. For experiences marked as "LOCK=must keep exactly", output workExperience.position must exactly match original title text (except trimming spaces); no translation, no semantic rename, no seniority downgrade.

### Mandatory title-preservation workflow (must execute)
For each existing experience, perform this decision in order:
1. Decide whether original title is functionally close to target role (same core track/domain).
2. If functionally close: output position must preserve original title text (only minimal normalization allowed, no semantic renaming).
2.1 If original title is an established English role title (e.g., Tech Lead), preserve original wording and leadership semantics; do not translate, downgrade, or homogenize.
3. Only when clearly cross-function mismatch, renaming is allowed.
4. Final self-check before output: if any functionally-close existing title was renamed, rewrite internally and fix before emitting JSON.

Hard examples (must follow):
- Target role ".NET Developer", original title "Java Developer" => same backend track, must keep "Java Developer" (do NOT rename to .NET).
- Target role "Backend Developer", original title "Tech Lead" => includes backend scope and is same track; must keep "Tech Lead" or a highly similar title (e.g., "Backend Tech Lead"), and must not downgrade to plain "Backend Developer".
- Target role "Backend Engineer", original title "Golang Engineer" => same backend track, must keep original title.
- Target role "Backend Engineer", original title "Product Manager" => cross-function mismatch, renaming is allowed.

### Output JSON template
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
`;
}

export function generateEnglishJobBulletPrompt(
  context: PromptContext,
  workExperiences: BulletPhaseWorkExperience[]
): string {
  const lines = workExperiences.map((exp, idx) => `
- Experience ${idx + 1}: ${exp.company} | ${exp.position} | ${exp.startDate} to ${exp.endDate}`).join('');

  const anchors = workExperiences.map((exp, idx) => {
    const original = (context.profile.workExperiences || []).find((item: any) => {
      return String(item?.startDate || '').trim() === String(exp.startDate || '').trim()
        && String(item?.endDate || '').trim() === String(exp.endDate || '').trim()
        && String(item?.company || '').trim() === String(exp.company || '').trim();
    });

    if (!original) {
      return `- Experience ${idx + 1} source anchor: none (likely supplemental role)`;
    }

    return `- Experience ${idx + 1} source anchor: originalTitle=${original.jobTitle || 'N/A'} | businessDirection=${original.businessDirection || 'N/A'} | originalWorkContent=${original.workContent || 'N/A'}`;
  }).join('\n');

  return `
You are a world-class resume writer. This is Phase 2 (Job Bullet): generate only responsibilities.

### Language and priority
- Output strictly in English.
- Target role: ${context.targetTitle}
- Highest-priority user instruction: "${context.profile.aiMessage || 'None'}" (must be satisfied when present)

### Fixed work experience skeleton (must not be changed)
The company / position / startDate / endDate below are finalized for this phase. Only responsibilities may be generated:
${lines}

### Original source anchors (must be used for related-role expansion)
${anchors}

### Strict requirements
1. Return workExperience in the same order and same count as input.
2. Generate exactly 8 responsibilities for each role.
3. Responsibilities must be impact-first, quantified where possible, and tailored to ${context.targetTitle}.
3.1 For existing experiences that are strongly related to the target track (e.g., Backend Engineer, Java/Golang/Python backend roles, Tech Lead/Technical Lead):
  - Expand from original source anchors (original title, business direction, work content) rather than replacing with a new function narrative.
  - Keep the same role semantics and strengthen with clearer ownership, architecture depth, and quantified outcomes.
  - If original content includes leadership/technical-leading signals, preserve that leadership level and do not downgrade to an individual-contributor-only narrative.
4. Use strong action verbs; avoid weak phrasing like “Responsible for” or “Helped with”.
5. Follow STAR logic and keep each bullet outcome-oriented.
5.1 Prefer ${Math.floor((context.maxCharPerLine || 90) * 1.7)}-${Math.floor((context.maxCharPerLine || 90) * 2.1)} visible characters after removing HTML tags. Count and verify every bullet before the first response; do not make bullets so short that they occupy one line or so long that they spill into a third line.
6. Do not use <b> in any responsibility. Bold emphasis is reserved for the personal introduction.
7. In each work experience, select only 1-2 of the most important bullets for underline emphasis. Each selected bullet must contain exactly one short <u> segment around a key metric or key phrase, never the full sentence. The underlined phrase does not have to be numeric.
7.1 Avoid acronym-with-parentheses style for professional methodologies (write full terms when possible).
8. Do not add, remove, or rewrite non-responsibility fields.
9. Even if context is sparse, still provide 8 high-quality bullets. Every bullet must fill approximately two lines without spilling into a clear third line.

### Output format (JSON only)
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
