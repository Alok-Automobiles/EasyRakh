import { describe, expect, it } from 'vitest';
import {
  cloudinaryAssetFromUrl,
  cloudinaryAssetsFromFields,
} from '@/lib/cloudinary-cleanup';

describe('cloudinary cleanup helpers', () => {
  it('builds refs from stored public ids and infers raw PDFs from URLs', () => {
    expect(
      cloudinaryAssetsFromFields({
        publicIds: ['ledger-bills/user-1/bill.pdf'],
        urls: ['https://res.cloudinary.com/demo/raw/upload/v123/ledger-bills/user-1/bill.pdf'],
      })
    ).toEqual([
      {
        publicId: 'ledger-bills/user-1/bill.pdf',
        resourceType: 'raw',
      },
    ]);
  });

  it('parses legacy image URLs when public ids were not persisted', () => {
    expect(
      cloudinaryAssetFromUrl(
        'https://res.cloudinary.com/demo/image/upload/v123/ledger-bills/user-1/part-photo.jpg'
      )
    ).toEqual({
      publicId: 'ledger-bills/user-1/part-photo',
      resourceType: 'image',
    });
  });
});
