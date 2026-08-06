// Image Matcher Module
// Matches product data with image files using EAN, reference, and filename patterns.

import { ImageFile, ImageMatchResult, ImageMatchStrategy, ProductData, EAN, Reference } from '../../types';

export class ImageMatcher {
  private strategies: ImageMatchStrategy[];
  private filenamePatterns: Record<ImageMatchStrategy, string[]>;
  private maxDistanceForEANMatch: number;
  private requireExactEANMatch: boolean;

  constructor(config: {
    strategies?: ImageMatchStrategy[];
    filenamePatterns?: Record<ImageMatchStrategy, string[]>;
    maxDistanceForEANMatch?: number;
    requireExactEANMatch?: boolean;
  } = {}) {
    this.strategies = config.strategies || ['ean', 'reference', 'filename_pattern', 'manual'];
    this.filenamePatterns = config.filenamePatterns || {
      ean: ['*ean*', '*ean*', '*ean*'],
      reference: ['*reference*', '*ref*'],
      filename_pattern: ['*main*', '*front*', '*1*', '*cover*'],
      manual: []
    };
    this.maxDistanceForEANMatch = config.maxDistanceForEANMatch || 2;
    this.requireExactEANMatch = config.requireExactEANMatch ?? false;
  }

  matchProductImages(product: ProductData, availableImages: ImageFile[]): ImageMatchResult {
    const matchedFiles: ImageFile[] = [];
    let matchScore = 0;
    const reasons: Array<{ type: string; score: number; description: string }> = [];

    // Try exact EAN match first
    if (product.ean && this.strategies.includes('ean')) {
      const eanMatches = this.matchByEAN(product.ean, availableImages);
      if (eanMatches.length > 0) {
        matchedFiles.push(...eanMatches);
        matchScore += 0.8; // High score for exact EAN match
        reasons.push({
          type: 'exact_ean',
          score: 0.8,
          description: `Exact EAN match (${product.ean})`
        });
      }
    }

    // Try exact reference match
    if (product.reference && this.strategies.includes('reference')) {
      const refMatches = this.matchByReference(product.reference, availableImages);
      if (refMatches.length > 0) {
        matchedFiles.push(...refMatches);
        matchScore += 0.6; // High score for exact reference match
        reasons.push({
          type: 'exact_reference',
          score: 0.6,
          description: `Exact reference match (${product.reference})`
        });
      }
    }

    // Apply filename pattern matching for remaining images
    if (this.strategies.includes('filename_pattern')) {
      const patternMatches = this.matchByFilenamePattern(product, availableImages, matchedFiles);
      if (patternMatches.length > 0) {
        matchedFiles.push(...patternMatches);
        matchScore += 0.4; // Medium score for pattern matching
        reasons.push({
          type: 'filename_pattern',
          score: 0.4,
          description: 'Filename pattern match'
        });
      }
    }

    // Remove duplicates while preserving order
    const uniqueMatches = this.removeDuplicateImages(matchedFiles);

    return {
      product_id: product.id,
      matched_files: uniqueMatches,
      match_score: Math.min(matchScore, 1.0),
      match_strategy: this.determineMatchStrategy(product, uniqueMatches),
      confidence: this.calculateConfidence(product, uniqueMatches),
      reasons
    };
  }

  matchByEAN(ean: EAN, images: ImageFile[]): ImageFile[] {
    const eanMatches: ImageFile[] = [];
    const normalizedEAN = ean.replace(/[^0-9]/g, '');

    for (const image of images) {
      let score = 0;

      // Check filename for EAN match
      if (this.isEANInFilename(image.filename, normalizedEAN)) {
        score += 0.9;
      }

      // Check if EAN appears in image metadata
      if (image.matched_ean === normalizedEAN) {
        score += 0.95;
      }

      // Check if EAN appears in image description
      if (image.description?.includes(normalizedEAN)) {
        score += 0.8;
      }

      // Check directory structure for EAN
      if (image.path.includes(normalizedEAN)) {
        score += 0.7;
      }

      if (score > 0) {
        eanMatches.push({
          ...image,
          match_score: score,
          match_strategy: 'ean'
        });
      }
    }

    // Sort by score (highest first)
    return eanMatches.sort((a, b) => b.match_score - a.match_score);
  }

  matchByReference(reference: Reference, images: ImageFile[]): ImageFile[] {
    const refMatches: ImageFile[] = [];
    const normalizedRef = reference.toLowerCase().replace(/[^a-z0-9]/g, '');

    for (const image of images) {
      let score = 0;

      // Check filename for reference match
      if (this.isReferenceInFilename(image.filename, normalizedRef)) {
        score += 0.8;
      }

      // Check if reference appears in image metadata
      if (image.matched_reference === reference) {
        score += 0.9;
      }

      // Check directory structure for reference
      if (image.path.toLowerCase().includes(normalizedRef)) {
        score += 0.7;
      }

      if (score > 0) {
        refMatches.push({
          ...image,
          match_score: score,
          match_strategy: 'reference'
        });
      }
    }

    return refMatches.sort((a, b) => b.match_score - a.match_score);
  }

  matchByFilenamePattern(product: ProductData, images: ImageFile[], excludeFiles: ImageFile[] = []): ImageFile[] {
    const patternMatches: ImageFile[] = [];

    for (const image of images) {
      // Skip already matched files
      if (excludeFiles.some(excluded => excluded.path === image.path)) {
        continue;
      }

      const score = this.calculateFilenamePatternScore(image, product);

      if (score > 0.3) {
        patternMatches.push({
          ...image,
          match_score: score,
          match_strategy: 'filename_pattern'
        });
      }
    }

    return patternMatches.sort((a, b) => b.match_score - a.match_score);
  }

  private isEANInFilename(filename: string, ean: string): boolean {
    const normalizedFilename = filename.toLowerCase();
    const normalizedEAN = ean.replace(/[^0-9]/g, '');

    // Check if EAN appears as a whole number in filename
    const patterns = [
      new RegExp(`\\b${normalizedEAN}\\b`),
      new RegExp(normalizedEAN),
      new RegExp(`product${normalizedEAN}`),
      new RegExp(`${normalizedEAN}-`), // EAN followed by dash
      new RegExp(`-${normalizedEAN}`)  // Dash followed by EAN
    ];

    return patterns.some(pattern => pattern.test(normalizedFilename));
  }

  private isReferenceInFilename(filename: string, reference: string): boolean {
    const normalizedFilename = filename.toLowerCase();
    const normalizedRef = reference.toLowerCase().replace(/[^a-z0-9]/g, '');

    return normalizedFilename.includes(normalizedRef);
  }

  private calculateFilenamePatternScore(image: ImageFile, _product: ProductData): number {
    let score = 0;

    // Check for main/front indicators
    const mainPatterns = ['main', 'front', 'cover', 'principal', 'primary'];
    const filename = image.filename.toLowerCase();
    for (const pattern of mainPatterns) {
      if (filename.includes(pattern)) {
        score += 0.4;
        break;
      }
    }

    // Check for numbering (1, 2, etc.)
    const numberMatch = filename.match(/\b(\d+)\b/);
    if (numberMatch) {
      const number = parseInt(numberMatch[1], 10);
      if (number <= 3) { // Prefer first few images
        score += 0.3;
      }
    }

    // Check for image quality indicators
    if (filename.includes('high') || filename.includes('highres') || filename.includes('hd')) {
      score += 0.2;
    }

    // Prefer non-thumbnail images
    if (!filename.includes('thumb') && !filename.includes('small') && !filename.includes('mini')) {
      score += 0.1;
    }

    // Prefer larger file sizes
    if (image.size_in_bytes && image.size_in_bytes > 100000) { // > 100KB
      score += 0.1;
    }

    return score;
  }

  private removeDuplicateImages(images: ImageFile[]): ImageFile[] {
    const seen = new Map<string, ImageFile>();
    const unique: ImageFile[] = [];

    for (const image of images) {
      const key = this.generateImageKey(image);

      if (!seen.has(key)) {
        seen.set(key, image);
        unique.push(image);
      }
    }

    return unique;
  }

  private generateImageKey(image: ImageFile): string {
    // Create a unique key based on filename and size
    return `${image.filename.toLowerCase()}_${image.size_in_bytes || 0}`;
  }

  private determineMatchStrategy(product: ProductData, matchedFiles: ImageFile[]): ImageMatchStrategy {
    if (matchedFiles.length === 0) return 'manual';

    const strategyCounts = matchedFiles.reduce((counts, image) => {
      counts[image.match_strategy || 'manual'] = (counts[image.match_strategy || 'manual'] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);

    // Return the most common strategy
    return Object.entries(strategyCounts)
      .sort(([, a], [, b]) => b - a)[0][0] as ImageMatchStrategy;
  }

  private calculateConfidence(product: ProductData, matchedFiles: ImageFile[]): number {
    if (matchedFiles.length === 0) return 0;

    let confidence = 0;
    let totalWeight = 0;

    // High confidence for exact EAN match
    if (product.ean) {
      confidence += 0.8;
      totalWeight += 0.8;
    }

    // Additional confidence for exact reference match
    if (product.reference) {
      confidence += 0.6;
      totalWeight += 0.6;
    }

    // Add confidence based on number of matched images
    const imageCountConfidence = Math.min(matchedFiles.length * 0.1, 0.4);
    confidence += imageCountConfidence;
    totalWeight += 0.4;

    return totalWeight > 0 ? confidence / totalWeight : 0;
  }

  getMatchingStatistics(products: ProductData[], images: ImageFile[]): any {
    const totalProducts = products.length;
    const productsWithEan = products.filter(p => p.ean).length;
    const productsWithReference = products.filter(p => p.reference).length;

    const totalImages = images.length;
    const imagesWithEAN = images.filter(i => i.matched_ean).length;
    const imagesWithReference = images.filter(i => i.matched_reference).length;

    return {
      total_products: totalProducts,
      products_with_ean: productsWithEan,
      products_with_reference: productsWithReference,
      total_images: totalImages,
      images_with_ean: imagesWithEAN,
      images_with_reference: imagesWithReference,
      ean_match_rate: totalProducts > 0 ? (productsWithEan / totalProducts) * 100 : 0,
      reference_match_rate: totalProducts > 0 ? (productsWithReference / totalProducts) * 100 : 0
    };
  }
}