import { ImageMatcher } from '../backend/src/modules/image-matcher/image-matcher';
import { ImageFile } from '../backend/src/types';
import { makeProduct } from './helpers';

function makeImage(overrides: Partial<ImageFile> = {}): ImageFile {
  return {
    filename: 'default.jpg',
    path: '/images/default.jpg',
    format: 'jpg',
    ...overrides
  };
}

describe('ImageMatcher', () => {
  describe('matchProductImages - EAN matching', () => {
    it('matches images whose filename contains the EAN', () => {
      const matcher = new ImageMatcher();
      const product = makeProduct({ ean: '1234567890123', reference: undefined });
      const images = [makeImage({ filename: '1234567890123-main.jpg', path: '/images/1234567890123-main.jpg' })];

      const result = matcher.matchProductImages(product, images);

      expect(result.matched_files).toHaveLength(1);
      expect(result.matched_files[0].filename).toBe('1234567890123-main.jpg');
      expect(result.match_strategy).toBe('ean');
      expect(result.match_score).toBe(0.8);
      expect(result.reasons).toContainEqual(expect.objectContaining({ type: 'exact_ean' }));
    });

    it('does not match when no image contains the EAN', () => {
      const matcher = new ImageMatcher();
      const product = makeProduct({ ean: '1234567890123', reference: undefined });
      const images = [makeImage({ filename: 'random.jpg', path: '/images/random.jpg' })];

      const result = matcher.matchProductImages(product, images);

      expect(result.matched_files).toHaveLength(0);
      expect(result.match_strategy).toBe('manual');
      expect(result.confidence).toBe(0);
    });
  });

  describe('matchProductImages - reference matching', () => {
    it('matches images by exact reference metadata', () => {
      const matcher = new ImageMatcher();
      const product = makeProduct({ ean: undefined, reference: 'REF-001' });
      const images = [makeImage({ filename: 'photo.jpg', matched_reference: 'REF-001' })];

      const result = matcher.matchProductImages(product, images);

      expect(result.matched_files).toHaveLength(1);
      expect(result.matched_files[0].match_strategy).toBe('reference');
      expect(result.match_score).toBe(0.6);
      expect(result.reasons).toContainEqual(expect.objectContaining({ type: 'exact_reference' }));
    });
  });

  describe('matchProductImages - filename pattern matching', () => {
    it('matches main/front images when no EAN or reference match', () => {
      const matcher = new ImageMatcher();
      const product = makeProduct({ ean: undefined, reference: undefined });
      const images = [makeImage({ filename: 'main-hd.jpg', path: '/images/main-hd.jpg', size_in_bytes: 200000 })];

      const result = matcher.matchProductImages(product, images);

      expect(result.matched_files).toHaveLength(1);
      expect(result.matched_files[0].match_strategy).toBe('filename_pattern');
      expect(result.reasons).toContainEqual(expect.objectContaining({ type: 'filename_pattern' }));
    });

    it('deduplicates identical images matched by multiple strategies', () => {
      const matcher = new ImageMatcher();
      const product = makeProduct({ ean: '1234567890123', reference: undefined });
      const duplicate = { filename: '1234567890123.jpg', path: '/images/1234567890123.jpg', format: 'jpg' };

      const result = matcher.matchProductImages(product, [duplicate, { ...duplicate }]);

      expect(result.matched_files).toHaveLength(1);
    });
  });

  describe('matchByEAN', () => {
    it('scores images by EAN presence in metadata, filename and path', () => {
      const matcher = new ImageMatcher();
      const ean = '1234567890123';
      const images = [
        makeImage({ filename: 'x.jpg', matched_ean: ean }),
        makeImage({ filename: `${ean}.jpg`, path: `/products/${ean}/main.jpg` })
      ];

      const matches = matcher.matchByEAN(ean, images);

      expect(matches).toHaveLength(2);
      expect(matches[0].match_score).toBeGreaterThan(matches[1].match_score!);
      expect(matches.every(m => m.match_strategy === 'ean')).toBe(true);
    });

    it('normalizes EAN digits before matching', () => {
      const matcher = new ImageMatcher();
      const matches = matcher.matchByEAN('12-3456-7890-123', [makeImage({ filename: 'img-1234567890123.jpg' })]);

      expect(matches).toHaveLength(1);
    });

    it('returns no matches when no image references the EAN', () => {
      const matcher = new ImageMatcher();
      const matches = matcher.matchByEAN('1234567890123', [makeImage({ filename: 'nothing.jpg' })]);

      expect(matches).toHaveLength(0);
    });
  });

  describe('matchByReference', () => {
    it('matches by reference metadata and filename', () => {
      const matcher = new ImageMatcher();
      const images = [
        makeImage({ filename: 'ref001.jpg', matched_reference: 'REF-001' }),
        makeImage({ filename: 'other.jpg' })
      ];

      const matches = matcher.matchByReference('REF-001', images);

      expect(matches).toHaveLength(1);
      expect(matches[0].match_strategy).toBe('reference');
    });

    it('normalizes the reference before matching filenames', () => {
      const matcher = new ImageMatcher();
      const matches = matcher.matchByReference('REF-001', [makeImage({ filename: 'ref001.jpg' })]);

      expect(matches).toHaveLength(1);
    });
  });

  describe('matchByFilenamePattern', () => {
    it('scores main and high-resolution indicators higher', () => {
      const matcher = new ImageMatcher();
      const product = makeProduct({ ean: undefined, reference: undefined });
      const images = [
        makeImage({ filename: 'photo.jpg' }),
        makeImage({ filename: 'main-hd.jpg', size_in_bytes: 200000 })
      ];

      const matches = matcher.matchByFilenamePattern(product, images);

      expect(matches).toHaveLength(1);
      expect(matches[0].filename).toBe('main-hd.jpg');
    });

    it('excludes files already matched', () => {
      const matcher = new ImageMatcher();
      const product = makeProduct({ ean: undefined, reference: undefined });
      const excluded = makeImage({ filename: 'main.jpg' });

      const matches = matcher.matchByFilenamePattern(
        product,
        [excluded, makeImage({ filename: 'other-main.jpg', path: '/images/other-main.jpg' })],
        [excluded]
      );

      expect(matches.some(m => m.filename === 'main.jpg')).toBe(false);
      expect(matches.some(m => m.filename === 'other-main.jpg')).toBe(true);
    });
  });

  describe('getMatchingStatistics', () => {
    it('computes EAN and reference match rates', () => {
      const matcher = new ImageMatcher();
      const products = [
        makeProduct({ id: 'p1', ean: '1234567890123', reference: undefined }),
        makeProduct({ id: 'p2', ean: '9999999999999', reference: undefined }),
        makeProduct({ id: 'p3', ean: undefined, reference: 'REF-001' })
      ];
      const images = [
        makeImage({ filename: 'a.jpg', matched_ean: '1234567890123' }),
        makeImage({ filename: 'b.jpg', matched_reference: 'REF-001' })
      ];

      const stats = matcher.getMatchingStatistics(products, images);

      expect(stats).toMatchObject({
        total_products: 3,
        products_with_ean: 2,
        products_with_reference: 1,
        total_images: 2,
        images_with_ean: 1,
        images_with_reference: 1
      });
      expect(stats.ean_match_rate).toBeCloseTo(66.67, 1);
    });

    it('handles empty inputs', () => {
      const stats = new ImageMatcher().getMatchingStatistics([], []);

      expect(stats).toMatchObject({ total_products: 0, total_images: 0, ean_match_rate: 0 });
    });
  });
});
