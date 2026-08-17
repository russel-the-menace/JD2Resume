import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CSSProperties } from 'react';
import { ResumePreviewFrame } from './components/resume-preview/ResumePreviewFrame';
import { LoadingOverlay } from './components/LoadingOverlay';
import type { LayoutReportV2, PagePlanV2, RendererResumeDocument } from './resume-renderer/types';
import { A4_HEIGHT_PX, A4_WIDTH_PX, DEFAULT_HEADER_HEIGHT_PX, DEFAULT_LAYOUT_FONT_SIZE_PX, DEFAULT_LAYOUT_LINE_HEIGHT_PX, DEFAULT_LAYOUT_TITLE_MARGIN_BOTTOM_PX, DEFAULT_LAYOUT_TITLE_MARGIN_TOP_PX, DEFAULT_SKILL_TITLE_GAP_PX, DEFAULT_SKILL_TITLE_OFFSET_X_PX, MAX_HEADER_HEIGHT_PX, MAX_LAYOUT_FONT_SIZE_PX, MAX_LAYOUT_LINE_HEIGHT_PX, MAX_LAYOUT_TITLE_MARGIN_BOTTOM_PX, MAX_LAYOUT_TITLE_MARGIN_TOP_PX, MAX_SKILL_TITLE_GAP_PX, MAX_SKILL_TITLE_OFFSET_X_PX, MIN_HEADER_HEIGHT_PX, MIN_LAYOUT_FONT_SIZE_PX, MIN_LAYOUT_LINE_HEIGHT_PX, MIN_LAYOUT_TITLE_MARGIN_BOTTOM_PX, MIN_LAYOUT_TITLE_MARGIN_TOP_PX, MIN_SKILL_TITLE_GAP_PX, MIN_SKILL_TITLE_OFFSET_X_PX, PREVIEW_PAGE_GAP_PX } from './resume-renderer/constants';
import { hideOneBulletForSkills, MAX_SKILL_FIT_HIDES, skillsStartOnNewPage } from './resume-renderer/fitSkills';
import {
  AlignLeft,
  ArrowLeft,
  Award,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileUp,
  FileText,
  FolderOpen,
  GraduationCap,
  GripVertical,
  LayoutGrid,
  KeyRound,
  LogIn,
  Link,
  Linkedin,
  ListChecks,
  LoaderCircle,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquareText,
  Minus,
  MoreHorizontal,
  Palette,
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  Phone,
  Plus,
  Redo2,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  Undo2,
  UserPlus,
  UsersRound,
  Upload,
  UserRound,
  WandSparkles,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

const initialResume = {
  basics: {
    fullName: '',
    firstName: 'Jordan',
    lastName: 'Lee',
    role: 'Senior Product Designer',
    email: 'jordan.lee@email.com',
    phone: '(415) 555-0148',
    location: 'San Francisco, CA',
    gender: 'Male',
    website: 'jordanlee.design',
    photoUrl: '',
  },
  summary:
    'Product designer with 7+ years of experience turning complex workflows into clear, high-impact products. Skilled at connecting customer insight, business goals, and design systems to ship experiences that scale.',
  experience: [
    {
      id: 1,
      role: 'Senior Product Designer',
      company: 'Northwind Labs',
      location: 'San Francisco, CA',
      start: 'Mar 2022',
      end: 'Present',
      current: true,
      bullets: [
        'Led end-to-end design for an enterprise analytics suite used by 18K+ weekly users, improving task completion by 27%.',
        'Built a shared design system across three product teams, reducing design-to-development time by 35%.',
        'Partnered with research and data teams to launch a new onboarding flow that increased activation by 16%.',
      ],
    },
    {
      id: 2,
      role: 'Product Designer',
      company: 'Mosaic Health',
      location: 'Oakland, CA',
      start: 'Jun 2019',
      end: 'Feb 2022',
      current: false,
      bullets: [
        'Designed patient scheduling and care coordination tools across web and mobile, supporting 120+ clinics.',
        'Established a continuous discovery program that cut validation cycles from four weeks to ten days.',
      ],
    },
  ],
  education: [
    {
      id: 1,
      school: 'California College of the Arts',
      degree: 'BFA, Interaction Design',
      location: 'San Francisco, CA',
      start: '2015',
      end: '2019',
    },
  ],
  skills: {
    expertise:
      'Product strategy, Interaction design, User research, Prototyping, Design systems, Workshop facilitation',
    tools: 'Figma, FigJam, Maze, Amplitude, Jira, Notion',
  },
};

const baseSections = [
  { id: 'basics', label: 'Personal details', icon: UserRound },
  { id: 'summary', label: 'Professional summary', icon: AlignLeft },
  { id: 'experience', label: 'Experience', icon: BriefcaseBusiness },
  { id: 'education', label: 'Education', icon: GraduationCap },
  { id: 'skills', label: 'Skills', icon: ListChecks },
];

const chineseSectionLabels = {
  basics: '个人信息',
  summary: '个人介绍',
  experience: '工作经历',
  education: '教育经历',
  skills: '专业技能',
  certifications: '证书',
};

const templateOptions = [
  { id: 'classic', name: 'Classic', detail: 'Traditional' },
  { id: 'modern', name: 'Modern', detail: 'Balanced' },
  { id: 'compact', name: 'Compact', detail: 'Space-saving' },
  { id: 'profile', name: 'Profile', detail: 'Editorial' },
];

const accentOptions = ['#167c65', '#3498db', '#2e5aac', '#a34636', '#5f4b8b', '#2f3438'];
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.1;
const DEFAULT_EDITOR_WIDTH = 540;
const MIN_EDITOR_WIDTH = 340;
const MAX_EDITOR_WIDTH = 720;
const REMOTE_ACCOUNT = {
  id: 'yeatom',
  username: 'yeatom',
};
const LIBRARY_VERSION = 3;
const DEFAULT_DOCUMENT_NAME = 'Jordan Lee - Product Designer';
const MAX_JOB_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_SOURCE_TEXT_CHARS = 20_000;
const REMEMBERED_ACCOUNTS_STORAGE_KEY = 'jd2resume-remembered-accounts-v1';
type CssVariables = CSSProperties & Record<`--${string}`, string>;

function rememberedAccounts() {
  if (typeof window === 'undefined') return [];
  try {
    const stored = JSON.parse(window.localStorage.getItem(REMEMBERED_ACCOUNTS_STORAGE_KEY) || '[]');
    if (!Array.isArray(stored)) return [];
    return stored
      .filter((account) => isRecord(account) && textValue(account.id) && textValue(account.username) && textValue(account.token))
      .map((account) => ({
        id: textValue(account.id),
        username: textValue(account.username),
        token: textValue(account.token),
        lastUsedAt: Number(account.lastUsedAt) || 0,
      }))
      .sort((first, second) => second.lastUsedAt - first.lastUsedAt)
      .slice(0, 12);
  } catch {
    return [];
  }
}

function storeRememberedAccounts(accounts) {
  try {
    window.localStorage.setItem(REMEMBERED_ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
  } catch {
    // Sign-in still works when browser storage is unavailable.
  }
}

function normalizeGenerationEvidence(value) {
  const source = isRecord(value) ? value : {};
  const uploadedSource = isRecord(source.uploadedSource) ? source.uploadedSource : null;
  return {
    applicationId: textValue(source.applicationId),
    jobId: textValue(source.jobId),
    sourceType: ['text', 'image', 'pdf'].includes(source.sourceType) ? source.sourceType : 'text',
    jobDescription: textValue(source.jobDescription).slice(0, MAX_SOURCE_TEXT_CHARS),
    uploadedSource: uploadedSource
      ? {
          name: textValue(uploadedSource.name),
          mimeType: textValue(uploadedSource.mimeType),
          evidenceId: textValue(uploadedSource.evidenceId),
        }
      : null,
    capturedAt: Number.isFinite(Number(source.capturedAt)) ? Number(source.capturedAt) : 0,
  };
}

function normalizeLayoutManifest(value) {
  const source = isRecord(value) ? value : {};
  const allowedPolicies = new Set([
    'balanced-fit', 'line-fit', 'spacing-fit', 'typography-fit', 'combined-fit',
    'compact-gaps', 'compact-lines', 'compact-balanced', 'expand-gaps', 'expand-lines',
  ]);
  return {
    policy: allowedPolicies.has(source.policy) ? source.policy : '',
    sectionGapDelta: Number.isFinite(Number(source.sectionGapDelta)) ? Number(source.sectionGapDelta) : 0,
    lineHeightDelta: Number.isFinite(Number(source.lineHeightDelta)) ? Number(source.lineHeightDelta) : 0,
    fontSizeDelta: Number.isFinite(Number(source.fontSizeDelta)) ? Number(source.fontSizeDelta) : 0,
    pageCount: Math.max(1, Number(source.pageCount) || 1),
    fillRatio: Math.max(0, Math.min(1, Number(source.fillRatio) || 0)),
    pageFillRatios: Array.isArray(source.pageFillRatios)
      ? source.pageFillRatios.map((ratio) => Math.max(0, Math.min(1, Number(ratio) || 0)))
      : [],
  };
}

function normalizeRenderState(value) {
  const source = isRecord(value) ? value : {};
  const plan = isRecord(source.pagePlan) && Number(source.pagePlan.schemaVersion) === 2 && Array.isArray(source.pagePlan.pages)
    ? source.pagePlan as PagePlanV2
    : null;
  const tuningSource = isRecord(source.layoutTuning) ? source.layoutTuning : isRecord(plan?.tuning) ? plan.tuning : {};
  const allowedPolicies = new Set(['balanced-fit', 'line-fit', 'spacing-fit', 'typography-fit', 'combined-fit']);
  const layoutTuning = {
    policy: allowedPolicies.has(tuningSource.policy) ? tuningSource.policy : 'spacing-fit',
    sectionGapDelta: Number.isFinite(Number(tuningSource.sectionGapDelta)) ? Number(tuningSource.sectionGapDelta) : 0,
    lineHeightDelta: Number.isFinite(Number(tuningSource.lineHeightDelta)) ? Number(tuningSource.lineHeightDelta) : 0,
    fontSizeDelta: Number.isFinite(Number(tuningSource.fontSizeDelta)) ? Number(tuningSource.fontSizeDelta) : 0,
  };
  return {
    status: ['dirty', 'rendering', 'valid', 'failed'].includes(source.status) ? source.status : 'dirty',
    draftRevision: Math.max(0, Number(source.draftRevision) || 0),
    currentSnapshotHash: textValue(source.currentSnapshotHash),
    rendererVersion: textValue(source.rendererVersion),
    layoutTuning,
    pagePlan: plan,
    layoutReport: isRecord(source.layoutReport) ? source.layoutReport as LayoutReportV2 : null,
    lastValidSnapshotHash: textValue(source.lastValidSnapshotHash),
    lastValidAt: Math.max(0, Number(source.lastValidAt) || 0),
  };
}

const sectionSuggestions = [
  { id: 'projects', label: 'Projects', icon: LayoutGrid },
  { id: 'certifications', label: 'Certifications', icon: Award },
  { id: 'volunteering', label: 'Volunteering', icon: CheckCircle2 },
];

const emptyCustomSection = {
  projects: {
    title: 'Selected Projects',
    itemTitle: 'Design systems adoption toolkit',
    subtitle: 'Independent project',
    description:
      'Created a practical toolkit for auditing, documenting, and scaling design system adoption across product teams.',
  },
  certifications: {
    title: 'Certifications',
    itemTitle: 'Human-Centered Design',
    subtitle: 'IDEO U, 2024',
    description: '',
  },
  volunteering: {
    title: 'Volunteering',
    itemTitle: 'Design Mentor',
    subtitle: 'ADPList, 2023 - Present',
    description: 'Mentor early-career designers through monthly portfolio and career sessions.',
  },
};

const chineseCustomSection = {
  certifications: {
    title: '证书',
    itemTitle: '专业证书',
    subtitle: '颁发机构，年份',
    description: '',
  },
};

function isChineseResume(language) {
  return language === 'chinese';
}

function localizedBaseSections(language) {
  if (!isChineseResume(language)) return baseSections;
  return baseSections.map((section) => ({
    ...section,
    label: chineseSectionLabels[section.id],
  }));
}

function localizedSectionSuggestions(language) {
  if (!isChineseResume(language)) return sectionSuggestions;
  return sectionSuggestions.map((section) => ({
    ...section,
    label: chineseSectionLabels[section.id] || section.label,
  }));
}

function customSectionDefaults(id, language) {
  if (isChineseResume(language) && chineseCustomSection[id]) {
    return chineseCustomSection[id];
  }
  return emptyCustomSection[id];
}

function resumeName(basics, language) {
  if (isChineseResume(language)) {
    return `${basics.fullName || basics.lastName || ''}${basics.fullName ? '' : basics.firstName || ''}`.trim();
  }
  if (basics.fullName) return basics.fullName.trim();
  return `${basics.firstName || ''} ${basics.lastName || ''}`.trim();
}

function resumeInitials(basics, language) {
  if (isChineseResume(language)) {
    return resumeName(basics, language).slice(0, 2) || '姓名';
  }
  if (basics.fullName) {
    return basics.fullName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  }
  return `${basics.firstName?.[0] || 'Y'}${basics.lastName?.[0] || ''}`;
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function textValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

const emptyUserProfile = {
  chinese: {
    fullName: '',
    gender: '',
    birthday: '',
    phone: '',
    phoneEn: '',
    email: '',
    location: '',
    wechat: '',
    whatsapp: '',
    telegram: '',
    linkedin: '',
    website: '',
    photoUrl: '',
    educations: [],
    workExperiences: [],
    certificates: [],
    aiMessage: '',
  },
  english: {
    fullName: '',
    gender: '',
    birthday: '',
    phone: '',
    phoneEn: '',
    email: '',
    location: '',
    linkedin: '',
    wechat: '',
    whatsapp: '',
    telegram: '',
    website: '',
    photoUrl: '',
    educations: [],
    workExperiences: [],
    certificates: [],
    aiMessage: '',
  },
};

const profileValidationMessages = {
  chinese: {
    name: '请填写姓名。',
    contact: '请至少填写手机号码、邮箱或微信号中的一项。',
    education: '请至少添加一条教育经历。',
  },
  english: {
    name: 'Enter your full name.',
    contact: 'Add an email address, personal website, LinkedIn, WhatsApp, or Telegram contact.',
    education: 'Add at least one education entry.',
  },
};

function normalizeUserProfile(value) {
  const source = isRecord(value) ? value : {};
  return Object.entries(emptyUserProfile).reduce((profile, [language]) => {
    const legacyLanguage = language === 'chinese' ? 'zh' : 'en';
    const savedFields = isRecord(source[language])
      ? source[language]
      : isRecord(source[legacyLanguage])
        ? source[legacyLanguage]
        : {};
    profile[language] = normalizeProfileLanguage(savedFields, language);
    return profile;
  }, {});
}

function profileEntryId(prefix, index = 0) {
  return `${prefix}-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeStringList(value) {
  return Array.isArray(value)
    ? value.map((item) => textValue(item).trim()).filter(Boolean)
    : [];
}

function normalizeChineseSpacing(value) {
  return textValue(value).trim().replace(/([\u3400-\u9FFF])\s+(?=[\u3400-\u9FFF])/gu, '$1');
}

function normalizeProfileStudyType(value, degree) {
  const studyType = textValue(value).trim();
  const evidence = `${degree} ${studyType}`;
  if (/非全日制|函授|成人(?:教育|本科)?|夜校|业余|网络教育|自考/u.test(evidence)) return '非全日制';
  if (/part[ -]?time|correspondence|adult education|night school/i.test(evidence)) return 'Part-time';
  if (['全日制', '非全日制', 'Full-time', 'Part-time'].includes(studyType)) return studyType;
  if (/本科/u.test(textValue(degree))) return '全日制';
  if (/bachelor/i.test(textValue(degree))) return 'Full-time';
  return '';
}

function displayedProfileStudyType(value) {
  return ['非全日制', 'Part-time'].includes(textValue(value)) ? value : '';
}

function normalizeProfileEducation(value, index = 0) {
  const source = isRecord(value) ? value : {};
  const degree = textValue(source.degree).trim();
  return {
    id: textValue(source.id, profileEntryId('education', index)),
    school: normalizeChineseSpacing(source.school),
    schoolEn: textValue(source.schoolEn || source.school_en).trim(),
    schoolCn: textValue(source.schoolCn || source.school_cn).trim(),
    countryChinese: textValue(source.countryChinese || source.country_chinese).trim(),
    countryEnglish: textValue(source.countryEnglish || source.country_english).trim(),
    degree,
    studyType: normalizeProfileStudyType(source.studyType || source.study_type, degree),
    major: textValue(source.major).trim(),
    majorEn: textValue(source.majorEn || source.major_en).trim(),
    startDate: textValue(source.startDate || source.startTime).trim(),
    endDate: textValue(source.endDate || source.endTime || source.graduationDate).trim(),
    description: textValue(source.description).trim(),
  };
}

function normalizeProfileWorkExperience(value, index = 0) {
  const source = isRecord(value) ? value : {};
  return {
    id: textValue(source.id, profileEntryId('work', index)),
    company: normalizeChineseSpacing(source.company),
    jobTitle: textValue(source.jobTitle || source.role).trim(),
    businessDirection: textValue(source.businessDirection).trim(),
    workContent: textValue(source.workContent || source.description).trim(),
    startDate: textValue(source.startDate || source.startTime).trim(),
    endDate: textValue(source.endDate || source.endTime).trim(),
  };
}

function normalizeProfileLanguage(value, language) {
  const source = isRecord(value) ? value : {};
  const phone = textValue(source.phone || (language === 'english' ? source.phoneEn || source.phone_en : '')).trim();
  return {
    fullName: textValue(source.fullName || source.name).trim(),
    gender: textValue(source.gender).trim(),
    birthday: textValue(source.birthday).trim(),
    phone,
    phoneEn: textValue(source.phoneEn || source.phone_en || (language === 'english' ? phone : '')).trim(),
    email: textValue(source.email).trim(),
    location: textValue(source.location || source.city).trim(),
    wechat: textValue(source.wechat).trim(),
    linkedin: textValue(source.linkedin).trim(),
    whatsapp: textValue(source.whatsapp).trim(),
    telegram: textValue(source.telegram).trim(),
    website: textValue(source.website).trim(),
    photoUrl: textValue(source.photoUrl || source.photo).trim(),
    educations: Array.isArray(source.educations)
      ? source.educations.map(normalizeProfileEducation)
      : [],
    workExperiences: Array.isArray(source.workExperiences)
      ? source.workExperiences.map(normalizeProfileWorkExperience)
      : [],
    certificates: normalizeStringList(source.certificates),
    aiMessage: textValue(source.aiMessage).trim(),
  };
}

function mergeImportedProfileFields(currentValue, importedValue, language) {
  const current = normalizeProfileLanguage(currentValue, language);
  const imported = normalizeProfileLanguage(importedValue, language);
  return Object.fromEntries(Object.keys(current).map((field) => {
    const importedField = imported[field];
    if (Array.isArray(importedField)) {
      return [field, importedField.length ? importedField : current[field]];
    }
    return [field, textValue(importedField).trim() ? importedField : current[field]];
  }));
}

const fallbackProfileUniversities = [
  { id: 'tsinghua', chinese_name: '清华大学', english_name: 'Tsinghua University', country_chinese: '中国', country_english: 'China' },
  { id: 'pku', chinese_name: '北京大学', english_name: 'Peking University', country_chinese: '中国', country_english: 'China' },
  { id: 'sjtu', chinese_name: '上海交通大学', english_name: 'Shanghai Jiao Tong University', country_chinese: '中国', country_english: 'China' },
  { id: 'fudan', chinese_name: '复旦大学', english_name: 'Fudan University', country_chinese: '中国', country_english: 'China' },
  { id: 'zju', chinese_name: '浙江大学', english_name: 'Zhejiang University', country_chinese: '中国', country_english: 'China' },
  { id: 'nju', chinese_name: '南京大学', english_name: 'Nanjing University', country_chinese: '中国', country_english: 'China' },
  { id: 'ustc', chinese_name: '中国科学技术大学', english_name: 'University of Science and Technology of China', country_chinese: '中国', country_english: 'China' },
  { id: 'stanford', chinese_name: '斯坦福大学', english_name: 'Stanford University', country_chinese: '美国', country_english: 'United States' },
  { id: 'mit', chinese_name: '麻省理工学院', english_name: 'Massachusetts Institute of Technology', country_chinese: '美国', country_english: 'United States' },
  { id: 'berkeley', chinese_name: '加州大学伯克利分校', english_name: 'University of California, Berkeley', country_chinese: '美国', country_english: 'United States' },
];

const fallbackProfileMajors = [
  { id: 'cs', chinese_name: '计算机科学与技术', english_name: 'Computer Science and Technology', level: 'Bachelor' },
  { id: 'software', chinese_name: '软件工程', english_name: 'Software Engineering', level: 'Bachelor' },
  { id: 'information-management', chinese_name: '信息管理与信息系统', english_name: 'Information Management and Information Systems', level: 'Bachelor' },
  { id: 'interaction-design', chinese_name: '交互设计', english_name: 'Interaction Design', level: 'Bachelor' },
  { id: 'industrial-design', chinese_name: '工业设计', english_name: 'Industrial Design', level: 'Bachelor' },
  { id: 'visual-communication', chinese_name: '视觉传达设计', english_name: 'Visual Communication Design', level: 'Bachelor' },
  { id: 'business', chinese_name: '工商管理', english_name: 'Business Administration', level: 'Bachelor' },
  { id: 'marketing', chinese_name: '市场营销', english_name: 'Marketing', level: 'Bachelor' },
  { id: 'finance', chinese_name: '金融学', english_name: 'Finance', level: 'Bachelor' },
  { id: 'data-science', chinese_name: '数据科学与大数据技术', english_name: 'Data Science and Big Data Technology', level: 'Master' },
];

function profileDirectoryMatches(items, keyword, level = '') {
  const normalized = textValue(keyword).trim().toLowerCase();
  const candidates = items.filter((item) => {
    const matchesLevel = !level || !item.level || item.level === level;
    if (!matchesLevel) return false;
    if (!normalized) return true;
    return `${item.chinese_name || ''} ${item.english_name || ''}`.toLowerCase().includes(normalized);
  });
  return candidates
    .sort((a, b) => {
      const aText = `${a.chinese_name || ''} ${a.english_name || ''}`.toLowerCase();
      const bText = `${b.chinese_name || ''} ${b.english_name || ''}`.toLowerCase();
      const aStarts = aText.startsWith(normalized);
      const bStarts = bText.startsWith(normalized);
      if (aStarts !== bStarts) return aStarts ? -1 : 1;
      return aText.length - bText.length;
    })
    .slice(0, 10);
}

const profileDegreeOptions = {
  chinese: ['大专', '本科', '硕士', '博士', '其他'],
  english: ['Associate', 'Bachelor', 'Master', 'PhD', 'Other'],
};

const profileStudyTypeOptions = {
  chinese: ['全日制', '非全日制'],
  english: ['Full-time', 'Part-time'],
};

function majorLevelForDegree(degree) {
  const value = textValue(degree).toLowerCase();
  if (value.includes('本科') || value.includes('bachelor')) return 'Bachelor';
  if (value.includes('硕士') || value.includes('master')) return 'Master';
  if (value.includes('博士') || value.includes('phd') || value.includes('doctor')) return 'PhD';
  return '';
}

function profileDateValue(value) {
  const match = textValue(value).match(/^(\d{4})-(\d{1,2})$/);
  return match ? { year: match[1], month: String(match[2]).padStart(2, '0') } : { year: '', month: '' };
}

function profileDateRangeInvalid(startDate, endDate) {
  return Boolean(startDate && endDate && !['Present', '至今'].includes(endDate) && startDate > endDate);
}

function readFileAsDataUrl(file): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(typeof reader.result === 'string' ? reader.result : ''));
    reader.addEventListener('error', () => reject(new Error('The selected file could not be read.')));
    reader.readAsDataURL(file);
  });
}

function validateSourcePayload(
  { text = '', sourceType = 'text', sourceFile }: { text?: unknown; sourceType?: string; sourceFile?: File | null } = {},
) {
  const normalizedText = textValue(text).trim();
  if (sourceType === 'text' && normalizedText.length > MAX_SOURCE_TEXT_CHARS) {
    throw new Error(`Text source cannot exceed ${MAX_SOURCE_TEXT_CHARS.toLocaleString()} characters.`);
  }
  if (sourceType !== 'text' && sourceFile && sourceFile.size > MAX_JOB_SOURCE_BYTES) {
    throw new Error('The source file must be 10 MB or smaller.');
  }
  return normalizedText;
}

function accountInitials(username) {
  const name = normalizedUsername(username);
  if (!name) return '??';
  if (/[^\u0000-\u007f]/.test(name)) return name.slice(0, 2);
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || '??';
}

function validatePersonalProfile(profile, language) {
  const fields = profile?.[language] || {};
  const contactFields = language === 'chinese'
    ? ['phone', 'email', 'wechat']
    : ['email', 'website', 'linkedin', 'whatsapp', 'telegram'];
  const issues = [
    ...(!textValue(fields.fullName).trim() ? ['name'] : []),
    ...(!contactFields.some((field) => textValue(fields[field]).trim()) ? ['contact'] : []),
    ...(!Array.isArray(fields.educations) || fields.educations.length === 0 ? ['education'] : []),
  ];
  return {
    valid: issues.length === 0,
    issues,
    message: issues.map((issue) => profileValidationMessages[language][issue]).join(' '),
  };
}

function parseWebsiteLink(value) {
  const raw = textValue(value).trim();
  if (!raw) return null;

  const markdownMatch = raw.match(/^\[([^\]\r\n]+)\]\s*\((.+)\)$/);
  const duplicatedMarkdownMatch = raw.match(/^\[([^\]\r\n]+)\]\s*\[[^\]\r\n]*\]\s*\((.+)\)$/);
  const legacyNamedMatch = raw.match(/^\[([^\]\r\n]+)\]\s*(\S+)$/);
  const match = markdownMatch || duplicatedMarkdownMatch || legacyNamedMatch;
  const label = (match ? match[1] : raw).trim();
  const target = (match ? match[2] : raw).trim().replace(/^<|>$/g, '');
  const href = /^https?:\/\//i.test(target)
    ? target
    : /^[\w.-]+\.[a-z]{2,}(?:[/?#].*)?$/i.test(target)
      ? `https://${target}`
      : '';

  if (!label || !href) return null;
  try {
    const url = new URL(href);
    return ['http:', 'https:'].includes(url.protocol)
      ? { href: url.href, label }
      : null;
  } catch {
    return null;
  }
}

function normalizeAccent(value: unknown, fallback = accentOptions[0]) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toLowerCase()
    : fallback;
}

function normalizeResumeData(value, language = 'english') {
  const source = isRecord(value) ? value : {};
  const basics = isRecord(source.basics) ? source.basics : {};
  const skills = isRecord(source.skills) ? source.skills : {};
  const layout = isRecord(source.layout) ? source.layout : {};
  const skillCategories = Array.isArray(skills.categories)
    ? skills.categories.filter(isRecord).map((category) => ({
        title: textValue(category.title),
        items: Array.isArray(category.items) ? category.items.map((item) => textValue(item)).filter(Boolean) : [],
        hidden: category.hidden === true,
      })).filter((category) => category.title && category.items.length)
    : [];
  const chinese = isChineseResume(language);
  const storedFullName = textValue(basics.fullName).trim();
  const migratedChineseName = `${textValue(basics.lastName)}${textValue(basics.firstName)}`.trim();

  const experience = Array.isArray(source.experience)
    ? source.experience.filter(isRecord).map((entry, index) => {
        const fallback = initialResume.experience[index] || initialResume.experience[0];
        return {
          id: Number.isFinite(Number(entry.id)) ? Number(entry.id) : index + 1,
          role: textValue(entry.role, fallback.role),
          company: textValue(entry.company, fallback.company),
          location: textValue(entry.location, fallback.location),
          start: textValue(entry.start, fallback.start),
          end: textValue(entry.end, fallback.end),
          current: typeof entry.current === 'boolean' ? entry.current : Boolean(fallback.current),
          bullets: Array.isArray(entry.bullets)
            ? entry.bullets.map((bullet) => textValue(bullet)).filter(Boolean)
            : [...(fallback.bullets || [])],
          hiddenBullets: Array.isArray(entry.hiddenBullets) ? entry.hiddenBullets.map((hidden) => hidden === true) : [],
        };
      })
    : initialResume.experience.map((entry) => ({ ...entry, bullets: [...entry.bullets] }));

  const storedEducation = Array.isArray(source.education)
    ? source.education.filter(isRecord).map((entry, index) => {
        const fallback = initialResume.education[index] || initialResume.education[0];
        return {
          id: Number.isFinite(Number(entry.id)) ? Number(entry.id) : index + 1,
          school: textValue(entry.school, fallback.school),
          degree: textValue(entry.degree, fallback.degree),
          location: textValue(entry.location, fallback.location),
          start: textValue(entry.start, fallback.start),
          end: textValue(entry.end, fallback.end),
        };
      })
    : [];

  return {
    basics: {
      fullName: chinese ? storedFullName || migratedChineseName : textValue(basics.fullName),
      firstName: chinese ? '' : textValue(basics.firstName, initialResume.basics.firstName),
      lastName: chinese ? '' : textValue(basics.lastName, initialResume.basics.lastName),
      role: textValue(basics.role, initialResume.basics.role),
      email: textValue(basics.email, initialResume.basics.email),
      phone: textValue(basics.phone, initialResume.basics.phone),
      location: textValue(basics.location, initialResume.basics.location),
      gender: textValue(basics.gender, chinese ? '男' : initialResume.basics.gender),
      website: textValue(basics.website),
      wechat: textValue(basics.wechat),
      linkedin: textValue(basics.linkedin),
      whatsapp: textValue(basics.whatsapp),
      telegram: textValue(basics.telegram),
      photoUrl: textValue(basics.photoUrl, initialResume.basics.photoUrl),
      headerHeight: Math.min(MAX_HEADER_HEIGHT_PX, Math.max(MIN_HEADER_HEIGHT_PX, Number(basics.headerHeight) || DEFAULT_HEADER_HEIGHT_PX)),
    },
    layout: {
      lineHeight: Math.min(MAX_LAYOUT_LINE_HEIGHT_PX, Math.max(MIN_LAYOUT_LINE_HEIGHT_PX, Number.isFinite(Number(layout.lineHeight)) ? Number(layout.lineHeight) : DEFAULT_LAYOUT_LINE_HEIGHT_PX)),
      titleMarginTop: Math.min(MAX_LAYOUT_TITLE_MARGIN_TOP_PX, Math.max(MIN_LAYOUT_TITLE_MARGIN_TOP_PX, Number.isFinite(Number(layout.titleMarginTop)) ? Number(layout.titleMarginTop) : DEFAULT_LAYOUT_TITLE_MARGIN_TOP_PX)),
      titleMarginBottom: Math.min(MAX_LAYOUT_TITLE_MARGIN_BOTTOM_PX, Math.max(MIN_LAYOUT_TITLE_MARGIN_BOTTOM_PX, Number.isFinite(Number(layout.titleMarginBottom)) ? Number(layout.titleMarginBottom) : DEFAULT_LAYOUT_TITLE_MARGIN_BOTTOM_PX)),
      fontSize: Math.min(MAX_LAYOUT_FONT_SIZE_PX, Math.max(MIN_LAYOUT_FONT_SIZE_PX, Number.isFinite(Number(layout.fontSize)) ? Number(layout.fontSize) : DEFAULT_LAYOUT_FONT_SIZE_PX)),
    },
    summary: textValue(source.summary, initialResume.summary),
    yearsOfExperience: Number.isFinite(Number(source.yearsOfExperience)) ? Number(source.yearsOfExperience) : 0,
    experience,
    education: storedEducation.length
      ? storedEducation
      : initialResume.education.map((entry) => ({ ...entry })),
    skills: {
      expertise: textValue(skills.expertise, initialResume.skills.expertise),
      tools: textValue(skills.tools, initialResume.skills.tools),
      categories: skillCategories,
      titleItemGap: Math.min(MAX_SKILL_TITLE_GAP_PX, Math.max(MIN_SKILL_TITLE_GAP_PX, Number.isFinite(Number(skills.titleItemGap)) ? Number(skills.titleItemGap) : DEFAULT_SKILL_TITLE_GAP_PX)),
      titleOffsetX: Math.min(MAX_SKILL_TITLE_OFFSET_X_PX, Math.max(MIN_SKILL_TITLE_OFFSET_X_PX, Number.isFinite(Number(skills.titleOffsetX)) ? Number(skills.titleOffsetX) : DEFAULT_SKILL_TITLE_OFFSET_X_PX)),
    },
    certificates: Array.isArray(source.certificates)
      ? source.certificates.filter(isRecord).map((certificate) => ({
          name: textValue(certificate.name),
          date: textValue(certificate.date),
          score: textValue(certificate.score),
        })).filter((certificate) => certificate.name)
      : [],
  };
}

function normalizeCustomSections(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id) => Object.hasOwn(emptyCustomSection, id)))];
}

function defaultSectionOrder(template, customSections) {
  const baseOrder = template === 'profile'
    ? ['basics', 'summary', 'education', 'experience', 'skills']
    : baseSections.map((section) => section.id);
  return [...baseOrder, ...customSections];
}

function normalizeSectionOrder(value, customSections, template = 'modern') {
  const defaultOrder = defaultSectionOrder(template, customSections);
  const allowed = new Set(defaultOrder);
  const storedOrder = Array.isArray(value)
    ? value.filter((id) => typeof id === 'string' && allowed.has(id))
    : [];
  const ordered = [...new Set([...storedOrder, ...defaultOrder])];
  return ['basics', ...ordered.filter((id) => id !== 'basics')];
}

function normalizeCustomContent(sectionIds, value, language = 'english') {
  const source = isRecord(value) ? value : {};
  return sectionIds.reduce((result, id) => {
    const defaults = customSectionDefaults(id, language);
    const section = isRecord(source[id]) ? source[id] : {};
    result[id] = {
      title: textValue(section.title, defaults.title),
      itemTitle: textValue(section.itemTitle, defaults.itemTitle),
      subtitle: textValue(section.subtitle, defaults.subtitle),
      description: textValue(section.description, defaults.description),
    };
    return result;
  }, {});
}

function roleResumeSnapshot({ documentName, role, summary, experience, skills, template, accent }) {
  return {
    documentName,
    language: 'english',
    data: normalizeResumeData({
      basics: { ...initialResume.basics, role },
      summary,
      experience,
      education: initialResume.education,
      skills,
    }),
    template,
    accent,
    customSections: [],
    customContent: {},
    sectionOrder: defaultSectionOrder(template, []),
    sectionOrderCustomized: false,
  };
}

function productManagerSnapshot() {
  return roleResumeSnapshot({
    documentName: 'Jordan Lee - Product Manager',
    role: 'Senior Product Manager',
    summary:
      'Product leader with 8+ years of experience defining strategy and shipping B2B software. Aligns customer insight, market context, and delivery teams to build products that improve adoption and retention.',
    experience: [
      {
        id: 1,
        role: 'Senior Product Manager',
        company: 'Meridian Cloud',
        location: 'San Francisco, CA',
        start: 'Apr 2021',
        end: 'Present',
        current: true,
        bullets: [
          'Owned strategy and roadmap for a $24M analytics portfolio serving more than 600 enterprise customers.',
          'Launched usage-based packaging that increased expansion revenue by 19% within two quarters.',
          'Built a continuous discovery program across product, design, sales, and customer success.',
        ],
      },
      {
        id: 2,
        role: 'Product Manager',
        company: 'Harbor Systems',
        location: 'Oakland, CA',
        start: 'Jul 2018',
        end: 'Mar 2021',
        current: false,
        bullets: [
          'Shipped workflow automation features that reduced customer setup time by 32%.',
          'Prioritized a multi-team roadmap using customer evidence and product usage data.',
        ],
      },
    ],
    skills: {
      expertise:
        'Product strategy, Roadmapping, Customer discovery, Go-to-market, Pricing, Analytics, Stakeholder management',
      tools: 'Amplitude, Looker, SQL, Figma, Jira, Productboard, Notion',
    },
    template: 'classic',
    accent: '#2e5aac',
  });
}

function androidDeveloperSnapshot() {
  return roleResumeSnapshot({
    documentName: 'Jordan Lee - Android Developer',
    role: 'Senior Android Developer',
    summary:
      'Android engineer with 7+ years of experience building reliable consumer applications with Kotlin and Jetpack Compose. Focused on scalable architecture, performance, accessibility, and thoughtful collaboration.',
    experience: [
      {
        id: 1,
        role: 'Senior Android Developer',
        company: 'Atlas Mobility',
        location: 'San Francisco, CA',
        start: 'Jan 2022',
        end: 'Present',
        current: true,
        bullets: [
          'Led a Jetpack Compose migration across 40+ screens while maintaining a 99.8% crash-free rate.',
          'Reduced cold-start time by 38% through profiling, dependency cleanup, and startup deferral.',
          'Created modular architecture and CI standards adopted by four mobile feature teams.',
        ],
      },
      {
        id: 2,
        role: 'Android Engineer',
        company: 'Signal Market',
        location: 'Remote',
        start: 'Aug 2019',
        end: 'Dec 2021',
        current: false,
        bullets: [
          'Built checkout and account experiences used by 500K+ monthly active customers.',
          'Expanded automated test coverage from 42% to 78% and reduced release regressions.',
        ],
      },
    ],
    skills: {
      expertise:
        'Kotlin, Jetpack Compose, Coroutines, Clean Architecture, Modularization, Accessibility, Performance',
      tools: 'Android Studio, Gradle, Firebase, GitHub Actions, Datadog, Figma',
    },
    template: 'compact',
    accent: '#a34636',
  });
}

function normalizeResumeDocument(value, index) {
  const source = isRecord(value) ? value : {};
  const template = templateOptions.some((option) => option.id === source.template)
    ? source.template
    : 'modern';
  const customSections = normalizeCustomSections(source.customSections);
  const language = source.language === 'chinese' ? 'chinese' : 'english';
  const snapshot = {
    documentName: textValue(source.documentName, `Resume ${index + 1}`),
    language,
    data: normalizeResumeData(source.data, language),
    template,
    accent: normalizeAccent(source.accent),
    customSections,
    customContent: {},
    sectionOrder: normalizeSectionOrder(source.sectionOrder, customSections, template),
    sectionOrderCustomized: source.sectionOrderCustomized === true,
    generationEvidence: normalizeGenerationEvidence(source.generationEvidence),
    // Keep the previous server-produced result through the V2 -> V3 rollback window.
    legacyLayoutManifest: normalizeLayoutManifest(source.legacyLayoutManifest || source.layoutManifest),
    renderState: normalizeRenderState(source.renderState),
  };
  snapshot.customContent = normalizeCustomContent(snapshot.customSections, source.customContent, language);
  return {
    id: textValue(source.id, `resume-${index + 1}`),
    ...snapshot,
    updatedAt: Number.isFinite(Number(source.updatedAt)) ? Number(source.updatedAt) : Date.now(),
  };
}

function emptyResumeLibrary() {
  return { version: LIBRARY_VERSION, resumes: [] };
}

function normalizedUsername(value) {
  return textValue(value).trim();
}

function blankResumeSnapshot(
  { documentName, language, generationEvidence, layoutManifest }: { documentName?: string; language?: string; generationEvidence?: unknown; layoutManifest?: unknown } = {},
) {
  const chinese = isChineseResume(language);
  return {
    documentName: textValue(documentName, 'Untitled resume'),
    language: language === 'chinese' ? 'chinese' : 'english',
    data: normalizeResumeData({
      basics: {
        fullName: chinese ? '张晓明' : '',
        firstName: chinese ? '' : 'Jordan',
        lastName: chinese ? '' : 'Lee',
        role: chinese ? '产品设计师' : 'Target role',
        email: chinese ? 'xiaoming.zhang@email.com' : initialResume.basics.email,
        phone: chinese ? '138 0000 0000' : initialResume.basics.phone,
        location: chinese ? '上海，中国' : initialResume.basics.location,
        gender: chinese ? '男' : initialResume.basics.gender,
        website: chinese ? '' : initialResume.basics.website,
        photoUrl: initialResume.basics.photoUrl,
      },
      summary: chinese
        ? '拥有 7 年以上产品设计经验，擅长将复杂的业务流程转化为清晰、高效的用户体验。'
        : '',
      experience: chinese
        ? [{
            id: 1,
            role: '高级产品设计师',
            company: '北辰科技',
            location: '上海，中国',
            start: '2022 年 3 月',
            end: '至今',
            current: true,
            bullets: [
              '主导企业分析平台的端到端设计，提升关键任务完成效率。',
              '建立跨团队设计规范，缩短产品交付周期。',
            ],
          }]
        : [],
      education: chinese
        ? [{
            id: 1,
            school: '中国美术学院',
            degree: '交互设计学士',
            location: '杭州，中国',
            start: '2015 年',
            end: '2019 年',
          }]
        : initialResume.education,
      skills: chinese
        ? {
            expertise: '产品策略、用户研究、交互设计、原型设计、设计系统',
            tools: 'Figma、FigJam、Miro、Jira、Notion',
          }
        : { expertise: '', tools: '' },
    }, language),
    template: 'modern',
    accent: accentOptions[0],
    customSections: [],
    customContent: {},
    sectionOrder: defaultSectionOrder('modern', []),
    sectionOrderCustomized: false,
    generationEvidence: normalizeGenerationEvidence(generationEvidence),
    legacyLayoutManifest: normalizeLayoutManifest(layoutManifest),
    renderState: normalizeRenderState(null),
  };
}

function resumeId() {
  return globalThis.crypto?.randomUUID?.() || `resume-${Date.now()}`;
}

function resumeSnapshotEqual(document, snapshot) {
  return JSON.stringify({
    documentName: document.documentName,
    language: document.language,
    data: document.data,
    template: document.template,
    accent: document.accent,
    customSections: document.customSections,
    customContent: document.customContent,
    sectionOrder: document.sectionOrder,
    sectionOrderCustomized: document.sectionOrderCustomized,
    generationEvidence: document.generationEvidence,
    legacyLayoutManifest: document.legacyLayoutManifest,
    renderState: document.renderState,
  }) === JSON.stringify(snapshot);
}

function defaultWorkspacePreferences(resumeSnapshot) {
  const availableSections = new Set([
    ...baseSections.map((section) => section.id),
    ...resumeSnapshot.customSections,
  ]);
  const experienceIds = new Set(resumeSnapshot.data.experience.map((entry) => entry.id));

  return {
    zoom: 1,
    editorWidth: DEFAULT_EDITOR_WIDTH,
    activeSection: availableSections.has('experience') ? 'experience' : 'basics',
    openExperience: experienceIds.has(resumeSnapshot.data.experience[0]?.id)
      ? resumeSnapshot.data.experience[0].id
      : null,
    mobileMode: 'edit',
    editorCollapsed: false,
    previewPosition: {
      left: 0,
      top: 0,
    },
  };
}

function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}

function App() {
  const [currentAccount, setCurrentAccount] = useState(REMOTE_ACCOUNT);
  const [sessionState, setSessionState] = useState<'checking' | 'signed-out' | 'signed-in'>('checking');
  const libraryRef = useRef(emptyResumeLibrary());
  const remoteRevisionRef = useRef(null);
  const remoteSaveTimerRef = useRef(null);
  const lastRemoteSnapshotRef = useRef({ accountId: '', signature: '' });
  const [library, setLibrary] = useState(emptyResumeLibrary);
  const [userProfile, setUserProfile] = useState(() => normalizeUserProfile(null));
  const [remoteSyncReady, setRemoteSyncReady] = useState(false);
  const [connectionState, setConnectionState] = useState<'connecting' | 'unavailable' | 'ready'>('connecting');
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [profileImporting, setProfileImporting] = useState(false);
  const [generationLoading, setGenerationLoading] = useState(false);
  const [editorProfileOpen, setEditorProfileOpen] = useState(false);
  const [accountSwitcherOpen, setAccountSwitcherOpen] = useState(false);
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [registerDialogOpen, setRegisterDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState(rememberedAccounts);
  const [pendingSkillFitResumeIds, setPendingSkillFitResumeIds] = useState<Set<string>>(() => new Set());
  const [selectedResumeId, setSelectedResumeId] = useState(() => {
    if (typeof window === 'undefined') return null;
    const resume = new URLSearchParams(window.location.search).get('resume');
    return libraryRef.current.resumes.some((document) => document.id === resume) ? resume : null;
  });

  const persistLibrary = useCallback((nextLibrary) => {
    libraryRef.current = nextLibrary;
    setLibrary(nextLibrary);
    return true;
  }, []);

  const rememberAccount = useCallback((account, token) => {
    if (!account?.id || !account?.username || !token) return;
    setSavedAccounts((current) => {
      const next = [{ id: account.id, username: account.username, token, lastUsedAt: Date.now() }, ...current.filter((item) => item.id !== account.id)].slice(0, 12);
      storeRememberedAccounts(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const restoreSession = async () => {
      try {
        let response = await fetch('/api/auth/session');
        let payload = response.ok ? await response.json() : {};
        if (!payload?.account) {
          const saved = rememberedAccounts()[0];
          if (saved) {
            response = await fetch('/api/auth/activate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: saved.token }) });
            payload = response.ok ? await response.json() : {};
          }
        }
        if (payload?.account?.id && payload?.account?.username) {
          setCurrentAccount(payload.account);
          setSessionState('signed-in');
          const token = rememberedAccounts().find((account) => account.id === payload.account.id)?.token;
          if (token) rememberAccount(payload.account, token);
        } else setSessionState('signed-out');
      } catch {
        setSessionState('signed-out');
      }
    };
    void restoreSession();
  }, [rememberAccount]);

  const saveRemoteSnapshot = useCallback(async ({ accountId, payload, signature }) => {
    const save = async (baseRevision) => fetch('/api/account-state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, baseRevision, payload }),
    });
    let response = await save(remoteRevisionRef.current);
    if (response.status === 409) {
      const conflict = await response.json().catch(() => ({}));
      const currentRevision = Number(conflict?.current?.revision);
      if (Number.isInteger(currentRevision) && currentRevision > 0) {
        remoteRevisionRef.current = currentRevision;
        response = await save(currentRevision);
      }
    }
    if (!response.ok) throw new Error('REMOTE_PROFILE_SAVE_FAILED');
    const saved = await response.json().catch(() => ({}));
    if (saved.configured === false) return false;
    if (!Number.isInteger(saved.revision)) throw new Error('REMOTE_PROFILE_SAVE_INVALID');
    remoteRevisionRef.current = saved.revision;
    lastRemoteSnapshotRef.current = { accountId, signature };
    return true;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setRemoteSyncReady(false);
    setConnectionState('connecting');
    remoteRevisionRef.current = null;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
      setConnectionState('unavailable');
    }, 10_000);

    const hydrate = async () => {
      try {
        const response = await fetch(`/api/account-state?accountId=${encodeURIComponent(currentAccount.id)}`, {
          signal: controller.signal,
        });
        if (response.status === 404) {
          setRemoteSyncReady(true);
          setConnectionState('ready');
          return;
        }
        if (!response.ok) {
          setConnectionState('unavailable');
          return;
        }
        const snapshot = await response.json();
        if (!isRecord(snapshot) || !isRecord(snapshot.payload) || !Number.isInteger(snapshot.revision)) {
          setConnectionState('unavailable');
          return;
        }
        remoteRevisionRef.current = snapshot.revision;

        const remoteLibrary = isRecord(snapshot.payload.library) && Array.isArray(snapshot.payload.library.resumes)
          ? {
              version: LIBRARY_VERSION,
              resumes: snapshot.payload.library.resumes.map(normalizeResumeDocument),
            }
          : null;
        const remoteProfile = isRecord(snapshot.payload.profile)
          ? normalizeUserProfile(snapshot.payload.profile)
          : null;
        if (remoteLibrary) {
          libraryRef.current = remoteLibrary;
          setLibrary(remoteLibrary);
        }
        if (remoteProfile) {
          setUserProfile(remoteProfile);
        }
        setRemoteSyncReady(true);
        setConnectionState('ready');
      } catch (error) {
        if (!(error instanceof Error && error.name === 'AbortError' && !timedOut)) {
          setConnectionState('unavailable');
        }
      } finally {
        window.clearTimeout(timeout);
      }
    };

    void hydrate();
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [connectionAttempt, currentAccount.id]);

  useEffect(() => {
    if (!remoteSyncReady) return undefined;
    if (remoteSaveTimerRef.current) window.clearTimeout(remoteSaveTimerRef.current);
    const accountId = currentAccount.id;
    const signature = JSON.stringify({ library, profile: userProfile });
    if (lastRemoteSnapshotRef.current.accountId === accountId &&
      lastRemoteSnapshotRef.current.signature === signature) return undefined;
    const payload = {
      version: 1,
      library,
      profile: userProfile,
      savedAt: Date.now(),
    };
    remoteSaveTimerRef.current = window.setTimeout(async () => {
      try {
        await saveRemoteSnapshot({ accountId, payload, signature });
      } catch {
        // The in-memory editor state remains available until the server recovers.
      }
    }, 600);
    return () => {
      if (remoteSaveTimerRef.current) window.clearTimeout(remoteSaveTimerRef.current);
    };
  }, [currentAccount.id, library, remoteSyncReady, saveRemoteSnapshot, userProfile]);

  useEffect(() => {
    const syncFromLocation = () => {
      const resume = new URLSearchParams(window.location.search).get('resume');
      setSelectedResumeId(
        libraryRef.current.resumes.some((document) => document.id === resume) ? resume : null,
      );
    };
    window.addEventListener('popstate', syncFromLocation);
    return () => window.removeEventListener('popstate', syncFromLocation);
  }, []);

  useEffect(() => {
    const resume = new URLSearchParams(window.location.search).get('resume');
    if (library.resumes.some((document) => document.id === resume)) setSelectedResumeId(resume);
  }, [library]);

  const openResume = useCallback((id) => {
    const url = new URL(window.location.href);
    url.searchParams.set('resume', id);
    window.history.pushState({ jd2resume: 'editor' }, '', url);
    setSelectedResumeId(id);
  }, []);

  const returnHome = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('resume');
    window.history.replaceState({ jd2resume: 'home' }, '', url);
    setSelectedResumeId(null);
  }, []);

  const saveResume = useCallback((id, snapshot) => {
    const current = libraryRef.current;
    const index = current.resumes.findIndex((document) => document.id === id);
    if (index < 0) return false;
    const existing = current.resumes[index];
    if (resumeSnapshotEqual(existing, snapshot)) return true;
    const resumes = [...current.resumes];
    resumes[index] = { id, ...snapshot, updatedAt: Date.now() };
    return persistLibrary({ version: LIBRARY_VERSION, resumes });
  }, [persistLibrary]);

  const createResume = useCallback(({ documentName, language }) => {
    const name = documentName.trim();
    if (!name) return;
    const id = resumeId();
    const nextDocument = {
      id,
      ...blankResumeSnapshot({ documentName: name, language }),
      updatedAt: Date.now(),
    };
    const nextLibrary = {
      version: LIBRARY_VERSION,
      resumes: [nextDocument, ...libraryRef.current.resumes],
    };
    if (persistLibrary(nextLibrary)) openResume(id);
  }, [openResume, persistLibrary]);

  const duplicateResume = useCallback((id) => {
    const source = libraryRef.current.resumes.find((document) => document.id === id);
    if (!source) return;
    const duplicateId = resumeId();
    const duplicate = {
      ...source,
      id: duplicateId,
      documentName: `${source.documentName} Copy`,
      data: normalizeResumeData(source.data, source.language),
      customSections: [...source.customSections],
      customContent: normalizeCustomContent(source.customSections, source.customContent, source.language),
      sectionOrder: [...source.sectionOrder],
      updatedAt: Date.now(),
    };
    persistLibrary({
      version: LIBRARY_VERSION,
      resumes: [duplicate, ...libraryRef.current.resumes],
    });
  }, [persistLibrary]);

  const deleteResume = useCallback((id) => {
    const current = libraryRef.current;
    if (!current.resumes.some((document) => document.id === id)) return;
    persistLibrary({
      version: LIBRARY_VERSION,
      resumes: current.resumes.filter((document) => document.id !== id),
    });
  }, [persistLibrary]);

  const saveUserProfile = useCallback((nextProfile, options = { flushRemote: false }) => {
    const normalized = normalizeUserProfile(nextProfile);
    setUserProfile(normalized);
    if (!options.flushRemote) return true;
    const librarySnapshot = libraryRef.current;
    const signature = JSON.stringify({ library: librarySnapshot, profile: normalized });
    const payload = { version: 1, library: librarySnapshot, profile: normalized, savedAt: Date.now() };
    return (async () => {
      if (remoteSaveTimerRef.current) window.clearTimeout(remoteSaveTimerRef.current);
      const saved = await saveRemoteSnapshot({
        accountId: currentAccount.id,
        payload,
        signature,
      });
      if (remoteSaveTimerRef.current) window.clearTimeout(remoteSaveTimerRef.current);
      if (!saved) throw new Error('Database persistence is not configured on this server.');
      return true;
    })();
  }, [currentAccount.id, saveRemoteSnapshot]);

  const searchProfileDirectory = useCallback(async ({ type, keyword, level = '' }) => {
    const endpoint = type === 'major' ? '/api/searchMajors' : '/api/searchUniversities';
    const fallback = type === 'major' ? fallbackProfileMajors : fallbackProfileUniversities;
    const localResults = profileDirectoryMatches(fallback, keyword, level);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword, ...(level ? { level } : {}) }),
        signal: controller.signal,
      });
      if (!response.ok) return localResults;
      const payload = await response.json().catch(() => ({}));
      const items = payload?.result?.items;
      return Array.isArray(items) && items.length ? items.slice(0, 10) : localResults;
    } catch {
      return localResults;
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  const runProfileRequest = useCallback(async (path, body) => {
    setProfileImporting(true);
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(textValue(payload.error, 'Unable to import personal details right now.'));
      }
      if (!['chinese', 'english'].includes(payload.language)) {
        throw new Error('The imported personal details could not be read. Please try again.');
      }
      const profiles = isRecord(payload.profiles) ? payload.profiles : {
        [payload.language]: payload.profile,
      };
      if (!isRecord(profiles[payload.language])) {
        throw new Error('The imported personal details could not be read. Please try again.');
      }
      return {
        ...payload,
        profiles: normalizeUserProfile(profiles),
      };
    } finally {
      setProfileImporting(false);
    }
  }, []);

  const importProfileFromResume = useCallback(async ({ resumeText, sourceType = 'text', sourceFile }) => {
    const normalizedText = validateSourcePayload({ text: resumeText, sourceType, sourceFile });
    if (sourceType === 'text' && !normalizedText) {
      throw new Error('Enter resume content before importing personal details.');
    }
    if (sourceType !== 'text' && !sourceFile) {
      throw new Error('Choose a resume file before importing personal details.');
    }
    const sourceData = sourceFile ? await readFileAsDataUrl(sourceFile) : '';
    return runProfileRequest('/api/import-profile', {
      resumeText: normalizedText,
      sourceType,
      source: sourceData
        ? {
            name: sourceFile.name,
            mimeType: sourceFile.type,
            data: sourceData.split(',')[1] || '',
          }
        : null,
    });
  }, [runProfileRequest]);

  const translateImportedProfile = useCallback(async ({ language, profile }) =>
    runProfileRequest('/api/translate-profile', { language, profile }), [runProfileRequest]);

  const generateResumeFromJobDescription = useCallback(async ({
    jobDescription,
    aiMessage,
    outputLanguage,
    sourceType = 'text',
    sourceFile,
  }) => {
    setGenerationLoading(true);
    try {
    const normalizedJobDescription = validateSourcePayload({
      text: jobDescription,
      sourceType,
      sourceFile,
    });
    const languages = outputLanguage === 'both' ? ['chinese', 'english'] : [outputLanguage];
    const incompleteProfiles = languages
      .map((language) => ({ language, validation: validatePersonalProfile(userProfile, language) }))
      .filter(({ validation }) => !validation.valid);
    if (incompleteProfiles.length) {
      throw new Error(incompleteProfiles
        .map(({ language, validation }) => `${language === 'chinese' ? '中文' : 'English'}: ${validation.message}`)
        .join(' '));
    }
    if (sourceType === 'text' && !normalizedJobDescription) {
      throw new Error('Enter a job description before generating a resume.');
    }
    if (sourceType !== 'text' && !sourceFile) {
      throw new Error('Choose a source file before generating a resume.');
    }
    const sourceData = sourceFile
      ? await readFileAsDataUrl(sourceFile)
      : '';
    const applicationId = resumeId();
    const evidenceId = sourceFile ? resumeId() : '';
    const evidence = {
      applicationId,
      jobId: '',
      sourceType,
      jobDescription: normalizedJobDescription,
      uploadedSource: sourceFile
        ? { name: sourceFile.name, mimeType: sourceFile.type, evidenceId }
        : null,
      capturedAt: Date.now(),
    };
    const source = sourceData
      ? {
          name: sourceFile.name,
          mimeType: sourceFile.type,
          evidenceId,
          data: sourceData.split(',')[1] || '',
        }
      : null;
    const generatedResumes = [];

    for (const language of languages) {
      const baseResume = [...libraryRef.current.resumes]
        .sort((first, second) => second.updatedAt - first.updatedAt)
        .find((resume) => resume.language === language);
      const response = await fetch('/api/generate-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId,
          jobId: null,
          jobDescription: normalizedJobDescription,
          language,
          sourceType,
          source,
          evidence: {
            ...evidence,
            jobDescription: normalizedJobDescription,
          },
          profile: {
            ...userProfile[language],
            ...(typeof aiMessage === 'string' ? { aiMessage: aiMessage.trim().slice(0, 500) } : {}),
          },
          baseResume: baseResume?.data || null,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const traceId = textValue(payload.traceId);
        throw new Error(`${textValue(payload.error, 'Unable to generate a resume right now.')}${traceId ? ` Trace: ${traceId}` : ''}`);
      }
      if (!isRecord(payload.resume)) {
        throw new Error('The generated resume could not be read. Please try again.');
      }

      const data = normalizeResumeData(payload.resume, language);
      const generatedName = textValue(
        payload.documentName,
        `${resumeName(data.basics, language) || (isChineseResume(language) ? '未命名简历' : 'Untitled resume')} - ${data.basics.role || (isChineseResume(language) ? '目标职位' : 'Target role')}`,
      );
      const generatedId = resumeId();
      const snapshot = blankResumeSnapshot({ documentName: generatedName, language, layoutManifest: payload.layoutManifest, generationEvidence: {
        ...evidence,
        applicationId: textValue(payload.applicationId, applicationId),
      } });
      const customSections = data.certificates.length ? ['certifications'] : [];
      generatedResumes.push({
        id: generatedId,
        ...snapshot,
        data,
        template: 'profile',
        customSections,
        customContent: normalizeCustomContent(customSections, {}, language),
        sectionOrder: defaultSectionOrder('profile', customSections),
        updatedAt: Date.now(),
      });
    }

    const nextLibrary = {
      version: LIBRARY_VERSION,
      resumes: [...generatedResumes, ...libraryRef.current.resumes],
    };
    if (!persistLibrary(nextLibrary)) {
      throw new Error('The generated resume could not be saved to the server.');
    }
    setPendingSkillFitResumeIds((current) => new Set([...current, ...generatedResumes.map((resume) => resume.id)]));
    openResume(generatedResumes[0].id);
    } finally {
      setGenerationLoading(false);
    }
  }, [openResume, persistLibrary, userProfile]);

  if (sessionState === 'checking') return <RemoteConnectionGate unavailable={false} onRetry={() => window.location.reload()} />;
  if (sessionState === 'signed-out') return <RemoteLogin onSignedIn={(account, token) => { rememberAccount(account, token); setCurrentAccount(account); setSessionState('signed-in'); setConnectionAttempt((attempt) => attempt + 1); }} />;
  if (connectionState !== 'ready') {
    return <RemoteConnectionGate
      unavailable={connectionState === 'unavailable'}
      onRetry={() => setConnectionAttempt((attempt) => attempt + 1)}
    />;
  }

  const selectedResume = library.resumes.find((document) => document.id === selectedResumeId);
  const layoutFitLoading = Boolean(selectedResumeId && pendingSkillFitResumeIds.has(selectedResumeId));
  const appContent = selectedResume ? (
    <ResumeEditor
      key={selectedResume.id}
      resumeId={selectedResume.id}
      initialResumeState={selectedResume}
      accountUsername={currentAccount.username}
      autoFitSkills={pendingSkillFitResumeIds.has(selectedResume.id)}
      onSkillFitComplete={(id) => setPendingSkillFitResumeIds((current) => {
        if (!current.has(id)) return current;
        const next = new Set(current);
        next.delete(id);
        return next;
      })}
      onResumeChange={saveResume}
      onBack={returnHome}
      onEditProfile={() => setEditorProfileOpen(true)}
    />
  ) : (
    <ResumeLibrary
        resumes={library.resumes}
        onOpen={openResume}
        onCreate={createResume}
        onDuplicate={duplicateResume}
        onDelete={deleteResume}
        currentAccount={currentAccount}
        onSwitchAccount={() => setAccountSwitcherOpen(true)}
        onChangePassword={() => setPasswordDialogOpen(true)}
        userProfile={userProfile}
        onProfileSave={saveUserProfile}
        onImportProfile={importProfileFromResume}
        onTranslateProfile={translateImportedProfile}
        onSearchDirectory={searchProfileDirectory}
        onGenerate={generateResumeFromJobDescription}
    />
  );

  return (
    <>
      {appContent}
      {accountSwitcherOpen && (
        <AccountSwitcherDialog
          accounts={savedAccounts}
          currentAccount={currentAccount}
          onCancel={() => setAccountSwitcherOpen(false)}
          onSwitch={async (account) => {
            if (!account.token) return { ok: false, error: 'Saved sign-in is no longer available. Sign in again.' };
            const response = await fetch('/api/auth/activate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: account.token }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || !payload?.account) return { ok: false, error: textValue(payload?.error, 'Unable to switch accounts.') };
            libraryRef.current = emptyResumeLibrary();
            setLibrary(emptyResumeLibrary());
            setUserProfile(normalizeUserProfile(null));
            setPendingSkillFitResumeIds(new Set());
            setRemoteSyncReady(false);
            remoteRevisionRef.current = null;
            lastRemoteSnapshotRef.current = { accountId: '', signature: '' };
            rememberAccount(payload.account, account.token);
            setCurrentAccount(payload.account);
            returnHome();
            setAccountSwitcherOpen(false);
            return { ok: true };
          }}
          onSignIn={() => {
            setAccountSwitcherOpen(false);
            setLoginDialogOpen(true);
          }}
          onSignUp={() => {
            setAccountSwitcherOpen(false);
            setRegisterDialogOpen(true);
          }}
        />
      )}
      {loginDialogOpen && (
        <LoginDialog
          onCancel={() => setLoginDialogOpen(false)}
          onLogin={async (credentials) => {
            const response = await fetch('/api/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(credentials),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || !payload?.account || !payload?.token) return { ok: false, error: textValue(payload?.error, 'Unable to sign in.') };
            libraryRef.current = emptyResumeLibrary();
            setLibrary(emptyResumeLibrary());
            setUserProfile(normalizeUserProfile(null));
            setPendingSkillFitResumeIds(new Set());
            setRemoteSyncReady(false);
            remoteRevisionRef.current = null;
            lastRemoteSnapshotRef.current = { accountId: '', signature: '' };
            rememberAccount(payload.account, payload.token);
            setCurrentAccount(payload.account);
            returnHome();
            setLoginDialogOpen(false);
            setSessionState('signed-in');
            setConnectionAttempt((attempt) => attempt + 1);
            return { ok: true };
          }}
          onSignUp={() => { setLoginDialogOpen(false); setRegisterDialogOpen(true); }}
        />
      )}
      {registerDialogOpen && (
        <RegisterDialog
          onCancel={() => setRegisterDialogOpen(false)}
          onRegister={async (credentials) => {
            const response = await fetch('/api/auth/register', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(credentials),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || !payload?.account || !payload?.token) return { ok: false, error: textValue(payload?.error, 'Unable to sign up.') };
            libraryRef.current = emptyResumeLibrary();
            setLibrary(emptyResumeLibrary());
            setUserProfile(normalizeUserProfile(null));
            setPendingSkillFitResumeIds(new Set());
            setRemoteSyncReady(false);
            remoteRevisionRef.current = null;
            lastRemoteSnapshotRef.current = { accountId: '', signature: '' };
            rememberAccount(payload.account, payload.token);
            setCurrentAccount(payload.account);
            returnHome();
            setRegisterDialogOpen(false);
            setSessionState('signed-in');
            setConnectionAttempt((attempt) => attempt + 1);
            return { ok: true };
          }}
          onSignIn={() => { setRegisterDialogOpen(false); setLoginDialogOpen(true); }}
        />
      )}
      {passwordDialogOpen && (
        <ChangePasswordDialog
          onCancel={() => setPasswordDialogOpen(false)}
          onChangePassword={async (credentials) => {
            const response = await fetch('/api/auth/change-password', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(credentials),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) return { ok: false, error: textValue(payload?.error, 'Unable to change password.') };
            setPasswordDialogOpen(false);
            return { ok: true };
          }}
        />
      )}
      {editorProfileOpen && <PersonalProfileDialog profile={userProfile} onCancel={() => setEditorProfileOpen(false)} onComplete={() => setEditorProfileOpen(false)} onSave={saveUserProfile} onImport={importProfileFromResume} onTranslate={translateImportedProfile} onSearchDirectory={searchProfileDirectory} />}
      {profileImporting && <LoadingOverlay message="Importing personal details" />}
      {(generationLoading || layoutFitLoading) && <LoadingOverlay message={generationLoading ? 'Generating resume' : 'Fitting resume content to pages'} />}
    </>
  );
}

type RememberedAccount = { id: string; username: string; token?: string };

function AccountSwitcherDialog({ accounts, currentAccount, onCancel, onSwitch, onSignIn, onSignUp }: {
  accounts: RememberedAccount[];
  currentAccount: RememberedAccount;
  onCancel: () => void;
  onSwitch: (account: RememberedAccount) => Promise<{ ok: boolean; error?: string }>;
  onSignIn: () => void;
  onSignUp: () => void;
}) {
  const [switchingId, setSwitchingId] = useState('');
  const [error, setError] = useState('');
  const orderedAccounts = [
    currentAccount,
    ...accounts.filter((account) => account.id !== currentAccount.id),
  ];
  const switchAccount = async (account: RememberedAccount) => {
    if (account.id === currentAccount.id || switchingId) return;
    setSwitchingId(account.id);
    setError('');
    try {
      const result = await onSwitch(account);
      if (!result.ok) setError(result.error || 'Unable to switch accounts.');
    } catch {
      setError('Unable to switch accounts.');
    } finally {
      setSwitchingId('');
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <section className="resume-dialog account-switcher-dialog" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="account-switcher-title">
        <header className="resume-dialog-header account-dialog-header">
          <div><span className="dialog-kicker">Accounts</span><h2 id="account-switcher-title">Switch account</h2></div>
          <button className="icon-button small" type="button" onClick={onCancel} aria-label="Close" title="Close"><X size={16} /></button>
        </header>
        <div className="account-switcher-content">
          <div className="account-list">
            {orderedAccounts.map((account) => (
              <button key={account.id} type="button" className={cx('account-list-item', account.id === currentAccount.id && 'is-current')} onClick={() => void switchAccount(account)} disabled={account.id === currentAccount.id || Boolean(switchingId)} aria-label={account.id === currentAccount.id ? `${account.username}, current account` : `Switch to ${account.username}`} aria-busy={switchingId === account.id} aria-current={account.id === currentAccount.id ? 'page' : undefined}>
                <span className="account-list-avatar">{account.username.slice(0, 1).toUpperCase()}</span>
                <span className="account-list-copy"><strong>{account.username}</strong>{account.id === currentAccount.id && <small>Current account</small>}</span>
                {switchingId === account.id ? <LoaderCircle className="is-spinning" size={16} /> : account.id === currentAccount.id && <Check size={16} />}
              </button>
            ))}
            {error && <p className="account-auth-error" role="alert">{error}</p>}
          </div>
        </div>
        <footer className="account-dialog-footer">
          <button className="dialog-link-button" type="button" onClick={onSignIn}><LogIn size={15} /> Sign in</button>
          <button className="dialog-link-button" type="button" onClick={onSignUp}><UserPlus size={15} /> Sign up</button>
        </footer>
      </section>
    </div>
  );
}

function LoginDialog({ onCancel, onLogin, onSignUp }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (!username.trim() || !password || submitting) return;
    setSubmitting(true);
    const result = await onLogin({ username, password });
    setSubmitting(false);
    if (!result.ok) setError(result.error);
  };

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <form className="resume-dialog account-auth-dialog" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="login-title">
        <header className="resume-dialog-header account-dialog-header">
          <div><span className="dialog-kicker">Account</span><h2 id="login-title">Sign in</h2></div>
          <button className="icon-button small" type="button" onClick={onCancel} aria-label="Close" title="Close"><X size={16} /></button>
        </header>
        <div className="account-auth-content">
          <Field label="Username" value={username} onChange={(value) => { setUsername(value); setError(''); }} />
          <Field label="Password" type="password" value={password} onChange={(value) => { setPassword(value); setError(''); }} />
          {error && <p className="account-auth-error" role="alert">{error}</p>}
        </div>
        <footer className="account-auth-footer">
          <button className="primary-button" type="submit" disabled={!username.trim() || !password || submitting}><LogIn size={16} /> Sign in</button>
          <button className="dialog-link-button" type="button" onClick={onSignUp}>Sign up</button>
        </footer>
      </form>
    </div>
  );
}

function RegisterDialog({ onCancel, onRegister, onSignIn }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (!username.trim() || !password || submitting) return;
    setSubmitting(true);
    const result = await onRegister({ username, password });
    setSubmitting(false);
    if (!result.ok) setError(result.error);
  };

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <form className="resume-dialog account-auth-dialog" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="register-title">
        <header className="resume-dialog-header account-dialog-header">
          <div><span className="dialog-kicker">Account</span><h2 id="register-title">Sign up</h2></div>
          <button className="icon-button small" type="button" onClick={onCancel} aria-label="Close" title="Close"><X size={16} /></button>
        </header>
        <div className="account-auth-content">
          <Field label="Username" value={username} onChange={(value) => { setUsername(value); setError(''); }} />
          <Field label="Password" type="password" value={password} onChange={(value) => { setPassword(value); setError(''); }} />
          {error && <p className="account-auth-error" role="alert">{error}</p>}
        </div>
        <footer className="account-auth-footer">
          <button className="primary-button" type="submit" disabled={!username.trim() || !password || submitting}><UserPlus size={16} /> Sign up</button>
          <button className="dialog-link-button" type="button" onClick={onSignIn}>Sign in</button>
        </footer>
      </form>
    </div>
  );
}

function ChangePasswordDialog({ onCancel, onChangePassword }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (!currentPassword || !newPassword || !confirmation || submitting) return;
    if (newPassword !== confirmation) { setError('New passwords do not match.'); return; }
    setSubmitting(true);
    const result = await onChangePassword({ currentPassword, newPassword });
    setSubmitting(false);
    if (!result.ok) setError(result.error);
  };

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <form className="resume-dialog account-auth-dialog" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="change-password-title">
        <header className="resume-dialog-header account-dialog-header">
          <div><span className="dialog-kicker">Account</span><h2 id="change-password-title">Change password</h2></div>
          <button className="icon-button small" type="button" onClick={onCancel} aria-label="Close" title="Close"><X size={16} /></button>
        </header>
        <div className="account-auth-content">
          <Field label="Current password" type="password" value={currentPassword} onChange={(value) => { setCurrentPassword(value); setError(''); }} />
          <Field label="New password" type="password" value={newPassword} onChange={(value) => { setNewPassword(value); setError(''); }} />
          <Field label="Confirm new password" type="password" value={confirmation} onChange={(value) => { setConfirmation(value); setError(''); }} />
          {error && <p className="account-auth-error" role="alert">{error}</p>}
        </div>
        <footer className="account-auth-footer"><button className="primary-button" type="submit" disabled={!currentPassword || !newPassword || !confirmation || submitting}><KeyRound size={16} /> Change password</button></footer>
      </form>
    </div>
  );
}

function RemoteLogin({ onSignedIn }: { onSignedIn: (account: { id: string; username: string }, token: string) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login'); const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState('');
  const submit = async (event) => { event.preventDefault(); setError(''); const response = await fetch(`/api/auth/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) }); const payload = await response.json().catch(() => ({})); if (!response.ok || !payload.account || !payload.token) { setError(payload.error || '操作失败'); return; } onSignedIn(payload.account, payload.token); };
  return <main className="remote-connection-gate"><form className="remote-login" onSubmit={submit}><h1>{mode === 'login' ? 'Sign in' : 'Sign up'}</h1><input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Username" /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" />{error && <p>{error}</p>}<button className="primary-button" type="submit">{mode === 'login' ? <LogIn size={16} /> : <UserPlus size={16} />}{mode === 'login' ? 'Sign in' : 'Sign up'}</button><button className="dialog-link-button" type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? <><UserPlus size={15} /> Sign up</> : <><LogIn size={15} /> Sign in</>}</button></form></main>;
}

function RemoteConnectionGate({ unavailable, onRetry }: { unavailable: boolean; onRetry: () => void }) {
  return (
    <main className="remote-connection-gate" aria-live="assertive">
      <div className="remote-connection-gate-content">
        {unavailable ? <RefreshCw size={26} /> : <LoaderCircle className="is-spinning" size={26} />}
        <h1>{unavailable ? '网络不可用' : '正在连接服务器'}</h1>
        {unavailable && <button className="primary-button" type="button" onClick={onRetry}><RefreshCw size={16} />重试</button>}
      </div>
    </main>
  );
}

function ResumeEditor({ resumeId, initialResumeState, accountUsername, autoFitSkills, onSkillFitComplete, onResumeChange, onBack, onEditProfile }) {
  const initialWorkspaceState = useMemo(
    () => defaultWorkspacePreferences(initialResumeState),
    [initialResumeState],
  );
  const [history, setHistory] = useState({
    past: [],
    present: initialResumeState.data,
    future: [],
  });
  const [activeSection, setActiveSection] = useState(initialWorkspaceState.activeSection);
  const [openExperience, setOpenExperience] = useState(initialWorkspaceState.openExperience);
  const [template, setTemplate] = useState(initialResumeState.template);
  const [accent, setAccent] = useState(initialResumeState.accent);
  const [language] = useState(initialResumeState.language);
  const [zoom, setZoom] = useState(initialWorkspaceState.zoom);
  const [editorWidth, setEditorWidth] = useState(initialWorkspaceState.editorWidth);
  const [editorCollapsed, setEditorCollapsed] = useState(initialWorkspaceState.editorCollapsed);
  const [editorTransitioning, setEditorTransitioning] = useState(false);
  const [mobileMode, setMobileMode] = useState(initialWorkspaceState.mobileMode);
  const [templateMenu, setTemplateMenu] = useState(false);
  const [sectionMenu, setSectionMenu] = useState(false);
  const [aiPanel, setAiPanel] = useState(false);
  const [customSections, setCustomSections] = useState(initialResumeState.customSections);
  const [customContent, setCustomContent] = useState(initialResumeState.customContent);
  const [sectionOrder, setSectionOrder] = useState(initialResumeState.sectionOrder);
  const [sectionOrderCustomized, setSectionOrderCustomized] = useState(
    initialResumeState.sectionOrderCustomized,
  );
  const [documentName, setDocumentName] = useState(initialResumeState.documentName);
  const [renderState, setRenderState] = useState(initialResumeState.renderState);
  const [previewPosition, setPreviewPosition] = useState(initialWorkspaceState.previewPosition);
  const [saveState, setSaveState] = useState('Saved');
  const [toast, setToast] = useState('');
  const editorTransitionTimerRef = useRef(null);
  const skillFitHiddenCountRef = useRef(0);
  const skillFitCompletedRef = useRef(false);

  const data = history.present;

  useEffect(() => () => {
    if (editorTransitionTimerRef.current) {
      window.clearTimeout(editorTransitionTimerRef.current);
    }
  }, []);

  const toggleEditorCollapsed = () => {
    if (editorTransitionTimerRef.current) {
      window.clearTimeout(editorTransitionTimerRef.current);
    }
    setEditorTransitioning(true);
    window.requestAnimationFrame(() => {
      setEditorCollapsed((current) => !current);
      editorTransitionTimerRef.current = window.setTimeout(() => {
        setEditorTransitioning(false);
        editorTransitionTimerRef.current = null;
      }, 260);
    });
  };

  const updateData = (updater) => {
    setHistory((current) => {
      const next = typeof updater === 'function' ? updater(current.present) : updater;
      if (next === current.present) return current;
      return {
        past: [...current.past.slice(-39), current.present],
        present: next,
        future: [],
      };
    });
  };

  // A page plan belongs to one immutable snapshot only. Invalidate it before the edited frame paints.
  useLayoutEffect(() => {
    setRenderState((current) => ({
      ...current,
      status: 'dirty',
      draftRevision: current.draftRevision + 1,
      pagePlan: null,
      layoutReport: null,
      currentSnapshotHash: '',
    }));
  }, [accent, customContent, customSections, data, documentName, sectionOrder, sectionOrderCustomized, template]);

  const canExport = template === 'profile' && renderState.status === 'valid' && Boolean(renderState.pagePlan);

  useEffect(() => {
    setSaveState('Saving...');
    const saved = onResumeChange(resumeId, {
      documentName,
      language,
      data,
      template,
      accent,
      customSections,
      customContent,
      sectionOrder,
      sectionOrderCustomized,
      generationEvidence: initialResumeState.generationEvidence,
      legacyLayoutManifest: initialResumeState.legacyLayoutManifest,
      renderState,
    });
    if (!saved) {
      setSaveState('Save failed');
      return undefined;
    }
    const timer = window.setTimeout(() => setSaveState('Saved'), 260);
    return () => window.clearTimeout(timer);
  }, [
    accent,
    customContent,
    customSections,
    data,
    documentName,
    initialResumeState.generationEvidence,
    initialResumeState.legacyLayoutManifest,
    renderState,
    language,
    onResumeChange,
    resumeId,
    sectionOrder,
    sectionOrderCustomized,
    template,
  ]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const undo = () => {
    setHistory((current) => {
      if (!current.past.length) return current;
      const previous = current.past[current.past.length - 1];
      return {
        past: current.past.slice(0, -1),
        present: previous,
        future: [current.present, ...current.future],
      };
    });
  };

  const redo = () => {
    setHistory((current) => {
      if (!current.future.length) return current;
      const next = current.future[0];
      return {
        past: [...current.past, current.present],
        present: next,
        future: current.future.slice(1),
      };
    });
  };

  const updateBasics = (field, value) => {
    updateData((current) => ({
      ...current,
      basics: { ...current.basics, [field]: value },
    }));
  };

  const updateExperience = (id, field, value) => {
    updateData((current) => ({
      ...current,
      experience: current.experience.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    }));
  };

  const updateBullet = (experienceId, index, value) => {
    updateData((current) => ({
      ...current,
      experience: current.experience.map((item) =>
        item.id === experienceId
          ? {
              ...item,
              bullets: item.bullets.map((bullet, bulletIndex) =>
                bulletIndex === index ? value : bullet,
              ),
            }
          : item,
      ),
    }));
  };

  const addExperience = () => {
    const nextId = Math.max(0, ...data.experience.map((item) => item.id)) + 1;
    const nextItem = {
      id: nextId,
      role: 'Product Designer',
      company: 'Company name',
      location: 'City, State',
      start: 'Jan 2020',
      end: 'Present',
      current: true,
      bullets: ['Add a measurable accomplishment or outcome.'],
    };
    updateData((current) => ({
      ...current,
      experience: [nextItem, ...current.experience],
    }));
    setOpenExperience(nextId);
    setToast('Experience added');
  };

  const removeExperience = (id) => {
    updateData((current) => ({
      ...current,
      experience: current.experience.filter((item) => item.id !== id),
    }));
    setOpenExperience(null);
    setToast('Experience removed');
  };

  const score = useMemo(() => {
    let total = 56;
    if (data.summary.length > 100) total += 9;
    if (data.experience.length >= 2) total += 11;
    if (data.experience.every((item) => item.bullets.length >= 2)) total += 6;
    if (data.education.length) total += 5;
    if (data.skills.expertise.length > 30) total += 5;
    if (customSections.length) total += 3;
    return Math.min(total, 96);
  }, [data, customSections]);

  const sectionDefinitions = [
    ...localizedBaseSections(language),
    ...customSections.map((sectionId) => ({
      id: sectionId,
      label: customContent[sectionId]?.title || customSectionDefaults(sectionId, language).title,
      icon: sectionSuggestions.find((item) => item.id === sectionId)?.icon || Award,
    })),
  ];
  const sections = sectionOrder
    .map((id) => sectionDefinitions.find((section) => section.id === id))
    .filter(Boolean);
  sections.unshift({ id: 'layout', label: isChineseResume(language) ? '整体布局' : 'Overall layout', icon: Settings2 });

  const addCustomSection = (id) => {
    const defaults = customSectionDefaults(id, language);
    if (!customSections.includes(id)) {
      setCustomSections((current) => [...current, id]);
      setSectionOrder((current) => [...current.filter((sectionId) => sectionId !== id), id]);
      setCustomContent((current) => ({
        ...current,
        [id]: { ...defaults },
      }));
    }
    setActiveSection(id);
    setSectionMenu(false);
    setMobileMode('edit');
    setToast(`${defaults.title} added`);
  };

  const reorderSections = (sourceId, targetId) => {
    if (sourceId === targetId || sourceId === 'basics' || targetId === 'basics' || sourceId === 'layout' || targetId === 'layout') return;
    setSectionOrder((current) => {
      const sourceIndex = current.indexOf(sourceId);
      const targetIndex = current.indexOf(targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const next = current.filter((id) => id !== sourceId);
      next.splice(next.indexOf(targetId), 0, sourceId);
      return next;
    });
    setSectionOrderCustomized(true);
    setToast('Section order updated');
  };

  const applyAiSummary = () => {
    updateData((current) => ({
      ...current,
      summary:
        'Strategic product designer with 7+ years of experience simplifying complex enterprise workflows. Led research, interaction design, and design systems that increased activation by 16%, improved task completion by 27%, and accelerated delivery across three product teams.',
    }));
    setAiPanel(false);
    setToast('Summary updated');
  };

  const resetDemo = () => {
    setHistory({ past: [], present: normalizeResumeData(null), future: [] });
    setCustomSections([]);
    setCustomContent({});
    setSectionOrder(defaultSectionOrder('modern', []));
    setSectionOrderCustomized(false);
    setDocumentName(DEFAULT_DOCUMENT_NAME);
    setTemplate('modern');
    setAccent(accentOptions[0]);
    setActiveSection('experience');
    setOpenExperience(initialResume.experience[0].id);
    setToast('Demo content restored');
  };

  const exportPdf = async () => {
    if (!canExport) {
      setToast('Wait for the verified page layout before exporting.');
      return;
    }
    setToast('Preparing PDF...');
    try {
      const resumeDocument = {
        id: resumeId,
        documentName,
        language,
        data,
        template,
        accent,
        customSections,
        customContent,
        sectionOrder,
        sectionOrderCustomized,
        generationEvidence: initialResumeState.generationEvidence,
        legacyLayoutManifest: initialResumeState.legacyLayoutManifest,
        renderState,
        updatedAt: Date.now(),
      };
      const response = await fetch('/api/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: resumeDocument }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(textValue(payload.error, 'PDF export failed.'));
      }
      const url = URL.createObjectURL(await response.blob());
      const link = window.document.createElement('a');
      link.href = url;
      link.download = `${documentName.replace(/[^\w\u4e00-\u9fff-]+/g, '-') || 'resume'}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      setToast('PDF exported');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'PDF export failed');
    }
  };

  const refineGeneratedLayout = useCallback(async (report) => {
    try {
      const response = await fetch('/api/refine-resume-layout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language, data, layoutReport: report }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !isRecord(payload.data)) throw new Error(textValue(payload.error, 'Layout refinement failed.'));
      updateData(normalizeResumeData(payload.data, language));
      setToast('Resume content adjusted to fit the page layout');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Layout refinement failed');
    }
  }, [data, language]);

  return (
    <div className="app-shell">
      <TopBar
        documentName={documentName}
        onDocumentNameChange={setDocumentName}
        saveState={saveState}
        undo={undo}
        redo={redo}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onExport={exportPdf}
        canExport={canExport}
        onAi={() => setAiPanel(true)}
        onReset={resetDemo}
        onBack={onBack}
        accountUsername={accountUsername}
        onEditProfile={onEditProfile}
      />

      <MobileTabs value={mobileMode} onChange={setMobileMode} />

      <main
        className={cx(
          'workspace',
          editorCollapsed && 'editor-collapsed',
          editorTransitioning && 'editor-transitioning',
        )}
        data-mobile-mode={mobileMode}
        style={{ '--editor-width': `${editorWidth}px` } as CssVariables}
      >
        <OutlineSidebar
          sections={sections}
          activeSection={activeSection}
          onSelect={(id) => {
            setActiveSection(id);
            setMobileMode('edit');
          }}
          score={score}
          sectionMenu={sectionMenu}
          setSectionMenu={setSectionMenu}
          customSections={customSections}
          addCustomSection={addCustomSection}
          onReorder={reorderSections}
          language={language}
        />

        <EditorPanel
          activeSection={activeSection}
          data={data}
          updateData={updateData}
          updateBasics={updateBasics}
          updateExperience={updateExperience}
          updateBullet={updateBullet}
          addExperience={addExperience}
          removeExperience={removeExperience}
          openExperience={openExperience}
          setOpenExperience={setOpenExperience}
          customContent={customContent}
          setCustomContent={setCustomContent}
          onAi={() => setAiPanel(true)}
          onPreview={() => setMobileMode('preview')}
          editorCollapsed={editorCollapsed}
          onToggleCollapsed={toggleEditorCollapsed}
          language={language}
        />

        <ColumnResizer
          value={editorWidth}
          onChange={setEditorWidth}
          onCommit={(width) => setEditorWidth(Math.round(width))}
        />

        <PreviewPanel
          data={data}
          template={template}
          setTemplate={setTemplate}
          accent={accent}
          setAccent={setAccent}
          zoom={zoom}
          setZoom={setZoom}
          previewPosition={previewPosition}
          onPreviewPositionChange={setPreviewPosition}
          templateMenu={templateMenu}
          setTemplateMenu={setTemplateMenu}
          customSections={customSections}
          customContent={customContent}
          sectionOrder={sectionOrder}
          sectionOrderCustomized={sectionOrderCustomized}
          language={language}
          documentId={resumeId}
          documentName={documentName}
          layoutManifest={initialResumeState.legacyLayoutManifest}
          renderState={renderState}
          autoFitLayout={autoFitSkills}
          onLayoutFailure={() => {
            if (autoFitSkills && !skillFitCompletedRef.current) {
              skillFitCompletedRef.current = true;
              onSkillFitComplete(resumeId);
            }
          }}
          onValidPlan={(pagePlan, report) => {
            const needsSkillFit = autoFitSkills && skillsStartOnNewPage(pagePlan);
            if (needsSkillFit && skillFitHiddenCountRef.current < MAX_SKILL_FIT_HIDES) {
              const fittedData = hideOneBulletForSkills(data, pagePlan);
              if (fittedData) {
                skillFitHiddenCountRef.current += 1;
                updateData(fittedData);
                return;
              }
            }
            if (autoFitSkills && !skillFitCompletedRef.current) {
              skillFitCompletedRef.current = true;
              onSkillFitComplete(resumeId);
            }
            setRenderState((current) => {
              return {
                status: 'valid',
                draftRevision: pagePlan.revision,
                currentSnapshotHash: pagePlan.snapshotHash,
                rendererVersion: pagePlan.rendererVersion,
                layoutTuning: pagePlan.tuning,
                pagePlan,
                layoutReport: report,
                lastValidSnapshotHash: pagePlan.snapshotHash,
                lastValidAt: Date.now(),
              };
            });
          }}
        />
      </main>

      {aiPanel && (
        <AiPanel
          currentSummary={data.summary}
          onClose={() => setAiPanel(false)}
          onApply={applyAiSummary}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          <Check size={16} strokeWidth={2.5} />
          {toast}
        </div>
      )}
    </div>
  );
}

function formatUpdatedAt(timestamp) {
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return 'Updated just now';
  if (minutes < 60) return `Updated ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Updated ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Updated ${days}d ago`;
  return `Updated ${new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(timestamp))}`;
}

function ResumeLibrary({
  resumes,
  onOpen,
  onCreate,
  onDuplicate,
  onDelete,
  currentAccount,
  onSwitchAccount,
  onChangePassword,
  userProfile,
  onProfileSave,
  onImportProfile,
  onTranslateProfile,
  onSearchDirectory,
  onGenerate,
}) {
  const [query, setQuery] = useState('');
  const [openMenu, setOpenMenu] = useState(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [generatorDialogOpen, setGeneratorDialogOpen] = useState(false);
  const visibleResumes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...resumes]
      .sort((first, second) => second.updatedAt - first.updatedAt)
      .filter((resume) => {
        if (!normalizedQuery) return true;
        return `${resume.documentName} ${resume.data.basics.role}`
          .toLowerCase()
          .includes(normalizedQuery);
      });
  }, [query, resumes]);

  return (
    <div
      className="library-shell"
      onMouseDown={(event) => {
        if (!(event.target instanceof Element) || !event.target.closest('.resume-card-menu-wrap')) {
          setOpenMenu(null);
        }
        if (!(event.target instanceof Element) || !event.target.closest('.account-menu-wrap')) {
          setAccountMenuOpen(false);
        }
      }}
    >
      <header className="library-topbar">
        <a className="brand library-brand" href="#" onClick={(event) => event.preventDefault()} aria-label="Draftline home">
          <span className="brand-mark"><FileText size={18} /></span>
          <span>Draftline</span>
        </a>
        <div className="library-topbar-actions">
          <button
            className="secondary-button library-generate-top"
            onClick={() => setGeneratorDialogOpen(true)}
          >
            <WandSparkles size={16} />
            <span>Generate from JD</span>
          </button>
          <button className="primary-button library-create-top" onClick={() => setCreateDialogOpen(true)} aria-label="New resume" title="New resume">
            <Plus size={16} />
            <span>New resume</span>
          </button>
          <div className="account-menu-wrap">
            <button
              className="avatar-button"
              onClick={() => setAccountMenuOpen((current) => !current)}
              aria-label="Account menu"
              aria-expanded={accountMenuOpen}
              title="Account menu"
            >
              {accountInitials(currentAccount.username)}
            </button>
            {accountMenuOpen && (
              <div className="account-menu">
                <button
                  onClick={() => {
                    setProfileDialogOpen(true);
                    setAccountMenuOpen(false);
                  }}
                >
                  <UserRound size={16} />
                  Edit personal profile
                </button>
                <button onClick={() => { setAccountMenuOpen(false); void onSwitchAccount(); }}>
                  <UsersRound size={16} />
                  Switch account
                </button>
                <button onClick={() => { setAccountMenuOpen(false); void onChangePassword(); }}>
                  <KeyRound size={16} />
                  Change password
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="library-main">
        <div className="library-heading-row">
          <label className="library-search">
            <Search size={17} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search resumes"
              aria-label="Search resumes"
            />
            {query && (
              <button onClick={() => setQuery('')} aria-label="Clear search" title="Clear search">
                <X size={15} />
              </button>
            )}
          </label>
        </div>

        <div className="library-toolbar">
          <span><FolderOpen size={15} /> All resumes</span>
          <span>Recently edited</span>
        </div>

        {visibleResumes.length ? (
          <div className="resume-library-grid">
            {visibleResumes.map((resume) => (
              <ResumeLibraryCard
                key={resume.id}
                resume={resume}
                menuOpen={openMenu === resume.id}
                onToggleMenu={() => setOpenMenu((current) => current === resume.id ? null : resume.id)}
                onOpen={() => onOpen(resume.id)}
                onDuplicate={() => {
                  onDuplicate(resume.id);
                  setOpenMenu(null);
                }}
                onDelete={() => {
                  setPendingDelete(resume);
                  setOpenMenu(null);
                }}
              />
            ))}
          </div>
        ) : (
          <div className="library-empty">
            <Search size={22} />
            <h2>No resumes found</h2>
            <button onClick={() => setQuery('')}>Clear search</button>
          </div>
        )}
      </main>
      {createDialogOpen && (
        <NewResumeDialog
          onCancel={() => setCreateDialogOpen(false)}
          onSave={(details) => {
            onCreate(details);
            setCreateDialogOpen(false);
          }}
        />
      )}
      {pendingDelete && (
        <DeleteResumeDialog
          resume={pendingDelete}
          onCancel={() => setPendingDelete(null)}
          onDelete={() => {
            onDelete(pendingDelete.id);
            setPendingDelete(null);
          }}
        />
      )}
      {profileDialogOpen && (
        <PersonalProfileDialog
          profile={userProfile}
          onCancel={() => setProfileDialogOpen(false)}
          onSave={onProfileSave}
          onComplete={() => setProfileDialogOpen(false)}
          onImport={onImportProfile}
          onTranslate={onTranslateProfile}
          onSearchDirectory={onSearchDirectory}
        />
      )}
      {generatorDialogOpen && (
        <JobDescriptionDialog
          profile={userProfile}
          onCancel={() => setGeneratorDialogOpen(false)}
          onGenerate={onGenerate}
        />
      )}
    </div>
  );
}

function ResumeLibraryCard({ resume, menuOpen, onToggleMenu, onOpen, onDuplicate, onDelete }) {
  return (
    <article
      className="resume-library-card"
      onClick={(event) => {
        if (!(event.target instanceof Element) || !event.target.closest('.resume-card-menu-wrap')) {
          onOpen();
        }
      }}
    >
      <button
        className="resume-card-preview-button"
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
        aria-label={`Edit ${resume.documentName}`}
      >
        <ResumeCardPreview resume={resume} />
      </button>
      <div className="resume-card-details">
        <div className="resume-card-copy">
          <h2>{resume.documentName}</h2>
          <p>{resume.data.basics.role}</p>
          <span>{formatUpdatedAt(resume.updatedAt)}</span>
        </div>
        <div className="resume-card-commands">
          <div className="resume-card-menu-wrap">
            <button className="icon-button small" onClick={onToggleMenu} aria-label={`More actions for ${resume.documentName}`} title="More actions">
              <MoreHorizontal size={17} />
            </button>
            {menuOpen && (
              <div className="resume-card-menu">
                <button onClick={onDuplicate}><Copy size={15} /> Duplicate</button>
                <button onClick={onDelete}><Trash2 size={15} /> Delete</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function NewResumeDialog({ onCancel, onSave }) {
  const [language, setLanguage] = useState('english');
  const [documentName, setDocumentName] = useState('');
  const canSave = Boolean(documentName.trim());

  const submit = (event) => {
    event.preventDefault();
    if (canSave) onSave({ documentName: documentName.trim(), language });
  };

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <form className="resume-dialog" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="new-resume-title">
        <header className="resume-dialog-header">
          <h2 id="new-resume-title">New resume</h2>
        </header>
        <div className="resume-dialog-content">
          <div className="resume-language-selector" role="group" aria-label="Resume language">
            <button
              type="button"
              className={cx(language === 'english' && 'is-selected')}
              onClick={() => setLanguage('english')}
              aria-pressed={language === 'english'}
            >
              English
            </button>
            <button
              type="button"
              className={cx(language === 'chinese' && 'is-selected')}
              onClick={() => setLanguage('chinese')}
              aria-pressed={language === 'chinese'}
            >
              中文
            </button>
          </div>
          <label className="field">
            <span>Resume name</span>
            <input
              autoFocus
              value={documentName}
              onChange={(event) => setDocumentName(event.target.value)}
              aria-label="Resume name"
            />
          </label>
        </div>
        <footer className="resume-dialog-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>Cancel</button>
          <button className="primary-button" type="submit" disabled={!canSave}>Save</button>
        </footer>
      </form>
    </div>
  );
}

function splitProfileDegree(value) {
  const match = textValue(value).match(/^(.+?)\s*\((.+?)\)$/);
  return match ? { degree: match[1].trim(), studyType: match[2].trim() } : { degree: textValue(value).trim(), studyType: '' };
}

function ProfileSectionHeader({ title, actionLabel = '', onAction = undefined }) {
  return (
    <div className="profile-section-heading">
      <h3>{title}</h3>
      {actionLabel && <button className="dialog-link-button profile-section-action" type="button" onClick={onAction}><Plus size={14} /> {actionLabel}</button>}
    </div>
  );
}

function ProfilePickerButton({ label, value, placeholder, onClick }) {
  return (
    <label className="field">
      <span>{label}</span>
      <button className={cx('profile-picker-trigger', !value && 'is-placeholder')} type="button" onClick={onClick}>
        <span>{value || placeholder}</span>
        <ChevronDown size={15} />
      </button>
    </label>
  );
}

function ProfileDirectoryPicker({ type, language, keyword, results, loading, onKeywordChange, onSelect, onUseTypedValue, onCancel }) {
  const chinese = language === 'chinese';
  const university = type === 'university';
  const title = university ? (chinese ? '选择学校' : 'Choose university') : (chinese ? '选择专业' : 'Choose major');
  const placeholder = university ? (chinese ? '搜索学校名称' : 'Search university') : (chinese ? '搜索专业名称' : 'Search major');
  return (
    <div className="modal-backdrop profile-picker-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onCancel();
    }}>
      <section className="resume-dialog profile-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-picker-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="resume-dialog-header account-dialog-header">
          <div>
            <span className="dialog-kicker">{university ? 'Institution library' : 'Major library'}</span>
            <h2 id="profile-picker-title">{title}</h2>
          </div>
          <button className="icon-button small" type="button" onClick={onCancel} aria-label="Close" title="Close"><X size={16} /></button>
        </header>
        <div className="profile-picker-content">
          <label className="library-search profile-picker-search">
            <Search size={16} />
            <input autoFocus value={keyword} onChange={(event) => onKeywordChange(event.target.value)} placeholder={placeholder} aria-label={placeholder} />
          </label>
          {loading && <p className="profile-picker-status">Searching...</p>}
          {!loading && !results.length && <p className="profile-picker-status">{chinese ? '没有匹配结果，可直接使用当前输入。' : 'No matches. You can use the current input.'}</p>}
          <div className="profile-picker-list" role="listbox" aria-label={title}>
            {results.map((item) => {
              const primary = chinese ? item.chinese_name : item.english_name || item.chinese_name;
              const secondary = chinese ? item.english_name : item.chinese_name;
              return (
                <button className="profile-picker-option" key={item.id || `${item.chinese_name}-${item.english_name}`} type="button" role="option" onClick={() => onSelect(item)}>
                  <span><strong>{primary || (chinese ? '未命名' : 'Untitled')}</strong>{secondary && <small>{secondary}</small>}</span>
                  {university && (chinese ? item.country_chinese : item.country_english) && <small>{chinese ? item.country_chinese : item.country_english}</small>}
                </button>
              );
            })}
          </div>
        </div>
        <footer className="resume-dialog-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>{chinese ? '取消' : 'Cancel'}</button>
          <button className="primary-button" type="button" onClick={onUseTypedValue} disabled={!keyword.trim()}>{chinese ? '使用当前输入' : 'Use current input'}</button>
        </footer>
      </section>
    </div>
  );
}

function ProfileWheelPicker({ title, chinese, columns, allowPresent, onPresent, onConfirm, onCancel }) {
  const [selection, setSelection] = useState(() => Object.fromEntries(columns.map((column) => [column.id, column.value || column.options[0] || ''])));
  const update = (id, value) => setSelection((current) => ({ ...current, [id]: value }));
  return (
    <div className="modal-backdrop profile-picker-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onCancel();
    }}>
      <section className="resume-dialog profile-wheel-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-wheel-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="resume-dialog-header account-dialog-header">
          <h2 id="profile-wheel-title">{title}</h2>
          <button className="icon-button small" type="button" onClick={onCancel} aria-label="Close" title="Close"><X size={16} /></button>
        </header>
        <div className="profile-wheel-content">
          <div className="profile-wheel-columns">
            {columns.map((column) => (
              <label className="profile-wheel-column" key={column.id}>
                <span>{column.label}</span>
                <select value={selection[column.id]} onChange={(event) => update(column.id, event.target.value)} aria-label={column.label}>
                  {column.options.map((option) => <option value={option} key={option}>{option}</option>)}
                </select>
              </label>
            ))}
          </div>
          {allowPresent && <button className="dialog-link-button profile-present-button" type="button" onClick={onPresent}>{chinese ? '设为至今' : 'Set to present'}</button>}
        </div>
        <footer className="resume-dialog-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>{chinese ? '取消' : 'Cancel'}</button>
          <button className="primary-button" type="button" onClick={() => onConfirm(selection)}>{chinese ? '保存' : 'Save'}</button>
        </footer>
      </section>
    </div>
  );
}

function PersonalProfileDialog({ profile, onCancel, onSave, onComplete, onImport, onTranslate, onSearchDirectory }) {
  const [language, setLanguage] = useState('chinese');
  const [draft, setDraft] = useState(() => normalizeUserProfile(profile));
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importedProfile, setImportedProfile] = useState(null);
  const [educationEditor, setEducationEditor] = useState(null);
  const [workEditor, setWorkEditor] = useState(null);
  const [entryError, setEntryError] = useState('');
  const [profileError, setProfileError] = useState('');
  const [directoryPicker, setDirectoryPicker] = useState(null);
  const [directoryKeyword, setDirectoryKeyword] = useState('');
  const [directoryResults, setDirectoryResults] = useState([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [wheelPicker, setWheelPicker] = useState(null);
  const fields = draft[language];
  const chinese = language === 'chinese';
  const updateField = (field, value) => {
    setProfileError('');
    setDraft((current) => ({
      ...current,
      [language]: { ...current[language], [field]: value },
    }));
  };

  useEffect(() => {
    if (!directoryPicker) return undefined;
    let active = true;
    const timer = window.setTimeout(async () => {
      setDirectoryLoading(true);
      const results = onSearchDirectory
        ? await onSearchDirectory({
            type: directoryPicker.type,
            keyword: directoryKeyword,
            level: directoryPicker.type === 'major' ? majorLevelForDegree(educationEditor?.degree) : '',
          })
        : profileDirectoryMatches(
            directoryPicker.type === 'major' ? fallbackProfileMajors : fallbackProfileUniversities,
            directoryKeyword,
            directoryPicker.type === 'major' ? majorLevelForDegree(educationEditor?.degree) : '',
          );
      if (active) {
        setDirectoryResults(Array.isArray(results) ? results : []);
        setDirectoryLoading(false);
      }
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [directoryKeyword, directoryPicker, educationEditor?.degree, onSearchDirectory]);

  const openDirectoryPicker = (type) => {
    if (!educationEditor) return;
    setDirectoryPicker({ type });
    setDirectoryKeyword(type === 'university' ? educationEditor.school : educationEditor.major);
    setDirectoryResults([]);
  };

  const selectDirectoryItem = (item) => {
    if (!directoryPicker) return;
    if (directoryPicker.type === 'university') {
      setEducationEditor((current) => ({
        ...current,
        school: chinese ? item.chinese_name || item.english_name : item.english_name || item.chinese_name,
        schoolEn: item.english_name || '',
        schoolCn: item.chinese_name || '',
        countryChinese: item.country_chinese || '',
        countryEnglish: item.country_english || '',
      }));
    } else {
      setEducationEditor((current) => ({
        ...current,
        major: chinese ? item.chinese_name || item.english_name : item.english_name || item.chinese_name,
        majorEn: item.english_name || '',
      }));
    }
    setDirectoryPicker(null);
  };

  const useTypedDirectoryValue = () => {
    if (!directoryPicker || !directoryKeyword.trim()) return;
    setEducationEditor((current) => directoryPicker.type === 'university'
      ? { ...current, school: directoryKeyword.trim(), schoolCn: chinese ? directoryKeyword.trim() : current.schoolCn }
      : { ...current, major: directoryKeyword.trim() });
    setDirectoryPicker(null);
  };

  const openEducationEditor = (index = -1) => {
    const source = index >= 0 ? fields.educations[index] : normalizeProfileEducation({});
    const degree = splitProfileDegree(source.degree);
    setEntryError('');
    setEducationEditor({
      index,
      ...source,
      degree: degree.degree,
      studyType: source.studyType || degree.studyType,
    });
    setWorkEditor(null);
  };

  const saveEducation = () => {
    if (!educationEditor.school.trim()) return setEntryError(chinese ? '请填写学校。' : 'Enter a school.');
    if (!educationEditor.degree.trim()) return setEntryError(chinese ? '请选择学历。' : 'Choose a degree.');
    if (!educationEditor.major.trim()) return setEntryError(chinese ? '请填写专业。' : 'Enter a major.');
    if (!educationEditor.startDate) return setEntryError(chinese ? '请选择入学时间。' : 'Choose a start date.');
    if (!educationEditor.endDate) return setEntryError(chinese ? '请选择毕业时间。' : 'Choose an end date.');
    if (profileDateRangeInvalid(educationEditor.startDate, educationEditor.endDate)) return setEntryError(chinese ? '入学时间不能晚于毕业时间。' : 'The start date cannot be after the end date.');
    setDraft((current) => {
      const educations = [...current[language].educations];
      const { index, ...entry } = educationEditor;
      const nextEntry = { ...entry, degree: entry.degree.trim(), studyType: entry.studyType.trim() };
      if (index < 0) educations.push(nextEntry);
      else educations[index] = nextEntry;
      return { ...current, [language]: { ...current[language], educations } };
    });
    setEducationEditor(null);
    setEntryError('');
  };

  const deleteEducation = (index) => updateField('educations', fields.educations.filter((_, itemIndex) => itemIndex !== index));

  const openWorkEditor = (index = -1) => {
    const source = index >= 0 ? fields.workExperiences[index] : normalizeProfileWorkExperience({});
    setEntryError('');
    setWorkEditor({ index, ...source });
    setEducationEditor(null);
  };

  const saveWork = () => {
    if (!workEditor.company.trim()) return setEntryError(chinese ? '请填写公司名称。' : 'Enter a company.');
    if (!workEditor.jobTitle.trim()) return setEntryError(chinese ? '请填写职位名称。' : 'Enter a job title.');
    if (!workEditor.startDate) return setEntryError(chinese ? '请选择开始时间。' : 'Choose a start date.');
    if (!workEditor.endDate) return setEntryError(chinese ? '请选择结束时间。' : 'Choose an end date.');
    if (profileDateRangeInvalid(workEditor.startDate, workEditor.endDate)) return setEntryError(chinese ? '开始时间不能晚于结束时间。' : 'The start date cannot be after the end date.');
    setDraft((current) => {
      const workExperiences = [...current[language].workExperiences];
      const { index, ...entry } = workEditor;
      if (index < 0) workExperiences.push(entry);
      else workExperiences[index] = entry;
      return { ...current, [language]: { ...current[language], workExperiences } };
    });
    setWorkEditor(null);
    setEntryError('');
  };

  const deleteWork = (index) => updateField('workExperiences', fields.workExperiences.filter((_, itemIndex) => itemIndex !== index));

  const openDegreePicker = () => {
    if (!educationEditor) return;
    const options = profileDegreeOptions[language];
    const studyOptions = profileStudyTypeOptions[language];
    setWheelPicker({
      type: 'degree',
      columns: [
        { id: 'degree', label: chinese ? '学历' : 'Degree', options, value: educationEditor.degree || options[0] },
        ...(chinese ? [{ id: 'studyType', label: '学习形式', options: studyOptions, value: educationEditor.studyType || studyOptions[0] }] : []),
      ],
    });
  };

  const openDatePicker = (target, value, allowPresent = false) => {
    const parsed = profileDateValue(value);
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 81 }, (_, index) => String(currentYear + 10 - index));
    const months = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'));
    setWheelPicker({
      type: 'date',
      target,
      allowPresent,
      columns: [
        { id: 'year', label: chinese ? '年份' : 'Year', options: years, value: parsed.year || String(currentYear) },
        { id: 'month', label: chinese ? '月份' : 'Month', options: months, value: parsed.month || '09' },
      ],
    });
  };

  const confirmWheel = (values) => {
    if (!wheelPicker) return;
    if (wheelPicker.type === 'degree') {
      setEducationEditor((current) => ({ ...current, degree: values.degree, studyType: values.studyType || '' }));
    } else if (wheelPicker.target === 'birthday') {
      updateField('birthday', `${values.year}-${values.month}`);
    } else if (wheelPicker.target.startsWith('education.')) {
      setEducationEditor((current) => ({ ...current, [wheelPicker.target.split('.')[1]]: `${values.year}-${values.month}` }));
    } else {
      setWorkEditor((current) => ({ ...current, [wheelPicker.target.split('.')[1]]: `${values.year}-${values.month}` }));
    }
    setWheelPicker(null);
  };

  const setPresent = () => {
    if (!wheelPicker) return;
    if (wheelPicker.target.startsWith('education.')) setEducationEditor((current) => ({ ...current, endDate: chinese ? '至今' : 'Present' }));
    if (wheelPicker.target.startsWith('work.')) setWorkEditor((current) => ({ ...current, endDate: chinese ? '至今' : 'Present' }));
    setWheelPicker(null);
  };

  const submit = (event) => {
    event.preventDefault();
    let nextDraft = draft;
    if (educationEditor) {
      if (!educationEditor.school.trim()) return setEntryError(chinese ? '请填写学校。' : 'Enter a school.');
      if (!educationEditor.degree.trim()) return setEntryError(chinese ? '请选择学历。' : 'Choose a degree.');
      if (!educationEditor.major.trim()) return setEntryError(chinese ? '请填写专业。' : 'Enter a major.');
      if (!educationEditor.startDate) return setEntryError(chinese ? '请选择入学时间。' : 'Choose a start date.');
      if (!educationEditor.endDate) return setEntryError(chinese ? '请选择毕业时间。' : 'Choose an end date.');
      if (profileDateRangeInvalid(educationEditor.startDate, educationEditor.endDate)) return setEntryError(chinese ? '入学时间不能晚于毕业时间。' : 'The start date cannot be after the end date.');
      const educations = [...draft[language].educations];
      const { index, ...entry } = educationEditor;
      const nextEntry = { ...entry, degree: entry.degree.trim(), studyType: entry.studyType.trim() };
      if (index < 0) educations.push(nextEntry);
      else educations[index] = nextEntry;
      nextDraft = { ...draft, [language]: { ...draft[language], educations } };
    }
    if (workEditor) {
      if (!workEditor.company.trim()) return setEntryError(chinese ? '请填写公司名称。' : 'Enter a company.');
      if (!workEditor.jobTitle.trim()) return setEntryError(chinese ? '请填写职位名称。' : 'Enter a job title.');
      if (!workEditor.startDate) return setEntryError(chinese ? '请选择开始时间。' : 'Choose a start date.');
      if (!workEditor.endDate) return setEntryError(chinese ? '请选择结束时间。' : 'Choose an end date.');
      if (profileDateRangeInvalid(workEditor.startDate, workEditor.endDate)) return setEntryError(chinese ? '开始时间不能晚于结束时间。' : 'The start date cannot be after the end date.');
      const workExperiences = [...draft[language].workExperiences];
      const { index, ...entry } = workEditor;
      if (index < 0) workExperiences.push(entry);
      else workExperiences[index] = entry;
      nextDraft = { ...draft, [language]: { ...draft[language], workExperiences } };
    }
    const validation = validatePersonalProfile(nextDraft, language);
    if (!validation.valid) {
      setProfileError(validation.message);
      return;
    }
    setProfileError('');
    setEntryError('');
    setEducationEditor(null);
    setWorkEditor(null);
    setDraft(nextDraft);
    if (onSave(nextDraft)) onComplete();
  };

  const applyImportedProfile = async (source) => {
    const imported = await onImport(source);
    const importedLanguage = imported.language;
    const importedProfiles = normalizeUserProfile(imported.profiles);
    const normalizedFields = mergeImportedProfileFields(
      draft[importedLanguage],
      importedProfiles[importedLanguage],
      importedLanguage,
    );
    const nextDraft = { ...draft, [importedLanguage]: normalizedFields };
    if (!(await onSave(nextDraft, { flushRemote: true }))) throw new Error('The imported personal details could not be saved.');
    setDraft(nextDraft);
    setLanguage(importedLanguage);
    setImportedProfile({
      language: importedLanguage,
      profiles: { ...importedProfiles, [importedLanguage]: normalizedFields },
    });
    setImportDialogOpen(false);
  };

  const syncImportedProfile = async () => {
    if (!importedProfile) return;
    const targetLanguage = importedProfile.language === 'chinese' ? 'english' : 'chinese';
    const translated = await onTranslate({
      language: importedProfile.language,
      profile: importedProfile.profiles[importedProfile.language],
    });
    const translatedFields = mergeImportedProfileFields(
      draft[targetLanguage],
      translated.profiles[targetLanguage],
      targetLanguage,
    );
    const nextDraft = { ...draft, [targetLanguage]: translatedFields };
    if (!(await onSave(nextDraft, { flushRemote: true }))) throw new Error('The translated personal details could not be saved.');
    setDraft(nextDraft);
    setLanguage(targetLanguage);
    setImportedProfile(null);
  };

  const addListItem = (field) => updateField(field, [...fields[field], '']);
  const updateListItem = (field, index, value) => updateField(field, fields[field].map((item, itemIndex) => itemIndex === index ? value : item));
  const removeListItem = (field, index) => updateField(field, fields[field].filter((_, itemIndex) => itemIndex !== index));
  const showPhoto = fields.photoUrl;
  const educationEditorPanel = educationEditor && <div className="profile-entry-editor">
    <div className="profile-editor-heading"><strong>{educationEditor.index < 0 ? (chinese ? '添加教育经历' : 'Add education') : (chinese ? '编辑教育经历' : 'Edit education')}</strong><button className="icon-button small" type="button" onClick={() => { setEducationEditor(null); setEntryError(''); }} aria-label="Close" title="Close"><X size={15} /></button></div>
    <div className="form-grid two-columns">
      <ProfilePickerButton label={chinese ? '学校' : 'School'} value={educationEditor.school} placeholder={chinese ? '选择或输入学校' : 'Select or enter university'} onClick={() => openDirectoryPicker('university')} />
      <ProfilePickerButton label={chinese ? '学历' : 'Degree'} value={[educationEditor.degree, displayedProfileStudyType(educationEditor.studyType) && `(${displayedProfileStudyType(educationEditor.studyType)})`].filter(Boolean).join(' ')} placeholder={chinese ? '请选择学历' : 'Select degree'} onClick={openDegreePicker} />
      <ProfilePickerButton label={chinese ? '专业' : 'Major'} value={educationEditor.major} placeholder={chinese ? '选择或输入专业' : 'Select or enter major'} onClick={() => openDirectoryPicker('major')} />
      <ProfilePickerButton label={chinese ? '入学时间' : 'Start date'} value={educationEditor.startDate} placeholder={chinese ? '请选择入学时间' : 'Choose start date'} onClick={() => openDatePicker('education.startDate', educationEditor.startDate)} />
      <ProfilePickerButton label={chinese ? '毕业时间' : 'End date'} value={educationEditor.endDate} placeholder={chinese ? '请选择毕业时间' : 'Choose end date'} onClick={() => openDatePicker('education.endDate', educationEditor.endDate, true)} />
    </div>
    <label className="field"><span>{chinese ? '在校描述' : 'Description'} <small>({chinese ? '选填' : 'Optional'})</small></span><textarea rows={3} maxLength={500} value={educationEditor.description} onChange={(event) => setEducationEditor((current) => ({ ...current, description: event.target.value }))} placeholder={chinese ? '主要课程、荣誉奖励等' : 'Main courses, honors, etc.'} /></label>
    {entryError && <p className="account-auth-error" role="alert">{entryError}</p>}
    <div className="profile-editor-actions"><button className="secondary-button" type="button" onClick={() => setEducationEditor(null)}>{chinese ? '取消' : 'Cancel'}</button><button className="primary-button" type="button" onClick={saveEducation}><Check size={15} /> {chinese ? '保存教育经历' : 'Save education'}</button></div>
  </div>;
  const workEditorPanel = workEditor && <div className="profile-entry-editor">
    <div className="profile-editor-heading"><strong>{workEditor.index < 0 ? (chinese ? '添加工作经历' : 'Add work experience') : (chinese ? '编辑工作经历' : 'Edit work experience')}</strong><button className="icon-button small" type="button" onClick={() => { setWorkEditor(null); setEntryError(''); }} aria-label="Close" title="Close"><X size={15} /></button></div>
    <div className="form-grid two-columns">
      <Field label={chinese ? '公司名称' : 'Company'} value={workEditor.company} onChange={(value) => setWorkEditor((current) => ({ ...current, company: value }))} />
      <Field label={chinese ? '职位名称' : 'Job title'} value={workEditor.jobTitle} onChange={(value) => setWorkEditor((current) => ({ ...current, jobTitle: value }))} />
      <ProfilePickerButton label={chinese ? '开始时间' : 'Start date'} value={workEditor.startDate} placeholder={chinese ? '请选择开始时间' : 'Choose start date'} onClick={() => openDatePicker('work.startDate', workEditor.startDate)} />
      <ProfilePickerButton label={chinese ? '结束时间' : 'End date'} value={workEditor.endDate} placeholder={chinese ? '请选择结束时间' : 'Choose end date'} onClick={() => openDatePicker('work.endDate', workEditor.endDate, true)} />
    </div>
    <label className="field"><span>{chinese ? '工作内容' : 'Work content'} <small>({chinese ? '选填' : 'Optional'})</small></span><textarea rows={3} maxLength={1000} value={workEditor.workContent} onChange={(event) => setWorkEditor((current) => ({ ...current, workContent: event.target.value }))} placeholder={chinese ? '简要描述主要工作内容，AI 会做参考' : 'Briefly describe responsibilities'} /></label>
    <label className="field"><span>{chinese ? '业务方向' : 'Business direction'} <small>({chinese ? '选填' : 'Optional'})</small></span><textarea rows={2} maxLength={200} value={workEditor.businessDirection} onChange={(event) => setWorkEditor((current) => ({ ...current, businessDirection: event.target.value }))} placeholder={chinese ? '简要描述公司的业务方向，AI 会做参考' : 'Brief description of company business'} /></label>
    {entryError && <p className="account-auth-error" role="alert">{entryError}</p>}
    <div className="profile-editor-actions"><button className="secondary-button" type="button" onClick={() => setWorkEditor(null)}>{chinese ? '取消' : 'Cancel'}</button><button className="primary-button" type="button" onClick={saveWork}><Check size={15} /> {chinese ? '保存工作经历' : 'Save work experience'}</button></div>
  </div>;

  return (
    <div className="modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onCancel();
    }}>
      <form className="resume-dialog personal-profile-dialog" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="personal-profile-title">
        <header className="resume-dialog-header personal-profile-header">
          <div>
            <span className="dialog-kicker">Account</span>
            <h2 id="personal-profile-title">Edit personal profile</h2>
          </div>
          <div className="profile-header-actions">
            <button className="secondary-button profile-import-button" type="button" onClick={() => setImportDialogOpen(true)}><FileUp size={15} /><span>Import from resume</span></button>
            <button className="icon-button small" type="button" onClick={onCancel} aria-label="Close" title="Close"><X size={16} /></button>
          </div>
        </header>
        <div className="resume-dialog-content profile-dialog-content">
          <div className="resume-language-selector" role="group" aria-label="Profile language">
            <button type="button" className={cx(chinese && 'is-selected')} onClick={() => { setLanguage('chinese'); setEducationEditor(null); setWorkEditor(null); setProfileError(''); }} aria-pressed={chinese}>中文</button>
            <button type="button" className={cx(!chinese && 'is-selected')} onClick={() => { setLanguage('english'); setEducationEditor(null); setWorkEditor(null); setProfileError(''); }} aria-pressed={!chinese}>English</button>
          </div>

          <section className="profile-section-block">
            <ProfileSectionHeader title={chinese ? '基本信息' : 'Personal information'} />
            <div className="profile-photo-row">
              <div className="profile-photo-preview">{showPhoto ? <img src={showPhoto} alt="" /> : <span>{fields.fullName?.slice(0, 2) || '头像'}</span>}</div>
              <label className="secondary-button profile-photo-upload">
                <Upload size={15} /> {chinese ? '上传头像' : 'Upload photo'}
                <input type="file" accept="image/*" onChange={async (event) => { const file = event.target.files?.[0]; if (file) updateField('photoUrl', await readFileAsDataUrl(file)); event.target.value = ''; }} />
              </label>
              {showPhoto && <button className="dialog-link-button profile-remove-photo" type="button" onClick={() => updateField('photoUrl', '')}>{chinese ? '移除' : 'Remove'}</button>}
            </div>
            <div className="form-grid two-columns">
              <Field label={chinese ? '姓名' : 'Full name'} value={fields.fullName} onChange={(value) => updateField('fullName', value)} />
              <GenderField value={fields.gender} onChange={(value) => updateField('gender', value)} language={language} />
              {chinese && <ProfilePickerButton label="出生年月" value={fields.birthday} placeholder="请选择出生年月" onClick={() => openDatePicker('birthday', fields.birthday)} />}
              <Field label={chinese ? '所在地' : 'Location'} value={fields.location} onChange={(value) => updateField('location', value)} />
            </div>
          </section>

          <section className="profile-section-block">
            <ProfileSectionHeader title={chinese ? '联系方式' : 'Contact information'} />
            <div className="form-grid two-columns">
              <Field label={chinese ? '手机号码' : 'Phone'} value={fields.phone} onChange={(value) => updateField('phone', value)} />
              {fields.phoneEn && fields.phoneEn !== fields.phone && <Field label={chinese ? '国际手机号' : 'International phone'} value={fields.phoneEn} onChange={(value) => updateField('phoneEn', value)} />}
              <Field label="Email" type="email" value={fields.email} onChange={(value) => updateField('email', value)} />
              {chinese ? <Field label="微信号" value={fields.wechat} onChange={(value) => updateField('wechat', value)} /> : <Field label="LinkedIn" value={fields.linkedin} onChange={(value) => updateField('linkedin', value)} />}
              <Field label={chinese ? '个人网站' : 'Personal website'} value={fields.website} placeholder="https://..." onChange={(value) => updateField('website', value)} />
              {!chinese && <Field label="WhatsApp" value={fields.whatsapp} onChange={(value) => updateField('whatsapp', value)} />}
              {!chinese && <Field label="Telegram" value={fields.telegram} onChange={(value) => updateField('telegram', value)} />}
            </div>
          </section>

          <section className="profile-section-block">
            <ProfileSectionHeader title={chinese ? '教育经历' : 'Education'} actionLabel={chinese ? '添加教育经历' : 'Add education'} onAction={() => openEducationEditor()} />
            {fields.educations.length === 0 && !educationEditor && <p className="profile-empty-state">{chinese ? '暂无教育经历' : 'No education added yet.'}</p>}
            <div className="profile-entry-list">
              {fields.educations.map((education, index) => <div className="profile-entry-stack" key={education.id || index}>
                <article className="profile-entry-card">
                  <div className="profile-entry-card-copy"><strong>{education.school || (chinese ? '未填写学校' : 'School not entered')}</strong><span>{[education.degree, displayedProfileStudyType(education.studyType) && `(${displayedProfileStudyType(education.studyType)})`, education.major].filter(Boolean).join(' · ')}</span><small>{[education.startDate, education.endDate].filter(Boolean).join(' - ')}</small></div>
                  <div className="profile-entry-card-actions"><button className="icon-button small" type="button" onClick={() => openEducationEditor(index)} aria-label={`${chinese ? '编辑教育经历' : 'Edit education'} ${index + 1}`} title="Edit"><Settings2 size={15} /></button><button className="icon-button small" type="button" onClick={() => deleteEducation(index)} aria-label={`${chinese ? '删除教育经历' : 'Delete education'} ${index + 1}`} title="Delete"><Trash2 size={15} /></button></div>
                </article>
                {educationEditor?.index === index && educationEditorPanel}
              </div>)}
              {educationEditor?.index < 0 && educationEditorPanel}
            </div>
          </section>

          <section className="profile-section-block">
            <ProfileSectionHeader title={chinese ? '工作经历' : 'Work experience'} actionLabel={chinese ? '添加工作经历' : 'Add work experience'} onAction={() => openWorkEditor()} />
            {fields.workExperiences.length === 0 && !workEditor && <p className="profile-empty-state">{chinese ? '暂无工作经历' : 'No work experience added yet.'}</p>}
            <div className="profile-entry-list">
              {fields.workExperiences.map((work, index) => <div className="profile-entry-stack" key={work.id || index}>
                <article className="profile-entry-card">
                  <div className="profile-entry-card-copy"><strong>{work.company || (chinese ? '未填写公司' : 'Company not entered')}</strong><span>{work.jobTitle}</span><small>{[work.startDate, work.endDate].filter(Boolean).join(' - ')}</small></div>
                  <div className="profile-entry-card-actions"><button className="icon-button small" type="button" onClick={() => openWorkEditor(index)} aria-label={`${chinese ? '编辑工作经历' : 'Edit work experience'} ${index + 1}`} title="Edit"><Settings2 size={15} /></button><button className="icon-button small" type="button" onClick={() => deleteWork(index)} aria-label={`${chinese ? '删除工作经历' : 'Delete work experience'} ${index + 1}`} title="Delete"><Trash2 size={15} /></button></div>
                </article>
                {workEditor?.index === index && workEditorPanel}
              </div>)}
              {workEditor?.index < 0 && workEditorPanel}
            </div>
          </section>

          <section className="profile-section-block">
            <ProfileSectionHeader title={chinese ? '证书' : 'Certificates'} actionLabel={chinese ? '添加证书' : 'Add certificate'} onAction={() => addListItem('certificates')} />
            <div className="profile-list-editor">{fields.certificates.length === 0 && <p className="profile-empty-state">{chinese ? '暂无证书' : 'No certificates added yet.'}</p>}{fields.certificates.map((certificate, index) => <div className="profile-list-editor-row" key={`certificate-${index}`}><input aria-label={`${chinese ? '证书' : 'Certificate'} ${index + 1}`} value={certificate} placeholder={chinese ? '如：CET-6' : 'e.g. CET-6'} onChange={(event) => updateListItem('certificates', index, event.target.value)} /><button className="icon-button small" type="button" onClick={() => removeListItem('certificates', index)} aria-label={`${chinese ? '删除证书' : 'Delete certificate'} ${index + 1}`} title="Delete"><Trash2 size={14} /></button></div>)}</div>
          </section>

        </div>
        <footer className="resume-dialog-actions profile-save-actions">
          {profileError && <p className="account-auth-error profile-save-error" role="alert">{profileError}</p>}
          <button className="secondary-button" type="button" onClick={onCancel}>{chinese ? '取消' : 'Cancel'}</button>
          <button className="primary-button" type="submit"><Check size={16} /> {chinese ? '保存资料' : 'Save profile'}</button>
        </footer>
      </form>
      {importDialogOpen && <ProfileImportDialog onCancel={() => setImportDialogOpen(false)} onImport={applyImportedProfile} />}
      {importedProfile && <ProfileSyncDialog sourceLanguage={importedProfile.language} onCancel={() => setImportedProfile(null)} onSkip={() => setImportedProfile(null)} onSync={syncImportedProfile} />}
      {directoryPicker && <ProfileDirectoryPicker type={directoryPicker.type} language={language} keyword={directoryKeyword} results={directoryResults} loading={directoryLoading} onKeywordChange={setDirectoryKeyword} onSelect={selectDirectoryItem} onUseTypedValue={useTypedDirectoryValue} onCancel={() => setDirectoryPicker(null)} />}
      {wheelPicker && <ProfileWheelPicker title={wheelPicker.type === 'degree' ? (chinese ? '选择学历' : 'Choose degree') : (chinese ? '选择时间' : 'Choose date')} chinese={chinese} columns={wheelPicker.columns} allowPresent={wheelPicker.allowPresent} onPresent={setPresent} onConfirm={confirmWheel} onCancel={() => setWheelPicker(null)} />}
    </div>
  );
}

function ProfileImportDialog({ onCancel, onImport }) {
  const [inputMode, setInputMode] = useState('text');
  const [resumeText, setResumeText] = useState('');
  const [sourceFile, setSourceFile] = useState(null);
  const [error, setError] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const sourceReady = inputMode === 'text' ? Boolean(resumeText.trim()) : Boolean(sourceFile);

  const selectInputMode = (mode) => {
    setInputMode(mode);
    setError('');
  };

  const selectSourceFile = (event) => {
    const file = event.target.files?.[0] || null;
    if (file && file.size > MAX_JOB_SOURCE_BYTES) {
      setSourceFile(null);
      setError('The source file must be 10 MB or smaller.');
      event.target.value = '';
      return;
    }
    setSourceFile(file);
    setError('');
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!sourceReady || isImporting) return;
    setError('');
    setIsImporting(true);
    try {
      await onImport({ resumeText: resumeText.trim(), sourceType: inputMode, sourceFile });
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Unable to import personal details right now.');
      setIsImporting(false);
    }
  };

  return (
    <div className="modal-backdrop nested-modal-backdrop" onMouseDown={onCancel}>
      <form
        className="resume-dialog profile-import-dialog"
        onSubmit={submit}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-import-title"
        aria-busy={isImporting}
      >
        <header className="resume-dialog-header account-dialog-header">
          <div>
            <span className="dialog-kicker">Personal profile</span>
            <h2 id="profile-import-title">Import from resume</h2>
          </div>
          <button className="icon-button small" type="button" onClick={onCancel} disabled={isImporting} aria-label="Close" title="Close">
            <X size={16} />
          </button>
        </header>
        <div className="resume-dialog-content">
          <div className="generator-input-selector" role="group" aria-label="Resume import method">
            <button type="button" className={cx(inputMode === 'text' && 'is-selected')} onClick={() => selectInputMode('text')} disabled={isImporting} aria-pressed={inputMode === 'text'}>Paste text</button>
            <button type="button" className={cx(inputMode === 'image' && 'is-selected')} onClick={() => selectInputMode('image')} disabled={isImporting} aria-pressed={inputMode === 'image'}>Upload image</button>
            <button type="button" className={cx(inputMode === 'pdf' && 'is-selected')} onClick={() => selectInputMode('pdf')} disabled={isImporting} aria-pressed={inputMode === 'pdf'}>Upload PDF</button>
          </div>
          {inputMode === 'text' ? (
            <label className="field profile-import-textarea">
              <span>Resume content</span>
              <textarea
                value={resumeText}
                rows={13}
                maxLength={MAX_SOURCE_TEXT_CHARS}
                placeholder="Paste the resume content"
                onChange={(event) => setResumeText(event.target.value)}
                disabled={isImporting}
                aria-label="Resume content"
              />
              <small className="profile-character-count">{resumeText.length.toLocaleString()} / {MAX_SOURCE_TEXT_CHARS.toLocaleString()}</small>
            </label>
          ) : (
            <label className="job-source-picker">
              <Upload size={18} />
              <span>{inputMode === 'image' ? 'Upload image' : 'Upload PDF'}</span>
              {sourceFile && <small>{sourceFile.name}</small>}
              <input
                type="file"
                accept={inputMode === 'image' ? 'image/png,image/jpeg,image/webp' : 'application/pdf'}
                onChange={selectSourceFile}
                disabled={isImporting}
                aria-label={inputMode === 'image' ? 'Upload image' : 'Upload PDF'}
              />
            </label>
          )}
          {error && <p className="generator-error" role="alert">{error}</p>}
        </div>
        <footer className="resume-dialog-actions">
          <button className="secondary-button" type="button" onClick={onCancel} disabled={isImporting}>Cancel</button>
          <button className="primary-button" type="submit" disabled={!sourceReady || isImporting}>
            <FileUp size={16} />
            {isImporting ? 'Importing...' : 'Import details'}
          </button>
        </footer>
      </form>
    </div>
  );
}

function ProfileSyncDialog({ sourceLanguage, onCancel, onSkip, onSync }) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState('');
  const targetLanguage = sourceLanguage === 'chinese' ? 'English' : '中文';

  const sync = async () => {
    if (isSyncing) return;
    setError('');
    setIsSyncing(true);
    try {
      await onSync();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Unable to create the second profile right now.');
      setIsSyncing(false);
    }
  };

  return (
    <div className="modal-backdrop nested-modal-backdrop" onMouseDown={isSyncing ? undefined : onCancel}>
      <section className="resume-dialog profile-sync-dialog" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="profile-sync-title" aria-busy={isSyncing}>
        <header className="resume-dialog-header account-dialog-header">
          <div>
            <span className="dialog-kicker">Personal profile</span>
            <h2 id="profile-sync-title">Create {targetLanguage} profile too?</h2>
          </div>
          <button className="icon-button small" type="button" onClick={onCancel} disabled={isSyncing} aria-label="Close" title="Close">
            <X size={16} />
          </button>
        </header>
        {error && <div className="profile-sync-content"><p className="generator-error" role="alert">{error}</p></div>}
        <footer className="resume-dialog-actions">
          <button className="secondary-button" type="button" onClick={onSkip} disabled={isSyncing}>Not now</button>
          <button className="primary-button" type="button" onClick={sync} disabled={isSyncing}>
            <Sparkles size={16} />
            {isSyncing ? 'Creating...' : `Create ${targetLanguage} profile`}
          </button>
        </footer>
      </section>
    </div>
  );
}

function JobDescriptionDialog({ profile, onCancel, onGenerate }) {
  const [inputMode, setInputMode] = useState('text');
  const [outputLanguage, setOutputLanguage] = useState(profile.chinese.fullName ? 'chinese' : 'english');
  const [jobDescription, setJobDescription] = useState('');
  const [aiMessage, setAiMessage] = useState(profile.chinese.fullName ? (profile.chinese.aiMessage || '') : (profile.english.aiMessage || ''));
  const [sourceFile, setSourceFile] = useState(null);
  const [error, setError] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const outputLanguages = outputLanguage === 'both' ? ['chinese', 'english'] : [outputLanguage];
  const incompleteProfiles = outputLanguages
    .map((language) => ({ language, validation: validatePersonalProfile(profile, language) }))
    .filter(({ validation }) => !validation.valid);
  const profileError = incompleteProfiles.length
    ? incompleteProfiles
      .map(({ language, validation }) => `${language === 'chinese' ? '中文' : 'English'}: ${validation.message}`)
      .join('；')
    : '';
  const sourceReady = inputMode === 'text' ? Boolean(jobDescription.trim()) : Boolean(sourceFile);
  const canGenerate = sourceReady && !isGenerating;

  const selectInputMode = (mode) => {
    setInputMode(mode);
    setError('');
  };

  const selectSourceFile = (event) => {
    const file = event.target.files?.[0] || null;
    if (file && file.size > MAX_JOB_SOURCE_BYTES) {
      setSourceFile(null);
      setError('The source file must be 10 MB or smaller.');
      event.target.value = '';
      return;
    }
    setSourceFile(file);
    setError('');
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!canGenerate) return;
    if (profileError) {
      setError(profileError);
      return;
    }
    setError('');
    setIsGenerating(true);
    try {
      await onGenerate({
        jobDescription: jobDescription.trim(),
        aiMessage: aiMessage.trim(),
        outputLanguage,
        sourceType: inputMode,
        sourceFile,
      });
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Unable to generate a resume right now.');
      setIsGenerating(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={isGenerating ? undefined : onCancel}>
      <form className="resume-dialog job-description-dialog" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="job-description-title" aria-busy={isGenerating}>
        <header className="resume-dialog-header">
          <div>
            <span className="dialog-kicker">Resume generator</span>
            <h2 id="job-description-title">Generate from job description</h2>
          </div>
          <button className="icon-button small" type="button" onClick={onCancel} disabled={isGenerating} aria-label="Close" title="Close">
            <X size={16} />
          </button>
        </header>
        <div className="resume-dialog-content profile-dialog-content">
          <div className="generator-input-selector" role="group" aria-label="Job description input method">
            <button
              type="button"
              className={cx(inputMode === 'text' && 'is-selected')}
              onClick={() => selectInputMode('text')}
              disabled={isGenerating}
              aria-pressed={inputMode === 'text'}
            >
              Paste text
            </button>
            <button
              type="button"
              className={cx(inputMode === 'image' && 'is-selected')}
              onClick={() => selectInputMode('image')}
              disabled={isGenerating}
              aria-pressed={inputMode === 'image'}
            >
              Upload image
            </button>
            <button
              type="button"
              className={cx(inputMode === 'pdf' && 'is-selected')}
              onClick={() => selectInputMode('pdf')}
              disabled={isGenerating}
              aria-pressed={inputMode === 'pdf'}
            >
              Upload PDF
            </button>
          </div>
          {inputMode === 'text' ? (
            <label className="field job-description-field">
              <span>Job description</span>
              <textarea
                value={jobDescription}
                rows={13}
                maxLength={MAX_SOURCE_TEXT_CHARS}
                placeholder="Paste the role, responsibilities, and requirements"
                onChange={(event) => setJobDescription(event.target.value)}
                disabled={isGenerating}
                aria-label="Job description"
              />
              <small className="profile-character-count">{jobDescription.length.toLocaleString()} / {MAX_SOURCE_TEXT_CHARS.toLocaleString()}</small>
            </label>
          ) : (
            <label className="job-source-picker">
              <Upload size={18} />
              <span>{inputMode === 'image' ? 'Upload image' : 'Upload PDF'}</span>
              {sourceFile && <small>{sourceFile.name}</small>}
              <input
                type="file"
                accept={inputMode === 'image' ? 'image/png,image/jpeg,image/webp' : 'application/pdf'}
                onChange={selectSourceFile}
                disabled={isGenerating}
                aria-label={inputMode === 'image' ? 'Upload image' : 'Upload PDF'}
              />
            </label>
          )}
          <label className="field">
            <span>Message to AI <small>(Optional)</small></span>
            <textarea
              rows={5}
              maxLength={500}
              value={aiMessage}
              onChange={(event) => setAiMessage(event.target.value)}
              placeholder="Tell the AI how to tailor your resume without inventing facts."
              disabled={isGenerating}
              aria-label="Message to AI"
            />
            <small className="profile-character-count">{aiMessage.length} / 500</small>
          </label>
          <div className="generator-output-group">
            <span>Resume language</span>
            <div className="generator-output-selector" role="group" aria-label="Output language">
              <button
                type="button"
                className={cx(outputLanguage === 'chinese' && 'is-selected')}
                onClick={() => setOutputLanguage('chinese')}
                disabled={isGenerating}
                aria-pressed={outputLanguage === 'chinese'}
              >
                中文
              </button>
              <button
                type="button"
                className={cx(outputLanguage === 'english' && 'is-selected')}
                onClick={() => setOutputLanguage('english')}
                disabled={isGenerating}
                aria-pressed={outputLanguage === 'english'}
              >
                English
              </button>
              <button
                type="button"
                className={cx(outputLanguage === 'both' && 'is-selected')}
                onClick={() => setOutputLanguage('both')}
                disabled={isGenerating}
                aria-pressed={outputLanguage === 'both'}
              >
                中英文
              </button>
            </div>
          </div>
          {error && <p className="generator-error" role="alert">{error}</p>}
        </div>
        <footer className="resume-dialog-actions">
          <button className="secondary-button" type="button" onClick={onCancel} disabled={isGenerating}>Cancel</button>
          <button className="primary-button" type="submit" disabled={!canGenerate}>
            <WandSparkles size={16} />
            {isGenerating ? 'Generating...' : 'Generate resume'}
          </button>
        </footer>
      </form>
    </div>
  );
}

function DeleteResumeDialog({ resume, onCancel, onDelete }) {
  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <section className="resume-dialog" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="delete-resume-title">
        <header className="resume-dialog-header">
          <h2 id="delete-resume-title">Delete resume?</h2>
        </header>
        <div className="resume-dialog-content delete-resume-content">
          <p><strong>{resume.documentName}</strong> will be permanently deleted.</p>
        </div>
        <footer className="resume-dialog-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>Cancel</button>
          <button className="primary-button danger-button" type="button" onClick={onDelete}>Delete</button>
        </footer>
      </section>
    </div>
  );
}

function ResumeCardPreview({ resume }) {
  const name = resumeName(resume.data.basics, resume.language);
  const initials = resumeInitials(resume.data.basics, resume.language);
  return (
    <span
      className={cx('resume-card-canvas', `card-template-${resume.template}`)}
      style={{ '--card-accent': resume.accent } as CssVariables}
    >
      <span className="resume-card-paper">
        {resume.template === 'profile' && resume.data.basics.photoUrl && (
          <ProfileAvatar photoUrl={resume.data.basics.photoUrl} initials={initials} className="card-profile-avatar" />
        )}
        <span className="card-paper-header">
          <strong>{name || (isChineseResume(resume.language) ? '你的姓名' : 'Your name')}</strong>
          <small>{resume.data.basics.role || (isChineseResume(resume.language) ? '目标职位' : 'Target role')}</small>
        </span>
        <span className="card-paper-body">
          <i className="card-section-label" />
          <i className="card-copy-line long" />
          <i className="card-copy-line" />
          <i className="card-section-label second" />
          <i className="card-copy-line long" />
          <i className="card-copy-line medium" />
          <i className="card-copy-line short" />
          <i className="card-section-label third" />
          <i className="card-copy-line long" />
          <i className="card-copy-line medium" />
        </span>
      </span>
    </span>
  );
}

function ColumnResizer({ value, onChange, onCommit }) {
  const dragRef = useRef(null);
  const [isResizing, setIsResizing] = useState(false);

  const getBounds = (element) => {
    const workspace = element.parentElement;
    const editor = workspace?.querySelector('.editor-panel');
    const sidebar = workspace?.querySelector('.outline-sidebar');
    if (!workspace || !editor || !sidebar) return null;

    const styles = window.getComputedStyle(workspace);
    const minimum = Number.parseFloat(styles.getPropertyValue('--editor-min')) || MIN_EDITOR_WIDTH;
    const previewMinimum = Number.parseFloat(styles.getPropertyValue('--preview-min')) || 320;
    const dividerWidth = Number.parseFloat(styles.getPropertyValue('--divider-width')) || 1;
    const maximum = Math.min(
      MAX_EDITOR_WIDTH,
      workspace.clientWidth - sidebar.getBoundingClientRect().width - dividerWidth - previewMinimum,
    );

    return {
      current: editor.getBoundingClientRect().width,
      minimum: Math.min(minimum, maximum),
      maximum: Math.max(minimum, maximum),
    };
  };

  const startResize = (event) => {
    if (event.button !== 0) return;
    const bounds = getBounds(event.currentTarget);
    if (!bounds) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: bounds.current,
      width: bounds.current,
      minimum: bounds.minimum,
      maximum: bounds.maximum,
    };
    setIsResizing(true);
  };

  const resize = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const width = Math.min(
      drag.maximum,
      Math.max(drag.minimum, drag.startWidth + event.clientX - drag.startX),
    );
    drag.width = width;
    onChange(Math.round(width));
  };

  const stopResize = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onCommit(drag.width);
    dragRef.current = null;
    setIsResizing(false);
  };

  const resizeWithKeyboard = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const bounds = getBounds(event.currentTarget);
    if (!bounds) return;
    event.preventDefault();

    const step = event.shiftKey ? 32 : 16;
    let nextWidth = bounds.current;
    if (event.key === 'ArrowLeft') nextWidth -= step;
    if (event.key === 'ArrowRight') nextWidth += step;
    if (event.key === 'Home') nextWidth = bounds.minimum;
    if (event.key === 'End') nextWidth = bounds.maximum;
    nextWidth = Math.min(bounds.maximum, Math.max(bounds.minimum, nextWidth));
    onChange(Math.round(nextWidth));
    onCommit(nextWidth);
  };

  const resetWidth = (event) => {
    const bounds = getBounds(event.currentTarget);
    if (!bounds) return;
    const nextWidth = Math.min(bounds.maximum, Math.max(bounds.minimum, DEFAULT_EDITOR_WIDTH));
    onChange(Math.round(nextWidth));
    onCommit(nextWidth);
  };

  return (
    <div
      className={cx('column-resizer', isResizing && 'is-resizing')}
      role="separator"
      aria-label="Resize editor and preview panels"
      aria-orientation="vertical"
      aria-valuemin={MIN_EDITOR_WIDTH}
      aria-valuemax={MAX_EDITOR_WIDTH}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      title="Resize editor and preview panels"
      onPointerDown={startResize}
      onPointerMove={resize}
      onPointerUp={stopResize}
      onPointerCancel={stopResize}
      onDoubleClick={resetWidth}
      onKeyDown={resizeWithKeyboard}
    />
  );
}

function TopBar({
  documentName,
  onDocumentNameChange,
  saveState,
  undo,
  redo,
  canUndo,
  canRedo,
  onExport,
  canExport,
  onAi,
  onReset,
  onBack,
  accountUsername,
  onEditProfile,
}) {
  return (
    <header className="topbar">
      <div className="brand-block">
        <button className="icon-button back-button" onClick={onBack} aria-label="Back to resumes" title="Back to resumes">
          <ArrowLeft size={18} />
        </button>
        <a className="brand" href="#" aria-label="Draftline home" onClick={(event) => { event.preventDefault(); onBack(); }}>
          <span className="brand-mark"><FileText size={18} /></span>
          <span>Draftline</span>
        </a>
      </div>

      <div className="document-meta">
        <div className="document-title-row">
          <input
            aria-label="Resume name"
            value={documentName}
            onChange={(event) => onDocumentNameChange(event.target.value)}
          />
          <span className={cx(
            'save-status',
            saveState === 'Saving...' && 'is-saving',
            saveState === 'Save failed' && 'is-error',
          )}>
            {saveState === 'Saved' && <Check size={13} />}
            {saveState}
          </span>
        </div>
      </div>

      <div className="topbar-actions">
        <div className="history-actions">
          <button className="icon-button" onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo">
            <Undo2 size={17} />
          </button>
          <button className="icon-button" onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo">
            <Redo2 size={17} />
          </button>
          <button className="icon-button reset-button" onClick={onReset} aria-label="Reset demo" title="Reset demo">
            <RotateCcw size={16} />
          </button>
        </div>
        <button className="primary-button export-button" onClick={onExport} disabled={!canExport} title={canExport ? 'Export PDF' : 'Wait for the verified page layout'}>
          <Download size={16} />
          <span>Export PDF</span>
        </button>
        <button className="avatar-button" onClick={onEditProfile} aria-label="Edit personal profile" title="Edit personal profile">{accountInitials(accountUsername)}</button>
      </div>
    </header>
  );
}

function MobileTabs({ value, onChange }) {
  return (
    <nav className="mobile-tabs" aria-label="Workspace view">
      {[
        { id: 'outline', label: 'Outline', icon: PanelLeft },
        { id: 'edit', label: 'Edit', icon: Settings2 },
        { id: 'preview', label: 'Preview', icon: Eye },
      ].map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          className={value === id ? 'active' : ''}
          onClick={() => onChange(id)}
        >
          <Icon size={16} />
          {label}
        </button>
      ))}
    </nav>
  );
}

function OutlineSidebar({
  sections,
  activeSection,
  onSelect,
  score,
  sectionMenu,
  setSectionMenu,
  customSections,
  addCustomSection,
  onReorder,
  language,
}) {
  const [draggedSectionId, setDraggedSectionId] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);
  const ignoreClickRef = useRef(false);

  const finishDrag = () => {
    setDraggedSectionId(null);
    setDropTargetId(null);
    window.setTimeout(() => {
      ignoreClickRef.current = false;
    }, 0);
  };

  return (
    <aside className="outline-sidebar">
      <div className="score-block">
        <div className="score-heading">
          <div>
            <span className="eyebrow">Resume score</span>
            <strong>{score}<small>/100</small></strong>
          </div>
          <span className="score-grade">Strong</span>
        </div>
        <div className="progress-track" aria-label={`Resume score ${score} out of 100`}>
          <span style={{ width: `${score}%` }} />
        </div>
      </div>

      <nav className="section-nav" aria-label="Resume sections">
        {sections.map(({ id, label, icon: Icon }) => {
          const isFixed = id === 'basics' || id === 'layout';
          return (
            <button
              key={id}
              draggable={!isFixed}
              aria-grabbed={isFixed ? undefined : draggedSectionId === id}
              className={cx(
                'section-nav-item',
                id === 'layout' && 'layout-nav-item',
                activeSection === id && 'active',
                draggedSectionId === id && 'dragging',
                dropTargetId === id && draggedSectionId !== id && 'drop-target',
              )}
              onClick={(event) => {
                if (ignoreClickRef.current) {
                  event.preventDefault();
                  return;
                }
                onSelect(id);
              }}
              onDragStart={(event) => {
                if (isFixed) return;
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', id);
                ignoreClickRef.current = true;
                setDraggedSectionId(id);
                setDropTargetId(id);
              }}
              onDragOver={(event) => {
                if (isFixed || !draggedSectionId || draggedSectionId === id) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setDropTargetId(id);
              }}
              onDrop={(event) => {
                if (isFixed) return;
                event.preventDefault();
                const sourceId = event.dataTransfer.getData('text/plain') || draggedSectionId;
                if (sourceId) onReorder(sourceId, id);
                finishDrag();
              }}
              onDragEnd={finishDrag}
            >
              {isFixed ? (
                <span aria-hidden="true" />
              ) : (
                <GripVertical className="drag-icon" size={15} />
              )}
              <span className="section-icon"><Icon size={16} /></span>
              <span className="section-label">{label}</span>
              {baseSections.some((section) => section.id === id) ? (
                <CheckCircle2 className="complete-icon" size={16} />
              ) : (
                <Circle className="complete-icon" size={16} />
              )}
            </button>
          );
        })}
      </nav>

      <div className="add-section-wrap">
        <button className="add-section-button" onClick={() => setSectionMenu(!sectionMenu)}>
          <Plus size={16} />
          {isChineseResume(language) ? '添加模块' : 'Add section'}
        </button>
        {sectionMenu && (
          <div className="section-popover">
            <div className="popover-heading">
              <span>{isChineseResume(language) ? '添加到简历' : 'Add to resume'}</span>
              <button className="icon-button small" onClick={() => setSectionMenu(false)} aria-label="Close">
                <X size={15} />
              </button>
            </div>
            {localizedSectionSuggestions(language).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => addCustomSection(id)}
                disabled={customSections.includes(id)}
              >
                <Icon size={17} />
                <span>{label}</span>
                {customSections.includes(id) ? <Check size={15} /> : <Plus size={15} />}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="sidebar-footer">
        <span className="autosave-dot" />
        Changes save automatically
      </div>
    </aside>
  );
}

function EditorPanel({
  activeSection,
  data,
  updateData,
  updateBasics,
  updateExperience,
  updateBullet,
  addExperience,
  removeExperience,
  openExperience,
  setOpenExperience,
  customContent,
  setCustomContent,
  onAi,
  onPreview,
  editorCollapsed,
  onToggleCollapsed,
  language,
}) {
  const labels = isChineseResume(language)
    ? {
        basics: ['个人信息', '基本资料'],
        layout: ['整体布局', '页面排版'],
        summary: ['个人介绍', '自我简介'],
        experience: ['工作经历', `${data.experience.length} 段经历`],
        education: ['教育经历', `${data.education.length} 条记录`],
          skills: ['专业技能', '分类与技能点'],
      }
    : {
        basics: ['Personal details', 'The essentials'],
        layout: ['Overall layout', 'Page typography'],
        summary: ['Professional summary', 'Your introduction'],
        experience: ['Experience', `${data.experience.length} positions`],
        education: ['Education', `${data.education.length} entry`],
        skills: ['Skills', 'Core strengths'],
      };
  const fallback = customSectionDefaults(activeSection, language);
  const heading = labels[activeSection] || [
    customContent[activeSection]?.title || fallback?.title || 'Section',
    isChineseResume(language) ? '自定义模块' : 'Custom section',
  ];

  return (
    <section className="editor-panel">
      <div className="editor-header">
        <div>
          <span className="editor-kicker">{heading[1]}</span>
          <h1>{heading[0]}</h1>
        </div>
        <div className="editor-header-actions">
          {activeSection === 'experience' && (
            <button className="secondary-button compact" onClick={addExperience}>
              <Plus size={16} /> Add
            </button>
          )}
          <button
            className="icon-button editor-collapse-button"
            onClick={onToggleCollapsed}
            aria-label={editorCollapsed ? 'Expand editor' : 'Collapse editor'}
            title={editorCollapsed ? 'Expand editor' : 'Collapse editor'}
          >
            {editorCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          <button className="icon-button mobile-preview-button" onClick={onPreview} aria-label="Preview resume">
            <Eye size={18} />
          </button>
        </div>
      </div>

      <div className="editor-scroll">
        {activeSection === 'layout' && (
          <OverallLayoutEditor layout={data.layout} updateData={updateData} language={language} />
        )}
        {activeSection === 'basics' && (
          <BasicsEditor basics={data.basics} onChange={updateBasics} language={language} />
        )}
        {activeSection === 'summary' && (
          <SummaryEditor
            summary={data.summary}
            onChange={(value) => updateData((current) => ({ ...current, summary: value }))}
            onAi={onAi}
          />
        )}
        {activeSection === 'experience' && (
          <ExperienceEditor
            items={data.experience}
            openExperience={openExperience}
            setOpenExperience={setOpenExperience}
            updateExperience={updateExperience}
            updateBullet={updateBullet}
            updateData={updateData}
            addExperience={addExperience}
            removeExperience={removeExperience}
          />
        )}
        {activeSection === 'education' && (
          <EducationEditor data={data} updateData={updateData} />
        )}
        {activeSection === 'skills' && (
          <SkillsEditor skills={data.skills} updateData={updateData} language={language} />
        )}
        {activeSection !== 'layout' && !baseSections.some((section) => section.id === activeSection) && (
          <CustomSectionEditor
            content={customContent[activeSection] || customSectionDefaults(activeSection, language)}
            language={language}
            onChange={(field, value) =>
              setCustomContent((current) => ({
                ...current,
                [activeSection]: { ...current[activeSection], [field]: value },
              }))
            }
          />
        )}
      </div>
    </section>
  );
}

function OverallLayoutEditor({ layout, updateData, language }) {
  const chinese = isChineseResume(language);
  return (
    <div className="form-content layout-controls">
      <label className="field">
        <span>{chinese ? '行高' : 'Line height'}</span>
        <span className="header-height-control">
          <input type="range" min={MIN_LAYOUT_LINE_HEIGHT_PX} max={MAX_LAYOUT_LINE_HEIGHT_PX} step="1" value={layout?.lineHeight ?? DEFAULT_LAYOUT_LINE_HEIGHT_PX} onChange={(event) => updateData((current) => ({ ...current, layout: { ...current.layout, lineHeight: Number(event.target.value) } }))} />
          <output>{layout?.lineHeight ?? DEFAULT_LAYOUT_LINE_HEIGHT_PX}px</output>
        </span>
      </label>
      <label className="field">
        <span>{chinese ? '大标题上边距' : 'Section title top margin'}</span>
        <span className="header-height-control">
          <input type="range" min={MIN_LAYOUT_TITLE_MARGIN_TOP_PX} max={MAX_LAYOUT_TITLE_MARGIN_TOP_PX} step="1" value={layout?.titleMarginTop ?? DEFAULT_LAYOUT_TITLE_MARGIN_TOP_PX} onChange={(event) => updateData((current) => ({ ...current, layout: { ...current.layout, titleMarginTop: Number(event.target.value) } }))} />
          <output>{layout?.titleMarginTop ?? DEFAULT_LAYOUT_TITLE_MARGIN_TOP_PX}px</output>
        </span>
      </label>
      <label className="field">
        <span>{chinese ? '大标题下边距' : 'Section title bottom margin'}</span>
        <span className="header-height-control">
          <input type="range" min={MIN_LAYOUT_TITLE_MARGIN_BOTTOM_PX} max={MAX_LAYOUT_TITLE_MARGIN_BOTTOM_PX} step="1" value={layout?.titleMarginBottom ?? DEFAULT_LAYOUT_TITLE_MARGIN_BOTTOM_PX} onChange={(event) => updateData((current) => ({ ...current, layout: { ...current.layout, titleMarginBottom: Number(event.target.value) } }))} />
          <output>{layout?.titleMarginBottom ?? DEFAULT_LAYOUT_TITLE_MARGIN_BOTTOM_PX}px</output>
        </span>
      </label>
      <label className="field">
        <span>{chinese ? '字体大小' : 'Font size'}</span>
        <span className="header-height-control">
          <input type="range" min={MIN_LAYOUT_FONT_SIZE_PX} max={MAX_LAYOUT_FONT_SIZE_PX} step="0.5" value={layout?.fontSize ?? DEFAULT_LAYOUT_FONT_SIZE_PX} onChange={(event) => updateData((current) => ({ ...current, layout: { ...current.layout, fontSize: Number(event.target.value) } }))} />
          <output>{layout?.fontSize ?? DEFAULT_LAYOUT_FONT_SIZE_PX}px</output>
        </span>
      </label>
    </div>
  );
}

function BasicsEditor({ basics, onChange, language }) {
  const chinese = isChineseResume(language);
  const initials = resumeInitials(basics, language);
  const uploadPhoto = (event) => {
    const [file] = event.target.files || [];
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') onChange('photoUrl', reader.result);
    });
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  return (
    <div className="form-content">
      <div className={cx('basics-identity-row', chinese && 'is-chinese')}>
        <div className="profile-photo-field">
          <div className="profile-photo-controls">
            <label className="avatar-upload" title={chinese ? '上传头像' : 'Upload profile photo'}>
              <ProfileAvatar photoUrl={basics.photoUrl} initials={initials} className="details-avatar" />
              <span className="avatar-upload-overlay" aria-hidden="true"><Upload size={15} /></span>
              <input type="file" accept="image/*" onChange={uploadPhoto} aria-label={chinese ? '上传头像' : 'Upload profile photo'} />
            </label>
            {basics.photoUrl && (
              <button
                type="button"
                className="avatar-remove-button"
                onClick={() => onChange('photoUrl', '')}
                aria-label={chinese ? '移除头像' : 'Remove profile photo'}
                title={chinese ? '移除头像' : 'Remove profile photo'}
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>
        {chinese ? (
          <Field label="姓名" value={basics.fullName} onChange={(value) => onChange('fullName', value)} />
        ) : (
          <>
          <Field label="First name" value={basics.firstName} onChange={(value) => onChange('firstName', value)} />
          <Field label="Last name" value={basics.lastName} onChange={(value) => onChange('lastName', value)} />
          </>
        )}
      </div>
      <Field label={chinese ? '职业标题' : 'Professional title'} value={basics.role} onChange={(value) => onChange('role', value)} />
      <label className="field header-height-field">
        <span>{chinese ? '个人信息栏高度' : 'Personal information height'}</span>
        <span className="header-height-control">
          <input type="range" min={MIN_HEADER_HEIGHT_PX} max={MAX_HEADER_HEIGHT_PX} step="5" value={basics.headerHeight || DEFAULT_HEADER_HEIGHT_PX} onChange={(event) => onChange('headerHeight', Number(event.target.value))} />
          <output>{basics.headerHeight || DEFAULT_HEADER_HEIGHT_PX}px</output>
        </span>
      </label>
      <div className="form-grid two-columns">
        <Field label="Email" type="email" value={basics.email} onChange={(value) => onChange('email', value)} />
        <Field label={chinese ? '电话' : 'Phone'} value={basics.phone} onChange={(value) => onChange('phone', value)} />
      </div>
      <div className="form-grid two-columns">
        <Field label={chinese ? '所在地' : 'Location'} value={basics.location} onChange={(value) => onChange('location', value)} />
        <GenderField
          value={basics.gender}
          onChange={(value) => onChange('gender', value)}
          language={language}
        />
      </div>
      <Field
        label={chinese ? '个人网站' : 'Personal website'}
        value={basics.website}
        placeholder={chinese ? '[网站名称]https://...' : '[Website name]https://...'}
        onChange={(value) => onChange('website', value)}
      />
    </div>
  );
}

function SummaryEditor({ summary, onChange, onAi }) {
  return (
    <div className="form-content">
      <div className="summary-toolbar">
        <span>Summary</span>
        <button onClick={onAi}><Sparkles size={15} /> Rewrite</button>
      </div>
      <textarea
        className="summary-textarea"
        value={summary}
        onChange={(event) => onChange(event.target.value)}
        rows={9}
      />
      <div className="field-footer">
        <span className={summary.length > 380 ? 'warning' : ''}>{summary.length} / 420</span>
        <span><CheckCircle2 size={14} /> Action-focused</span>
      </div>
      <div className="keyword-strip">
        <span>Suggested keywords</span>
        <button>Product strategy <Plus size={13} /></button>
        <button>Design systems <Check size={13} /></button>
        <button>User research <Check size={13} /></button>
      </div>
    </div>
  );
}

function ExperienceEditor({
  items,
  openExperience,
  setOpenExperience,
  updateExperience,
  updateBullet,
  updateData,
  addExperience,
  removeExperience,
}) {
  const [draggedBullet, setDraggedBullet] = useState(null);
  const toggleExperience = (id) => {
    setOpenExperience((current) => (current === id ? null : id));
  };

  const addBullet = (id) => {
    updateData((current) => ({
      ...current,
      experience: current.experience.map((item) =>
        item.id === id
          ? { ...item, bullets: [...item.bullets, 'Add a measurable accomplishment or outcome.'] }
          : item,
      ),
    }));
  };

  const removeBullet = (id, index) => {
    updateData((current) => ({
      ...current,
      experience: current.experience.map((item) =>
        item.id === id
          ? { ...item, bullets: item.bullets.filter((_, bulletIndex) => bulletIndex !== index) }
          : item,
      ),
    }));
  };

  const toggleBullet = (id, index) => {
    updateData((current) => ({
      ...current,
      experience: current.experience.map((item) => {
        if (item.id !== id) return item;
        const hiddenBullets = [...(item.hiddenBullets || [])];
        hiddenBullets[index] = !hiddenBullets[index];
        return { ...item, hiddenBullets };
      }),
    }));
  };

  const reorderBullets = (id, fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    updateData((current) => ({
      ...current,
      experience: current.experience.map((item) => {
        if (item.id !== id) return item;
        const bullets = [...(item.bullets || [])];
        const hiddenBullets = [...(item.hiddenBullets || [])];
        const [bullet] = bullets.splice(fromIndex, 1);
        const [hidden] = hiddenBullets.splice(fromIndex, 1);
        bullets.splice(toIndex, 0, bullet);
        hiddenBullets.splice(toIndex, 0, hidden === true);
        return { ...item, bullets, hiddenBullets };
      }),
    }));
  };

  return (
    <div className="experience-list">
      {items.map((item) => {
        const isOpen = openExperience === item.id;
        const panelId = `experience-panel-${item.id}`;
        return (
          <article className={cx('experience-card', isOpen && 'open')} key={item.id}>
            <button
              type="button"
              className="experience-card-header"
              onClick={() => toggleExperience(item.id)}
              aria-expanded={isOpen}
              aria-controls={panelId}
              aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${item.role || 'experience'}`}
            >
              <span className="reorder-handle"><GripVertical size={17} /></span>
              <span className="experience-card-title">
                <strong>{item.role || 'Untitled role'}</strong>
                <small>{item.company} · {item.start} - {item.end}</small>
              </span>
              <ChevronDown className="accordion-chevron" size={18} />
            </button>

            {isOpen && (
              <div className="experience-card-body" id={panelId}>
                <div className="form-grid two-columns">
                  <Field label="Job title" value={item.role} onChange={(value) => updateExperience(item.id, 'role', value)} />
                  <Field label="Company" value={item.company} onChange={(value) => updateExperience(item.id, 'company', value)} />
                </div>
                <Field label="Location" value={item.location} onChange={(value) => updateExperience(item.id, 'location', value)} />
                <div className="date-current-row">
                  <div className="form-grid two-columns">
                    <Field label="Start date" value={item.start} onChange={(value) => updateExperience(item.id, 'start', value)} />
                    <Field label="End date" value={item.end} disabled={item.current} onChange={(value) => updateExperience(item.id, 'end', value)} />
                  </div>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={item.current}
                      onChange={(event) => {
                        updateExperience(item.id, 'current', event.target.checked);
                        if (event.target.checked) updateExperience(item.id, 'end', 'Present');
                      }}
                    />
                    <span>I currently work here</span>
                  </label>
                </div>

                <div className="field-label-row">
                  <label>Highlights</label>
                </div>
                <div className="bullet-editor-list">
                  {item.bullets.map((bullet, index) => (
                    <div className={cx('bullet-editor', draggedBullet?.id === item.id && draggedBullet.index === index && 'is-dragging')} key={`${item.id}-${index}`} onDragOver={(event) => { event.preventDefault(); }} onDrop={() => { if (draggedBullet?.id === item.id) reorderBullets(item.id, draggedBullet.index, index); setDraggedBullet(null); }}>
                      <span className="bullet-reorder-handle" draggable onDragStart={() => setDraggedBullet({ id: item.id, index })} onDragEnd={() => setDraggedBullet(null)}><GripVertical size={15} /></span>
                      <textarea
                        value={bullet}
                        rows={2}
                        onChange={(event) => updateBullet(item.id, index, event.target.value)}
                      />
                      <button className="icon-button small bullet-visibility-button" type="button" onClick={() => toggleBullet(item.id, index)} aria-label={item.hiddenBullets?.[index] ? 'Show highlight' : 'Hide highlight'} title={item.hiddenBullets?.[index] ? 'Show highlight' : 'Hide highlight'}>
                        {item.hiddenBullets?.[index] ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                      <button className="icon-button small" onClick={() => removeBullet(item.id, index)} aria-label="Delete highlight" title="Delete highlight">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
                <button className="inline-add-button" onClick={() => addBullet(item.id)}>
                  <Plus size={15} /> Add highlight
                </button>
                <div className="card-danger-row">
                  <button onClick={() => removeExperience(item.id)}><Trash2 size={14} /> Delete position</button>
                </div>
              </div>
            )}
          </article>
        );
      })}
      <button className="add-entry-button" onClick={addExperience}>
        <Plus size={17} /> Add another position
      </button>
    </div>
  );
}

function EducationEditor({ data, updateData }) {
  const item = data.education[0];
  const update = (field, value) => {
    updateData((current) => ({
      ...current,
      education: current.education.map((entry, index) =>
        index === 0 ? { ...entry, [field]: value } : entry,
      ),
    }));
  };
  return (
    <div className="form-content">
      <Field label="School" value={item.school} onChange={(value) => update('school', value)} />
      <Field label="Degree and field of study" value={item.degree} onChange={(value) => update('degree', value)} />
      <Field label="Location" value={item.location} onChange={(value) => update('location', value)} />
      <div className="form-grid two-columns">
        <Field label="Start year" value={item.start} onChange={(value) => update('start', value)} />
        <Field label="Graduation year" value={item.end} onChange={(value) => update('end', value)} />
      </div>
      <button className="add-entry-button"><Plus size={17} /> Add another education</button>
    </div>
  );
}

function SkillsEditor({ skills, updateData, language }) {
  const chinese = isChineseResume(language);
  const titleMaxLength = chinese ? 12 : 24;
  const [shakingCategory, setShakingCategory] = useState(null);
  const [titleDrafts, setTitleDrafts] = useState({});
  const [pendingDelete, setPendingDelete] = useState(null);
  const categories = skills.categories?.length
    ? skills.categories
    : [
        { title: chinese ? '专业领域' : 'Expertise', items: skills.expertise },
        { title: chinese ? '工具平台' : 'Tools & Platforms', items: skills.tools },
      ].map((category) => ({
        title: category.title,
        items: category.items.split(/[,，、]/).map((item) => item.trim()).filter(Boolean),
      })).filter((category) => category.items.length);
  const updateCategories = (nextCategories) => {
    updateData((current) => ({ ...current, skills: { ...current.skills, categories: nextCategories } }));
  };

  const addCategory = () => updateCategories([...categories, { title: chinese ? '新技能分类' : 'New skill category', items: [''] }]);
  const removeCategory = (categoryIndex) => setPendingDelete({ categoryIndex, title: categories[categoryIndex]?.title || (chinese ? '未命名分类' : 'Untitled category') });
  const confirmRemoveCategory = () => {
    if (pendingDelete === null) return;
    updateCategories(categories.filter((_, index) => index !== pendingDelete.categoryIndex));
    setPendingDelete(null);
  };
  const updateCategoryItems = (categoryIndex, value) => {
    const itemLines = value.split(/\r?\n/);
    const items = itemLines.map((line) => line.replace(/^\s*[·•]\s?/, '').trim()).filter(Boolean);
    updateCategories(categories.map((category, index) => index === categoryIndex ? { ...category, items } : category));
  };
  const updateCategoryTitle = (categoryIndex, value) => {
    updateCategories(categories.map((item, index) => index === categoryIndex ? { ...item, title: value.slice(0, titleMaxLength) } : item));
  };
  const shakeCategoryTitle = (categoryIndex) => {
    setShakingCategory(categoryIndex);
    window.setTimeout(() => setShakingCategory((current) => current === categoryIndex ? null : current), 220);
  };

  return (
    <div className="form-content">
      <label className="field skill-title-gap-field">
        <span>{chinese ? '小标题到技能点的距离' : 'Category title to skill spacing'}</span>
        <span className="skill-title-gap-control">
          <input type="range" min={MIN_SKILL_TITLE_GAP_PX} max={MAX_SKILL_TITLE_GAP_PX} step="1" value={skills.titleItemGap ?? DEFAULT_SKILL_TITLE_GAP_PX} onChange={(event) => updateData((current) => ({ ...current, skills: { ...current.skills, titleItemGap: Number(event.target.value) } }))} />
          <output>{skills.titleItemGap ?? DEFAULT_SKILL_TITLE_GAP_PX}px</output>
        </span>
      </label>
      <label className="field skill-title-offset-field">
        <span>{chinese ? '小标题水平偏移' : 'Category title horizontal offset'}</span>
        <span className="skill-title-gap-control">
          <input type="range" min={MIN_SKILL_TITLE_OFFSET_X_PX} max={MAX_SKILL_TITLE_OFFSET_X_PX} step="1" value={skills.titleOffsetX ?? DEFAULT_SKILL_TITLE_OFFSET_X_PX} onChange={(event) => updateData((current) => ({ ...current, skills: { ...current.skills, titleOffsetX: Number(event.target.value) } }))} />
          <output>{skills.titleOffsetX ?? DEFAULT_SKILL_TITLE_OFFSET_X_PX}px</output>
        </span>
      </label>
      <div className="skills-editor-list">
        {categories.map((category, categoryIndex) => (
          <section className="skill-editor-category" key={`${category.title}-${categoryIndex}`}>
            <div className="skill-editor-category-heading">
              <input
                value={titleDrafts[categoryIndex] ?? category.title}
                placeholder={chinese ? '分类标题' : 'Category title'}
                maxLength={titleMaxLength}
                className={cx('skill-category-title-input', shakingCategory === categoryIndex && 'is-shaking')}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                  if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && event.currentTarget.value.length >= titleMaxLength) {
                    event.preventDefault();
                    shakeCategoryTitle(categoryIndex);
                  }
                }}
                onChange={(event) => {
                  const value = event.currentTarget.value.slice(0, titleMaxLength);
                  setTitleDrafts((current) => ({ ...current, [categoryIndex]: value }));
                }}
                onBlur={(event) => updateCategoryTitle(categoryIndex, event.currentTarget.value)}
                aria-label={chinese ? `技能分类标题 ${categoryIndex + 1}` : `Skill category title ${categoryIndex + 1}`}
              />
              <button className="icon-button small skill-visibility-button" type="button" onClick={() => updateCategories(categories.map((item, index) => index === categoryIndex ? { ...item, hidden: !item.hidden } : item))} aria-label={category.hidden ? (chinese ? '显示技能分类' : 'Show skill category') : (chinese ? '隐藏技能分类' : 'Hide skill category')} title={category.hidden ? (chinese ? '显示技能分类' : 'Show category') : (chinese ? '隐藏技能分类' : 'Hide category')}>
                {category.hidden ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
              <button className="icon-button small skill-remove-button" type="button" onClick={() => removeCategory(categoryIndex)} aria-label={chinese ? '删除技能分类' : 'Remove skill category'} title={chinese ? '删除技能分类' : 'Remove category'}>
                <Trash2 size={15} />
              </button>
            </div>
            <textarea
              className="skill-category-textarea"
              value={category.items.map((item) => `· ${item}`).join('\n')}
              placeholder={chinese ? '· 技能点\n· 技能点' : '· Skill\n· Skill'}
              onChange={(event) => updateCategoryItems(categoryIndex, event.target.value)}
              aria-label={chinese ? `技能点 ${categoryIndex + 1}` : `Skills ${categoryIndex + 1}`}
            />
          </section>
        ))}
      </div>
      <button className="add-entry-button" type="button" onClick={addCategory}><Plus size={17} /> {chinese ? '添加技能分类' : 'Add skill category'}</button>
      <div className="skill-level-row">
        <div><strong>{chinese ? '显示技能熟练度' : 'Show skill level'}</strong><span>{chinese ? '适合保持简洁的简历格式' : 'Hide for ATS-friendly resumes'}</span></div>
        <button className="toggle-button" role="switch" aria-checked="false"><span /></button>
      </div>
      {pendingDelete !== null && (
        <div className="modal-backdrop" onMouseDown={() => setPendingDelete(null)}>
          <section className="resume-dialog" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="delete-skill-category-title">
            <header className="resume-dialog-header">
              <h2 id="delete-skill-category-title">{chinese ? '删除技能分类？' : 'Delete skill category?'}</h2>
            </header>
            <div className="resume-dialog-content delete-resume-content">
              <p><strong>{pendingDelete.title}</strong>{chinese ? ' 将被删除。' : ' will be deleted.'}</p>
            </div>
            <footer className="resume-dialog-actions">
              <button className="secondary-button" type="button" onClick={() => setPendingDelete(null)}>{chinese ? '取消' : 'Cancel'}</button>
              <button className="primary-button danger-button" type="button" onClick={confirmRemoveCategory}>{chinese ? '删除' : 'Delete'}</button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}

function CustomSectionEditor({ content, onChange, language }) {
  const chinese = isChineseResume(language);
  return (
    <div className="form-content">
      <Field label={chinese ? '模块标题' : 'Section title'} value={content.title} onChange={(value) => onChange('title', value)} />
      <Field label={chinese ? '证书名称' : 'Entry title'} value={content.itemTitle} onChange={(value) => onChange('itemTitle', value)} />
      <Field label={chinese ? '颁发机构或年份' : 'Organization or context'} value={content.subtitle} onChange={(value) => onChange('subtitle', value)} />
      <label className="field">
        <span>{chinese ? '描述' : 'Description'}</span>
        <textarea value={content.description} rows={5} onChange={(event) => onChange('description', event.target.value)} />
      </label>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', disabled = false, placeholder = '' }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function GenderField({ value, onChange, language }) {
  const chinese = isChineseResume(language);
  const options = chinese
    ? [
        { value: '', label: '请选择' },
        { value: '男', label: '男' },
        { value: '女', label: '女' },
        { value: '其他', label: '其他' },
      ]
    : [
        { value: '', label: 'Select' },
        { value: 'Male', label: 'Male' },
        { value: 'Female', label: 'Female' },
        { value: 'Non-binary', label: 'Non-binary' },
        { value: 'Prefer not to say', label: 'Prefer not to say' },
      ];

  return (
    <label className="field">
      <span>{chinese ? '性别' : 'Gender'}</span>
      <span className="select-control">
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <ChevronDown className="select-chevron" size={18} aria-hidden="true" />
      </span>
    </label>
  );
}

function PreviewPanel({
  data,
  template,
  setTemplate,
  accent,
  setAccent,
  zoom,
  setZoom,
  previewPosition,
  onPreviewPositionChange,
  templateMenu,
  setTemplateMenu,
  customSections,
  customContent,
  sectionOrder,
  sectionOrderCustomized,
  language,
  documentId,
  documentName,
  layoutManifest,
  renderState,
  onValidPlan,
  autoFitLayout,
  onLayoutFailure,
}) {
  const [colorMenu, setColorMenu] = useState(false);
  const [contentHeight, setContentHeight] = useState(A4_HEIGHT_PX);
  const [renderedPageCount, setRenderedPageCount] = useState(0);
  const zoomPercent = Math.round(zoom * 100);
  const canonicalDocument = useMemo(() => ({
    id: documentId, documentName, language, data, template: 'profile' as const, accent,
    customSections, customContent, sectionOrder, sectionOrderCustomized,
  }) satisfies RendererResumeDocument, [accent, customContent, customSections, data, documentId, documentName, language, sectionOrder, sectionOrderCustomized]);
  const canonicalPageCount = Math.max(1, renderedPageCount || Number(renderState?.pagePlan?.pages?.length) || 1);
  const serverPageCount = Math.max(1, Number(layoutManifest.pageCount) || 1);
  const hasServerLayout = Boolean(
    layoutManifest.policy && layoutManifest.pageFillRatios.length === serverPageCount,
  );
  const pageCount = template === 'profile'
    ? canonicalPageCount
    : hasServerLayout
    ? serverPageCount
    : Math.max(1, Math.ceil(contentHeight / A4_HEIGHT_PX));
  const previewHeight = pageCount * (A4_HEIGHT_PX + PREVIEW_PAGE_GAP_PX);
  const updateProfilePageHeight = useCallback((height) => {
    setContentHeight((current) => (Math.abs(current - height) < 1 ? current : height));
  }, []);

  useEffect(() => {
    setContentHeight(A4_HEIGHT_PX);
  }, [template]);
  const acceptCanonicalPlan = useCallback((pagePlan, report) => {
    setRenderedPageCount(pagePlan.pages.length);
    onValidPlan(pagePlan, report);
  }, [onValidPlan]);

  const changeZoom = (delta) => {
    setZoom((current) =>
      Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(current + delta).toFixed(2))),
    );
  };
  return (
    <section className="preview-panel">
      <div className="preview-toolbar">
        <div className="preview-toolbar-left">
          <span className="preview-label"><Eye size={15} /> Preview</span>
          <span className="page-count">{pageCount} {pageCount === 1 ? 'page' : 'pages'}</span>
        </div>
        <div className="preview-toolbar-actions">
          <div className="toolbar-popover-wrap">
            <button className="toolbar-button" onClick={() => setTemplateMenu(!templateMenu)}>
              <LayoutGrid size={15} />
              <span>Template</span>
              <ChevronDown size={14} />
            </button>
            {templateMenu && (
              <TemplatePopover
                template={template}
                setTemplate={(value) => {
                  setTemplate(value);
                  setTemplateMenu(false);
                }}
              />
            )}
          </div>
          <div className="toolbar-popover-wrap">
            <button className="icon-button preview-tool" onClick={() => setColorMenu(!colorMenu)} aria-label="Choose accent color" title="Choose accent color">
              <Palette size={17} />
              <span className="active-color-dot" style={{ background: accent }} />
            </button>
            {colorMenu && (
              <div className="color-popover">
                <span>Accent color</span>
                <div className="color-swatches">
                  {accentOptions.map((color) => (
                    <button
                      key={color}
                      className={accent === color ? 'selected' : ''}
                      style={{ background: color }}
                      onClick={() => {
                        setAccent(color);
                        setColorMenu(false);
                      }}
                      aria-label={`Use color ${color}`}
                    >
                      {accent === color && <Check size={14} />}
                    </button>
                  ))}
                  <label className="custom-color-control" title="Choose a custom accent color">
                    <input
                      type="color"
                      value={accent}
                      onChange={(event) => {
                        setAccent(normalizeAccent(event.target.value));
                        setColorMenu(false);
                      }}
                      aria-label="Choose a custom accent color"
                    />
                  </label>
                </div>
              </div>
            )}
          </div>
          <div className="zoom-control">
            <button
              onClick={() => changeZoom(-ZOOM_STEP)}
              disabled={zoom <= MIN_ZOOM}
              aria-label="Zoom out"
              title="Zoom out"
            ><ZoomOut size={15} /></button>
            <button
              className="zoom-value"
              onClick={() => setZoom(1)}
              aria-label={`Reset zoom, current ${zoomPercent}%`}
              title="Reset zoom"
            >{zoomPercent}%</button>
            <button
              onClick={() => changeZoom(ZOOM_STEP)}
              disabled={zoom >= MAX_ZOOM}
              aria-label="Zoom in"
              title="Zoom in"
            ><ZoomIn size={15} /></button>
          </div>
        </div>
      </div>
      <ResumeStage
        zoom={zoom}
        setZoom={setZoom}
        pageHeight={previewHeight}
        initialPosition={previewPosition}
        onPositionChange={onPreviewPositionChange}
      >
        {template === 'profile' ? (
          <ResumePreviewFrame document={canonicalDocument} revision={renderState.draftRevision} autoFit={autoFitLayout} tuning={renderState.layoutTuning} onValidPlan={acceptCanonicalPlan} onLayoutFailure={onLayoutFailure} />
        ) : <div className="resume-pages" aria-label={`${pageCount}-page resume preview`}>
          {Array.from({ length: pageCount }, (_, pageIndex) => (
            <div className="resume-sheet" data-page={pageIndex + 1} key={pageIndex}>
              <div className="resume-sheet-clip">
                <div
                  className="resume-sheet-content"
                  style={{ transform: `translateY(-${pageIndex * A4_HEIGHT_PX}px)` }}
                >
                  <ResumePage
                    data={data}
                    template={template}
                    accent={accent}
                    customSections={customSections}
                    customContent={customContent}
                    sectionOrder={sectionOrder}
                    sectionOrderCustomized={sectionOrderCustomized}
                    onContentHeightChange={pageIndex === 0 && !hasServerLayout ? updateProfilePageHeight : null}
                    language={language}
                    layoutManifest={layoutManifest}
                  />
                </div>
              </div>
              <span className="resume-sheet-number" aria-hidden="true">
                {pageIndex + 1} / {pageCount}
              </span>
            </div>
          ))}
        </div>}
      </ResumeStage>
    </section>
  );
}

function TemplatePopover({ template, setTemplate }) {
  return (
    <div className="template-popover">
      <div className="popover-heading"><span>Choose template</span></div>
      <div className="template-options">
        {templateOptions.map((option) => (
          <button
            key={option.id}
            className={template === option.id ? 'selected' : ''}
            onClick={() => setTemplate(option.id)}
          >
            <MiniResume variant={option.id} />
            <span><strong>{option.name}</strong><small>{option.detail}</small></span>
            {template === option.id && <CheckCircle2 size={16} />}
          </button>
        ))}
      </div>
    </div>
  );
}

function MiniResume({ variant }) {
  return (
    <span className={cx('mini-resume', `mini-${variant}`)}>
      <i className="mini-name" />
      <i className="mini-contact" />
      <i className="mini-heading" />
      <i className="mini-line long" />
      <i className="mini-line" />
      <i className="mini-heading second" />
      <i className="mini-line long" />
      <i className="mini-line short" />
    </span>
  );
}

function ResumeStage({ zoom, setZoom, pageHeight, initialPosition, onPositionChange, children }) {
  const stageRef = useRef(null);
  const dragRef = useRef(null);
  const positionTimerRef = useRef(null);
  const initialPositionRef = useRef(initialPosition);
  const hasRestoredPositionRef = useRef(false);
  const [fitScale, setFitScale] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const pageWidth = A4_WIDTH_PX;

  useLayoutEffect(() => {
    const element = stageRef.current;
    if (!element) return undefined;
    const updateScale = () => {
      const bounds = element.getBoundingClientRect();
      const styles = window.getComputedStyle(element);
      const horizontalPadding =
        Number.parseFloat(styles.paddingLeft) + Number.parseFloat(styles.paddingRight);
      const verticalPadding =
        Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom);
      const availableWidth = Math.max(bounds.width - horizontalPadding, 280);
      const availableHeight = Math.max(bounds.height - verticalPadding, 420);
      const nextScale = Math.min(availableWidth / pageWidth, availableHeight / A4_HEIGHT_PX, 1);
      setFitScale((current) => (Math.abs(current - nextScale) < 0.0005 ? current : nextScale));
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(element, { box: 'border-box' });
    return () => observer.disconnect();
  }, [pageHeight]);

  useLayoutEffect(() => {
    const element = stageRef.current;
    if (!element || fitScale === null || hasRestoredPositionRef.current) return undefined;
    const frame = window.requestAnimationFrame(() => {
      hasRestoredPositionRef.current = true;
      element.scrollLeft = initialPositionRef.current.left;
      element.scrollTop = initialPositionRef.current.top;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [fitScale]);

  useEffect(() => () => {
    if (positionTimerRef.current) window.clearTimeout(positionTimerRef.current);
  }, []);

  const publishPosition = () => {
    const element = stageRef.current;
    if (!element || !hasRestoredPositionRef.current) return;
    onPositionChange({
      left: Math.round(element.scrollLeft),
      top: Math.round(element.scrollTop),
    });
  };

  const savePositionAfterScroll = () => {
    if (!hasRestoredPositionRef.current) return;
    if (positionTimerRef.current) window.clearTimeout(positionTimerRef.current);
    positionTimerRef.current = window.setTimeout(publishPosition, 120);
  };

  const startDrag = (event) => {
    const element = stageRef.current;
    if (!element || event.button !== 0 || event.pointerType !== 'mouse') return;
    if (event.target instanceof Element && event.target.closest('a, button, input, textarea, select')) {
      return;
    }
    if (
      element.scrollWidth <= element.clientWidth &&
      element.scrollHeight <= element.clientHeight
    ) return;

    event.preventDefault();
    element.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scrollLeft: element.scrollLeft,
      scrollTop: element.scrollTop,
    };
    setIsDragging(true);
  };

  const moveDrag = (event) => {
    const element = stageRef.current;
    const drag = dragRef.current;
    if (!element || !drag || drag.pointerId !== event.pointerId) return;
    element.scrollLeft = drag.scrollLeft + drag.x - event.clientX;
    element.scrollTop = drag.scrollTop + drag.y - event.clientY;
  };

  const stopDrag = (event) => {
    const element = stageRef.current;
    const drag = dragRef.current;
    if (!element || !drag || drag.pointerId !== event.pointerId) return;
    if (element.hasPointerCapture(event.pointerId)) {
      element.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setIsDragging(false);
    publishPosition();
  };

  const zoomWithWheel = (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const direction = event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    setZoom((current) =>
      Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(current + direction).toFixed(2))),
    );
  };

  const scale = (fitScale ?? 0.7) * zoom;
  return (
    <div
      className={cx('resume-stage', isDragging && 'is-dragging')}
      ref={stageRef}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      onWheel={zoomWithWheel}
      onScroll={savePositionAfterScroll}
    >
      <div
        className="resume-scale-wrap"
        style={{ width: pageWidth * scale, height: pageHeight * scale }}
      >
        <div className="resume-transform" style={{ height: pageHeight, transform: `scale(${scale})` }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function ResumePage({
  data,
  template,
  accent,
  customSections,
  customContent,
  sectionOrder,
  sectionOrderCustomized,
  onContentHeightChange,
  language,
  layoutManifest,
}) {
  const { basics } = data;
  const initials = resumeInitials(basics, language);
  const name = resumeName(basics, language);
  const isProfileTemplate = template === 'profile';
  const hasProfilePhoto = Boolean(basics.photoUrl);
  const contactItems = [
    { id: 'email', icon: Mail, value: basics.email },
    { id: 'phone', icon: Phone, value: basics.phone },
    { id: 'location', icon: MapPin, value: basics.location },
    { id: 'gender', icon: UserRound, value: basics.gender },
    { id: 'website', icon: Link, value: basics.website },
    { id: 'wechat', icon: MessageSquareText, value: basics.wechat },
    { id: 'linkedin', icon: Linkedin, value: basics.linkedin },
    { id: 'whatsapp', icon: MessageCircle, value: basics.whatsapp },
    { id: 'telegram', icon: Send, value: basics.telegram },
  ].filter((item) => item.value);
  const displayOrder = useMemo(
    () => isProfileTemplate && !sectionOrderCustomized
      ? defaultSectionOrder('profile', customSections)
      : sectionOrder,
    [customSections, isProfileTemplate, sectionOrder, sectionOrderCustomized],
  );
  const pageRef = useRef(null);

  useLayoutEffect(() => {
    if (!onContentHeightChange) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const contentHeight = Math.max(A4_HEIGHT_PX, Math.ceil(pageRef.current?.scrollHeight || A4_HEIGHT_PX));
      onContentHeightChange(contentHeight);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    customContent,
    customSections,
    data,
    displayOrder,
    layoutManifest.lineHeightDelta,
    layoutManifest.fontSizeDelta,
    layoutManifest.sectionGapDelta,
    onContentHeightChange,
  ]);

  return (
    <article
      ref={pageRef}
      className={cx('resume-page', `template-${template}`, hasProfilePhoto && 'has-profile-photo')}
      style={{
        '--resume-accent': accent,
        '--layout-section-gap-delta': `${layoutManifest.sectionGapDelta}px`,
        '--layout-line-height-delta': `${layoutManifest.lineHeightDelta}px`,
        '--layout-font-size-delta': `${layoutManifest.fontSizeDelta}px`,
        '--resume-line-height': `${data.layout?.lineHeight ?? DEFAULT_LAYOUT_LINE_HEIGHT_PX}px`,
        '--resume-title-margin-top': `${data.layout?.titleMarginTop ?? DEFAULT_LAYOUT_TITLE_MARGIN_TOP_PX}px`,
        '--resume-title-margin-bottom': `${data.layout?.titleMarginBottom ?? DEFAULT_LAYOUT_TITLE_MARGIN_BOTTOM_PX}px`,
        '--resume-font-size': `${data.layout?.fontSize ?? DEFAULT_LAYOUT_FONT_SIZE_PX}px`,
      } as CssVariables}
      lang={isChineseResume(language) ? 'zh-CN' : 'en'}
    >
      <header className="resume-header" style={{ height: isProfileTemplate ? basics.headerHeight || DEFAULT_HEADER_HEIGHT_PX : undefined }}>
        {isProfileTemplate && hasProfilePhoto && (
          <div className="profile-avatar-slot">
            <ProfileAvatar photoUrl={basics.photoUrl} initials={initials} className="resume-profile-avatar" />
          </div>
        )}
        <div className="resume-header-content">
          <div className="resume-name-block">
            <h2>{name}</h2>
            <p>{basics.role}</p>
          </div>
          <div className="resume-contact">
            {contactItems.map(({ id, icon: Icon, value }, index) => (
              <span className="resume-contact-item" key={id} data-contact={id}>
                <Icon size={11} />
                {['website', 'linkedin'].includes(id) ? <WebsiteLink website={value} /> : value}
                {isProfileTemplate && index < contactItems.length - 1 && (
                  <i className="contact-separator" aria-hidden="true" />
                )}
              </span>
            ))}
          </div>
        </div>
      </header>

      <div className="resume-body">
        {displayOrder.map((sectionId) => (
          <ResumeContentSection
            key={sectionId}
            sectionId={sectionId}
            data={data}
            profile={isProfileTemplate}
            customContent={customContent}
            language={language}
          />
        ))}
      </div>
    </article>
  );
}

function WebsiteLink({ website }) {
  const link = parseWebsiteLink(website);
  if (!link) return <>{textValue(website).trim()}</>;
  return (
    <a className="resume-website-link" href={link.href} target="_blank" rel="noreferrer">
      {link.label}
    </a>
  );
}

function ResumeContentSection({ sectionId, data, profile, customContent, language }) {
  const chinese = isChineseResume(language);
  if (sectionId === 'basics') return null;
  if (sectionId === 'summary') {
    return (
      <ResumeSection title={chinese ? chineseSectionLabels.summary : profile ? 'Personal Introduction' : 'Profile'} className="profile-section">
        <p><FormattedPuppetText value={data.summary} allowBold maxBold={2} /></p>
      </ResumeSection>
    );
  }
  if (sectionId === 'education') {
    return (
      <ResumeSection title={chinese ? chineseSectionLabels.education : 'Education'} className="education-section">
        <EducationEntries items={data.education} profile={profile} />
      </ResumeSection>
    );
  }
  if (sectionId === 'experience') {
    return (
      <ResumeSection title={chinese ? chineseSectionLabels.experience : profile ? 'Work Experience' : 'Experience'} className="experience-section">
        <ExperienceEntries items={data.experience} profile={profile} />
      </ResumeSection>
    );
  }
  if (sectionId === 'skills') {
    return profile ? (
      <ResumeSection title={chinese ? chineseSectionLabels.skills : 'Professional Skills'} className="skills-section">
        <ProfileSkills skills={data.skills} language={language} />
      </ResumeSection>
    ) : (
      <ResumeSection title={chinese ? chineseSectionLabels.skills : 'Skills'} className="skills-section">
        <div className="resume-skill-row"><strong>{chinese ? '专业领域' : 'Expertise'}</strong><span>{data.skills.expertise}</span></div>
        <div className="resume-skill-row"><strong>{chinese ? '工具平台' : 'Tools'}</strong><span>{data.skills.tools}</span></div>
      </ResumeSection>
    );
  }
  if (sectionId === 'certifications' && data.certificates.length) {
    return (
      <ResumeSection title={chinese ? chineseSectionLabels.certifications : 'Certificates'} className="certificates-section">
        <div className="certificate-list">
          {data.certificates.map((certificate, index) => (
            <span key={`${certificate.name}-${index}`}>
              <FormattedPuppetText value={certificate.name} />
              {certificate.date && <small>{certificate.date}</small>}
            </span>
          ))}
        </div>
      </ResumeSection>
    );
  }

  const content = customContent[sectionId];
  if (!content) return null;
  return (
    <ResumeSection title={chinese && sectionId === 'certifications' ? chineseSectionLabels.certifications : content.title}>
      <div className="resume-entry compact-entry">
        <div className="resume-entry-heading">
          <div><strong>{content.itemTitle}</strong><span>{content.subtitle}</span></div>
        </div>
        {content.description && <p>{content.description}</p>}
      </div>
    </ResumeSection>
  );
}

function ProfileAvatar({ photoUrl, initials, className }) {
  const [imageFailed, setImageFailed] = useState(false);
  const hasImage = Boolean(photoUrl) && !imageFailed;

  useEffect(() => setImageFailed(false), [photoUrl]);

  return (
    <span className={cx(className, hasImage && 'has-image')} aria-hidden="true">
      {hasImage && <img src={photoUrl} alt="" onError={() => setImageFailed(true)} />}
      <span className="profile-avatar-initials">{initials}</span>
    </span>
  );
}

function ExperienceEntries({ items, profile = false }) {
  return items.map((item) => {
    let underlinedBullets = 0;
    return (
      <div className={cx('resume-entry', profile && 'profile-work-entry')} key={item.id}>
        <div className="resume-entry-heading">
          <div>
            <strong>{profile ? `${item.company} - ${item.role}` : item.role}</strong>
            <span>{profile ? item.location : `${item.company} · ${item.location}`}</span>
          </div>
          <time>{item.start} - {item.end}</time>
        </div>
        <ul>
          {item.bullets.map((bullet, index) => {
            if (item.hiddenBullets?.[index]) return null;
            const allowUnderline = underlinedBullets < 2 && /<u>.*?<\/u>/i.test(textValue(bullet));
            if (allowUnderline) underlinedBullets += 1;
            return (
              <li key={index}>
                <FormattedPuppetText value={bullet} allowUnderline={allowUnderline} maxUnderline={1} />
              </li>
            );
          })}
        </ul>
      </div>
    );
  });
}

function EducationEntries({ items, profile = false }) {
  return items.map((item) => (
    <div className={cx('resume-entry', 'compact-entry', profile && 'profile-education-entry')} key={item.id}>
      <div className="resume-entry-heading">
        <div>
          <strong>{profile ? item.school : item.degree}</strong>
          <span>{profile ? `${item.degree}${item.location ? `, ${item.location}` : ''}` : `${item.school} · ${item.location}`}</span>
        </div>
        <time>{item.start} - {item.end}</time>
      </div>
    </div>
  ));
}

function ProfileSkills({ skills, language }) {
  const chinese = isChineseResume(language);
  const categories = skills.categories?.length
    ? skills.categories
    : [
        { title: chinese ? '专业领域' : 'Expertise', items: skills.expertise },
        { title: chinese ? '工具平台' : 'Tools & Platforms', items: skills.tools },
      ].map((category) => ({
        ...category,
        items: category.items.split(',').map((item) => item.trim()).filter(Boolean),
      })).filter((category) => category.items.length);
  const visibleCategories = categories.filter((category) => !category.hidden);

  return (
    <div className="profile-skills-grid">
      {visibleCategories.map((category) => (
        <div className="profile-skill-category" key={category.title}>
          <strong style={{ transform: `translateX(${skills.titleOffsetX ?? DEFAULT_SKILL_TITLE_OFFSET_X_PX}px)` }}>{category.title}</strong>
          <ul style={{ marginTop: skills.titleItemGap ?? DEFAULT_SKILL_TITLE_GAP_PX }}>{category.items.map((item) => <li key={item}><FormattedPuppetText value={item} /></li>)}</ul>
        </div>
      ))}
    </div>
  );
}

function FormattedPuppetText({
  value,
  allowBold = false,
  allowUnderline = false,
  maxBold = 0,
  maxUnderline = 0,
}) {
  const tokens = textValue(value).split(/(<b>.*?<\/b>|<u>.*?<\/u>|(?:\r?\n[ \t]*)+)/gi);
  let boldCount = 0;
  let underlineCount = 0;
  return tokens.map((token, index) => {
    const bold = /^<b>(.*?)<\/b>$/i.exec(token);
    if (bold) {
      boldCount += 1;
      return allowBold && boldCount <= maxBold ? <strong key={index}>{bold[1]}</strong> : bold[1];
    }
    const underline = /^<u>(.*?)<\/u>$/i.exec(token);
    if (underline) {
      underlineCount += 1;
      return allowUnderline && underlineCount <= maxUnderline ? <u key={index}>{underline[1]}</u> : underline[1];
    }
    if (/^(?:\r?\n[ \t]*)+$/.test(token)) {
      return <span className="resume-paragraph-break" aria-hidden="true" key={index} />;
    }
    return token;
  });
}

function ResumeSection({ title, children, className = '' }) {
  return (
    <section className={cx('resume-section', className)}>
      <h3>{title}</h3>
      <div>{children}</div>
    </section>
  );
}

function AiPanel({ currentSummary, onClose, onApply }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="ai-panel" role="dialog" aria-modal="true" aria-labelledby="ai-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="ai-panel-header">
          <div className="ai-panel-icon"><Sparkles size={19} /></div>
          <div><span>Draftline AI</span><h2 id="ai-title">Strengthen your summary</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="ai-comparison">
          <div className="ai-version current-version">
            <span>Current</span>
            <p>{currentSummary}</p>
          </div>
          <div className="ai-version suggested-version">
            <span><Sparkles size={13} /> Suggested</span>
            <p>Strategic product designer with 7+ years of experience simplifying complex enterprise workflows. Led research, interaction design, and design systems that increased activation by 16%, improved task completion by 27%, and accelerated delivery across three product teams.</p>
            <div className="ai-tags"><span>More specific</span><span>Outcome-led</span><span>ATS keywords</span></div>
          </div>
        </div>
        <div className="ai-panel-actions">
          <button className="secondary-button" onClick={onClose}>Keep current</button>
          <button className="primary-button" onClick={onApply}><Check size={16} /> Use suggestion</button>
        </div>
      </section>
    </div>
  );
}

export default App;
