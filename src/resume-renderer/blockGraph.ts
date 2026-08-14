import type { MeasuredResumeBlock } from './types';
import { RendererError } from './errors';

export interface ConstrainedGroup { blocks: MeasuredResumeBlock[]; }

// A heading's keepWithNext count creates an indivisible group with its required followers.
export function buildConstrainedGroups(blocks: MeasuredResumeBlock[]): ConstrainedGroup[] {
  const groups: ConstrainedGroup[] = [];
  for (let index = 0; index < blocks.length;) {
    const block = blocks[index];
    const count = Math.max(0, block.keepWithNext);
    const members = blocks.slice(index, index + count + 1);
    if (members.length !== count + 1) throw new RendererError('ORPHAN_HEADING', { id: block.id });
    groups.push({ blocks: members }); index += members.length;
  }
  return groups;
}

export function isHeadingKind(kind: string) { return kind === 'section-heading' || kind === 'experience-heading' || kind === 'skill-category-heading'; }
