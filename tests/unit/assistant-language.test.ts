import { describe, expect, it } from 'vitest';
import {
  detectAssistantLanguage,
  detectHindiScript,
  resolveAssistantLanguageConfig,
} from '@/lib/assistant-language';

describe('assistant language detection', () => {
  it('detects Devanagari Hindi text', () => {
    expect(detectHindiScript('आज कितना पैसा आया?')).toBe('devanagari');
    expect(detectAssistantLanguage('आज कितना पैसा आया?')).toBe('hi');
  });

  it('detects romanized Hindi when multiple business keywords are present', () => {
    expect(detectAssistantLanguage('aaj kitna paisa jama hua')).toBe('hi');
  });

  it('defaults to English for ordinary English prompts', () => {
    expect(detectAssistantLanguage('show me the sales dashboard')).toBe('en');
  });

  it('honors explicit language hints', () => {
    expect(detectAssistantLanguage('show customers', 'hi')).toBe('hi');
    expect(detectAssistantLanguage('aaj ka hisaab batao', 'en')).toBe('en');
  });

  it('returns script only for Hindi responses', () => {
    expect(resolveAssistantLanguageConfig('kitna paisa aaj jama hua')).toEqual({
      language: 'hi',
      script: 'roman',
    });
    expect(resolveAssistantLanguageConfig('show invoices')).toEqual({
      language: 'en',
      script: undefined,
    });
  });
});
