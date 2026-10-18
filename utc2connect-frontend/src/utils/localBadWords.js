import { stripForLexicon } from './normalizeText';

const VIETNAMESE_BAD_WORDS = new Set([
  'ngu', 'địt', 'đụ', 'lồn', 'cặc', 'đm', 'vcl', 'đĩ', 'phò',
  'đcm', 'đmm', 'cc', 'cl', 'lol', 'lồz', 'cứt', 'bitch', 'fuck', 'shit',
  'loz', 'lon', 'cac', 'vkl', 'dkm', 'vl', 'ml', 'clgt', 'concac',
]);

const VIOLENT_PHRASES = ['đánh chết', 'giết', 'mẹ mày', 'bố mày', 'thằng ranh', 'đấm chết', 'đập chết'];

export function hasLocalToxicContent(rawText) {
  const textWithoutPunctuation = stripForLexicon(rawText);
  const words = textWithoutPunctuation.split(/\s+/).filter(Boolean);
  const hasBadWord = words.some((word) => VIETNAMESE_BAD_WORDS.has(word));
  const hasViolentPhrase = VIOLENT_PHRASES.some((phrase) => textWithoutPunctuation.includes(phrase));
  return hasBadWord || hasViolentPhrase;
}
