/**
 * Komon Lab — client-side PDF generator using pdf-lib.
 *
 * Everything in this module runs in the user's browser. No measurements are
 * transmitted off-device. The generated PDF is returned as a Uint8Array which
 * the UI converts into a Blob download.
 *
 * Layout philosophy:
 *   p.1   — Measurement summary + derived dimensions table.
 *   p.2…  — Pattern pieces, one per page, drawn TO SCALE in millimetres.
 *           When a piece exceeds the page, it is tiled with alignment marks
 *           (filled triangles in the corners) and a page-x-of-y footer.
 *   p.N-1 — Cut chart for the chosen fabric width.
 *   p.N   — Sewing instructions.
 *
 * Units: pdf-lib uses PDF points (1/72 in). We compute mm → points throughout.
 */

import {
  PDFDocument,
  StandardFonts,
  rgb,
  PageSizes,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import type { CalcResult, PatternPieceRect } from './kimonoCalc';

export type PaperSize = 'A4' | 'Letter';

const MM_PER_INCH = 25.4;
const PT_PER_INCH = 72;
const PT_PER_MM = PT_PER_INCH / MM_PER_INCH; // ≈ 2.8346

const CM_TO_PT = 10 * PT_PER_MM;

function pageDimensions(size: PaperSize): [number, number] {
  return size === 'A4' ? PageSizes.A4 : PageSizes.Letter;
}

function margin(): number {
  return 36; // 0.5 inch
}

const COLOR = {
  ink: rgb(0.1, 0.094, 0.078),
  rule: rgb(0.6, 0.58, 0.5),
  faint: rgb(0.85, 0.82, 0.75),
  indigo: rgb(0.19, 0.27, 0.4),
  accent: rgb(0.65, 0.31, 0.26),
};

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  opts: { font: PDFFont; size?: number; color?: ReturnType<typeof rgb> } = {} as {
    font: PDFFont;
  },
) {
  page.drawText(text, {
    x,
    y,
    size: opts.size ?? 10,
    font: opts.font,
    color: opts.color ?? COLOR.ink,
  });
}

function drawDashedRect(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  color: ReturnType<typeof rgb>,
) {
  const dash = 4;
  const gap = 3;
  // top
  for (let dx = 0; dx < width; dx += dash + gap) {
    page.drawLine({ start: { x: x + dx, y: y + height }, end: { x: x + Math.min(dx + dash, width), y: y + height }, thickness: 0.5, color });
  }
  // bottom
  for (let dx = 0; dx < width; dx += dash + gap) {
    page.drawLine({ start: { x: x + dx, y }, end: { x: x + Math.min(dx + dash, width), y }, thickness: 0.5, color });
  }
  // left
  for (let dy = 0; dy < height; dy += dash + gap) {
    page.drawLine({ start: { x, y: y + dy }, end: { x, y: y + Math.min(dy + dash, height) }, thickness: 0.5, color });
  }
  // right
  for (let dy = 0; dy < height; dy += dash + gap) {
    page.drawLine({ start: { x: x + width, y: y + dy }, end: { x: x + width, y: y + Math.min(dy + dash, height) }, thickness: 0.5, color });
  }
}

function drawHeaderFooter(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  pageWidth: number,
  pageHeight: number,
  pageIndex: number,
  pageCount: number,
  result: CalcResult,
) {
  // Header
  drawText(page, 'Komon Lab — Custom Kimono Pattern', margin(), pageHeight - 22, {
    font: fontBold,
    size: 9,
    color: COLOR.indigo,
  });
  drawText(
    page,
    `Generated in your browser · ${new Date().toISOString().slice(0, 10)}`,
    pageWidth - margin() - 180,
    pageHeight - 22,
    { font, size: 8, color: COLOR.rule },
  );
  page.drawLine({
    start: { x: margin(), y: pageHeight - 28 },
    end: { x: pageWidth - margin(), y: pageHeight - 28 },
    thickness: 0.5,
    color: COLOR.faint,
  });

  // Footer
  page.drawLine({
    start: { x: margin(), y: 24 },
    end: { x: pageWidth - margin(), y: 24 },
    thickness: 0.5,
    color: COLOR.faint,
  });
  drawText(page, 'komonlab.com', margin(), 12, { font, size: 8, color: COLOR.rule });
  drawText(
    page,
    `Page ${pageIndex + 1} of ${pageCount}`,
    pageWidth - margin() - 60,
    12,
    { font, size: 8, color: COLOR.rule },
  );

  void result; // reserved for per-page session info if needed
}

function drawSummaryPage(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  result: CalcResult,
) {
  const [pageWidth, pageHeight] = [page.getWidth(), page.getHeight()];
  let y = pageHeight - 60;

  drawText(page, 'Your kimono pattern', margin(), y, { font: fontBold, size: 22 });
  y -= 14;
  drawText(
    page,
    'Women’s basic (komon-style), based on your measurements.',
    margin(),
    y,
    { font, size: 11, color: COLOR.rule },
  );
  y -= 30;

  drawText(page, 'Measurements', margin(), y, { font: fontBold, size: 13 });
  y -= 14;

  const u = result.input.unit;
  const measurementRows: [string, string][] = [
    ['Unit', u],
    ['Height', `${result.input.height} ${u}`],
    ['Bust', `${result.input.bust} ${u}`],
    ['Waist', `${result.input.waist} ${u}`],
    ['Hip', `${result.input.hip} ${u}`],
    ['Shoulder width', `${result.input.shoulderWidth} ${u}`],
    ['Sleeve length', `${result.input.sleeveLength} ${u}`],
    ['Hem length', `${result.input.hemLength ?? result.input.height} ${u}`],
  ];

  for (const [k, v] of measurementRows) {
    drawText(page, k, margin(), y, { font, size: 10, color: COLOR.rule });
    drawText(page, v, margin() + 150, y, { font, size: 10 });
    y -= 14;
  }

  y -= 16;
  drawText(page, 'Derived dimensions (cm)', margin(), y, { font: fontBold, size: 13 });
  y -= 14;

  const d = result.derived;
  const derivedRows: [string, string][] = [
    ['Mitake (length)', `${d.mitakeCm} cm`],
    ['Yuki (shoulder→wrist)', `${d.yukiCm} cm`],
    ['Katahaba (back panel)', `${d.katahabaCm} cm`],
    ['Sodehaba (sleeve width)', `${d.sodehabaCm} cm`],
    ['Sodetake (sleeve drop)', `${d.sodetakeCm} cm`],
    ['Migohaba (body panel)', `${d.migohabaCm} cm`],
    ['Okumihaba (overlap)', `${d.okumihabaCm} cm`],
    ['Eri kataaki', `${d.eriKataakiCm} cm`],
    ['Eri length × width', `${d.eriLengthCm} × ${d.eriWidthCm} cm`],
    ['Wrap circumference', `${d.wrapCircumferenceCm} cm`],
  ];
  for (const [k, v] of derivedRows) {
    drawText(page, k, margin(), y, { font, size: 10, color: COLOR.rule });
    drawText(page, v, margin() + 200, y, { font, size: 10 });
    y -= 14;
  }

  y -= 16;
  drawText(page, 'Fabric plan', margin(), y, { font: fontBold, size: 13 });
  y -= 14;
  const fabricLabel = {
    traditional: 'Traditional tan-mono (~36 cm)',
    wide: 'Modern wide (110 cm)',
    custom: `Custom (${result.fabric.customWidth ?? '?'} cm)`,
  }[result.fabric.category];
  drawText(page, 'Fabric width', margin(), y, { font, size: 10, color: COLOR.rule });
  drawText(page, fabricLabel, margin() + 150, y, { font, size: 10 });
  y -= 14;
  drawText(page, 'Seam allowance', margin(), y, { font, size: 10, color: COLOR.rule });
  drawText(page, `${result.fabric.seamAllowance} cm`, margin() + 150, y, { font, size: 10 });
  y -= 14;
  drawText(page, 'Estimated yardage', margin(), y, { font, size: 10, color: COLOR.rule });
  drawText(page, `${result.yardageMetres} m`, margin() + 150, y, { font, size: 10 });

  if (result.warnings.length > 0) {
    y -= 28;
    drawText(page, 'Warnings', margin(), y, { font: fontBold, size: 13, color: COLOR.accent });
    y -= 14;
    for (const w of result.warnings) {
      const wrapped = wrapText(w, 78);
      for (const line of wrapped) {
        drawText(page, line, margin(), y, { font, size: 10, color: COLOR.accent });
        y -= 12;
      }
      y -= 4;
    }
  }
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    if ((current + ' ' + w).trim().length > maxChars) {
      if (current) lines.push(current);
      current = w;
    } else {
      current = current ? current + ' ' + w : w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawPiecePage(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  piece: PatternPieceRect,
  copyIndex: number,
) {
  const [pageWidth, pageHeight] = [page.getWidth(), page.getHeight()];
  const innerLeft = margin();
  const innerBottom = 36;
  const innerWidth = pageWidth - margin() * 2;
  const innerHeight = pageHeight - margin() - 60;

  // Title block
  drawText(page, piece.labelEn, innerLeft, pageHeight - 60, { font: fontBold, size: 16 });
  drawText(page, piece.labelJa, innerLeft, pageHeight - 76, { font, size: 11, color: COLOR.rule });
  drawText(
    page,
    `Cut size: ${piece.widthCm.toFixed(1)} cm × ${piece.heightCm.toFixed(1)} cm (incl. seam allowance) — copy ${copyIndex + 1} of ${piece.quantity}`,
    innerLeft,
    pageHeight - 92,
    { font, size: 9, color: COLOR.ink },
  );

  // True-size rectangle, scaled to fit the page.
  const pieceWPt = piece.widthCm * CM_TO_PT;
  const pieceHPt = piece.heightCm * CM_TO_PT;

  const fits = pieceWPt <= innerWidth && pieceHPt <= innerHeight - 50;
  if (fits) {
    // Centred, exact-scale piece
    const x = innerLeft + (innerWidth - pieceWPt) / 2;
    const y = innerBottom + 20;
    drawDashedRect(page, x, y, pieceWPt, pieceHPt, COLOR.faint);
    page.drawRectangle({
      x,
      y,
      width: pieceWPt,
      height: pieceHPt,
      borderColor: COLOR.indigo,
      borderWidth: 1,
    });
    // Grain arrow
    page.drawLine({
      start: { x: x + pieceWPt / 2, y: y + 14 },
      end: { x: x + pieceWPt / 2, y: y + pieceHPt - 14 },
      thickness: 0.75,
      color: COLOR.rule,
    });
    drawText(page, '↕ grain', x + pieceWPt / 2 + 4, y + pieceHPt / 2, { font, size: 8, color: COLOR.rule });

    const noteLines = wrapText(piece.note, 88);
    let ny = y + pieceHPt + 12;
    if (ny > pageHeight - 96) ny = pageHeight - 96;
    for (const line of noteLines) {
      drawText(page, line, innerLeft, ny, { font, size: 9, color: COLOR.rule });
      ny -= 11;
    }
  } else {
    // Tiled output: indicate that the piece needs to be printed across tiles.
    drawText(
      page,
      `This piece is larger than a single page. Print at 100 % scale and align with the crop marks.`,
      innerLeft,
      pageHeight - 110,
      { font, size: 10, color: COLOR.accent },
    );

    // Draw the portion of the piece that fits and add tile markers.
    const x = innerLeft;
    const y = innerBottom + 20;
    const drawW = Math.min(pieceWPt, innerWidth);
    const drawH = Math.min(pieceHPt, innerHeight - 60);
    page.drawRectangle({
      x,
      y,
      width: drawW,
      height: drawH,
      borderColor: COLOR.indigo,
      borderWidth: 1,
    });
    // Crop triangles in the corners of this tile
    for (const [cx, cy] of [
      [x, y],
      [x + drawW, y],
      [x, y + drawH],
      [x + drawW, y + drawH],
    ]) {
      page.drawCircle({ x: cx, y: cy, size: 3, color: COLOR.indigo });
    }
    // Note continuation
    drawText(
      page,
      `Tile shows ${(drawW / CM_TO_PT).toFixed(1)} × ${(drawH / CM_TO_PT).toFixed(1)} cm of a ${piece.widthCm} × ${piece.heightCm} cm piece.`,
      innerLeft,
      y - 14,
      { font, size: 9, color: COLOR.rule },
    );
  }
}

function drawCutChart(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  result: CalcResult,
) {
  const [pageWidth, pageHeight] = [page.getWidth(), page.getHeight()];
  let y = pageHeight - 60;
  drawText(page, 'Cut chart', margin(), y, { font: fontBold, size: 18 });
  y -= 14;

  const fabricCm = {
    traditional: 36,
    wide: 110,
    custom: result.fabric.customWidth ?? 110,
  }[result.fabric.category];

  drawText(
    page,
    `Layout for ${fabricCm} cm wide fabric. Pieces include ${result.fabric.seamAllowance} cm seam allowance.`,
    margin(),
    y,
    { font, size: 10, color: COLOR.rule },
  );
  y -= 24;

  // Schematic: vertical bolt running down the page, pieces stacked.
  const boltWidthPt = Math.min(pageWidth - margin() * 2 - 200, fabricCm * CM_TO_PT * 0.4);
  const boltX = margin();
  const boltScale = boltWidthPt / fabricCm;

  let currentY = y;

  for (const p of result.pieces) {
    const piecesAcross = Math.max(1, Math.floor(fabricCm / p.widthCm));
    const rows = Math.ceil(p.quantity / piecesAcross);
    const pieceH = p.heightCm * boltScale;
    const pieceW = p.widthCm * boltScale;

    for (let r = 0; r < rows; r++) {
      const inThisRow = Math.min(piecesAcross, p.quantity - r * piecesAcross);
      for (let c = 0; c < inThisRow; c++) {
        page.drawRectangle({
          x: boltX + c * pieceW,
          y: currentY - pieceH,
          width: pieceW,
          height: pieceH,
          borderColor: COLOR.indigo,
          borderWidth: 0.75,
        });
        drawText(
          page,
          p.labelEn.split(' ')[0],
          boltX + c * pieceW + 4,
          currentY - pieceH / 2,
          { font, size: 7, color: COLOR.rule },
        );
      }
      currentY -= pieceH + 2;
      if (currentY < 80) break;
    }
    if (currentY < 80) break;
  }

  // Side legend
  const legX = boltX + boltWidthPt + 24;
  let ly = y;
  drawText(page, 'Pieces', legX, ly, { font: fontBold, size: 11 });
  ly -= 14;
  for (const p of result.pieces) {
    drawText(page, `${p.labelEn} ×${p.quantity}`, legX, ly, { font, size: 9 });
    ly -= 11;
    drawText(page, `${p.widthCm} × ${p.heightCm} cm`, legX, ly, { font, size: 8, color: COLOR.rule });
    ly -= 14;
  }
  ly -= 6;
  drawText(page, 'Yardage estimate', legX, ly, { font: fontBold, size: 11 });
  ly -= 14;
  drawText(page, `${result.yardageMetres} m at ${fabricCm} cm wide`, legX, ly, { font, size: 9 });
  ly -= 12;
  drawText(page, 'Includes 10 % padding for matching and shrinkage.', legX, ly, {
    font,
    size: 8,
    color: COLOR.rule,
  });
}

const INSTRUCTIONS = [
  ['Prepare the fabric', 'Wash and dry your fabric the way you intend to wash the finished kimono. Press flat. Identify the grain — the lengthwise direction runs parallel to the selvedge.'],
  ['Cut the pieces', 'Lay out following the cut chart on page (cut-chart-page). Mark each piece on the wrong side with its name and a notch indicating the top edge. Cut with sharp shears — kimono fabric is unforgiving of fuzzy edges.'],
  ['Sew the back centre seam', 'Place the two back panels right sides together, matching the shoulder fold ends. Sew from the hem up to within a few centimetres of the top fold. Press the seam open.'],
  ['Join shoulders and add fronts', 'Open the back panels flat. Lay each front panel right side together to the corresponding back panel at the shoulder fold. Sew along the shoulder line. There is no shoulder *seam* — the fabric folds at the top.'],
  ['Attach the okumi', 'Sew the okumi panels to the leading edge of each front, from the desired collar break point down to the hem. Press toward the okumi.'],
  ['Set the sleeves', 'Fold each sleeve along the shoulder line (the fold becomes the sleeve top). Sew the sleeve underarm seam, leaving the cuff opening as specified. Pin and sew the sleeve to the body at the armscye.'],
  ['Attach the collar', 'Cut the collar opening (eri-kataaki) per the dimension on page 1. Pin the eri strip centred at the back neck, then bring it down both fronts. Fold lengthwise over itself, turning under the raw edge on the inside. Slip-stitch (kuke) to the inside.'],
  ['Add the over-collar (kake-eri)', 'Centre the kake-eri on top of the eri and slip-stitch along both long edges. This layer takes the wear at the back of the neck and can be replaced later.'],
  ['Hem the kimono', 'Turn under the bottom edge twice, encasing the raw edge. Slip-stitch invisibly. Press lightly.'],
  ['Press and finish', 'Press all seams away from the centre back, sleeves toward the body, and the okumi toward the front. Hang the finished garment over a wide bar so the shoulders set into their natural fold.'],
];

function drawInstructionsPages(
  pdf: PDFDocument,
  font: PDFFont,
  fontBold: PDFFont,
  size: PaperSize,
): PDFPage[] {
  const [pageW, pageH] = pageDimensions(size);
  const pages: PDFPage[] = [];
  let page = pdf.addPage([pageW, pageH]);
  pages.push(page);
  let y = pageH - 60;
  drawText(page, 'Sewing instructions', margin(), y, { font: fontBold, size: 18 });
  y -= 14;
  drawText(
    page,
    'Plain-language steps for assembling the pattern pieces. Each step assumes you have ironed and labelled the cut pieces.',
    margin(),
    y,
    { font, size: 10, color: COLOR.rule },
  );
  y -= 24;

  let step = 1;
  for (const [title, body] of INSTRUCTIONS) {
    if (y < 100) {
      page = pdf.addPage([pageW, pageH]);
      pages.push(page);
      y = pageH - 60;
    }
    drawText(page, `${step}. ${title}`, margin(), y, { font: fontBold, size: 12 });
    y -= 14;
    const wrapped = wrapText(body, 88);
    for (const line of wrapped) {
      drawText(page, line, margin(), y, { font, size: 10 });
      y -= 12;
    }
    y -= 8;
    step++;
  }

  return pages;
}

export async function generatePdf(
  result: CalcResult,
  size: PaperSize,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Komon Lab — Custom Kimono Pattern');
  pdf.setAuthor('Komon Lab');
  pdf.setSubject('Personal kimono pattern (women’s basic)');
  pdf.setProducer('Komon Lab pdf-lib generator');
  pdf.setCreator('komonlab.com');
  pdf.setCreationDate(new Date());

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const [pageW, pageH] = pageDimensions(size);
  const allPages: PDFPage[] = [];

  // Page 1: Summary
  const summary = pdf.addPage([pageW, pageH]);
  allPages.push(summary);
  drawSummaryPage(summary, font, fontBold, result);

  // Pages 2..N: pieces (one page per copy)
  for (const piece of result.pieces) {
    for (let c = 0; c < piece.quantity; c++) {
      const p = pdf.addPage([pageW, pageH]);
      allPages.push(p);
      drawPiecePage(p, font, fontBold, piece, c);
    }
  }

  // Cut chart
  const cut = pdf.addPage([pageW, pageH]);
  allPages.push(cut);
  drawCutChart(cut, font, fontBold, result);

  // Instructions (may span multiple pages)
  const instr = drawInstructionsPages(pdf, font, fontBold, size);
  allPages.push(...instr);

  // Header/footer on every page
  const total = allPages.length;
  allPages.forEach((p, idx) => {
    drawHeaderFooter(p, font, fontBold, pageW, pageH, idx, total, result);
  });

  return pdf.save();
}
