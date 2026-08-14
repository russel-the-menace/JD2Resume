import type { ReactNode } from 'react';
import { Link, Linkedin, Mail, MapPin, MessageCircle, MessageSquareText, Phone, Send, UserRound } from 'lucide-react';
import { blockId } from './blockIds';
import { FormattedPuppetText } from './FormattedPuppetText';
import type { RendererResumeDocument, ResumeBlockDescriptor, ResumeBlockKind } from './types';

export interface RendererBlock extends ResumeBlockDescriptor { content: ReactNode; }
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const label = (chinese: boolean, cn: string, en: string) => chinese ? cn : en;
const date = (start?: string, end?: string) => [text(start), text(end)].filter(Boolean).join(' - ');
const sectionBlock = (id: string, sourcePath: string, order: number, content: ReactNode, keepWithNext = 1): RendererBlock => ({ id, kind: 'section-heading', sourcePath, order, keepWithNext, atomic: true, gapBeforeToken: order === 1 ? '30' : '26', gapAfterToken: '0', content: <h3>{content}</h3> });
const block = (id: string, kind: ResumeBlockKind, sourcePath: string, order: number, content: ReactNode, options: Partial<ResumeBlockDescriptor> = {}): RendererBlock => ({ id, kind, sourcePath, order, keepWithNext: 0, atomic: true, gapBeforeToken: '0', gapAfterToken: '0', content, ...options });

export function buildRendererBlocks(document: RendererResumeDocument): RendererBlock[] {
  const { data } = document; const chinese = document.language === 'chinese'; const blocks: RendererBlock[] = []; let order = 0;
  const add = (entry: RendererBlock) => blocks.push({ ...entry, order: order++ });
  const basics = data.basics || {}; const name = chinese ? text(basics.fullName) : [text(basics.firstName), text(basics.lastName)].filter(Boolean).join(' ') || text(basics.fullName);
  const contacts = [
    ['email', Mail, basics.email], ['phone', Phone, basics.phone], ['location', MapPin, basics.location], ['gender', UserRound, basics.gender],
    ['website', Link, basics.website], ['wechat', MessageSquareText, basics.wechat], ['linkedin', Linkedin, basics.linkedin],
    ['whatsapp', MessageCircle, basics.whatsapp], ['telegram', Send, basics.telegram],
  ].filter((entry) => text(entry[2]));
  add(block(blockId.header(), 'header', 'data.basics', order, <header className="resume-header"><div className="resume-name-block"><h1>{name}</h1><p>{text(basics.role)}</p></div>{contacts.length ? <div className="resume-contact">{contacts.map(([id, Icon, value], index) => <span className="resume-contact-item" data-contact={String(id)} key={String(id)}><Icon size={11} aria-hidden="true" />{text(value)}{index < contacts.length - 1 ? <i className="contact-separator" aria-hidden="true" /> : null}</span>)}</div> : null}{text(basics.photoUrl) ? <div className="profile-avatar-slot"><img className="resume-profile-avatar" src={text(basics.photoUrl)} alt="" /></div> : null}</header>, { gapBeforeToken: '0', gapAfterToken: '30' }));
  const sectionOrder = document.sectionOrder.length ? document.sectionOrder : ['summary', 'education', 'experience', 'skills', 'certifications'];
  for (const section of sectionOrder) {
    if (section === 'basics') continue;
    if (section === 'summary' && text(data.summary)) {
      add(sectionBlock(blockId.section('summary'), 'data.summary', order, label(chinese, '个人介绍', 'Personal Introduction')));
      add(block(blockId.summary(0), 'summary-paragraph', 'data.summary', order, <FormattedPuppetText value={text(data.summary)} allowBold maxBold={2} />, { gapBeforeToken: '18' }));
    }
    if (section === 'education' && data.education.length) {
      add(sectionBlock(blockId.section('education'), 'data.education', order, label(chinese, '教育经历', 'Education')));
      data.education.forEach((entry, index) => add(block(blockId.education(entry.id, index), 'education-entry', `data.education.${index}`, order,
        <div className="resume-entry-heading profile-education-entry"><div><strong>{text(entry.school)}</strong><span>{[text(entry.degree), text(entry.location)].filter(Boolean).join(', ')}</span></div><time>{date(entry.start, entry.end)}</time></div>, { gapBeforeToken: index ? '23' : '18' })));
    }
    if (section === 'experience' && data.experience.length) {
      add(sectionBlock(blockId.section('experience'), 'data.experience', order, label(chinese, '工作经历', 'Work Experience')));
      data.experience.forEach((entry, entryIndex) => {
        const bullets = (entry.bullets || []).map(text).filter(Boolean);
        if (!bullets.length) return;
        add(block(blockId.experienceHeading(entry.id, entryIndex), 'experience-heading', `data.experience.${entryIndex}`, order,
          <div className="resume-entry-heading profile-work-entry"><div><strong>{text(entry.company)} - {text(entry.role)}</strong></div><time>{date(entry.start, entry.current ? (chinese ? '至今' : 'Present') : entry.end)}</time></div>, { keepWithNext: 1, gapBeforeToken: entryIndex ? '23' : '18' }));
        let underlinedBullets = 0;
        bullets.forEach((bullet, bulletIndex) => { const allowUnderline = underlinedBullets < 2 && /<u>.*?<\/u>/i.test(bullet); if (allowUnderline) underlinedBullets += 1; add(block(blockId.experienceBullet(entry.id, entryIndex, bulletIndex), 'experience-bullet', `data.experience.${entryIndex}.bullets.${bulletIndex}`, order, <div className="resume-bullet"><FormattedPuppetText value={bullet} allowUnderline={allowUnderline} maxUnderline={1} /></div>, { gapBeforeToken: bulletIndex ? '8' : '10' })); });
      });
    }
    if (section === 'skills' && (data.skills?.categories?.length || text(data.skills?.expertise) || text(data.skills?.tools))) {
      add(sectionBlock(blockId.section('skills'), 'data.skills', order, label(chinese, '专业技能', 'Professional Skills')));
      const categories = data.skills?.categories?.length ? data.skills.categories : [
        { title: chinese ? '专业领域' : 'Expertise', items: text(data.skills?.expertise).split(',').map((item) => item.trim()).filter(Boolean) },
        { title: chinese ? '工具平台' : 'Tools & Platforms', items: text(data.skills?.tools).split(',').map((item) => item.trim()).filter(Boolean) },
      ].filter((category) => category.items.length);
      add(block(blockId.skillItem('content', 0, 0), 'skill-item', 'data.skills', order, <div className="profile-skills-grid">{categories.map((category) => <div className="profile-skill-category" key={category.title}><strong>{category.title}</strong><ul>{category.items.map((item, itemIndex) => <li key={`${item}-${itemIndex}`}>{item}</li>)}</ul></div>)}</div>, { gapBeforeToken: '18' }));
    }
    if (section === 'certifications' && (data.certificates || []).length) {
      add(sectionBlock(blockId.section('certificates'), 'data.certificates', order, label(chinese, '证书', 'Certificates')));
      add(block(blockId.certificate('content', 0), 'certificate-item', 'data.certificates', order, <div className="certificate-list">{(data.certificates || []).map((entry, index) => <span key={String(entry.id ?? index)}>{text(entry.name)}{text(entry.date) ? <small>{text(entry.date)}</small> : null}</span>)}</div>, { gapBeforeToken: '18' }));
    }
  }
  return blocks;
}
