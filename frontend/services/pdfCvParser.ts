/**
 * pdfCvParser.ts
 * Zero-token PDF text extraction using pdfjs-dist.
 * Handles single-column and multi-column (sidebar) CV layouts.
 * No AI, no keys required.
 */

import * as pdfjsLib from 'pdfjs-dist';

// pdfjs-dist v5+ ships .mjs workers only — the old CDN .min.js URL is a 404.
// Vite resolves `new URL(pkg/file, import.meta.url)` into a proper asset URL
// at build time, so the worker is always served from the same origin.
if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).href;
}

export interface LayoutMeta {
  isMultiColumn: boolean;
  pageCount: number;
  hasTextLayer: boolean;
}

export interface PDFExtractResult {
  text: string;
  layout: LayoutMeta;
}

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
}

/** Extract all text items from a single PDF page, with position data. */
async function extractPageItems(page: pdfjsLib.PDFPageProxy, pageIndex: number): Promise<TextItem[]> {
  const content = await page.getTextContent();
  const items: TextItem[] = [];
  for (const item of content.items) {
    if (!('str' in item)) continue;
    const ti = item as pdfjsLib.TextItem;
    if (!ti.str.trim()) continue;
    items.push({
      str:    ti.str,
      x:      ti.transform[4],
      y:      ti.transform[5],
      width:  ti.width,
      height: ti.height,
      page:   pageIndex,
    });
  }
  return items;
}

/** Detect if two x-position clusters exist, indicating a 2-column layout. */
function detectMultiColumn(items: TextItem[], pageWidth: number): boolean {
  if (items.length < 10) return false;
  const xs = items.map(i => i.x);
  const mid = pageWidth / 2;
  const leftCount  = xs.filter(x => x < mid - pageWidth * 0.10).length;
  const rightCount = xs.filter(x => x > mid + pageWidth * 0.10).length;
  const gap = pageWidth * 0.30;

  const leftMax  = Math.max(...xs.filter(x => x < mid));
  const rightMin = Math.min(...xs.filter(x => x > mid));
  const hasGap   = rightMin - leftMax > gap;

  return hasGap && leftCount > 3 && rightCount > 3;
}

/** Sort items reading-order: page → y DESC → x ASC (top-left first). */
function sortReadingOrder(items: TextItem[]): TextItem[] {
  return [...items].sort((a, b) =>
    a.page !== b.page ? a.page - b.page :
    // Y in PDF space is bottom-up; negate to get top-down
    b.y !== a.y ? b.y - a.y :
    a.x - b.x
  );
}

/** Group items into lines (items within 5pt of the same y are the same line). */
function groupIntoLines(items: TextItem[]): string[] {
  if (!items.length) return [];
  const lines: Array<{ y: number; page: number; parts: string[] }> = [];
  let currentLine: typeof lines[0] | null = null;

  for (const item of items) {
    if (!currentLine || item.page !== currentLine.page || Math.abs(item.y - currentLine.y) > 5) {
      if (currentLine) lines.push(currentLine);
      currentLine = { y: item.y, page: item.page, parts: [item.str] };
    } else {
      currentLine.parts.push(item.str);
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.map(l => l.parts.join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/**
 * Handle 2-column layout: split items into left/right columns, sort each
 * independently, then concatenate left column lines followed by right column lines.
 */
function reconstruct2Column(items: TextItem[], pageWidth: number): string[] {
  const mid = pageWidth / 2;
  const leftItems  = items.filter(i => i.x <= mid);
  const rightItems = items.filter(i => i.x  > mid);
  const leftLines  = groupIntoLines(sortReadingOrder(leftItems));
  const rightLines = groupIntoLines(sortReadingOrder(rightItems));
  return [...leftLines, '', ...rightLines];
}

/**
 * Extract all text from a PDF file.
 * Returns the extracted text + layout metadata.
 * Throws on corrupt or password-protected PDFs.
 */
export async function extractText(file: File): Promise<PDFExtractResult> {
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: buffer, useWorkerFetch: false, isEvalSupported: false });

  let doc: pdfjsLib.PDFDocumentProxy;
  try {
    doc = await loadingTask.promise;
  } catch (err) {
    throw new Error(`Could not open PDF: ${err instanceof Error ? err.message : String(err)}`);
  }

  const pageCount = doc.numPages;
  const allItems: TextItem[] = [];
  let pageWidth = 595; // A4 default in points
  let totalTextChars = 0;

  for (let p = 1; p <= Math.min(pageCount, 8); p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    if (p === 1) pageWidth = viewport.width;
    const items = await extractPageItems(page, p);
    totalTextChars += items.reduce((s, i) => s + i.str.length, 0);
    allItems.push(...items);
    page.cleanup();
  }

  const hasTextLayer = totalTextChars > 50;

  if (!hasTextLayer) {
    await doc.destroy();
    console.log(`[PDFParser] ${file.name} — ${pageCount}p, scanned/image-only (no text layer). Needs AI vision.`);
    return {
      text: '',
      layout: { isMultiColumn: false, pageCount, hasTextLayer: false },
    };
  }

  const isMultiColumn = detectMultiColumn(allItems, pageWidth);
  let lines: string[];

  if (isMultiColumn) {
    lines = reconstruct2Column(allItems, pageWidth);
  } else {
    lines = groupIntoLines(sortReadingOrder(allItems));
  }

  // Remove page-number lines (lone 1–4 digit numbers) and other extraction
  // noise that would otherwise pollute the section parser.
  lines = lines.filter(l => {
    const t = l.trim();
    if (!t) return true;                    // keep blank separator lines
    if (/^\d{1,4}$/.test(t)) return false; // bare page numbers: 1, 2, 12, 123
    if (t.length < 2) return false;         // single stray chars
    return true;
  });

  await doc.destroy();

  const wordCount = lines.join(' ').split(/\s+/).filter(Boolean).length;
  console.log(`[PDFParser] ${file.name} — ${pageCount}p, ${isMultiColumn ? 'multi-column' : 'single-column'}, ~${wordCount} words extracted`);

  return {
    text: lines.join('\n'),
    layout: { isMultiColumn, pageCount, hasTextLayer: true },
  };
}
