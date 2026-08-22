import { describe, expect, it } from 'vitest';
import {
  editDistance,
  fuzzyCandidateTokens,
  inventoryFuzzyTokens,
  scoreInventorySearch,
} from '@/lib/inventory-search';

const tataBrake = {
  itemName: 'FRONT BRAKE PAD',
  itemNumber: 'BP-104',
  uniqueCode: 'RACK-A-12',
  brand: 'TATA',
  location: 'FRONT SHELF',
  description: 'CERAMIC DISC PAD',
  supplier: 'METRO SUPPLIES',
};

describe('inventory fuzzy search', () => {
  it('treats an adjacent transposition as one edit', () => {
    expect(editDistance('brkae', 'brake')).toBe(1);
  });

  it('finds spelling mistakes but rejects unrelated inventory', () => {
    expect(scoreInventorySearch(tataBrake, 'brkae')).toBeGreaterThan(0.42);
    expect(scoreInventorySearch(tataBrake, 'engine oil')).toBe(0);
  });

  it('matches query terms across brand, item name, and location', () => {
    expect(scoreInventorySearch(tataBrake, 'tata brake front shelf')).toBeGreaterThan(0.7);
  });

  it('ranks an exact item code above a partial name match', () => {
    expect(scoreInventorySearch(tataBrake, 'BP104')).toBeGreaterThan(
      scoreInventorySearch(tataBrake, 'brak')
    );
  });

  it('shares n-gram candidates for a transposed word', () => {
    const indexed = new Set(inventoryFuzzyTokens(tataBrake));
    expect(fuzzyCandidateTokens('brkae').some((token) => indexed.has(token))).toBe(true);
  });

  it('shares candidates when searching by the last digits of a long item number', () => {
    const indexed = new Set(inventoryFuzzyTokens({ itemNumber: '1234530145' }));
    const shared = fuzzyCandidateTokens('0145').filter((token) => indexed.has(token));

    expect(shared).toEqual(expect.arrayContaining(['~014', '~145']));
    expect(scoreInventorySearch({ itemNumber: '1234530145' }, '30145')).toBeGreaterThan(0.42);
  });
});
