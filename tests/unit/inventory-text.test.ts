import { describe, expect, it } from 'vitest';
import { uppercaseInventoryPayload } from '@/lib/inventory-text';

describe('uppercaseInventoryPayload', () => {
  it('uppercases persisted inventory text fields while preserving other values', () => {
    const payload = {
      itemName: 'brake pad',
      itemNumber: 'bp-104',
      uniqueCode: 'rack-a-12',
      location: 'ground shelf',
      unitOfMeasure: 'pcs',
      brand: 'bosch',
      description: 'front wheel set',
      supplier: 'metro supplies',
      quantity: 12,
      partImages: ['https://res.cloudinary.com/demo/image/upload/part.jpg'],
    };

    expect(uppercaseInventoryPayload(payload)).toEqual({
      ...payload,
      itemName: 'BRAKE PAD',
      itemNumber: 'BP-104',
      uniqueCode: 'RACK-A-12',
      location: 'GROUND SHELF',
      brand: 'BOSCH',
      description: 'FRONT WHEEL SET',
      supplier: 'METRO SUPPLIES',
    });
  });
});
