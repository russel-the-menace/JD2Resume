import { createRoot, type Root } from 'react-dom/client';
import { PuppetMeasurementDocument } from './PuppetDocument';
import { buildRendererBlocks } from './blocks';
import { RendererError, assertNotAborted } from './errors';
import type { LayoutTuningV2, MeasurementResult, RenderSnapshot } from './types';

let measurementRoot: Root | null = null;
let measurementHost: HTMLDivElement | null = null;
function host() { if (!measurementHost) { measurementHost = document.createElement('div'); measurementHost.className = 'puppet-measurement-host'; document.body.append(measurementHost); measurementRoot = createRoot(measurementHost); } return measurementHost; }
export function afterTwoAnimationFrames() { return new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); }
export async function ensureCanonicalFont() { try { await document.fonts.ready; } catch { throw new RendererError('FONT_LOAD_FAILED'); } }
export async function waitForImages(root: ParentNode) { const images = Array.from(root.querySelectorAll('img')); try { await Promise.all(images.map(async (image) => { if (!image.complete) await new Promise<void>((resolve, reject) => { image.addEventListener('load', () => resolve(), { once: true }); image.addEventListener('error', () => reject(new Error('decode')), { once: true }); }); await image.decode(); })); } catch { throw new RendererError('IMAGE_DECODE_FAILED'); } return images.length; }
export async function measureSnapshot(snapshot: RenderSnapshot, tuning: LayoutTuningV2, signal: AbortSignal): Promise<MeasurementResult> {
  const target = host(); if (!measurementRoot) throw new RendererError('MEASUREMENT_ROOT_MISSING');
  measurementRoot.render(<PuppetMeasurementDocument snapshot={snapshot} tuning={tuning} />);
  await afterTwoAnimationFrames(); assertNotAborted(signal); await ensureCanonicalFont(); await waitForImages(target); await afterTwoAnimationFrames(); assertNotAborted(signal);
  const root = target.querySelector<HTMLElement>('.puppet-measurement-document'); const elements = Array.from(target.querySelectorAll<HTMLElement>('[data-resume-block="true"]'));
  if (!root || !elements.length) throw new RendererError('MEASUREMENT_ROOT_MISSING');
  const rootRect = root.getBoundingClientRect(); const seen = new Set<string>();
  const blocks = elements.map((element, order) => { const id = element.dataset.blockId || ''; if (!id || seen.has(id)) throw new RendererError('BLOCK_ID_DUPLICATE', { id }); seen.add(id); const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return { id, kind: element.dataset.blockKind as any, sourcePath: element.dataset.sourcePath || '', order, keepWithNext: Number(element.dataset.keepWithNext) || 0, atomic: true, gapBeforeToken: String(parseFloat(style.marginTop) || 0), gapAfterToken: '0', width: rect.width, height: rect.height, naturalTop: rect.top - rootRect.top, naturalBottom: rect.bottom - rootRect.top, computedFontSize: parseFloat(style.fontSize) || 0, computedLineHeight: parseFloat(style.lineHeight) || 0 }; });
  // DOM cannot carry grouping metadata without duplicating it. Restore it from the one block graph source.
  const descriptors = new Map(buildRendererBlocks(snapshot.document).map((block) => [block.id, block]));
  const measured = blocks.map((entry) => ({ ...entry, ...descriptors.get(entry.id), width: entry.width, height: entry.height, naturalTop: entry.naturalTop, naturalBottom: entry.naturalBottom, computedFontSize: entry.computedFontSize, computedLineHeight: entry.computedLineHeight }));
  return { blocks: measured, contentBottom: measured.reduce((maximum, block) => Math.max(maximum, block.naturalBottom), 0), expectedBlockIds: buildRendererBlocks(snapshot.document).map((block) => block.id), tuning };
}
