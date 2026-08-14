import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument } from 'pdf-lib';

export type CanonicalLine = {
  id: string;
  page: number;
  line: number;
  text: string;
};

export type CanonicalPage = {
  page: number;
  lines: CanonicalLine[];
  needsOcr: boolean;
  ocrReasons: string[];
};

export type CanonicalDocument = {
  pages: CanonicalPage[];
  lines: CanonicalLine[];
};

type PositionedText = { text: string; x: number; y: number; height: number };

function normalizeLineText(value: string) {
  return value
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .replace(/([\u3400-\u9FFF])\s+(?=[\u3400-\u9FFF])/gu, '$1')
    .trim();
}

function groupTextItems(items: PositionedText[]) {
  const rows: Array<{ y: number; height: number; items: PositionedText[] }> = [];
  for (const item of [...items].sort((first, second) => second.y - first.y || first.x - second.x)) {
    const row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= Math.max(2.5, candidate.height * 0.35));
    if (row) {
      row.items.push(item);
      row.y = (row.y + item.y) / 2;
      row.height = Math.max(row.height, item.height);
    } else {
      rows.push({ y: item.y, height: item.height, items: [item] });
    }
  }
  return rows
    .sort((first, second) => second.y - first.y)
    .map((row) => normalizeLineText(row.items.sort((first, second) => first.x - second.x).map((item) => item.text).join(' ')))
    .filter(Boolean);
}

function pageOcrReasons(lines: string[]) {
  const reasons: string[] = [];
  const text = lines.join('');
  if (text.length < 40 || lines.length < 3) reasons.push('sparse-text');
  if (/[\u0000\uFFFD]/u.test(text)) reasons.push('invalid-text-encoding');
  const suspicious = [...text].filter((character) =>
    character === '\uFFFD' || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uE000-\uF8FF]/u.test(character),
  ).length;
  if (suspicious / Math.max(text.length, 1) > 0.05) reasons.push('high-garbled-ratio');
  return [...new Set(reasons)];
}

function canonicalLines(page: number, values: string[]): CanonicalLine[] {
  return values.map((text, index) => ({
    id: `p${page}-l${index + 1}`,
    page,
    line: index + 1,
    text,
  }));
}

export async function extractPdfDocument(encodedPdf: string): Promise<CanonicalDocument> {
  const loadingTask = getDocument({
    data: new Uint8Array(Buffer.from(encodedPdf, 'base64')),
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  const pages: CanonicalPage[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const positioned = content.items.flatMap((item: any) => {
        const text = normalizeLineText(typeof item.str === 'string' ? item.str : '');
        if (!text || !Array.isArray(item.transform)) return [];
        return [{
          text,
          x: Number(item.transform[4]) || 0,
          y: Number(item.transform[5]) || 0,
          height: Math.abs(Number(item.height) || Number(item.transform[3]) || 10),
        } satisfies PositionedText];
      });
      const lineValues = groupTextItems(positioned);
      const ocrReasons = pageOcrReasons(lineValues);
      pages.push({
        page: pageNumber,
        lines: canonicalLines(pageNumber, lineValues),
        needsOcr: ocrReasons.length > 0,
        ocrReasons,
      });
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
  return { pages, lines: pages.flatMap((page) => page.lines) };
}

export function documentFromText(text: string): CanonicalDocument {
  const lines = canonicalLines(1, text.split(/\r?\n/).map(normalizeLineText).filter(Boolean));
  return { pages: [{ page: 1, lines, needsOcr: false, ocrReasons: [] }], lines };
}

export function replacePageWithOcr(document: CanonicalDocument, pageNumber: number, ocrLines: string[]) {
  const pages = document.pages.map((page) => page.page === pageNumber
    ? { ...page, lines: canonicalLines(pageNumber, ocrLines.map(normalizeLineText).filter(Boolean)), needsOcr: false, ocrReasons: [] }
    : page);
  return { pages, lines: pages.flatMap((page) => page.lines) };
}

export function replaceCorruptedPageLines(document: CanonicalDocument, pageNumber: number, replacements: string[]) {
  let replacementIndex = 0;
  const pages = document.pages.map((page) => {
    if (page.page !== pageNumber) return page;
    const lines = page.lines.map((line) => {
      if (!/[\u0000\uFFFD]/u.test(line.text)) return line;
      const replacement = normalizeLineText(replacements[replacementIndex] || '');
      replacementIndex += 1;
      return replacement ? { ...line, text: replacement } : line;
    });
    return { ...page, lines, needsOcr: false, ocrReasons: [] };
  });
  return { pages, lines: pages.flatMap((page) => page.lines) };
}

export async function extractSinglePdfPage(encodedPdf: string, pageNumber: number) {
  const source = await PDFDocument.load(Buffer.from(encodedPdf, 'base64'));
  const singlePage = await PDFDocument.create();
  const [page] = await singlePage.copyPages(source, [pageNumber - 1]);
  singlePage.addPage(page);
  return Buffer.from(await singlePage.save()).toString('base64');
}

export function indexedDocumentText(document: CanonicalDocument) {
  return document.lines.map((line) => `[${line.id}]: ${line.text}`).join('\n');
}
