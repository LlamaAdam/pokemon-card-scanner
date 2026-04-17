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

  // number/total: first occurrence of N/N
  const numMatch = text.match(/(\d{1,4})\s*\/\s*(\d{1,4})/);
  const number = numMatch ? numMatch[1].padStart(3, '0').replace(/^0+(?=\d{3,})/, '') : null;
  const total = numMatch ? numMatch[2].padStart(3, '0').replace(/^0+(?=\d{3,})/, '') : null;

  // set code + language: look for "<CODE> <LANG>" where LANG is in allowlist
  // Allow mixed case in set code (e.g. SV5a) and tolerate stray punctuation before set code
  const langLine = text.match(new RegExp(`\\b([A-Z][A-Za-z0-9]{1,4})\\s+(${LANG_ALT})\\b`));
  const setCode = langLine ? langLine[1] : null;
  const languageFromCode = langLine ? langLine[2] : null;

  // fallback for language: scan anywhere
  const languageAny = text.match(new RegExp(`\\b(${LANG_ALT})\\b`));
  const language = languageFromCode ?? (languageAny ? languageAny[1] : null);

  // regulation mark: single uppercase letter at start of line, optionally followed
  // by spaces/dots before the set-code/lang pair — tightened to handle stray punctuation
  let regulationMark: string | null = null;
  const regMatch = text.match(
    new RegExp(`(?:^|\\n)\\s*([A-Z])(?:\\s|\\.|:)+\\s*[A-Z][A-Za-z0-9]{1,4}\\s+(${LANG_ALT})\\b`, 'm')
  );
  if (regMatch) regulationMark = regMatch[1];

  const isSecretRare =
    number != null && total != null && Number(number) > Number(total);

  return { setCode, number, total, regulationMark, language, illustrator, isSecretRare };
}
