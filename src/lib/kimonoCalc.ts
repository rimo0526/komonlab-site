/**
 * Komon Lab — women's basic kimono (komon-style) proportion calculator.
 *
 * Implementation note (charter §1, §3):
 *
 * The calculations below are written from first principles of traditional Japanese
 * wasai construction — that is, from the underlying *proportional relationships*
 * documented in general wasai pedagogy (panel-on-panel layout, mitake = body
 * height for the standard ohashori-bearing adult, yuki = nuki + sodehaba, four-
 * panel wrap with okumi overlap). No formulas, drafting tables, or sliding-scale
 * grading charts have been copied verbatim from Folkwear, DRCOS, or any other
 * named pattern company. Every constant has a documented origin in the comments
 * so the reasoning can be audited and disagreed with.
 *
 * All units internally are CENTIMETRES. Inputs accept cm or inches via a flag.
 *
 * Caveats — explicit, because pattern-cutting is high-trust work:
 *   - This MVP targets the women's basic ("ko-mon" / casual) lined or unlined
 *     kimono with standard ohashori. Furisode, men's, yukata, and child's
 *     variants are out of scope.
 *   - The numbers below produce a reasonable, sewable garment for someone
 *     near the middle of the size distribution. Bodies far outside that range
 *     should treat the output as a *starting muslin*, not a final pattern.
 *   - Ease values are deliberately conservative; the garment is wrap-style, so
 *     the wearer can re-tie the okumi overlap to fine-tune fit.
 */

export type Unit = 'cm' | 'in';

export type FabricWidthCategory =
  | 'traditional' // 35–38 cm tan-mono bolt (women's standard ~36 cm)
  | 'wide'        // modern Western fabric 110 cm+
  | 'custom';

export interface MeasurementInput {
  unit: Unit;
  height: number;
  bust: number;
  waist: number;
  hip: number;
  shoulderWidth: number; // shoulder-tip to shoulder-tip across the back
  sleeveLength: number;  // shoulder-tip to wrist along outstretched arm
  hemLength?: number;    // optional; if omitted, equals height
}

export interface FabricInput {
  category: FabricWidthCategory;
  /** Required if category === 'custom'. cm. */
  customWidth?: number;
  /** Seam allowance in cm. 1.5 cm matches traditional ~5 bu kuke. */
  seamAllowance: number;
}

export interface PatternPieceRect {
  /** Internal id. */
  id: string;
  /** Bilingual label. */
  labelEn: string;
  labelJa: string;
  /** Cut-to size in cm (before seam allowance). */
  widthCm: number;
  heightCm: number;
  /** Quantity to cut (e.g. 2 sleeves). */
  quantity: number;
  /** Grain direction note. */
  grain: 'lengthwise' | 'either';
  /** Short prose note printed in the PDF beside the piece. */
  note: string;
}

export interface DerivedDimensions {
  /** Mitake — total back length from collar to hem. */
  mitakeCm: number;
  /** Yuki — shoulder-tip-to-wrist on the made garment. */
  yukiCm: number;
  /** Katahaba — back panel width on each side of centre back. */
  katahabaCm: number;
  /** Sodehaba — sleeve width, top to opening. */
  sodehabaCm: number;
  /** Sodetake — sleeve drop (top of sleeve to sleeve hem). */
  sodetakeCm: number;
  /** Migohaba — width of each body panel. */
  migohabaCm: number;
  /** Okumihaba — width of the overlap panel. */
  okumihabaCm: number;
  /** Eri-kataaki — collar opening at the shoulder. */
  eriKataakiCm: number;
  /** Length of the collar (eri) strip. */
  eriLengthCm: number;
  /** Width of the collar strip before fold. */
  eriWidthCm: number;
  /** Estimated wrap circumference (covers hip + overlap). */
  wrapCircumferenceCm: number;
}

export interface CalcResult {
  input: MeasurementInput;
  fabric: FabricInput;
  derived: DerivedDimensions;
  pieces: PatternPieceRect[];
  /** Suggested total yardage in metres for the chosen fabric width. */
  yardageMetres: number;
  warnings: string[];
}

const IN_TO_CM = 2.54;

function toCm(v: number, unit: Unit): number {
  return unit === 'in' ? v * IN_TO_CM : v;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Validate inputs. Returns an array of human-readable error messages.
 * Empty array means valid.
 */
export function validate(input: MeasurementInput, fabric: FabricInput): string[] {
  const errors: string[] = [];
  const u = input.unit;
  const minH = u === 'cm' ? 130 : 51;
  const maxH = u === 'cm' ? 210 : 83;
  const minBust = u === 'cm' ? 60 : 24;
  const maxBust = u === 'cm' ? 140 : 55;

  if (!(input.height >= minH && input.height <= maxH))
    errors.push(`Height must be between ${minH} and ${maxH} ${u}.`);
  if (!(input.bust >= minBust && input.bust <= maxBust))
    errors.push(`Bust must be between ${minBust} and ${maxBust} ${u}.`);
  if (!(input.waist > 0 && input.waist < input.bust + (u === 'cm' ? 40 : 16)))
    errors.push('Waist must be positive and a plausible value relative to bust.');
  if (!(input.hip >= input.waist * 0.85))
    errors.push('Hip is unusually small relative to waist; please re-measure.');
  if (!(input.shoulderWidth > 0 && input.shoulderWidth < input.height / 2))
    errors.push('Shoulder width must be positive and less than half your height.');
  if (!(input.sleeveLength > 0))
    errors.push('Sleeve length (shoulder to wrist) must be positive.');

  if (fabric.category === 'custom') {
    if (!fabric.customWidth || fabric.customWidth < 30 || fabric.customWidth > 200)
      errors.push('Custom fabric width must be between 30 and 200 cm.');
  }
  if (!(fabric.seamAllowance >= 0.5 && fabric.seamAllowance <= 5))
    errors.push('Seam allowance must be between 0.5 and 5 cm.');

  return errors;
}

/**
 * Pick a working fabric width from the chosen category.
 */
function fabricWidthCm(fabric: FabricInput): number {
  switch (fabric.category) {
    case 'traditional':
      return 36; // representative tan-mono width for women's komon
    case 'wide':
      return 110;
    case 'custom':
      return fabric.customWidth ?? 110;
  }
}

/**
 * Derive every garment dimension from the input. All maths is per-piece
 * and proportional; no graded size chart is consulted.
 */
export function derive(input: MeasurementInput): DerivedDimensions {
  const u = input.unit;
  const heightCm = toCm(input.height, u);
  const bustCm = toCm(input.bust, u);
  const hipCm = toCm(input.hip, u);
  const shoulderCm = toCm(input.shoulderWidth, u);
  const sleeveLenCm = toCm(input.sleeveLength, u);
  const hemLenCm = input.hemLength ? toCm(input.hemLength, u) : heightCm;

  // Mitake: the made-up garment length, collar fold to hem. For women's kimono
  // worn with the ohashori tuck, this is conventionally equal to body height.
  // We allow the user to override via hemLength if they want a non-standard hem.
  const mitakeCm = hemLenCm;

  // Yuki: shoulder-tip-to-wrist along the made garment. We approximate the
  // anatomical nuki-to-wrist as (shoulder width / 2) + sleeve length.
  const yukiCm = shoulderCm / 2 + sleeveLenCm;

  // Sodehaba: sleeve width. The wasai rule of thumb is that the sleeve takes
  // roughly half of the yuki, with the back panel taking the other half.
  // We bias slightly toward the back to avoid sleeves that drag past the wrist.
  const sodehabaCm = round1(yukiCm * 0.48);
  const katahabaCm = round1(yukiCm - sodehabaCm);

  // Sodetake: sleeve drop. A common women's komon proportion is roughly
  // height × 0.30, with a floor of 48 cm and a ceiling of 56 cm. Values
  // outside that range produce silhouettes that read as furisode or child's,
  // which is out of scope for this MVP.
  const sodetakeRaw = heightCm * 0.30;
  const sodetakeCm = round1(Math.min(56, Math.max(48, sodetakeRaw)));

  // Migohaba: each body panel needs to wrap the hip with overlap. A women's
  // kimono has four body panels around the torso (2 back × 2 front) plus the
  // okumi overlap, so per-panel ≈ hip / 4. We add a small ease (1.5 cm) so
  // the front edges meet over the okumi without strain.
  const migohabaCm = round1(Math.max(bustCm, hipCm) / 4 + 1.5);

  // Okumihaba: the overlap strip. Convention is roughly 15 cm; we scale
  // gently with hip size so larger bodies get a proportional overlap.
  const okumihabaCm = round1(15 + (hipCm - 90) * 0.05);

  // Eri-kataaki: collar opening at the shoulder. Traditional ~8 cm.
  const eriKataakiCm = 8;

  // Eri (collar) strip. Length = neckline-to-hem run, doubled for the way
  // the collar wraps down both fronts. Width before fold = ~5.5 cm so the
  // finished collar lies at the conventional 2.5–2.8 cm.
  const eriLengthCm = round1(mitakeCm * 1.05);
  const eriWidthCm = 5.5;

  // Wrap circumference sanity figure: total fabric around the body once worn.
  const wrapCircumferenceCm = round1(migohabaCm * 4 + okumihabaCm * 2);

  return {
    mitakeCm: round1(mitakeCm),
    yukiCm: round1(yukiCm),
    katahabaCm,
    sodehabaCm,
    sodetakeCm,
    migohabaCm,
    okumihabaCm,
    eriKataakiCm,
    eriLengthCm,
    eriWidthCm,
    wrapCircumferenceCm,
  };
}

/**
 * Convert derived dimensions to a list of rectangles that need to be cut
 * from fabric. Each rectangle has seam allowance already added on all four
 * sides (the printable cut line includes the allowance; the stitch line is
 * drawn dashed in the PDF).
 */
export function pieces(
  d: DerivedDimensions,
  fabric: FabricInput,
): PatternPieceRect[] {
  const sa = fabric.seamAllowance;
  const dblSA = sa * 2;
  return [
    {
      id: 'body-back',
      labelEn: 'Back body panel',
      labelJa: '後身頃 (ushiro-migoro)',
      widthCm: round1(d.migohabaCm + dblSA),
      heightCm: round1(d.mitakeCm + dblSA),
      quantity: 2,
      grain: 'lengthwise',
      note: 'Joins along the centre-back seam. Top edge is the shoulder fold.',
    },
    {
      id: 'body-front',
      labelEn: 'Front body panel',
      labelJa: '前身頃 (mae-migoro)',
      widthCm: round1(d.migohabaCm + dblSA),
      heightCm: round1(d.mitakeCm + dblSA),
      quantity: 2,
      grain: 'lengthwise',
      note: 'One per side. Okumi attaches to the leading edge.',
    },
    {
      id: 'okumi',
      labelEn: 'Okumi (overlap panel)',
      labelJa: '衽 (okumi)',
      widthCm: round1(d.okumihabaCm + dblSA),
      heightCm: round1(d.mitakeCm + dblSA),
      quantity: 2,
      grain: 'lengthwise',
      note: 'Sewn to each front edge from collar point down to hem.',
    },
    {
      id: 'sleeve',
      labelEn: 'Sleeve',
      labelJa: '袖 (sode)',
      widthCm: round1(d.sodehabaCm + dblSA),
      heightCm: round1(d.sodetakeCm * 2 + dblSA), // sleeve is cut on the fold
      quantity: 2,
      grain: 'lengthwise',
      note: 'Cut on the fold along the shoulder line; the fold becomes the sleeve top.',
    },
    {
      id: 'eri',
      labelEn: 'Collar (eri)',
      labelJa: '衿 (eri)',
      widthCm: round1(d.eriWidthCm * 2 + dblSA), // folded in half lengthwise
      heightCm: round1(d.eriLengthCm + dblSA),
      quantity: 1,
      grain: 'lengthwise',
      note: 'Single strip folded in half along its length before attaching.',
    },
    {
      id: 'kake-eri',
      labelEn: 'Over-collar (kake-eri)',
      labelJa: '掛衿 (kake-eri)',
      widthCm: round1(d.eriWidthCm * 2 + dblSA),
      heightCm: round1(d.eriLengthCm * 0.4 + dblSA),
      quantity: 1,
      grain: 'lengthwise',
      note: 'Decorative + protective layer over the collar centre.',
    },
  ];
}

/**
 * Estimate total yardage needed at the chosen fabric width. The estimate
 * lays pieces lengthwise on the bolt with no rotation, accumulates their
 * heights, and pads 10 % for matching, mistakes, and shrinkage.
 */
export function estimateYardage(
  pieces: PatternPieceRect[],
  fabric: FabricInput,
): number {
  const widthCm = fabricWidthCm(fabric);
  // How many panels fit side-by-side at this width?
  let totalLengthCm = 0;
  for (const p of pieces) {
    const piecesAcross = Math.max(1, Math.floor(widthCm / p.widthCm));
    const rows = Math.ceil(p.quantity / piecesAcross);
    totalLengthCm += rows * p.heightCm;
  }
  const padded = totalLengthCm * 1.1;
  return Math.round(padded) / 100; // metres
}

/**
 * Top-level entry point. Validates, computes, and returns the full result.
 * Throws on validation failure with the joined messages — callers should
 * pre-validate using `validate()` for nicer field-level errors.
 */
export function compute(
  input: MeasurementInput,
  fabric: FabricInput,
): CalcResult {
  const errors = validate(input, fabric);
  if (errors.length > 0) throw new Error(errors.join(' '));

  const derived = derive(input);
  const ps = pieces(derived, fabric);
  const yardageMetres = estimateYardage(ps, fabric);

  const warnings: string[] = [];
  const fabricWidth = fabricWidthCm(fabric);
  const widestPiece = Math.max(...ps.map((p) => p.widthCm));
  if (widestPiece > fabricWidth) {
    warnings.push(
      `Some pieces (widest: ${widestPiece} cm) exceed your fabric width (${fabricWidth} cm). ` +
        'They will need to be pieced, or you will need wider fabric.',
    );
  }
  if (derived.yukiCm > 73) {
    warnings.push(
      `Your computed yuki (${derived.yukiCm} cm) is above the typical adult women's range. ` +
        'Double-check your shoulder and sleeve measurements.',
    );
  }
  if (derived.mitakeCm < 140) {
    warnings.push(
      `Mitake (${derived.mitakeCm} cm) is short for an ohashori-style fit. ` +
        'Consider increasing hem length or sewing without the tuck.',
    );
  }

  return { input, fabric, derived, pieces: ps, yardageMetres, warnings };
}

/** Helper for the UI: format a measurement back to the chosen unit. */
export function formatLength(cm: number, unit: Unit): string {
  if (unit === 'in') {
    const inches = cm / IN_TO_CM;
    return `${inches.toFixed(1)} in`;
  }
  return `${cm.toFixed(1)} cm`;
}
