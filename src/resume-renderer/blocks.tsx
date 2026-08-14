import type { ReactNode } from 'react';
import { blockId } from './blockIds';
import { FormattedPuppetText } from './FormattedPuppetText';
import type { RendererResumeDocument, ResumeBlockDescriptor, ResumeBlockKind } from './types';

export interface RendererBlock extends ResumeBlockDescriptor { content: ReactNode; }
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const label = (chinese: boolean, cn: string, en: string) => chinese ? cn : en;
const date = (start?: string, end?: string) => [text(start), text(end)].filter(Boolean).join(' - ');
const paragraphs = (value: string) => value.split(/(?:\r?\n[ \t]*){1,}/).map((item) => item.trim()).filter(Boolean);
const sectionBlock = (id: string, sourcePath: string, order: number, content: ReactNode, keepWithNext = 1): RendererBlock => ({ id, kind: 'section-heading', sourcePath, order, keepWithNext, atomic: true, gapBeforeToken: '30', gapAfterToken: '20', content });
const block = (id: string, kind: ResumeBlockKind, sourcePath: string, order: number, content: ReactNode, options: Partial<ResumeBlockDescriptor> = {}): RendererBlock => ({ id, kind, sourcePath, order, keepWithNext: 0, atomic: true, gapBeforeToken: '0', gapAfterToken: '0', content, ...options });

export function buildRendererBlocks(document: RendererResumeDocument): RendererBlock[] {
  const { data } = document; const chinese = document.language === 'chinese'; const blocks: RendererBlock[] = []; let order = 0;
  const add = (entry: RendererBlock) => blocks.push({ ...entry, order: order++ });
  const basics = data.basics || {}; const name = chinese ? text(basics.fullName) : [text(basics.firstName), text(basics.lastName)].filter(Boolean).join(' ') || text(basics.fullName);
  const contacts = [basics.email, basics.phone, basics.location, basics.gender, basics.website, basics.wechat, basics.linkedin, basics.whatsapp, basics.telegram].map(text).filter(Boolean);
  add(block(blockId.header(), 'header', 'data.basics', order, <header className="puppet-header"><div className="puppet-header-main"><h1>{name}</h1><p>{text(basics.role)}</p>{contacts.length ? <div className="puppet-contact">{contacts.map((item, index) => <span key={`${item}-${index}`}>{item}</span>)}</div> : null}</div>{text(basics.photoUrl) ? <img className="puppet-avatar" src={text(basics.photoUrl)} alt="" /> : null}</header>, { gapBeforeToken: '0', gapAfterToken: '27' }));
  const sectionOrder = document.sectionOrder.length ? document.sectionOrder : ['summary', 'education', 'experience', 'skills', 'certifications'];
  for (const section of sectionOrder) {
    if (section === 'basics') continue;
    if (section === 'summary' && text(data.summary)) {
      add(sectionBlock(blockId.section('summary'), 'data.summary', order, label(chinese, '个人介绍', 'Personal Introduction')));
      paragraphs(text(data.summary)).forEach((paragraph, index) => add(block(blockId.summary(index), 'summary-paragraph', `data.summary.${index}`, order, <FormattedPuppetText value={paragraph} allowBold maxBold={2} />, { gapBeforeToken: index ? '9' : '0' })));
    }
    if (section === 'education' && data.education.length) {
      add(sectionBlock(blockId.section('education'), 'data.education', order, label(chinese, '教育经历', 'Education')));
      data.education.forEach((entry, index) => add(block(blockId.education(entry.id, index), 'education-entry', `data.education.${index}`, order,
        <div className="puppet-education-line"><strong>{text(entry.school)}</strong><span>{text(entry.degree)}</span><time>{date(entry.start, entry.end)}</time></div>, { gapBeforeToken: index ? '14' : '0' })));
    }
    if (section === 'experience' && data.experience.length) {
      add(sectionBlock(blockId.section('experience'), 'data.experience', order, label(chinese, '工作经历', 'Work Experience')));
      data.experience.forEach((entry, entryIndex) => {
        const bullets = (entry.bullets || []).map(text).filter(Boolean);
        if (!bullets.length) return;
        add(block(blockId.experienceHeading(entry.id, entryIndex), 'experience-heading', `data.experience.${entryIndex}`, order,
          <div className="puppet-experience-heading"><strong>{text(entry.company)}</strong><span>{text(entry.role)}</span><time>{date(entry.start, entry.current ? (chinese ? '至今' : 'Present') : entry.end)}</time></div>, { keepWithNext: 1, gapBeforeToken: entryIndex ? '25' : '0' }));
        bullets.forEach((bullet, bulletIndex) => add(block(blockId.experienceBullet(entry.id, entryIndex, bulletIndex), 'experience-bullet', `data.experience.${entryIndex}.bullets.${bulletIndex}`, order, <div className="puppet-bullet"><FormattedPuppetText value={bullet} allowUnderline maxUnderline={1} /></div>, { gapBeforeToken: bulletIndex ? '9' : '0' })));
      });
    }
    if (section === 'skills' && Object.values(data.skills || {}).some((value) => text(value))) {
      add(sectionBlock(blockId.section('skills'), 'data.skills', order, label(chinese, '专业技能', 'Professional Skills')));
      Object.entries(data.skills || {}).forEach(([category, value], categoryIndex) => {
        const items = text(value).split(/[，,、]/).map((item) => item.trim()).filter(Boolean); if (!items.length) return;
        add(block(blockId.skillHeading(category, categoryIndex), 'skill-category-heading', `data.skills.${category}`, order, <strong className="puppet-skill-heading">{category}</strong>, { keepWithNext: 1, gapBeforeToken: categoryIndex ? '12' : '0' }));
        items.forEach((item, itemIndex) => add(block(blockId.skillItem(category, categoryIndex, itemIndex), 'skill-item', `data.skills.${category}.${itemIndex}`, order, <span className="puppet-skill-item">{item}</span>, { gapBeforeToken: itemIndex ? '9' : '0' })));
      });
    }
    if (section === 'certifications' && (data.certificates || []).length) {
      add(sectionBlock(blockId.section('certificates'), 'data.certificates', order, label(chinese, '证书', 'Certificates')));
      (data.certificates || []).forEach((entry, index) => add(block(blockId.certificate(entry.id, index), 'certificate-item', `data.certificates.${index}`, order, [text(entry.name), text(entry.issuer), text(entry.date)].filter(Boolean).join(' · '), { gapBeforeToken: index ? '9' : '0' })));
    }
  }
  return blocks;
}
