import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
  Download,
  Eye,
  FileText,
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
  Phone,
  Plus,
  Redo2,
  RotateCcw,
  Settings2,
  Sparkles,
  Trash2,
  Undo2,
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
    linkedin: 'linkedin.com/in/jordanlee',
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
  { id: 'modern', name: 'Modern', detail: 'Balanced' },
  { id: 'classic', name: 'Classic', detail: 'Traditional' },
  { id: 'compact', name: 'Compact', detail: 'Space-saving' },
];

const accentOptions = ['#167c65', '#2e5aac', '#a34636', '#5f4b8b', '#2f3438'];
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.1;
const DEFAULT_EDITOR_WIDTH = 540;
const MIN_EDITOR_WIDTH = 340;
const MAX_EDITOR_WIDTH = 720;
const EDITOR_WIDTH_STORAGE_KEY = 'draftline-editor-width';

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

function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}

function App() {
  const [history, setHistory] = useState({
    past: [],
    present: initialResume,
    future: [],
  });
  const [activeSection, setActiveSection] = useState('experience');
  const [openExperience, setOpenExperience] = useState(1);
  const [template, setTemplate] = useState('modern');
  const [accent, setAccent] = useState(accentOptions[0]);
  const [zoom, setZoom] = useState(1);
  const [editorWidth, setEditorWidth] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_EDITOR_WIDTH;
    const storedWidth = window.localStorage.getItem(EDITOR_WIDTH_STORAGE_KEY);
    if (storedWidth === null) return DEFAULT_EDITOR_WIDTH;
    const savedWidth = Number(storedWidth);
    if (!Number.isFinite(savedWidth)) return DEFAULT_EDITOR_WIDTH;
    return Math.min(MAX_EDITOR_WIDTH, Math.max(MIN_EDITOR_WIDTH, savedWidth));
  });
  const [mobileMode, setMobileMode] = useState('edit');
  const [templateMenu, setTemplateMenu] = useState(false);
  const [sectionMenu, setSectionMenu] = useState(false);
  const [aiPanel, setAiPanel] = useState(false);
  const [customSections, setCustomSections] = useState([]);
  const [customContent, setCustomContent] = useState({});
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
    setSaveState('Saving...');
  };

  useEffect(() => {
    if (saveState !== 'Saving...') return undefined;
    const timer = window.setTimeout(() => setSaveState('Saved'), 650);
    return () => window.clearTimeout(timer);
  }, [history.present, saveState]);

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

  const sections = [
    ...baseSections,
    ...customSections.map((sectionId) => ({
      id: sectionId,
      label: emptyCustomSection[sectionId].title,
      icon: sectionSuggestions.find((item) => item.id === sectionId)?.icon || Award,
    })),
  ];

  const addCustomSection = (id) => {
    if (!customSections.includes(id)) {
      setCustomSections((current) => [...current, id]);
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
    setHistory({ past: [], present: initialResume, future: [] });
    setCustomSections([]);
    setCustomContent({});
    setToast('Demo content restored');
  };

  return (
    <div className="app-shell">
      <TopBar
        saveState={saveState}
        undo={undo}
        redo={redo}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onExport={() => window.print()}
        onAi={() => setAiPanel(true)}
        onReset={resetDemo}
      />

      <MobileTabs value={mobileMode} onChange={setMobileMode} />

      <main
        className="workspace"
        data-mobile-mode={mobileMode}
        style={{ '--editor-width': `${editorWidth}px` }}
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
          onCommit={(width) =>
            window.localStorage.setItem(EDITOR_WIDTH_STORAGE_KEY, String(Math.round(width)))
          }
        />

        <PreviewPanel
          data={data}
          template={template}
          setTemplate={setTemplate}
          accent={accent}
          setAccent={setAccent}
          zoom={zoom}
          setZoom={setZoom}
          templateMenu={templateMenu}
          setTemplateMenu={setTemplateMenu}
          customSections={customSections}
          customContent={customContent}
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
  saveState,
  undo,
  redo,
  canUndo,
  canRedo,
  onExport,
  onAi,
  onReset,
}) {
  return (
    <header className="topbar">
      <div className="brand-block">
        <button className="icon-button back-button" aria-label="Back to resumes" title="Back to resumes">
          <ArrowLeft size={18} />
        </button>
        <a className="brand" href="#" aria-label="Draftline home">
          <span className="brand-mark"><FileText size={18} /></span>
          <span>Draftline</span>
        </a>
      </div>

      <div className="document-meta">
        <div className="document-title-row">
          <input aria-label="Resume name" defaultValue="Jordan Lee - Product Designer" />
          <span className={cx('save-status', saveState === 'Saving...' && 'is-saving')}>
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
}) {
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
        {sections.map(({ id, label, icon: Icon }, index) => (
          <button
            key={id}
            className={cx('section-nav-item', activeSection === id && 'active')}
            onClick={() => onSelect(id)}
          >
            <GripVertical className="drag-icon" size={15} />
            <span className="section-icon"><Icon size={16} /></span>
            <span className="section-label">{label}</span>
            {index < 5 ? (
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
            id={activeSection}
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
  return (
    <div className="form-content">
      <div className="form-grid two-columns">
        <Field label="First name" value={basics.firstName} onChange={(value) => onChange('firstName', value)} />
        <Field label="Last name" value={basics.lastName} onChange={(value) => onChange('lastName', value)} />
      </div>
      <Field label="Professional title" value={basics.role} onChange={(value) => onChange('role', value)} />
      <div className="form-grid two-columns">
        <Field label="Email" type="email" value={basics.email} onChange={(value) => onChange('email', value)} />
        <Field label="Phone" value={basics.phone} onChange={(value) => onChange('phone', value)} />
      </div>
      <Field label="Location" value={basics.location} onChange={(value) => onChange('location', value)} />
      <div className="form-grid two-columns">
        <Field label="Portfolio" value={basics.website} onChange={(value) => onChange('website', value)} />
        <Field label="LinkedIn" value={basics.linkedin} onChange={(value) => onChange('linkedin', value)} />
      </div>
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

function Field({ label, value, onChange, type = 'text', disabled = false }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        disabled={disabled}
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
  templateMenu,
  setTemplateMenu,
  customSections,
  customContent,
}) {
  const [colorMenu, setColorMenu] = useState(false);
  const zoomPercent = Math.round(zoom * 100);
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
          <span className="page-count">1 page</span>
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
                <div>
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
      <ResumeStage zoom={zoom} setZoom={setZoom}>
        <ResumePage
          data={data}
          template={template}
          accent={accent}
          customSections={customSections}
          customContent={customContent}
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

function ResumeStage({ zoom, setZoom, children }) {
  const stageRef = useRef(null);
  const dragRef = useRef(null);
  const [fitScale, setFitScale] = useState(0.7);
  const [isDragging, setIsDragging] = useState(false);
  const pageWidth = 720;
  const pageHeight = 932;

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
  }, []);

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
  };

  const zoomWithWheel = (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const direction = event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    setZoom((current) =>
      Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(current + direction).toFixed(2))),
    );
  };

  const scale = fitScale * zoom;
  return (
    <div
      className={cx('resume-stage', isDragging && 'is-dragging')}
      ref={stageRef}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      onWheel={zoomWithWheel}
    >
      <div
        className="resume-scale-wrap"
        style={{ width: pageWidth * scale, height: pageHeight * scale }}
      >
        <div className="resume-transform" style={{ transform: `scale(${scale})` }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function ResumePage({ data, template, accent, customSections, customContent }) {
  const { basics } = data;
  return (
    <article className={cx('resume-page', `template-${template}`)} style={{ '--resume-accent': accent }}>
      <header className="resume-header">
        <div className="resume-name-block">
          <h2>{basics.firstName} {basics.lastName}</h2>
          <p>{basics.role}</p>
        </div>
        <div className="resume-contact">
          <span><Mail size={11} />{basics.email}</span>
          <span><Phone size={11} />{basics.phone}</span>
          <span><MapPin size={11} />{basics.location}</span>
          <span><Link size={11} />{basics.website}</span>
        </div>
      </header>

      <div className="resume-body">
        <ResumeSection title="Profile" className="profile-section">
          <p>{data.summary}</p>
        </ResumeSection>

        <ResumeSection title="Experience" className="experience-section">
          {data.experience.map((item) => (
            <div className="resume-entry" key={item.id}>
              <div className="resume-entry-heading">
                <div><strong>{item.role}</strong><span>{item.company} · {item.location}</span></div>
                <time>{item.start} - {item.end}</time>
              </div>
              <ul>
                {item.bullets.map((bullet, index) => <li key={index}>{bullet}</li>)}
              </ul>
            </div>
          ))}
        </ResumeSection>

        <div className="resume-bottom-grid">
          <ResumeSection title="Education" className="education-section">
            {data.education.map((item) => (
              <div className="resume-entry compact-entry" key={item.id}>
                <div className="resume-entry-heading">
                  <div><strong>{item.degree}</strong><span>{item.school} · {item.location}</span></div>
                  <time>{item.start} - {item.end}</time>
                </div>
              </div>
            ))}
          </ResumeSection>

          <ResumeSection title="Skills" className="skills-section">
            <div className="resume-skill-row"><strong>Expertise</strong><span>{data.skills.expertise}</span></div>
            <div className="resume-skill-row"><strong>Tools</strong><span>{data.skills.tools}</span></div>
          </ResumeSection>
        </div>

        {customSections.map((sectionId) => {
          const content = customContent[sectionId];
          if (!content) return null;
          return (
            <ResumeSection title={content.title} key={sectionId}>
              <div className="resume-entry compact-entry">
                <div className="resume-entry-heading">
                  <div><strong>{content.itemTitle}</strong><span>{content.subtitle}</span></div>
                </div>
                {content.description && <p>{content.description}</p>}
              </div>
            </ResumeSection>
          );
        })}
      </div>
    </article>
  );
}

function ResumeSection({ title, children, className }) {
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
