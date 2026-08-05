import { ImageRanker } from '../backend/src/modules/image-ranker/image-ranker';
import { ImageCandidate, ImageFile, ImageSelectionConfig } from '../backend/src/types';
import { makeProduct } from './helpers';

function makeCandidate(overrides: Partial<ImageCandidate> = {}): ImageCandidate {
  return {
    filename: 'default.jpg',
    path: 'dirA/default.jpg',
    format: 'jpeg',
    size_in_bytes: 500000,
    width: 1280,
    height: 720,
    score: 0.5,
    ...overrides
  };
}

function ranker(maxImages = 2): ImageRanker {
  const config: ImageSelectionConfig = { max_images_per_product: maxImages };
  return new ImageRanker(config);
}

describe('ImageRanker', () => {
  describe('rankProductImages', () => {
    it('returns an empty list when there are no candidates', () => {
      const product = makeProduct({ id: 'p1' });

      expect(ranker().rankProductImages(product, [], [])).toEqual([]);
    });

    it('sorts candidates by rank score and respects max_images_per_product', () => {
      const candidates: ImageCandidate[] = [
        makeCandidate({ filename: 'a.jpg', path: 'dirA/a.jpg', score: 0.9, size_in_bytes: 1000000, width: 1920, height: 1080 }),
        makeCandidate({ filename: 'quite-long-filename.jpg', path: 'dirB/quite-long-filename.jpg', score: 0.5, size_in_bytes: 500000, width: 1280, height: 720 }),
        makeCandidate({ filename: 'another-one.jpg', path: 'dirC/another-one.jpg', score: 0.3, size_in_bytes: 100000, width: 800, height: 600 })
      ];

      const product = makeProduct({ id: 'p1' });
      const selected = ranker(2).rankProductImages(product, candidates, candidates);

      expect(selected).toHaveLength(2);
      expect(selected[0].filename).toBe('a.jpg');
      expect(selected[1].filename).toBe('quite-long-filename.jpg');
    });

    it('skips images that are too similar to already selected ones', () => {
      const candidates: ImageCandidate[] = [
        makeCandidate({ filename: 'main1.jpg', path: 'dirA/main1.jpg', score: 0.9 }),
        makeCandidate({ filename: 'main2.jpg', path: 'dirA/main2.jpg', score: 0.8 }),
        makeCandidate({ filename: 'unique-long-filename.jpg', path: 'dirB/unique-long-filename.jpg', score: 0.5 })
      ];

      const product = makeProduct({ id: 'p1' });
      const selected = ranker(3).rankProductImages(product, candidates, candidates);

      expect(selected.map(s => s.filename)).toEqual(['main1.jpg', 'unique-long-filename.jpg']);
    });

    it('ranks a higher-quality image above a lower-quality one with the same base score', () => {
      const candidates: ImageCandidate[] = [
        makeCandidate({ filename: 'small.jpg', path: 'dirA/small.jpg', score: 0.5, size_in_bytes: 10000, width: 100, height: 100 }),
        makeCandidate({ filename: 'very-long-highres-filename.jpg', path: 'dirB/very-long-highres-filename.jpg', score: 0.5, size_in_bytes: 2000000, width: 3840, height: 2160 })
      ];

      const product = makeProduct({ id: 'p1' });
      const selected = ranker(2).rankProductImages(product, candidates, candidates);

      expect(selected[0].filename).toBe('very-long-highres-filename.jpg');
    });
  });

  describe('generateRankingReport', () => {
    it('reports selected images per product', () => {
      const product = makeProduct({ id: 'p1' });
      const images: ImageFile[] = [
        makeCandidate({ filename: 'front.jpg', path: 'dirA/front.jpg', score: 0.8, match_score: 0.8 }),
        makeCandidate({ filename: 'side.jpg', path: 'dirB/side.jpg', score: 0.6, match_score: 0.6 })
      ];

      const report = ranker().generateRankingReport([product], { p1: images });

      expect(report).toMatchObject({
        total_products: 1,
        total_images_selected: 2,
        products_with_images: 1,
        products_without_images: 0
      });
      expect(report.by_product.p1.selected_count).toBe(2);
      expect(report.by_product.p1.reference).toBe('REF-001');
      expect(report.by_product.p1.average_quality).toBeCloseTo(0.7, 5);
    });

    it('counts products without ranked images', () => {
      const product = makeProduct({ id: 'p1' });

      const report = ranker().generateRankingReport([product], {});

      expect(report.total_images_selected).toBe(0);
      expect(report.products_without_images).toBe(1);
      expect(report.by_product.p1.average_quality).toBe(0);
    });
  });
});
