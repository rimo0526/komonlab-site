/** @jsxImportSource preact */
import { useState, useMemo } from 'preact/hooks';
import {
  compute,
  validate,
  formatLength,
  type MeasurementInput,
  type FabricInput,
  type Unit,
  type FabricWidthCategory,
  type CalcResult,
} from '../lib/kimonoCalc';
import { generatePdf, type PaperSize } from '../lib/pdfGenerator';

// Sensible defaults — average women's adult, metric
const DEFAULTS_CM: Omit<MeasurementInput, 'unit'> = {
  height: 160,
  bust: 85,
  waist: 70,
  hip: 92,
  shoulderWidth: 40,
  sleeveLength: 52,
  hemLength: 160,
};

const DEFAULTS_IN: Omit<MeasurementInput, 'unit'> = {
  height: 63,
  bust: 33.5,
  waist: 27.5,
  hip: 36,
  shoulderWidth: 15.7,
  sleeveLength: 20.5,
  hemLength: 63,
};

interface FieldErrors {
  [key: string]: string;
}

export default function KimonoPatternTool() {
  const [unit, setUnit] = useState<Unit>('cm');
  const [m, setM] = useState<Omit<MeasurementInput, 'unit'>>(DEFAULTS_CM);
  const [garmentType, setGarmentType] = useState<'womens-basic' | 'mens' | 'yukata'>('womens-basic');
  const [fabricCat, setFabricCat] = useState<FabricWidthCategory>('wide');
  const [customWidth, setCustomWidth] = useState<number>(110);
  const [seamAllowance, setSeamAllowance] = useState<number>(1.5);
  const [paperSize, setPaperSize] = useState<PaperSize>('A4');

  const [result, setResult] = useState<CalcResult | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState<boolean>(false);
  const [downloaded, setDownloaded] = useState<string | null>(null);

  const handleUnitChange = (next: Unit) => {
    if (next === unit) return;
    setUnit(next);
    setM(next === 'cm' ? DEFAULTS_CM : DEFAULTS_IN);
    setResult(null);
    setDownloaded(null);
  };

  const update = <K extends keyof typeof m>(key: K, value: number) => {
    setM((prev) => ({ ...prev, [key]: value }));
    setDownloaded(null);
    setResult(null);
  };

  const fabric: FabricInput = useMemo(
    () => ({
      category: fabricCat,
      customWidth: fabricCat === 'custom' ? customWidth : undefined,
      seamAllowance,
    }),
    [fabricCat, customWidth, seamAllowance],
  );

  const input: MeasurementInput = useMemo(() => ({ unit, ...m }), [unit, m]);

  const liveErrors = useMemo(() => validate(input, fabric), [input, fabric]);

  const handleGenerate = async () => {
    if (garmentType !== 'womens-basic') {
      setErrors(['Only the women’s basic style is available in this MVP. Men’s and yukata are coming soon.']);
      return;
    }
    const errs = validate(input, fabric);
    if (errs.length > 0) {
      setErrors(errs);
      return;
    }
    setErrors([]);
    setBusy(true);
    try {
      const r = compute(input, fabric);
      setResult(r);
      const bytes = await generatePdf(r, paperSize);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `komonlab-pattern-${paperSize.toLowerCase()}-${new Date()
        .toISOString()
        .slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoke after a short delay to allow the browser to start the download.
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setDownloaded(a.download);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrors([msg]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="grid gap-10 lg:grid-cols-5">
      {/* Form */}
      <form
        class="lg:col-span-3 space-y-8"
        onSubmit={(e) => {
          e.preventDefault();
          void handleGenerate();
        }}
        aria-label="Kimono pattern measurements"
      >
        {/* Unit */}
        <fieldset class="rounded-lg border border-ink-200 bg-white/60 p-5">
          <legend class="px-2 text-sm font-medium text-ink-600">Units</legend>
          <div class="mt-2 flex gap-6">
            {(['cm', 'in'] as Unit[]).map((u) => (
              <label class="flex items-center gap-2">
                <input
                  type="radio"
                  name="unit"
                  checked={unit === u}
                  onChange={() => handleUnitChange(u)}
                  class="h-4 w-4 accent-indigo-700"
                />
                <span class="text-sm">{u === 'cm' ? 'Centimetres (cm)' : 'Inches (in)'}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Garment type */}
        <fieldset class="rounded-lg border border-ink-200 bg-white/60 p-5">
          <legend class="px-2 text-sm font-medium text-ink-600">Garment type</legend>
          <div class="mt-2 grid gap-2 sm:grid-cols-3">
            <label class="flex items-center gap-2 rounded border border-ink-200 bg-ivory p-3">
              <input
                type="radio"
                checked={garmentType === 'womens-basic'}
                onChange={() => setGarmentType('womens-basic')}
                class="h-4 w-4 accent-indigo-700"
              />
              <span class="text-sm">Women’s basic</span>
            </label>
            <label class="flex items-center gap-2 rounded border border-ink-200 bg-ink-50 p-3 opacity-60">
              <input type="radio" checked={false} disabled class="h-4 w-4" />
              <span class="text-sm">Men’s <em class="text-xs text-ink-400">(soon)</em></span>
            </label>
            <label class="flex items-center gap-2 rounded border border-ink-200 bg-ink-50 p-3 opacity-60">
              <input type="radio" checked={false} disabled class="h-4 w-4" />
              <span class="text-sm">Yukata <em class="text-xs text-ink-400">(soon)</em></span>
            </label>
          </div>
        </fieldset>

        {/* Measurements */}
        <fieldset class="rounded-lg border border-ink-200 bg-white/60 p-5">
          <legend class="px-2 text-sm font-medium text-ink-600">Your measurements ({unit})</legend>
          <div class="mt-3 grid gap-4 sm:grid-cols-2">
            {([
              ['height', 'Height', 'Top of head to floor, bare feet.'],
              ['bust', 'Bust', 'Around the fullest part.'],
              ['waist', 'Waist', 'Around the natural waist.'],
              ['hip', 'Hip', 'Around the widest part.'],
              ['shoulderWidth', 'Shoulder width', 'Tip to tip across the back.'],
              ['sleeveLength', 'Sleeve length', 'Shoulder tip to wrist, arm out.'],
              ['hemLength', 'Hem length', 'Optional. Defaults to height.'],
            ] as const).map(([key, label, hint]) => (
              <label class="flex flex-col gap-1">
                <span class="text-sm font-medium text-ink-700">
                  {label} <span class="text-ink-400 font-normal">({unit})</span>
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="0"
                  value={m[key as keyof typeof m] ?? ''}
                  onInput={(e) => {
                    const v = parseFloat((e.target as HTMLInputElement).value);
                    update(key as keyof typeof m, isNaN(v) ? 0 : v);
                  }}
                  class="rounded border border-ink-300 bg-ivory px-3 py-2 text-base focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  aria-describedby={`hint-${key}`}
                />
                <span id={`hint-${key}`} class="text-xs text-ink-400">{hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Fabric */}
        <fieldset class="rounded-lg border border-ink-200 bg-white/60 p-5">
          <legend class="px-2 text-sm font-medium text-ink-600">Fabric</legend>
          <div class="mt-2 grid gap-2 sm:grid-cols-3">
            {([
              ['traditional', 'Traditional 35–38 cm', 'tan-mono bolt'],
              ['wide', 'Modern wide 110 cm+', 'Western fabric'],
              ['custom', 'Custom width', 'enter cm below'],
            ] as const).map(([val, label, hint]) => (
              <label class="flex items-start gap-2 rounded border border-ink-200 bg-ivory p-3">
                <input
                  type="radio"
                  name="fabric"
                  checked={fabricCat === val}
                  onChange={() => setFabricCat(val)}
                  class="mt-1 h-4 w-4 accent-indigo-700"
                />
                <span>
                  <span class="block text-sm font-medium text-ink-700">{label}</span>
                  <span class="block text-xs text-ink-400">{hint}</span>
                </span>
              </label>
            ))}
          </div>

          {fabricCat === 'custom' && (
            <label class="mt-4 flex flex-col gap-1">
              <span class="text-sm font-medium text-ink-700">Custom width (cm)</span>
              <input
                type="number"
                step="1"
                min="30"
                max="200"
                value={customWidth}
                onInput={(e) => setCustomWidth(parseFloat((e.target as HTMLInputElement).value) || 0)}
                class="w-32 rounded border border-ink-300 bg-ivory px-3 py-2"
              />
            </label>
          )}

          <label class="mt-4 flex flex-col gap-1">
            <span class="text-sm font-medium text-ink-700">Seam allowance (cm)</span>
            <input
              type="number"
              step="0.1"
              min="0.5"
              max="5"
              value={seamAllowance}
              onInput={(e) => setSeamAllowance(parseFloat((e.target as HTMLInputElement).value) || 1.5)}
              class="w-32 rounded border border-ink-300 bg-ivory px-3 py-2"
            />
            <span class="text-xs text-ink-400">1.5 cm matches the traditional ~5 bu allowance.</span>
          </label>
        </fieldset>

        {/* Paper size */}
        <fieldset class="rounded-lg border border-ink-200 bg-white/60 p-5">
          <legend class="px-2 text-sm font-medium text-ink-600">PDF page size</legend>
          <div class="mt-2 flex gap-6">
            {(['A4', 'Letter'] as PaperSize[]).map((s) => (
              <label class="flex items-center gap-2">
                <input
                  type="radio"
                  name="paper"
                  checked={paperSize === s}
                  onChange={() => setPaperSize(s)}
                  class="h-4 w-4 accent-indigo-700"
                />
                <span class="text-sm">{s}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Errors */}
        {errors.length > 0 && (
          <div role="alert" class="rounded border border-accent/40 bg-accent/5 p-4 text-sm text-accent">
            <p class="font-medium">Please check the following:</p>
            <ul class="mt-2 list-disc pl-5">
              {errors.map((e) => <li>{e}</li>)}
            </ul>
          </div>
        )}

        <button
          type="submit"
          disabled={busy || liveErrors.length > 0}
          class="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Generating PDF…' : 'Generate PDF'}
        </button>

        {downloaded && (
          <p role="status" class="text-sm text-indigo-700">
            Downloaded <code class="font-mono text-xs">{downloaded}</code>. If your browser blocked
            it, check your downloads folder.
          </p>
        )}
      </form>

      {/* Live summary */}
      <aside class="lg:col-span-2 space-y-4">
        <div class="sticky top-20 rounded-lg border border-ink-200 bg-white/60 p-5">
          <p class="eyebrow">Live preview</p>
          <p class="mt-2 font-serif text-lg text-sumi">
            {liveErrors.length === 0
              ? 'Looks good — your derived dimensions are below.'
              : 'Adjust the highlighted fields to enable the PDF.'}
          </p>

          {liveErrors.length === 0 ? (
            <LivePreview input={input} fabric={fabric} />
          ) : (
            <ul class="mt-3 list-disc pl-5 text-sm text-accent">
              {liveErrors.map((e) => <li>{e}</li>)}
            </ul>
          )}

          <p class="mt-4 text-xs text-ink-400">
            Measurements stay in your browser. Nothing is sent to a server.
          </p>
        </div>
      </aside>
    </div>
  );
}

function LivePreview({ input, fabric }: { input: MeasurementInput; fabric: FabricInput }) {
  const r = useMemo(() => {
    try {
      return compute(input, fabric);
    } catch {
      return null;
    }
  }, [input, fabric]);
  if (!r) return null;
  const rows: [string, string][] = [
    ['Mitake', formatLength(r.derived.mitakeCm, input.unit)],
    ['Yuki', formatLength(r.derived.yukiCm, input.unit)],
    ['Sleeve drop', formatLength(r.derived.sodetakeCm, input.unit)],
    ['Body panel', formatLength(r.derived.migohabaCm, input.unit)],
    ['Okumi width', formatLength(r.derived.okumihabaCm, input.unit)],
    ['Yardage', `${r.yardageMetres} m`],
  ];
  return (
    <dl class="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
      {rows.map(([k, v]) => (
        <>
          <dt class="text-ink-500">{k}</dt>
          <dd class="text-right font-mono text-ink-800">{v}</dd>
        </>
      ))}
    </dl>
  );
}
