export type AssistantLanguage = 'hi' | 'en';
export type AssistantLanguageHint = 'auto' | 'hi' | 'en';
export type AssistantHindiScript = 'roman' | 'devanagari';

const HINDI_SCRIPT_REGEX = /[\u0900-\u097F]/;
const HINDI_KEYWORDS = [
  'kya',
  'hai',
  'ka',
  'ki',
  'ke',
  'ko',
  'se',
  'mein',
  'aur',
  'bhi',
  'batao',
  'dikhao',
  'dena',
  'lena',
  'kitna',
  'aaj',
  'kal',
  'parso',
  'haan',
  'nahi',
  'nahin',
  'khata',
  'paisa',
  'rupay',
  'rupaye',
  'jama',
  'udhar',
  'grahak',
  'kharcha',
  'bech',
  'bikri',
  'hisab',
  'hisaab',
  'jod',
  'likh',
  'dikhana',
];

export function detectHindiScript(text: string): AssistantHindiScript {
  return HINDI_SCRIPT_REGEX.test(text) ? 'devanagari' : 'roman';
}

export function detectAssistantLanguage(
  text: string,
  languageHint: AssistantLanguageHint = 'auto'
): AssistantLanguage {
  if (languageHint === 'hi' || languageHint === 'en') {
    return languageHint;
  }

  if (HINDI_SCRIPT_REGEX.test(text)) {
    return 'hi';
  }

  const lowerText = text.toLowerCase();
  let matchedKeywordCount = 0;

  for (const keyword of HINDI_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      matchedKeywordCount += 1;
    }
  }

  return matchedKeywordCount >= 2 ? 'hi' : 'en';
}

export function resolveAssistantLanguageConfig(
  text: string,
  languageHint: AssistantLanguageHint = 'auto'
) {
  const language = detectAssistantLanguage(text, languageHint);

  return {
    language,
    script: language === 'hi' ? detectHindiScript(text) : undefined,
  };
}
