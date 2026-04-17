export interface CornerParseResult {
  setCode: string | null;
  number: string | null;
  total: string | null;
  regulationMark: string | null;
  language: string | null;
  illustrator: string | null;
  isSecretRare: boolean;
}

const LANGUAGES = ['EN', 'JP', 'DE', 'FR', 'IT', 'ES', 'PT'] as const;
const LANG_ALT = LANGUAGES.join('|');

export function parseCorner(raw: string): CornerParseResult {
  const text = raw.replace(/[|`]/g, '').trim();

  // Illustrator: "Illus. <name>" (case-insensitive, tolerate "IIlus."/"lllus.")
  const illusMatch = text.match(/I[Il1]lus\.\s+([^\n]+?)\s*$/im);
  const illustrator = illusMatch ? illusMatch[1].trim() : null;

  // number/total: first try N/N. Fall back to two space-separated numbers in
  // the 001..999 range, since Tesseract regularly drops the slash glyph on the
  // small collector-number line (observed: "POR i004 0551" for "POR EN 004/088").
  // Only accept this fallback when the pair looks plausible as number/total —
  // otherwise a stray year like "2026 Pokemon" would hijack the result.
  let number: string | null = null;
  let total: string | null = null;
  const slashMatch = text.match(/(\d{1,4})\s*\/\s*(\d{1,4})/);
  if (slashMatch) {
    number = normalizeNum(slashMatch[1]);
    total = normalizeNum(slashMatch[2]);
  } else {
    const spacedMatch = text.match(/\b(\d{3})\s+(\d{3})\b/);
    if (spacedMatch && Number(spacedMatch[1]) <= 999 && Number(spacedMatch[2]) <= 999) {
      number = normalizeNum(spacedMatch[1]);
      total = normalizeNum(spacedMatch[2]);
    }
  }

  // Set code + language: look for "<CODE> <LANG>" with space separation. Fall
  // back to "<CODE><LANG>" concatenated (observed when the kerning between
  // the set stamp and the language tag is tight, e.g. "POREN" or "PORN").
  // The concatenated fallback requires the code to be 2–5 uppercase chars and
  // the language to be in the allowlist.
  let setCode: string | null = null;
  let languageFromCode: string | null = null;
  const langLine = text.match(new RegExp(`\\b([A-Z][A-Za-z0-9]{1,4})\\s+(${LANG_ALT})\\b`));
  if (langLine) {
    setCode = langLine[1];
    languageFromCode = langLine[2];
  } else {
    const merged = text.match(new RegExp(`\\b([A-Z]{2,5})(${LANG_ALT})\\b`));
    if (merged) {
      setCode = merged[1];
      languageFromCode = merged[2];
    }
  }

  // Fallback for language when no set-code pair matched: scan anywhere.
  const languageAny = text.match(new RegExp(`\\b(${LANG_ALT})\\b`));
  const language = languageFromCode ?? (languageAny ? languageAny[1] : null);

  // Regulation mark: single uppercase letter at start of line, optionally
  // followed by spaces/dots before the set-code/lang pair. Tolerates both
  // spaced (`G    POR EN`) and merged (`G    POREN`) set+lang kerning.
  let regulationMark: string | null = null;
  const regMatch = text.match(
    new RegExp(
      `(?:^|\\n)\\s*([A-Z])(?:\\s|\\.|:)+\\s*[A-Z][A-Za-z0-9]{1,4}\\s*(${LANG_ALT})\\b`,
      'm',
    ),
  );
  if (regMatch) regulationMark = regMatch[1];

  const isSecretRare =
    number != null && total != null && Number(number) > Number(total);

  return { setCode, number, total, regulationMark, language, illustrator, isSecretRare };
}

function normalizeNum(s: string): string {
  return s.padStart(3, '0').replace(/^0+(?=\d{3,})/, '');
}
