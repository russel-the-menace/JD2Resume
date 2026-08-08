import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CSSProperties } from 'react';
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
  FileUp,
  FileText,
  FolderOpen,
  GraduationCap,
  GripVertical,
  LayoutGrid,
  KeyRound,
  Link,
  ListChecks,
  LoaderCircle,
  LogIn,
  Mail,
  MapPin,
  Minus,
  MoreHorizontal,
  Palette,
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  Phone,
  Plus,
  Redo2,
  RotateCcw,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  UserPlus,
  UserRound,
  UsersRound,
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
  skills: '专业经历',
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
const EDITOR_WIDTH_STORAGE_KEY = 'draftline-editor-width';
const RESUME_STORAGE_KEY = 'draftline-resume-state-v1';
const WORKSPACE_STORAGE_KEY = 'draftline-workspace-preferences-v1';
const LIBRARY_STORAGE_KEY = 'draftline-resume-library-v2';
const USER_PROFILE_STORAGE_KEY = 'draftline-user-profile-v1';
const USER_DATABASE_STORAGE_KEY = 'draftline-user-database-v1';
const CURRENT_ACCOUNT_STORAGE_KEY = 'draftline-current-account-v1';
const ACCOUNT_STORAGE_PREFIX = 'draftline-account-data-v1';
const ACCOUNT_MIGRATION_STORAGE_KEY = 'draftline-account-migration-v1';
const DEFAULT_ACCOUNT = {
  id: 'yeatom',
  username: 'yeatom',
  password: 'yeatom',
  createdAt: 0,
};
const STORAGE_VERSION = 1;
const LIBRARY_VERSION = 2;
const DEFAULT_DOCUMENT_NAME = 'Jordan Lee - Product Designer';
const MAX_JOB_SOURCE_BYTES = 5 * 1024 * 1024;
type CssVariables = CSSProperties & Record<`--${string}`, string>;

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
  return `${basics.firstName || ''} ${basics.lastName || ''}`.trim();
}

function resumeInitials(basics, language) {
  if (isChineseResume(language)) {
    return resumeName(basics, language).slice(0, 2) || '姓名';
  }
  return `${basics.firstName?.[0] || 'Y'}${basics.lastName?.[0] || ''}`;
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function storedJson(key: string): unknown {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function textValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

const emptyUserProfile = {
  chinese: {
    fullName: '',
    gender: '',
    phone: '',
    email: '',
    location: '',
    wechat: '',
    website: '',
    summary: '',
  },
  english: {
    fullName: '',
    gender: '',
    phone: '',
    email: '',
    location: '',
    linkedin: '',
    website: '',
    summary: '',
  },
};

const requiredProfileFields = ['fullName', 'gender', 'phone', 'email', 'location', 'summary'];

const profileFieldLabels = {
  chinese: {
    fullName: '姓名',
    gender: '性别',
    phone: '手机号码',
    email: '邮箱',
    location: '所在地',
    summary: '个人简介',
  },
  english: {
    fullName: 'Full name',
    gender: 'Gender',
    phone: 'Phone',
    email: 'Email',
    location: 'Location',
    summary: 'Professional profile',
  },
};

function normalizeUserProfile(value) {
  const source = isRecord(value) ? value : {};
  return Object.entries(emptyUserProfile).reduce((profile, [language, fields]) => {
    const savedFields = isRecord(source[language]) ? source[language] : {};
    profile[language] = Object.keys(fields).reduce((result, field) => {
      result[field] = textValue(savedFields[field]).trim();
      return result;
    }, {});
    return profile;
  }, {});
}

function loadUserProfile(storageKey = USER_PROFILE_STORAGE_KEY) {
  return normalizeUserProfile(storedJson(storageKey));
}

function readFileAsDataUrl(file): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(typeof reader.result === 'string' ? reader.result : ''));
    reader.addEventListener('error', () => reject(new Error('The selected file could not be read.')));
    reader.readAsDataURL(file);
  });
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

function missingProfileFields(profile, language) {
  const fields = profile?.[language] || {};
  return requiredProfileFields.filter((field) => !textValue(fields[field]).trim());
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
      website: textValue(
        basics.website,
        textValue(basics.linkedin, initialResume.basics.website),
      ),
      photoUrl: textValue(basics.photoUrl, initialResume.basics.photoUrl),
    },
    summary: textValue(source.summary, initialResume.summary),
    experience,
    education: storedEducation.length
      ? storedEducation
      : initialResume.education.map((entry) => ({ ...entry })),
    skills: {
      expertise: textValue(skills.expertise, initialResume.skills.expertise),
      tools: textValue(skills.tools, initialResume.skills.tools),
    },
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

function loadResumeSnapshot() {
  const stored = storedJson(RESUME_STORAGE_KEY);
  const source = isRecord(stored) ? stored : {};
  const customSections = normalizeCustomSections(source.customSections);
  const template = templateOptions.some((option) => option.id === source.template)
    ? source.template
    : 'modern';
  const language = source.language === 'chinese' ? 'chinese' : 'english';
  return {
    documentName: textValue(source.documentName, DEFAULT_DOCUMENT_NAME),
    language,
    data: normalizeResumeData(source.data, language),
    template,
    accent: normalizeAccent(source.accent),
    customSections,
    customContent: normalizeCustomContent(customSections, source.customContent, language),
    sectionOrder: normalizeSectionOrder(source.sectionOrder, customSections, template),
    sectionOrderCustomized: source.sectionOrderCustomized === true,
  };
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

function defaultResumeLibrary() {
  const migratedResume = loadResumeSnapshot();
  const now = Date.now();
  return {
    version: LIBRARY_VERSION,
    resumes: [
      { id: 'product-designer', ...migratedResume, updatedAt: now },
      { id: 'product-manager', ...productManagerSnapshot(), updatedAt: now - 1000 * 60 * 42 },
      { id: 'android-developer', ...androidDeveloperSnapshot(), updatedAt: now - 1000 * 60 * 60 * 26 },
    ],
  };
}

function loadResumeLibrary(storageKey = LIBRARY_STORAGE_KEY, useLegacyDefaults = true) {
  const stored = storedJson(storageKey);
  if (isRecord(stored) && Array.isArray(stored.resumes)) {
    return {
      version: LIBRARY_VERSION,
      resumes: stored.resumes.map(normalizeResumeDocument),
    };
  }
  return useLegacyDefaults ? defaultResumeLibrary() : emptyResumeLibrary();
}

function normalizedUsername(value) {
  return textValue(value).trim();
}

function accountIdFor(username) {
  return normalizedUsername(username).toLowerCase();
}

function accountStorageKey(accountId, key) {
  return `${ACCOUNT_STORAGE_PREFIX}:${encodeURIComponent(accountId)}:${key}`;
}

function writeStoredJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function storedValueExists(key) {
  try {
    return window.localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

function removeStoredValue(key) {
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function normalizeAccountDatabase(value) {
  const source = isRecord(value) && Array.isArray(value.accounts) ? value.accounts : [];
  const accounts = source.reduce((result, entry) => {
    const username = normalizedUsername(entry?.username);
    const id = accountIdFor(username);
    const password = textValue(entry?.password);
    if (!username || !password || result.some((account) => account.id === id)) return result;
    result.push({
      id,
      username,
      password,
      createdAt: Number.isFinite(Number(entry?.createdAt)) ? Number(entry.createdAt) : Date.now(),
    });
    return result;
  }, []);
  if (!accounts.some((account) => account.id === DEFAULT_ACCOUNT.id)) {
    accounts.unshift({ ...DEFAULT_ACCOUNT });
  }
  return { version: 1, accounts };
}

function profileForUsername(username) {
  const profile = normalizeUserProfile(null) as any;
  const name = normalizedUsername(username);
  profile.chinese.fullName = name;
  profile.english.fullName = name;
  return profile;
}

function hasProfileData(profile) {
  return Object.values(normalizeUserProfile(profile)).some((fields) =>
    Object.values(fields).some((value) => textValue(value).trim()),
  );
}

function hasMeaningfulProfileData(profile, username) {
  const normalized = normalizeUserProfile(profile);
  const generatedName = normalizedUsername(username);
  return Object.values(normalized).some((fields) =>
    Object.entries(fields).some(([field, value]) => {
      const text = textValue(value).trim();
      return Boolean(text) && !(field === 'fullName' && text === generatedName);
    }),
  );
}

function hasWorkspaceData(workspace) {
  if (!isRecord(workspace)) return false;
  return Object.keys(isRecord(workspace.byResume) ? workspace.byResume : {}).length > 0 ||
    Number(workspace.editorWidth) !== DEFAULT_EDITOR_WIDTH;
}

function initializeAccountData(account) {
  const libraryKey = accountStorageKey(account.id, LIBRARY_STORAGE_KEY);
  const profileKey = accountStorageKey(account.id, USER_PROFILE_STORAGE_KEY);
  const workspaceKey = accountStorageKey(account.id, WORKSPACE_STORAGE_KEY);
  if (!storedValueExists(libraryKey)) {
    writeStoredJson(libraryKey, emptyResumeLibrary());
  }
  const scopedProfile = loadUserProfile(profileKey);
  if (!storedValueExists(profileKey) || !hasProfileData(scopedProfile)) {
    writeStoredJson(profileKey, profileForUsername(account.username));
  }
  if (!storedValueExists(workspaceKey)) {
    writeStoredJson(workspaceKey, {
      version: STORAGE_VERSION,
      editorWidth: DEFAULT_EDITOR_WIDTH,
      byResume: {},
    });
  }
}

function migrateLegacyAccountData(accounts) {
  if (storedValueExists(ACCOUNT_MIGRATION_STORAGE_KEY)) return;
  const defaultAccount = accounts.find((account) => account.id === DEFAULT_ACCOUNT.id);
  if (!defaultAccount) return;
  let migrationSucceeded = true;

  const libraryKey = accountStorageKey(defaultAccount.id, LIBRARY_STORAGE_KEY);
  const profileKey = accountStorageKey(defaultAccount.id, USER_PROFILE_STORAGE_KEY);
  const workspaceKey = accountStorageKey(defaultAccount.id, WORKSPACE_STORAGE_KEY);
  const scopedLibrary = storedJson(libraryKey);
  const legacyStoredLibrary = storedJson(LIBRARY_STORAGE_KEY);
  const legacyLibrary = loadResumeLibrary(LIBRARY_STORAGE_KEY);
  const scopedHasResumes = isRecord(scopedLibrary) && Array.isArray(scopedLibrary.resumes) && scopedLibrary.resumes.length > 0;
  const legacyStorageHasResumes = isRecord(legacyStoredLibrary) &&
    Array.isArray(legacyStoredLibrary.resumes) &&
    legacyStoredLibrary.resumes.length > 0;
  if (!storedValueExists(libraryKey) || (!scopedHasResumes && legacyStorageHasResumes)) {
    migrationSucceeded = writeStoredJson(
      libraryKey,
      legacyStorageHasResumes ? legacyLibrary : loadResumeLibrary(LIBRARY_STORAGE_KEY),
    ) && migrationSucceeded;
  }
  const scopedProfile = loadUserProfile(profileKey);
  const legacyProfile = loadUserProfile(USER_PROFILE_STORAGE_KEY);
  if (!storedValueExists(profileKey) || !hasProfileData(scopedProfile) ||
    (hasProfileData(legacyProfile) && !hasMeaningfulProfileData(scopedProfile, defaultAccount.username))) {
    migrationSucceeded = writeStoredJson(
      profileKey,
      hasProfileData(legacyProfile) ? legacyProfile : profileForUsername(defaultAccount.username),
    ) && migrationSucceeded;
  }
  const scopedWorkspace = storedJson(workspaceKey);
  const legacyWorkspace = storedJson(WORKSPACE_STORAGE_KEY);
  if (!storedValueExists(workspaceKey) || (!hasWorkspaceData(scopedWorkspace) && hasWorkspaceData(legacyWorkspace))) {
    const legacyEditorWidth = Number(window.localStorage.getItem(EDITOR_WIDTH_STORAGE_KEY));
    migrationSucceeded = writeStoredJson(
      workspaceKey,
      hasWorkspaceData(legacyWorkspace)
        ? legacyWorkspace
        : {
            version: STORAGE_VERSION,
            editorWidth: Number.isFinite(legacyEditorWidth) ? legacyEditorWidth : DEFAULT_EDITOR_WIDTH,
            byResume: {},
          },
    ) && migrationSucceeded;
  }
  if (!migrationSucceeded) return;
  const legacyKeys = [
    EDITOR_WIDTH_STORAGE_KEY,
    RESUME_STORAGE_KEY,
    WORKSPACE_STORAGE_KEY,
    LIBRARY_STORAGE_KEY,
    USER_PROFILE_STORAGE_KEY,
  ];
  if (!legacyKeys.every(removeStoredValue)) return;
  writeStoredJson(ACCOUNT_MIGRATION_STORAGE_KEY, { version: 1, completedAt: Date.now() });
}

function initializeAccountDatabase() {
  if (typeof window === 'undefined') {
    return { accounts: [{ ...DEFAULT_ACCOUNT }], currentAccount: { ...DEFAULT_ACCOUNT } };
  }
  const savedDatabase = storedJson(USER_DATABASE_STORAGE_KEY);
  const database = normalizeAccountDatabase(savedDatabase);
  const hasDatabase = isRecord(savedDatabase) && Array.isArray(savedDatabase.accounts);
  if (!hasDatabase || JSON.stringify(savedDatabase) !== JSON.stringify(database)) {
    writeStoredJson(USER_DATABASE_STORAGE_KEY, database);
  }
  migrateLegacyAccountData(database.accounts);
  database.accounts.forEach((account) => initializeAccountData(account));
  const savedCurrentId = textValue(window.localStorage.getItem(CURRENT_ACCOUNT_STORAGE_KEY));
  const currentAccount = database.accounts.find((account) => account.id === savedCurrentId)
    || database.accounts[0];
  window.localStorage.setItem(CURRENT_ACCOUNT_STORAGE_KEY, currentAccount.id);
  return { accounts: database.accounts, currentAccount };
}

function blankResumeSnapshot(
  { documentName, language }: { documentName?: string; language?: string } = {},
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
  }) === JSON.stringify(snapshot);
}

function loadWorkspacePreferences(resumeSnapshot, resumeId, workspaceStorageKey = WORKSPACE_STORAGE_KEY) {
  const stored = storedJson(workspaceStorageKey);
  const root = isRecord(stored) ? stored : {};
  const savedByResume = isRecord(root.byResume) ? root.byResume : {};
  const source = isRecord(savedByResume[resumeId]) ? savedByResume[resumeId] : root;
  const legacyWidth = workspaceStorageKey === WORKSPACE_STORAGE_KEY && typeof window !== 'undefined'
    ? window.localStorage.getItem(EDITOR_WIDTH_STORAGE_KEY)
    : null;
  const widthCandidate = root.editorWidth ?? source.editorWidth ?? Number(legacyWidth);
  const zoomCandidate = Number(source.zoom);
  const editorWidthCandidate = Number(widthCandidate);
  const availableSections = new Set([
    ...baseSections.map((section) => section.id),
    ...resumeSnapshot.customSections,
  ]);
  const experienceIds = new Set(resumeSnapshot.data.experience.map((entry) => entry.id));
  const storedPosition = isRecord(source.previewPosition) ? source.previewPosition : {};

  return {
    zoom: Number.isFinite(zoomCandidate)
      ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomCandidate))
      : 1,
    editorWidth: Number.isFinite(editorWidthCandidate) && editorWidthCandidate > 0
      ? Math.min(MAX_EDITOR_WIDTH, Math.max(MIN_EDITOR_WIDTH, editorWidthCandidate))
      : DEFAULT_EDITOR_WIDTH,
    activeSection: availableSections.has(source.activeSection)
      ? source.activeSection
      : 'experience',
    openExperience: source.openExperience === null
      ? null
      : experienceIds.has(source.openExperience)
        ? source.openExperience
        : resumeSnapshot.data.experience[0]?.id ?? null,
    mobileMode: ['outline', 'edit', 'preview'].includes(source.mobileMode)
      ? source.mobileMode
      : 'edit',
    editorCollapsed: source.editorCollapsed === true,
    previewPosition: {
      left: Number.isFinite(Number(storedPosition.left))
        ? Math.max(0, Number(storedPosition.left))
        : 0,
      top: Number.isFinite(Number(storedPosition.top))
        ? Math.max(0, Number(storedPosition.top))
        : 0,
    },
  };
}

function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}

function App() {
  const accountBootstrap = useMemo(initializeAccountDatabase, []);
  const [accounts, setAccounts] = useState(accountBootstrap.accounts);
  const [currentAccount, setCurrentAccount] = useState(accountBootstrap.currentAccount);
  const initialLibrary = useMemo(
    () => loadResumeLibrary(accountStorageKey(accountBootstrap.currentAccount.id, LIBRARY_STORAGE_KEY), false),
    [accountBootstrap],
  );
  const initialProfile = useMemo(
    () => loadUserProfile(accountStorageKey(accountBootstrap.currentAccount.id, USER_PROFILE_STORAGE_KEY)),
    [accountBootstrap],
  );
  const accountLibraryKey = accountStorageKey(currentAccount.id, LIBRARY_STORAGE_KEY);
  const accountProfileKey = accountStorageKey(currentAccount.id, USER_PROFILE_STORAGE_KEY);
  const accountWorkspaceKey = accountStorageKey(currentAccount.id, WORKSPACE_STORAGE_KEY);
  const libraryRef = useRef(initialLibrary);
  const [library, setLibrary] = useState(initialLibrary);
  const [userProfile, setUserProfile] = useState(initialProfile);
  const [profileImporting, setProfileImporting] = useState(false);
  const [selectedResumeId, setSelectedResumeId] = useState(() => {
    if (typeof window === 'undefined') return null;
    const resume = new URLSearchParams(window.location.search).get('resume');
    return initialLibrary.resumes.some((document) => document.id === resume) ? resume : null;
  });

  const persistLibrary = useCallback((nextLibrary) => {
    if (!writeStoredJson(accountLibraryKey, nextLibrary)) return false;
    libraryRef.current = nextLibrary;
    setLibrary(nextLibrary);
    return true;
  }, [accountLibraryKey]);

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

  const activateAccount = useCallback((account) => {
    initializeAccountData(account);
    const nextLibrary = loadResumeLibrary(accountStorageKey(account.id, LIBRARY_STORAGE_KEY), false);
    const nextProfile = loadUserProfile(accountStorageKey(account.id, USER_PROFILE_STORAGE_KEY));
    try {
      window.localStorage.setItem(CURRENT_ACCOUNT_STORAGE_KEY, account.id);
    } catch {
      return false;
    }
    libraryRef.current = nextLibrary;
    setLibrary(nextLibrary);
    setUserProfile(nextProfile);
    setCurrentAccount(account);
    returnHome();
    return true;
  }, [returnHome]);

  const switchAccount = useCallback((accountId) => {
    const account = accounts.find((candidate) => candidate.id === accountId);
    return account ? activateAccount(account) : false;
  }, [accounts, activateAccount]);

  const loginAccount = useCallback(({ username, password }) => {
    const account = accounts.find((candidate) => candidate.id === accountIdFor(username));
    if (!account) return { ok: false, error: 'This account is not registered yet.' };
    if (account.password !== password) return { ok: false, error: 'Password is incorrect.' };
    return activateAccount(account)
      ? { ok: true }
      : { ok: false, error: 'This browser could not save the active account.' };
  }, [accounts, activateAccount]);

  const registerAccount = useCallback(({ username, password }) => {
    const displayName = normalizedUsername(username);
    const id = accountIdFor(displayName);
    if (displayName.length < 2 || displayName.length > 64) {
      return { ok: false, error: 'Username must be between 2 and 64 characters.' };
    }
    if (!password) return { ok: false, error: 'Enter a password.' };
    if (accounts.some((account) => account.id === id)) {
      return { ok: false, error: 'This username is already in use.' };
    }
    const account = { id, username: displayName, password, createdAt: Date.now() };
    const nextAccounts = [...accounts, account];
    if (!writeStoredJson(USER_DATABASE_STORAGE_KEY, { version: 1, accounts: nextAccounts })) {
      return { ok: false, error: 'This browser could not save the new account.' };
    }
    initializeAccountData(account);
    setAccounts(nextAccounts);
    return activateAccount(account)
      ? { ok: true }
      : { ok: false, error: 'This browser could not activate the new account.' };
  }, [accounts, activateAccount]);

  const changePassword = useCallback(({ currentPassword, newPassword }) => {
    if (currentAccount.password !== currentPassword) {
      return { ok: false, error: 'Current password is incorrect.' };
    }
    if (!newPassword) return { ok: false, error: 'Enter a new password.' };
    const updatedAccount = { ...currentAccount, password: newPassword };
    const nextAccounts = accounts.map((account) =>
      account.id === currentAccount.id ? updatedAccount : account,
    );
    if (!writeStoredJson(USER_DATABASE_STORAGE_KEY, { version: 1, accounts: nextAccounts })) {
      return { ok: false, error: 'This browser could not save the new password.' };
    }
    setAccounts(nextAccounts);
    setCurrentAccount(updatedAccount);
    return { ok: true };
  }, [accounts, currentAccount]);

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

  const saveUserProfile = useCallback((nextProfile) => {
    const normalized = normalizeUserProfile(nextProfile);
    if (!writeStoredJson(accountProfileKey, normalized)) return false;
    setUserProfile(normalized);
    return true;
  }, [accountProfileKey]);

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
    if (sourceType === 'text' && !resumeText.trim()) {
      throw new Error('Enter resume content before importing personal details.');
    }
    if (sourceType !== 'text' && !sourceFile) {
      throw new Error('Choose a resume file before importing personal details.');
    }
    if (sourceFile && sourceFile.size > MAX_JOB_SOURCE_BYTES) {
      throw new Error('The source file must be 5 MB or smaller.');
    }
    const sourceData = sourceFile ? await readFileAsDataUrl(sourceFile) : '';
    return runProfileRequest('/api/import-profile', {
      resumeText: resumeText.trim(),
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

  const generateResumeFromJobDescription = useCallback(async ({
    jobDescription,
    outputLanguage,
    sourceType = 'text',
    sourceFile,
  }) => {
    const languages = outputLanguage === 'both' ? ['chinese', 'english'] : [outputLanguage];
    const incompleteProfiles = languages
      .map((language) => ({ language, fields: missingProfileFields(userProfile, language) }))
      .filter(({ fields }) => fields.length);
    if (incompleteProfiles.length) {
      throw new Error('Complete the selected personal profile before generating a resume.');
    }
    if (sourceType === 'text' && !jobDescription.trim()) {
      throw new Error('Enter a job description before generating a resume.');
    }
    if (sourceType !== 'text' && !sourceFile) {
      throw new Error('Choose a source file before generating a resume.');
    }
    if (sourceFile && sourceFile.size > MAX_JOB_SOURCE_BYTES) {
      throw new Error('The source file must be 5 MB or smaller.');
    }

    const sourceData = sourceFile
      ? await readFileAsDataUrl(sourceFile)
      : '';
    const source = sourceData
      ? {
          name: sourceFile.name,
          mimeType: sourceFile.type,
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
          jobDescription,
          language,
          sourceType,
          source,
          profile: userProfile[language],
          baseResume: baseResume?.data || null,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(textValue(payload.error, 'Unable to generate a resume right now.'));
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
      const snapshot = blankResumeSnapshot({ documentName: generatedName, language });
      generatedResumes.push({
        id: generatedId,
        ...snapshot,
        data,
        updatedAt: Date.now(),
      });
    }

    const nextLibrary = {
      version: LIBRARY_VERSION,
      resumes: [...generatedResumes, ...libraryRef.current.resumes],
    };
    if (!persistLibrary(nextLibrary)) {
      throw new Error('The generated resume could not be saved locally.');
    }
    openResume(generatedResumes[0].id);
  }, [openResume, persistLibrary, userProfile]);

  const selectedResume = library.resumes.find((document) => document.id === selectedResumeId);
  const appContent = selectedResume ? (
    <ResumeEditor
      key={selectedResume.id}
      resumeId={selectedResume.id}
      initialResumeState={selectedResume}
      accountUsername={currentAccount.username}
      onResumeChange={saveResume}
      onBack={returnHome}
      workspaceStorageKey={accountWorkspaceKey}
    />
  ) : (
    <ResumeLibrary
        resumes={library.resumes}
        onOpen={openResume}
        onCreate={createResume}
        onDuplicate={duplicateResume}
        onDelete={deleteResume}
        accounts={accounts}
        currentAccount={currentAccount}
        onSwitchAccount={switchAccount}
        onLogin={loginAccount}
        onRegister={registerAccount}
        onChangePassword={changePassword}
        userProfile={userProfile}
        onProfileSave={saveUserProfile}
        onImportProfile={importProfileFromResume}
        onGenerate={generateResumeFromJobDescription}
    />
  );

  return (
    <>
      {appContent}
      {profileImporting && <ProfileImportLoadingOverlay />}
    </>
  );
}

function ResumeEditor({ resumeId, initialResumeState, accountUsername, onResumeChange, onBack, workspaceStorageKey }) {
  const initialWorkspaceState = useMemo(
    () => loadWorkspacePreferences(initialResumeState, resumeId, workspaceStorageKey),
    [initialResumeState, resumeId, workspaceStorageKey],
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
  const [previewPosition, setPreviewPosition] = useState(initialWorkspaceState.previewPosition);
  const [saveState, setSaveState] = useState('Saved');
  const [toast, setToast] = useState('');
  const editorTransitionTimerRef = useRef(null);

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
    language,
    onResumeChange,
    resumeId,
    sectionOrder,
    sectionOrderCustomized,
    template,
  ]);

  useEffect(() => {
    try {
      const stored = storedJson(workspaceStorageKey);
      const root = isRecord(stored) ? stored : {};
      const byResume = isRecord(root.byResume) ? root.byResume : {};
      window.localStorage.setItem(
        workspaceStorageKey,
        JSON.stringify({
          version: STORAGE_VERSION,
          editorWidth,
          byResume: {
            ...byResume,
            [resumeId]: {
              zoom,
              activeSection,
              openExperience,
              mobileMode,
              editorCollapsed,
              previewPosition,
            },
          },
        }),
      );
    } catch {
      // Resume content saving remains independent if preferences exceed browser storage.
    }
  }, [
    activeSection,
    editorCollapsed,
    editorWidth,
    mobileMode,
    openExperience,
    previewPosition,
    resumeId,
    workspaceStorageKey,
    zoom,
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
    if (sourceId === targetId || sourceId === 'basics' || targetId === 'basics') return;
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
        onExport={() => window.print()}
        onAi={() => setAiPanel(true)}
        onReset={resetDemo}
        onBack={onBack}
        accountUsername={accountUsername}
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
  accounts,
  currentAccount,
  onSwitchAccount,
  onLogin,
  onRegister,
  onChangePassword,
  userProfile,
  onProfileSave,
  onImportProfile,
  onGenerate,
}) {
  const [query, setQuery] = useState('');
  const [openMenu, setOpenMenu] = useState(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [accountSwitcherOpen, setAccountSwitcherOpen] = useState(false);
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [registerDialogOpen, setRegisterDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
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
                <button
                  onClick={() => {
                    setAccountSwitcherOpen(true);
                    setAccountMenuOpen(false);
                  }}
                >
                  <UsersRound size={16} />
                  Switch account
                </button>
                <button
                  onClick={() => {
                    setPasswordDialogOpen(true);
                    setAccountMenuOpen(false);
                  }}
                >
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
        />
      )}
      {generatorDialogOpen && (
        <JobDescriptionDialog
          profile={userProfile}
          onCancel={() => setGeneratorDialogOpen(false)}
          onGenerate={onGenerate}
        />
      )}
      {accountSwitcherOpen && (
        <AccountSwitcherDialog
          accounts={accounts}
          currentAccount={currentAccount}
          onCancel={() => setAccountSwitcherOpen(false)}
          onSwitch={(accountId) => {
            if (onSwitchAccount(accountId)) setAccountSwitcherOpen(false);
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
          onLogin={(credentials) => {
            const result = onLogin(credentials);
            if (result.ok) setLoginDialogOpen(false);
            return result;
          }}
          onSignUp={() => {
            setLoginDialogOpen(false);
            setRegisterDialogOpen(true);
          }}
        />
      )}
      {registerDialogOpen && (
        <RegisterDialog
          accounts={accounts}
          onCancel={() => setRegisterDialogOpen(false)}
          onRegister={(credentials) => {
            const result = onRegister(credentials);
            if (result.ok) setRegisterDialogOpen(false);
            return result;
          }}
          onSignIn={() => {
            setRegisterDialogOpen(false);
            setLoginDialogOpen(true);
          }}
        />
      )}
      {passwordDialogOpen && (
        <ChangePasswordDialog
          onCancel={() => setPasswordDialogOpen(false)}
          onChangePassword={(credentials) => {
            const result = onChangePassword(credentials);
            if (result.ok) setPasswordDialogOpen(false);
            return result;
          }}
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

function AccountSwitcherDialog({ accounts, currentAccount, onCancel, onSwitch, onSignIn, onSignUp }) {
  const orderedAccounts = [
    currentAccount,
    ...accounts.filter((account) => account.id !== currentAccount.id),
  ];

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <section
        className="resume-dialog account-switcher-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-switcher-title"
      >
        <header className="resume-dialog-header account-dialog-header">
          <div>
            <span className="dialog-kicker">Accounts</span>
            <h2 id="account-switcher-title">Switch account</h2>
          </div>
          <button className="icon-button small" type="button" onClick={onCancel} aria-label="Close" title="Close">
            <X size={16} />
          </button>
        </header>
        <div className="account-switcher-content">
          <div className="account-list">
            {orderedAccounts.map((account) => (
              <button
                key={account.id}
                type="button"
                className={cx('account-list-item', account.id === currentAccount.id && 'is-current')}
                onClick={() => onSwitch(account.id)}
                aria-current={account.id === currentAccount.id ? 'page' : undefined}
              >
                <span className="account-list-avatar">{accountInitials(account.username)}</span>
                <span className="account-list-copy">
                  <strong>{account.username}</strong>
                  {account.id === currentAccount.id && <small>Current account</small>}
                </span>
                {account.id === currentAccount.id && <Check size={16} />}
              </button>
            ))}
          </div>
        </div>
        <footer className="account-dialog-footer">
          <button className="dialog-link-button" type="button" onClick={onSignIn}>
            <LogIn size={15} /> Sign in
          </button>
          <button className="dialog-link-button" type="button" onClick={onSignUp}>
            <UserPlus size={15} /> Sign up
          </button>
        </footer>
      </section>
    </div>
  );
}

function LoginDialog({ onCancel, onLogin, onSignUp }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = (event) => {
    event.preventDefault();
    if (!username.trim() || !password) return;
    const result = onLogin({ username, password });
    if (!result.ok) setError(result.error);
  };

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <form
        className="resume-dialog account-auth-dialog"
        onSubmit={submit}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
      >
        <header className="resume-dialog-header account-dialog-header">
          <div>
            <span className="dialog-kicker">Local account</span>
            <h2 id="login-title">Sign in</h2>
          </div>
          <button className="icon-button small" type="button" onClick={onCancel} aria-label="Close" title="Close">
            <X size={16} />
          </button>
        </header>
        <div className="account-auth-content">
          <Field label="Username" value={username} onChange={(value) => { setUsername(value); setError(''); }} />
          <Field label="Password" type="password" value={password} onChange={(value) => { setPassword(value); setError(''); }} />
          {error && <p className="account-auth-error" role="alert">{error}</p>}
        </div>
        <footer className="account-auth-footer">
          <button className="dialog-link-button" type="button" onClick={onSignUp}>Sign up</button>
          <button className="primary-button" type="submit" disabled={!username.trim() || !password}>
            <LogIn size={16} /> Sign in
          </button>
        </footer>
      </form>
    </div>
  );
}

function RegisterDialog({ accounts, onCancel, onRegister, onSignIn }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const usernameDuplicate = Boolean(username.trim()) && accounts.some(
    (account) => account.id === accountIdFor(username),
  );

  const submit = (event) => {
    event.preventDefault();
    if (!username.trim() || !password || usernameDuplicate) return;
    const result = onRegister({ username, password });
    if (!result.ok) setError(result.error);
  };

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <form
        className="resume-dialog account-auth-dialog"
        onSubmit={submit}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="register-title"
      >
        <header className="resume-dialog-header account-dialog-header">
          <div>
            <span className="dialog-kicker">Local account</span>
            <h2 id="register-title">Sign up</h2>
          </div>
          <button className="icon-button small" type="button" onClick={onCancel} aria-label="Close" title="Close">
            <X size={16} />
          </button>
        </header>
        <div className="account-auth-content">
          <Field label="Username" value={username} onChange={(value) => { setUsername(value); setError(''); }} />
          <Field label="Password" type="password" value={password} onChange={(value) => { setPassword(value); setError(''); }} />
          {(usernameDuplicate || error) && (
            <p className="account-auth-error" role="alert">
              {usernameDuplicate ? 'This username is already in use.' : error}
            </p>
          )}
        </div>
        <footer className="account-auth-footer">
          <button className="dialog-link-button" type="button" onClick={onSignIn}>Sign in</button>
          <button className="primary-button" type="submit" disabled={!username.trim() || !password || usernameDuplicate}>
            <UserPlus size={16} /> Sign up
          </button>
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

  const submit = (event) => {
    event.preventDefault();
    if (!currentPassword || !newPassword || !confirmation) return;
    if (newPassword !== confirmation) {
      setError('New passwords do not match.');
      return;
    }
    const result = onChangePassword({ currentPassword, newPassword });
    if (!result.ok) setError(result.error);
  };

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <form
        className="resume-dialog account-auth-dialog"
        onSubmit={submit}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
      >
        <header className="resume-dialog-header account-dialog-header">
          <div>
            <span className="dialog-kicker">Local account</span>
            <h2 id="change-password-title">Change password</h2>
          </div>
          <button className="icon-button small" type="button" onClick={onCancel} aria-label="Close" title="Close">
            <X size={16} />
          </button>
        </header>
        <div className="account-auth-content">
          <Field label="Current password" type="password" value={currentPassword} onChange={(value) => { setCurrentPassword(value); setError(''); }} />
          <Field label="New password" type="password" value={newPassword} onChange={(value) => { setNewPassword(value); setError(''); }} />
          <Field label="Confirm new password" type="password" value={confirmation} onChange={(value) => { setConfirmation(value); setError(''); }} />
          {error && <p className="account-auth-error" role="alert">{error}</p>}
        </div>
        <footer className="account-auth-footer">
          <button className="primary-button" type="submit" disabled={!currentPassword || !newPassword || !confirmation}>
            <KeyRound size={16} /> Change password
          </button>
        </footer>
      </form>
    </div>
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

function PersonalProfileDialog({ profile, onCancel, onSave, onComplete, onImport }) {
  const [language, setLanguage] = useState('chinese');
  const [draft, setDraft] = useState(() => normalizeUserProfile(profile));
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importedProfile, setImportedProfile] = useState(null);
  const fields = draft[language];
  const chinese = language === 'chinese';
  const updateField = (field, value) => {
    setDraft((current) => ({
      ...current,
      [language]: { ...current[language], [field]: value },
    }));
  };

  const submit = (event) => {
    event.preventDefault();
    if (onSave(draft)) onComplete();
  };

  const applyImportedProfile = async (source) => {
    const imported = await onImport(source);
    const importedLanguage = imported.language;
    const importedProfiles = normalizeUserProfile(imported.profiles);
    const normalizedFields = importedProfiles[importedLanguage];
    const nextDraft = {
      ...draft,
      [importedLanguage]: normalizedFields,
    };
    if (!onSave(nextDraft)) throw new Error('The imported personal details could not be saved locally.');
    setDraft(nextDraft);
    setLanguage(importedLanguage);
    setImportedProfile({ language: importedLanguage, profiles: importedProfiles });
    setImportDialogOpen(false);
  };

  const syncImportedProfile = () => {
    if (!importedProfile) return;
    const targetLanguage = importedProfile.language === 'chinese' ? 'english' : 'chinese';
    const translatedFields = importedProfile.profiles[targetLanguage];
    const nextDraft = {
      ...draft,
      [targetLanguage]: translatedFields,
    };
    if (!onSave(nextDraft)) throw new Error('The imported personal details could not be saved locally.');
    setDraft(nextDraft);
    setLanguage(targetLanguage);
    setImportedProfile(null);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onCancel();
    }}>
      <form className="resume-dialog personal-profile-dialog" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="personal-profile-title">
        <header className="resume-dialog-header">
          <div>
            <span className="dialog-kicker">Account</span>
            <h2 id="personal-profile-title">Edit personal profile</h2>
          </div>
          <button className="secondary-button profile-import-button" type="button" onClick={() => setImportDialogOpen(true)}>
            <FileUp size={15} />
            <span>Import from resume</span>
          </button>
        </header>
        <div className="resume-dialog-content profile-dialog-content">
          <div className="resume-language-selector" role="group" aria-label="Profile language">
            <button
              type="button"
              className={cx(chinese && 'is-selected')}
              onClick={() => setLanguage('chinese')}
              aria-pressed={chinese}
            >
              中文
            </button>
            <button
              type="button"
              className={cx(!chinese && 'is-selected')}
              onClick={() => setLanguage('english')}
              aria-pressed={!chinese}
            >
              English
            </button>
          </div>
          <div className="form-grid two-columns">
            <Field
              label={chinese ? '姓名' : 'Full name'}
              value={fields.fullName}
              onChange={(value) => updateField('fullName', value)}
            />
            <GenderField
              value={fields.gender}
              onChange={(value) => updateField('gender', value)}
              language={language}
            />
            <Field label={chinese ? '手机号码' : 'Phone'} value={fields.phone} onChange={(value) => updateField('phone', value)} />
            <Field label="Email" type="email" value={fields.email} onChange={(value) => updateField('email', value)} />
            <Field label={chinese ? '所在地' : 'Location'} value={fields.location} onChange={(value) => updateField('location', value)} />
            <Field
              label={chinese ? '个人网站' : 'Website'}
              value={fields.website}
              placeholder="https://..."
              onChange={(value) => updateField('website', value)}
            />
            <Field
              label={chinese ? '微信号' : 'LinkedIn'}
              value={chinese ? fields.wechat : fields.linkedin}
              onChange={(value) => updateField(chinese ? 'wechat' : 'linkedin', value)}
            />
          </div>
          <label className="field">
            <span>{chinese ? '个人简介' : 'Professional profile'}</span>
            <textarea
              value={fields.summary}
              rows={5}
              onChange={(event) => updateField('summary', event.target.value)}
            />
          </label>
        </div>
        <footer className="resume-dialog-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>Cancel</button>
          <button className="primary-button" type="submit"><Check size={16} /> Save profile</button>
        </footer>
      </form>
      {importDialogOpen && (
        <ProfileImportDialog
          onCancel={() => setImportDialogOpen(false)}
          onImport={applyImportedProfile}
        />
      )}
      {importedProfile && (
        <ProfileSyncDialog
          sourceLanguage={importedProfile.language}
          onCancel={() => setImportedProfile(null)}
          onSkip={() => setImportedProfile(null)}
          onSync={syncImportedProfile}
        />
      )}
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
      setError('The source file must be 5 MB or smaller.');
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
                placeholder="Paste the resume content"
                onChange={(event) => setResumeText(event.target.value)}
                disabled={isImporting}
                aria-label="Resume content"
              />
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

function ProfileImportLoadingOverlay() {
  return (
    <div className="profile-import-loading" role="status" aria-live="assertive">
      <div className="profile-import-loading-content">
        <LoaderCircle size={24} />
        <strong>Importing personal details</strong>
      </div>
    </div>
  );
}

function JobDescriptionDialog({ profile, onCancel, onGenerate }) {
  const [inputMode, setInputMode] = useState('text');
  const [outputLanguage, setOutputLanguage] = useState(profile.chinese.fullName ? 'chinese' : 'english');
  const [jobDescription, setJobDescription] = useState('');
  const [sourceFile, setSourceFile] = useState(null);
  const [error, setError] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const outputLanguages = outputLanguage === 'both' ? ['chinese', 'english'] : [outputLanguage];
  const incompleteProfiles = outputLanguages
    .map((language) => ({ language, fields: missingProfileFields(profile, language) }))
    .filter(({ fields }) => fields.length);
  const profileError = incompleteProfiles.length
    ? incompleteProfiles
      .map(({ language, fields }) => `${language === 'chinese' ? '中文' : 'English'}: ${fields.map((field) => profileFieldLabels[language][field]).join('、')}`)
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
      setError('The source file must be 5 MB or smaller.');
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
      setError('Complete the selected profile before generating a resume.');
      return;
    }
    setError('');
    setIsGenerating(true);
    try {
      await onGenerate({
        jobDescription: jobDescription.trim(),
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
                placeholder="Paste the role, responsibilities, and requirements"
                onChange={(event) => setJobDescription(event.target.value)}
                disabled={isGenerating}
                aria-label="Job description"
              />
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
  onAi,
  onReset,
  onBack,
  accountUsername,
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
        <button className="secondary-button ai-button" onClick={onAi}>
          <Sparkles size={16} />
          <span>Improve with AI</span>
        </button>
        <button className="primary-button export-button" onClick={onExport}>
          <Download size={16} />
          <span>Export PDF</span>
        </button>
        <button className="avatar-button" aria-label="Account menu" title="Account menu">{accountInitials(accountUsername)}</button>
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
        <button className="score-action">
          <WandSparkles size={15} />
          View recommendations
          <ChevronRight size={15} />
        </button>
      </div>

      <div className="sidebar-section-heading">
        <span>Resume sections</span>
        <button className="icon-button small" aria-label="Reorder sections" title="Reorder sections">
          <MoreHorizontal size={17} />
        </button>
      </div>

      <nav className="section-nav" aria-label="Resume sections">
        {sections.map(({ id, label, icon: Icon }) => {
          const isFixed = id === 'basics';
          return (
            <button
              key={id}
              draggable={!isFixed}
              aria-grabbed={isFixed ? undefined : draggedSectionId === id}
              className={cx(
                'section-nav-item',
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
        summary: ['个人介绍', '自我简介'],
        experience: ['工作经历', `${data.experience.length} 段经历`],
        education: ['教育经历', `${data.education.length} 条记录`],
        skills: ['专业经历', '核心能力'],
      }
    : {
        basics: ['Personal details', 'The essentials'],
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
          <SkillsEditor skills={data.skills} updateData={updateData} />
        )}
        {!baseSections.some((section) => section.id === activeSection) && (
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
                  <button className="mini-ai-button"><Sparkles size={13} /> Enhance</button>
                </div>
                <div className="bullet-editor-list">
                  {item.bullets.map((bullet, index) => (
                    <div className="bullet-editor" key={`${item.id}-${index}`}>
                      <GripVertical size={15} />
                      <textarea
                        value={bullet}
                        rows={2}
                        onChange={(event) => updateBullet(item.id, index, event.target.value)}
                      />
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

function SkillsEditor({ skills, updateData }) {
  const update = (field, value) => {
    updateData((current) => ({
      ...current,
      skills: { ...current.skills, [field]: value },
    }));
  };
  const expertise = skills.expertise.split(',').map((item) => item.trim()).filter(Boolean);
  return (
    <div className="form-content">
      <Field label="Areas of expertise" value={skills.expertise} onChange={(value) => update('expertise', value)} />
      <div className="tag-preview">
        {expertise.map((item) => <span key={item}>{item}<X size={12} /></span>)}
      </div>
      <Field label="Tools and platforms" value={skills.tools} onChange={(value) => update('tools', value)} />
      <div className="skill-level-row">
        <div><strong>Show skill level</strong><span>Hide for ATS-friendly resumes</span></div>
        <button className="toggle-button" role="switch" aria-checked="false"><span /></button>
      </div>
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
}) {
  const [colorMenu, setColorMenu] = useState(false);
  const [profilePageHeight, setProfilePageHeight] = useState(932);
  const zoomPercent = Math.round(zoom * 100);
  const pageHeight = template === 'profile' ? profilePageHeight : 932;
  const pageCount = Math.max(1, Math.ceil(pageHeight / 932));
  const updateProfilePageHeight = useCallback((height) => {
    setProfilePageHeight((current) => (Math.abs(current - height) < 1 ? current : height));
  }, []);

  useEffect(() => {
    if (template !== 'profile') setProfilePageHeight(932);
  }, [template]);

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
        pageHeight={pageHeight}
        initialPosition={previewPosition}
        onPositionChange={onPreviewPositionChange}
      >
        <ResumePage
          data={data}
          template={template}
          accent={accent}
          customSections={customSections}
          customContent={customContent}
          sectionOrder={sectionOrder}
          sectionOrderCustomized={sectionOrderCustomized}
          onContentHeightChange={updateProfilePageHeight}
          language={language}
        />
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
  const pageWidth = 720;

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
      const nextScale = Math.min(availableWidth / pageWidth, availableHeight / pageHeight, 1);
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
  ].filter((item) => item.value);
  const displayOrder = useMemo(
    () => isProfileTemplate && !sectionOrderCustomized
      ? defaultSectionOrder('profile', customSections)
      : sectionOrder,
    [customSections, isProfileTemplate, sectionOrder, sectionOrderCustomized],
  );
  const pageRef = useRef(null);

  useLayoutEffect(() => {
    if (!isProfileTemplate) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const contentHeight = Math.max(932, Math.ceil(pageRef.current?.scrollHeight || 932));
      onContentHeightChange(contentHeight);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    customContent,
    customSections,
    data,
    displayOrder,
    isProfileTemplate,
    onContentHeightChange,
  ]);

  return (
    <article
      ref={pageRef}
      className={cx('resume-page', `template-${template}`, hasProfilePhoto && 'has-profile-photo')}
      style={{ '--resume-accent': accent } as CssVariables}
      lang={isChineseResume(language) ? 'zh-CN' : 'en'}
    >
      <header className="resume-header">
        {isProfileTemplate && hasProfilePhoto && (
          <div className="profile-avatar-slot">
            <ProfileAvatar photoUrl={basics.photoUrl} initials={initials} className="resume-profile-avatar" />
          </div>
        )}
        <div className="resume-name-block">
          <h2>{name}</h2>
          <p>{basics.role}</p>
        </div>
        <div className="resume-contact">
          {contactItems.map(({ id, icon: Icon, value }, index) => (
            <span className="resume-contact-item" key={id} data-contact={id}>
              <Icon size={11} />
              {id === 'website' ? <WebsiteLink website={value} /> : value}
              {isProfileTemplate && index < contactItems.length - 1 && (
                <i className="contact-separator" aria-hidden="true" />
              )}
            </span>
          ))}
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
        <p>{data.summary}</p>
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
  return items.map((item) => (
    <div className={cx('resume-entry', profile && 'profile-work-entry')} key={item.id}>
      <div className="resume-entry-heading">
        <div>
          <strong>{profile ? `${item.company} - ${item.role}` : item.role}</strong>
          <span>{profile ? item.location : `${item.company} · ${item.location}`}</span>
        </div>
        <time>{item.start} - {item.end}</time>
      </div>
      <ul>
        {item.bullets.map((bullet, index) => <li key={index}>{bullet}</li>)}
      </ul>
    </div>
  ));
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
  const categories = [
    { title: chinese ? '专业领域' : 'Expertise', items: skills.expertise },
    { title: chinese ? '工具平台' : 'Tools & Platforms', items: skills.tools },
  ].map((category) => ({
    ...category,
    items: category.items.split(',').map((item) => item.trim()).filter(Boolean),
  })).filter((category) => category.items.length);

  return (
    <div className="profile-skills-grid">
      {categories.map((category) => (
        <div className="profile-skill-category" key={category.title}>
          <strong>{category.title}</strong>
          <ul>{category.items.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      ))}
    </div>
  );
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
