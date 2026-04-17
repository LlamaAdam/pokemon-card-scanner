export interface CornerFixture {
  label: string;
  ocrText: string;
  expected: {
    setCode: string | null;
    number: string | null;
    total: string | null;
    regulationMark: string | null;
    language: string | null;
    illustrator: string | null;
    isSecretRare: boolean;
  };
}

export const CORNER_FIXTURES: CornerFixture[] = [
  {
    label: 'Meowth ex illustration rare (secret)',
    ocrText: 'Illus. Natsumi Yoshida\nJ    POR EN\n121/088 ★★',
    expected: {
      setCode: 'POR', number: '121', total: '088',
      regulationMark: 'J', language: 'EN',
      illustrator: 'Natsumi Yoshida', isSecretRare: true,
    },
  },
  {
    label: 'Common from Obsidian Flames',
    ocrText: 'Illus. kawayoo\nG    OBF EN\n045/197',
    expected: {
      setCode: 'OBF', number: '045', total: '197',
      regulationMark: 'G', language: 'EN',
      illustrator: 'kawayoo', isSecretRare: false,
    },
  },
  {
    label: 'Japanese card',
    ocrText: 'Illus. 5ban Graphics\nH    SV5a JP\n073/066',
    expected: {
      setCode: 'SV5a', number: '073', total: '066',
      regulationMark: 'H', language: 'JP',
      illustrator: '5ban Graphics', isSecretRare: true,
    },
  },
  {
    label: 'Noisy OCR with stray punctuation',
    ocrText: 'IIlus. Ryuta Fuse|\nF  .  TEF  EN\n099/162  ',
    expected: {
      setCode: 'TEF', number: '099', total: '162',
      regulationMark: 'F', language: 'EN',
      illustrator: 'Ryuta Fuse', isSecretRare: false,
    },
  },
  {
    label: 'Number only — set code unreadable',
    ocrText: 'Illus. Unknown\n     EN\n015/198',
    expected: {
      setCode: null, number: '015', total: '198',
      regulationMark: null, language: 'EN',
      illustrator: 'Unknown', isSecretRare: false,
    },
  },
  {
    label: 'Complete garbage',
    ocrText: '@@@\n###\n!!!',
    expected: {
      setCode: null, number: null, total: null,
      regulationMark: null, language: null,
      illustrator: null, isSecretRare: false,
    },
  },
  {
    // Real-world failure: kerning between the set stamp and language tag is
    // tight on printed cards, and Tesseract routinely reads "POR EN" as
    // "POREN" on low-resolution scans. The parser must still pull set+lang.
    label: 'Merged set code and language (POREN)',
    ocrText: 'Illus. kawayoo\nG    POREN\n045/088',
    expected: {
      setCode: 'POR', number: '045', total: '088',
      regulationMark: 'G', language: 'EN',
      illustrator: 'kawayoo', isSecretRare: false,
    },
  },
  {
    // Real-world failure: the '/' glyph on the collector-number line is often
    // read as a space or a stray digit. When two 3-digit groups appear
    // adjacent, treat them as number/total.
    label: 'Collector number with missing slash',
    ocrText: 'Illus. Naoki Saito\nG    POR EN\n004 088',
    expected: {
      setCode: 'POR', number: '004', total: '088',
      regulationMark: 'G', language: 'EN',
      illustrator: 'Naoki Saito', isSecretRare: false,
    },
  },
];
