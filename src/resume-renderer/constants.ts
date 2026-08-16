export const RENDERER_VERSION = 'puppet-renderer-v4';
export const RENDERER_PROTOCOL = 'jd2resume-puppet-renderer-v3';
export const A4_WIDTH_PX = 794 as const;
export const A4_HEIGHT_PX = 1123 as const;
export const PAGE_MARGIN_TOP_PX = 40;
export const PAGE_MARGIN_RIGHT_PX = 50;
export const PAGE_MARGIN_BOTTOM_PX = 40;
export const PAGE_MARGIN_LEFT_PX = 50;
export const PAGE_CONTENT_WIDTH_PX = 694 as const;
export const PAGE_CONTENT_HEIGHT_PX = 1043 as const;
export const PREVIEW_PAGE_GAP_PX = 34;
export const DEFAULT_HEADER_HEIGHT_PX = 125;
export const MIN_HEADER_HEIGHT_PX = 120;
export const MAX_HEADER_HEIGHT_PX = 220;
export const DEFAULT_SKILL_TITLE_GAP_PX = 10;
export const MIN_SKILL_TITLE_GAP_PX = 0;
export const MAX_SKILL_TITLE_GAP_PX = 30;
export const DEFAULT_SKILL_TITLE_OFFSET_X_PX = 20;
export const MIN_SKILL_TITLE_OFFSET_X_PX = 0;
export const MAX_SKILL_TITLE_OFFSET_X_PX = 40;
export const MIN_PAGE_FILL_RATIO = 0.92;
export const TARGET_BOTTOM_MARGIN_PX = 42;
export const CALIBRATION_STEPS = 8;
export const MAX_TUNING_INTENSITY = 3;
export const MIN_PARAGRAPH_LINE_HEIGHT = 20;
export const MIN_RESPONSIBILITY_LINE_HEIGHT = 20;
export const MIN_SKILL_LINE_HEIGHT = 19;
export const PIXEL_EPSILON = 1;
export const INPUT_LAYOUT_DEBOUNCE_MS = 250;
export const MIN_LOADING_VISIBILITY_MS = 180;
export const RENDER_TIMEOUT_MS = 20_000;

export const NATURAL_TUNING = {
  policy: 'natural',
  sectionGapDelta: 0,
  lineHeightDelta: 0,
  fontSizeDelta: 0,
} as const;

// This order and these values are intentionally identical to the former server layout.ts.
export const PUPPET_TUNING_STRATEGIES = [
  { id: 'spacing-fit', sectionGapDelta: 14, lineHeightDelta: 0, fontSizeDelta: 0 },
  { id: 'balanced-fit', sectionGapDelta: 8, lineHeightDelta: 4, fontSizeDelta: 0 },
  { id: 'typography-fit', sectionGapDelta: 2, lineHeightDelta: 2, fontSizeDelta: 1 },
  { id: 'combined-fit', sectionGapDelta: 10, lineHeightDelta: 5, fontSizeDelta: 0.8 },
  { id: 'line-fit', sectionGapDelta: 0, lineHeightDelta: 6, fontSizeDelta: 0 },
] as const;
