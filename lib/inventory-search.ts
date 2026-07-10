import type { InventoryItem } from './types';
import { normalizeSearchText } from './search-normalization';

const FIELD_WEIGHTS: Array<{
  field: keyof Pick<
    InventoryItem,
    'itemName' | 'itemNumber' | 'uniqueCode' | 'brand' | 'description' | 'location' | 'supplier'
  >;
  weight: number;
}> = [
  { field: 'itemNumber', weight: 1.08 },
  { field: 'uniqueCode', weight: 1.05 },
  { field: 'itemName', weight: 1 },
  { field: 'brand', weight: 0.92 },
  { field: 'location', weight: 0.75 },
  { field: 'description', weight: 0.68 },
  { field: 'supplier', weight: 0.6 },
];

function compact(value: string) {
  return normalizeSearchText(value).replace(/\s+/g, '');
}

/**
 * Damerau-Levenshtein (optimal string alignment) distance. In addition to
 * insert/delete/replace, this treats a common adjacent-key transposition as
 * one typo (for example, "brkae" -> "brake").
 */
export function editDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;

  const rows = Array.from({ length: left.length + 1 }, () =>
    new Array<number>(right.length + 1).fill(0)
  );

  for (let i = 0; i <= left.length; i += 1) rows[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) rows[0][j] = j;

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + substitutionCost
      );

      if (
        i > 1 &&
        j > 1 &&
        left[i - 1] === right[j - 2] &&
        left[i - 2] === right[j - 1]
      ) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
  }

  return rows[left.length][right.length];
}

function similarity(query: string, target: string): number {
  if (!query || !target) return 0;
  if (query === target) return 1;

  if (query.length >= 2 && target.startsWith(query)) return 0.94;
  if (query.length >= 3 && target.includes(query)) return 0.86;

  // Very short words produce too many accidental fuzzy matches.
  if (query.length < 3 || target.length < 3) return 0;

  const longest = Math.max(query.length, target.length);
  const allowedDistance = longest <= 4 ? 1 : longest <= 8 ? 2 : 3;
  const distance = editDistance(query, target);
  if (distance > allowedDistance) return 0;

  const ratio = 1 - distance / longest;
  return ratio >= 0.6 ? ratio * 0.88 : 0;
}

export function inventoryQueryTokens(query: string): string[] {
  return normalizeSearchText(query)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 10);
}

function ngrams(value: string): string[] {
  const normalized = compact(value);
  if (normalized.length < 2) return normalized ? [`~${normalized}`] : [];

  const grams = new Set<string>();
  const size = normalized.length <= 5 ? 2 : 3;
  for (let index = 0; index <= normalized.length - size; index += 1) {
    grams.add(`~${normalized.slice(index, index + size)}`);
  }
  return Array.from(grams);
}

/** Indexed candidate tokens used before the more expensive fuzzy ranker. */
export function inventoryFuzzyTokens(item: Partial<InventoryItem>): string[] {
  const tokens = new Set<string>();
  for (const { field } of FIELD_WEIGHTS) {
    const value = String(item[field] || '');
    const words = normalizeSearchText(value).split(/\s+/).filter(Boolean);
    for (const word of words) ngrams(word).forEach((gram) => tokens.add(gram));
    ngrams(words.join('')).forEach((gram) => tokens.add(gram));
  }
  return Array.from(tokens).slice(0, 300);
}

export function fuzzyCandidateTokens(query: string): string[] {
  const words = inventoryQueryTokens(query);
  const tokens = new Set<string>();
  for (const word of words) ngrams(word).forEach((gram) => tokens.add(gram));
  ngrams(words.join('')).forEach((gram) => tokens.add(gram));
  return Array.from(tokens).slice(0, 60);
}

/**
 * Scores all query words across all useful inventory fields. This means a
 * query such as "tata brake" can match TATA in brand and BRAKE in item name,
 * while exact item numbers and codes receive the strongest ranking.
 */
export function scoreInventorySearch(item: Partial<InventoryItem>, query: string): number {
  const queryTokens = inventoryQueryTokens(query);
  if (queryTokens.length === 0) return 0;

  const fields = FIELD_WEIGHTS.map(({ field, weight }) => {
    const normalized = normalizeSearchText(item[field]);
    return {
      normalized,
      compact: normalized.replace(/\s+/g, ''),
      words: normalized.split(/\s+/).filter(Boolean),
      weight,
    };
  }).filter(({ normalized }) => normalized.length > 0);

  let total = 0;
  let matched = 0;

  for (const queryToken of queryTokens) {
    const compactQuery = compact(queryToken);
    let best = 0;

    for (const field of fields) {
      for (const word of field.words) {
        best = Math.max(best, similarity(queryToken, word) * field.weight);
      }
      if (compactQuery.length >= 2) {
        best = Math.max(best, similarity(compactQuery, field.compact) * field.weight);
      }
    }

    if (best >= 0.42) matched += 1;
    total += best;
  }

  // Avoid weak one-word coincidences for a multi-word search.
  const coverage = matched / queryTokens.length;
  if (coverage < 0.6) return 0;

  let score = (total / queryTokens.length) * (0.75 + coverage * 0.25);
  const normalizedQuery = normalizeSearchText(query);
  const compactQuery = compact(query);

  for (const field of fields) {
    if (field.normalized === normalizedQuery || field.compact === compactQuery) {
      score += 0.3 * field.weight;
    } else if (
      normalizedQuery.length >= 3 &&
      (field.normalized.startsWith(normalizedQuery) || field.compact.startsWith(compactQuery))
    ) {
      score += 0.14 * field.weight;
    }
  }

  return score;
}
