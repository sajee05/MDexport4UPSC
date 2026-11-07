export type PaperName = "A4" | "A3" | "A5" | "Letter" | "Legal";
export type FontName = "serif" | "sans";

export interface ExportOptions {
  title: string;
  subtitle: string;
  titlePage: boolean;
  toc: boolean;
  tocDepth: number;
  chapterBreak: boolean;
  justify: boolean;
  font: FontName;
  paper: PaperName;
  twoUp: boolean;
  scratchpad: boolean;
  /** Diagonal watermark text. Empty = none. */
  watermark: string;
  /** 1-100 */
  wmOpacity: number;
  /** px */
  wmSize: number;
  /** raster scale: 2 = ~192 dpi, 3 = ~288 dpi */
  quality: number;
}

export const DEFAULT_OPTIONS: ExportOptions = {
  title: "",
  subtitle: "",
  titlePage: true,
  toc: true,
  tocDepth: 3,
  chapterBreak: false,
  justify: true,
  font: "serif",
  paper: "A4",
  twoUp: false,
  scratchpad: true,
  watermark: "",
  wmOpacity: 5,
  wmSize: 120,
  quality: 2.5,
};

export const PAPER_MM: Record<PaperName, [number, number]> = {
  A4: [210, 297],
  A3: [297, 420],
  A5: [148, 210],
  Letter: [215.9, 279.4],
  Legal: [215.9, 355.6],
};

export const MM_TO_PX = 96 / 25.4;
export const MM_TO_PT = 72 / 25.4;

export interface Geometry {
  sheetWmm: number;
  sheetHmm: number;
  cols: number;
  colX0mm: number[];
  contentWmm: number;
  contentHmm: number;
  topMm: number;
  scratchWmm: number;
}

/** Same page maths as the original desktop script. */
export function computeGeometry(o: ExportOptions): Geometry {
  const [pw, ph] = PAPER_MM[o.paper];
  const top = 20;
  if (!o.twoUp) {
    const rightM = o.scratchpad ? pw * 0.2 + 6 : 20;
    return {
      sheetWmm: pw, sheetHmm: ph, cols: 1, colX0mm: [20],
      contentWmm: pw - 20 - rightM, contentHmm: ph - 2 * top, topMm: top,
      scratchWmm: o.scratchpad ? pw * 0.2 : 0,
    };
  }
  const W = ph, H = pw;
  const scratch = o.scratchpad ? W * 0.2 : 0;
  const colW = (W - scratch) / 2;
  return {
    sheetWmm: W, sheetHmm: H, cols: 2, colX0mm: [15, colW + 15],
    contentWmm: colW - 30, contentHmm: H - 2 * top, topMm: top, scratchWmm: scratch,
  };
}
