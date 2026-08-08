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
  FileText,
  FolderOpen,
  GraduationCap,
  GripVertical,
  LayoutGrid,
  Link,
  ListChecks,
  Mail,
  MapPin,
  Minus,
  MoreHorizontal,
  Palette,
  PanelLeft,
  PencilLine,
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
  UserRound,
  WandSparkles,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

const initialResume = {
  basics: {
    firstName: 'Jordan',
    lastName: 'Lee',
    role: 'Senior Product Designer',
    email: 'jordan.lee@email.com',
    phone: '(415) 555-0148',
    location: 'San Francisco, CA',
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
const STORAGE_VERSION = 1;
const LIBRARY_VERSION = 2;
const DEFAULT_DOCUMENT_NAME = 'Jordan Lee - Product Designer';
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

function normalizeAccent(value: unknown, fallback = accentOptions[0]) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toLowerCase()
    : fallback;
}

function normalizeResumeData(value) {
  const source = isRecord(value) ? value : {};
  const basics = isRecord(source.basics) ? source.basics : {};
  const skills = isRecord(source.skills) ? source.skills : {};

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
      firstName: textValue(basics.firstName, initialResume.basics.firstName),
      lastName: textValue(basics.lastName, initialResume.basics.lastName),
      role: textValue(basics.role, initialResume.basics.role),
      email: textValue(basics.email, initialResume.basics.email),
      phone: textValue(basics.phone, initialResume.basics.phone),
      location: textValue(basics.location, initialResume.basics.location),
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
  return [...new Set([...storedOrder, ...defaultOrder])];
}

function normalizeCustomContent(sectionIds, value) {
  const source = isRecord(value) ? value : {};
  return sectionIds.reduce((result, id) => {
    const defaults = emptyCustomSection[id];
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
  return {
    documentName: textValue(source.documentName, DEFAULT_DOCUMENT_NAME),
    language: source.language === 'chinese' ? 'chinese' : 'english',
    data: normalizeResumeData(source.data),
    template,
    accent: normalizeAccent(source.accent),
    customSections,
    customContent: normalizeCustomContent(customSections, source.customContent),
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
  const snapshot = {
    documentName: textValue(source.documentName, `Resume ${index + 1}`),
    language: source.language === 'chinese' ? 'chinese' : 'english',
    data: normalizeResumeData(source.data),
    template,
    accent: normalizeAccent(source.accent),
    customSections,
    customContent: {},
    sectionOrder: normalizeSectionOrder(source.sectionOrder, customSections, template),
    sectionOrderCustomized: source.sectionOrderCustomized === true,
  };
  snapshot.customContent = normalizeCustomContent(snapshot.customSections, source.customContent);
  return {
    id: textValue(source.id, `resume-${index + 1}`),
    ...snapshot,
    updatedAt: Number.isFinite(Number(source.updatedAt)) ? Number(source.updatedAt) : Date.now(),
  };
}

function loadResumeLibrary() {
  const stored = storedJson(LIBRARY_STORAGE_KEY);
  if (isRecord(stored) && Array.isArray(stored.resumes) && stored.resumes.length) {
    return {
      version: LIBRARY_VERSION,
      resumes: stored.resumes.map(normalizeResumeDocument),
    };
  }

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

function blankResumeSnapshot(
  { documentName, language }: { documentName?: string; language?: string } = {},
) {
  return {
    documentName: textValue(documentName, 'Untitled resume'),
    language: language === 'chinese' ? 'chinese' : 'english',
    data: normalizeResumeData({
      basics: {
        firstName: 'Jordan',
        lastName: 'Lee',
        role: 'Target role',
        email: initialResume.basics.email,
        phone: initialResume.basics.phone,
        location: initialResume.basics.location,
        website: initialResume.basics.website,
        photoUrl: initialResume.basics.photoUrl,
      },
      summary: '',
      experience: [],
      education: initialResume.education,
      skills: { expertise: '', tools: '' },
    }),
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

function loadWorkspacePreferences(resumeSnapshot, resumeId) {
  const stored = storedJson(WORKSPACE_STORAGE_KEY);
  const root = isRecord(stored) ? stored : {};
  const savedByResume = isRecord(root.byResume) ? root.byResume : {};
  const source = isRecord(savedByResume[resumeId]) ? savedByResume[resumeId] : root;
  const legacyWidth =
    typeof window === 'undefined' ? null : window.localStorage.getItem(EDITOR_WIDTH_STORAGE_KEY);
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
  const initialLibrary = useMemo(loadResumeLibrary, []);
  const libraryRef = useRef(initialLibrary);
  const [library, setLibrary] = useState(initialLibrary);
  const [selectedResumeId, setSelectedResumeId] = useState(() => {
    if (typeof window === 'undefined') return null;
    const resume = new URLSearchParams(window.location.search).get('resume');
    return initialLibrary.resumes.some((document) => document.id === resume) ? resume : null;
  });

  const persistLibrary = useCallback((nextLibrary) => {
    try {
      window.localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(nextLibrary));
    } catch {
      return false;
    }
    libraryRef.current = nextLibrary;
    setLibrary(nextLibrary);
    return true;
  }, []);

  useEffect(() => {
    persistLibrary(initialLibrary);
  }, [initialLibrary, persistLibrary]);

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
      data: normalizeResumeData(source.data),
      customSections: [...source.customSections],
      customContent: normalizeCustomContent(source.customSections, source.customContent),
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

  const selectedResume = library.resumes.find((document) => document.id === selectedResumeId);
  if (!selectedResume) {
    return (
      <ResumeLibrary
        resumes={library.resumes}
        onOpen={openResume}
        onCreate={createResume}
        onDuplicate={duplicateResume}
        onDelete={deleteResume}
      />
    );
  }

  return (
    <ResumeEditor
      key={selectedResume.id}
      resumeId={selectedResume.id}
      initialResumeState={selectedResume}
      onResumeChange={saveResume}
      onBack={returnHome}
    />
  );
}

function ResumeEditor({ resumeId, initialResumeState, onResumeChange, onBack }) {
  const initialWorkspaceState = useMemo(
    () => loadWorkspacePreferences(initialResumeState, resumeId),
    [initialResumeState, resumeId],
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

  const data = history.present;

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
      const stored = storedJson(WORKSPACE_STORAGE_KEY);
      const root = isRecord(stored) ? stored : {};
      const byResume = isRecord(root.byResume) ? root.byResume : {};
      window.localStorage.setItem(
        WORKSPACE_STORAGE_KEY,
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
              previewPosition,
            },
          },
        }),
      );
    } catch {
      // Resume content saving remains independent if preferences exceed browser storage.
    }
  }, [activeSection, editorWidth, mobileMode, openExperience, previewPosition, resumeId, zoom]);

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
    ...baseSections,
    ...customSections.map((sectionId) => ({
      id: sectionId,
      label: emptyCustomSection[sectionId].title,
      icon: sectionSuggestions.find((item) => item.id === sectionId)?.icon || Award,
    })),
  ];
  const sections = sectionOrder
    .map((id) => sectionDefinitions.find((section) => section.id === id))
    .filter(Boolean);

  const addCustomSection = (id) => {
    if (!customSections.includes(id)) {
      setCustomSections((current) => [...current, id]);
      setSectionOrder((current) => [...current.filter((sectionId) => sectionId !== id), id]);
      setCustomContent((current) => ({
        ...current,
        [id]: { ...emptyCustomSection[id] },
      }));
    }
    setActiveSection(id);
    setSectionMenu(false);
    setMobileMode('edit');
    setToast(`${emptyCustomSection[id].title} added`);
  };

  const reorderSections = (sourceId, targetId) => {
    if (sourceId === targetId) return;
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
      />

      <MobileTabs value={mobileMode} onChange={setMobileMode} />

      <main
        className="workspace"
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

function ResumeLibrary({ resumes, onOpen, onCreate, onDuplicate, onDelete }) {
  const [query, setQuery] = useState('');
  const [openMenu, setOpenMenu] = useState(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
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
      }}
    >
      <header className="library-topbar">
        <a className="brand library-brand" href="#" onClick={(event) => event.preventDefault()} aria-label="Draftline home">
          <span className="brand-mark"><FileText size={18} /></span>
          <span>Draftline</span>
        </a>
        <div className="library-topbar-actions">
          <button className="primary-button library-create-top" onClick={() => setCreateDialogOpen(true)} aria-label="New resume" title="New resume">
            <Plus size={16} />
            <span>New resume</span>
          </button>
          <button className="avatar-button" aria-label="Account menu" title="Account menu">JL</button>
        </div>
      </header>

      <main className="library-main">
        <div className="library-heading-row">
          <div className="library-title-block">
            <span className="library-kicker">Resume workspace</span>
            <h1>My resumes</h1>
            <p>{resumes.length} {resumes.length === 1 ? 'resume' : 'resumes'}</p>
          </div>
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
    </div>
  );
}

function ResumeLibraryCard({ resume, menuOpen, onToggleMenu, onOpen, onDuplicate, onDelete }) {
  return (
    <article className="resume-library-card">
      <button
        className="resume-card-preview-button"
        onClick={onOpen}
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
          <button className="resume-card-edit" onClick={onOpen}>
            <PencilLine size={14} /> Edit
          </button>
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
  const name = `${resume.data.basics.firstName} ${resume.data.basics.lastName}`.trim();
  const initials = `${resume.data.basics.firstName?.[0] || 'Y'}${resume.data.basics.lastName?.[0] || ''}`;
  return (
    <span
      className={cx('resume-card-canvas', `card-template-${resume.template}`)}
      style={{ '--card-accent': resume.accent } as CssVariables}
    >
      <span className="resume-card-paper">
        {resume.template === 'profile' && (
          <ProfileAvatar photoUrl={resume.data.basics.photoUrl} initials={initials} className="card-profile-avatar" />
        )}
        <span className="card-paper-header">
          <strong>{name || 'Your name'}</strong>
          <small>{resume.data.basics.role || 'Target role'}</small>
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
        <button className="avatar-button" aria-label="Account menu" title="Account menu">JL</button>
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
        {sections.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            draggable
            aria-grabbed={draggedSectionId === id}
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
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', id);
              ignoreClickRef.current = true;
              setDraggedSectionId(id);
              setDropTargetId(id);
            }}
            onDragOver={(event) => {
              if (!draggedSectionId || draggedSectionId === id) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              setDropTargetId(id);
            }}
            onDrop={(event) => {
              event.preventDefault();
              const sourceId = event.dataTransfer.getData('text/plain') || draggedSectionId;
              if (sourceId) onReorder(sourceId, id);
              finishDrag();
            }}
            onDragEnd={finishDrag}
          >
            <GripVertical className="drag-icon" size={15} />
            <span className="section-icon"><Icon size={16} /></span>
            <span className="section-label">{label}</span>
            {baseSections.some((section) => section.id === id) ? (
              <CheckCircle2 className="complete-icon" size={16} />
            ) : (
              <Circle className="complete-icon" size={16} />
            )}
          </button>
        ))}
      </nav>

      <div className="add-section-wrap">
        <button className="add-section-button" onClick={() => setSectionMenu(!sectionMenu)}>
          <Plus size={16} />
          Add section
        </button>
        {sectionMenu && (
          <div className="section-popover">
            <div className="popover-heading">
              <span>Add to resume</span>
              <button className="icon-button small" onClick={() => setSectionMenu(false)} aria-label="Close">
                <X size={15} />
              </button>
            </div>
            {sectionSuggestions.map(({ id, label, icon: Icon }) => (
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
}) {
  const labels = {
    basics: ['Personal details', 'The essentials'],
    summary: ['Professional summary', 'Your introduction'],
    experience: ['Experience', `${data.experience.length} positions`],
    education: ['Education', `${data.education.length} entry`],
    skills: ['Skills', 'Core strengths'],
  };
  const heading = labels[activeSection] || [customContent[activeSection]?.title || 'Section', 'Custom section'];

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
          <button className="icon-button mobile-preview-button" onClick={onPreview} aria-label="Preview resume">
            <Eye size={18} />
          </button>
        </div>
      </div>

      <div className="editor-scroll">
        {activeSection === 'basics' && (
          <BasicsEditor basics={data.basics} onChange={updateBasics} />
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
            content={customContent[activeSection] || emptyCustomSection[activeSection]}
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

function BasicsEditor({ basics, onChange }) {
  const initials = `${basics.firstName?.[0] || 'Y'}${basics.lastName?.[0] || ''}`;
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
      <div className="form-grid two-columns">
        <Field label="First name" value={basics.firstName} onChange={(value) => onChange('firstName', value)} />
        <Field label="Last name" value={basics.lastName} onChange={(value) => onChange('lastName', value)} />
      </div>
      <div className="profile-photo-field">
        <span>Profile photo</span>
        <div className="profile-photo-controls">
          <ProfileAvatar photoUrl={basics.photoUrl} initials={initials} className="details-avatar" />
          <label className="avatar-upload" title="Upload profile photo">
            <Upload size={16} />
            <input type="file" accept="image/*" onChange={uploadPhoto} aria-label="Upload profile photo" />
          </label>
          {basics.photoUrl && (
            <button
              type="button"
              className="icon-button small"
              onClick={() => onChange('photoUrl', '')}
              aria-label="Remove profile photo"
              title="Remove profile photo"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>
      <Field label="Professional title" value={basics.role} onChange={(value) => onChange('role', value)} />
      <div className="form-grid two-columns">
        <Field label="Email" type="email" value={basics.email} onChange={(value) => onChange('email', value)} />
        <Field label="Phone" value={basics.phone} onChange={(value) => onChange('phone', value)} />
      </div>
      <Field label="Location" value={basics.location} onChange={(value) => onChange('location', value)} />
      <Field
        label="Personal website"
        value={basics.website}
        placeholder="[Website name]https://..."
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

function CustomSectionEditor({ content, onChange }) {
  return (
    <div className="form-content">
      <Field label="Section title" value={content.title} onChange={(value) => onChange('title', value)} />
      <Field label="Entry title" value={content.itemTitle} onChange={(value) => onChange('itemTitle', value)} />
      <Field label="Organization or context" value={content.subtitle} onChange={(value) => onChange('subtitle', value)} />
      <label className="field">
        <span>Description</span>
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
}) {
  const { basics } = data;
  const initials = `${basics.firstName?.[0] || 'Y'}${basics.lastName?.[0] || ''}`;
  const isProfileTemplate = template === 'profile';
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
      className={cx('resume-page', `template-${template}`)}
      style={{ '--resume-accent': accent } as CssVariables}
    >
      <header className="resume-header">
        {isProfileTemplate && (
          <ProfileAvatar photoUrl={basics.photoUrl} initials={initials} className="resume-profile-avatar" />
        )}
        <div className="resume-name-block">
          <h2>{basics.firstName} {basics.lastName}</h2>
          <p>{basics.role}</p>
        </div>
        <div className="resume-contact">
          {basics.email && <span><Mail size={11} />{basics.email}</span>}
          {basics.phone && <span><Phone size={11} />{basics.phone}</span>}
          {basics.location && <span><MapPin size={11} />{basics.location}</span>}
          {basics.website && <span><Link size={11} />{basics.website}</span>}
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
          />
        ))}
      </div>
    </article>
  );
}

function ResumeContentSection({ sectionId, data, profile, customContent }) {
  if (sectionId === 'basics') return null;
  if (sectionId === 'summary') {
    return (
      <ResumeSection title={profile ? 'Personal Introduction' : 'Profile'} className="profile-section">
        <p>{data.summary}</p>
      </ResumeSection>
    );
  }
  if (sectionId === 'education') {
    return (
      <ResumeSection title="Education" className="education-section">
        <EducationEntries items={data.education} profile={profile} />
      </ResumeSection>
    );
  }
  if (sectionId === 'experience') {
    return (
      <ResumeSection title={profile ? 'Work Experience' : 'Experience'} className="experience-section">
        <ExperienceEntries items={data.experience} profile={profile} />
      </ResumeSection>
    );
  }
  if (sectionId === 'skills') {
    return profile ? (
      <ResumeSection title="Professional Skills" className="skills-section">
        <ProfileSkills skills={data.skills} />
      </ResumeSection>
    ) : (
      <ResumeSection title="Skills" className="skills-section">
        <div className="resume-skill-row"><strong>Expertise</strong><span>{data.skills.expertise}</span></div>
        <div className="resume-skill-row"><strong>Tools</strong><span>{data.skills.tools}</span></div>
      </ResumeSection>
    );
  }

  const content = customContent[sectionId];
  if (!content) return null;
  return (
    <ResumeSection title={content.title}>
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

function ProfileSkills({ skills }) {
  const categories = [
    { title: 'Expertise', items: skills.expertise },
    { title: 'Tools & Platforms', items: skills.tools },
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
