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
];
