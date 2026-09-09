import { describe, expect, it } from 'vitest';

import { PRODUCT_CONFIGS } from '../config/products';
import { resolveProductSEO } from './seo';

describe('private product metadata', () => {
  it('keeps SagaCraft metadata neutral until the owner is verified', () => {
    expect(resolveProductSEO(PRODUCT_CONFIGS.sagacraft)).toEqual({
      title: 'Private workspace | Sixsmith Games',
      description: 'This private workspace is not publicly available.',
      url: 'https://sixsmithgames.com',
    });
  });

  it('restores SagaCraft metadata only after owner verification', () => {
    expect(resolveProductSEO(PRODUCT_CONFIGS.sagacraft, true)).toEqual({
      title: PRODUCT_CONFIGS.sagacraft.seoTitle,
      description: PRODUCT_CONFIGS.sagacraft.seoDescription,
      url: PRODUCT_CONFIGS.sagacraft.appUrl,
    });
  });

  it('leaves public product metadata unchanged', () => {
    expect(resolveProductSEO(PRODUCT_CONFIGS.gamemastercraft)).toEqual({
      title: PRODUCT_CONFIGS.gamemastercraft.seoTitle,
      description: PRODUCT_CONFIGS.gamemastercraft.seoDescription,
      url: PRODUCT_CONFIGS.gamemastercraft.appUrl,
    });
  });
});
