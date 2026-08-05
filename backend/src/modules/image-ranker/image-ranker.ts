"""
Image Ranker Module
Selects the most relevant images for each product based on matching scores and quality metrics.
"""

import { ImageFile, ImageCandidate, ImageSelectionConfig, ProductData } from '../types';

export class ImageRanker {
  private config: ImageSelectionConfig;

  constructor(config: ImageSelectionConfig) {
    this.config = config;
  }

  rankProductImages(
    product: ProductData,
    candidateImages: ImageCandidate[],
    availableFiles: ImageFile[]
  ): ImageFile[] {
    const rankedImages = this.rankCandidates(candidateImages, availableFiles);
    return this.selectTopImages(rankedImages);
  }

  private rankCandidates(
    candidates: ImageCandidate[],
    availableFiles: ImageFile[]
  ): ImageCandidate[] {
    const ranked: ImageCandidate[] = [];

    for (const candidate of candidates) {
      const rankScore = this.calculateRankScore(candidate, availableFiles);
      ranked.push({
        ...candidate,
        score: rankScore
      });
    }

    return ranked.sort((a, b) => b.score - a.score);
  }

  private calculateRankScore(candidate: ImageCandidate, availableFiles: ImageFile[]): number {
    let score = 0;

    // Match score component (70% weight)
    score += candidate.score * 0.7;

    // Quality component (20% weight)
    score += this.calculateQualityScore(candidate.file) * 0.2;

    // Variety component (10% weight)
    score += this.calculateVarietyScore(candidate, availableFiles) * 0.1;

    return score;
  }

  private calculateQualityScore(file: ImageFile): number {
    let score = 0;

    // File size (prefer larger files)
    if (file.size_in_bytes) {
      const sizeScore = Math.min(file.size_in_bytes / 1000000, 1); // Max 1MB = 1.0
      score += sizeScore * 0.4;
    }

    // File format
    const formatScore = this.getFormatScore(file.format);
    score += formatScore * 0.3;

    // Resolution (if available)
    if (file.width && file.height) {
      const resolutionScore = Math.min((file.width * file.height) / (1920 * 1080), 1);
      score += resolutionScore * 0.3;
    }

    return Math.min(score, 1);
  }

  private calculateVarietyScore(candidate: ImageCandidate, availableFiles: ImageFile[]): number {
    // Count similar images (same directory, similar size, same format)
    const similarCount = availableFiles.filter(file => 
      file.path === candidate.file.path ||
      (file.width && candidate.file.width && 
       Math.abs(file.width - candidate.file.width) < 100) ||
      file.format === candidate.file.format
    ).length;

    // Lower variety score for many similar images
    return Math.max(0, 1 - (similarCount / Math.max(availableFiles.length, 1)));
  }

  private getFormatScore(format: string): number {
    const formatWeights: Record<string, number> = {
      'jpeg': 1.0,
      'jpg': 0.9,
      'png': 0.8,
      'webp': 0.95,
      'gif': 0.6
    };
    return formatWeights[format] || 0.5;
  }

  private selectTopImages(candidates: ImageCandidate[]): ImageFile[] {
    const selected: ImageFile[] = [];

    for (const candidate of candidates) {
      if (selected.length >= this.config.max_images_per_product) {
        break;
      }

      // Check if this image would be too similar to already selected ones
      if (this.isTooSimilar(candidate.file, selected)) {
        continue;
      }

      selected.push(candidate.file);
    }

    return selected;
  }

  private isTooSimilar(newImage: ImageFile, selectedImages: ImageFile[]): boolean {
    if (selectedImages.length === 0) return false;

    // Check filename similarity
    for (const selected of selectedImages) {
      if (this.isFilenameSimilar(newImage.filename, selected.filename)) {
        return true;
      }
    }

    // Check directory similarity
    if (newImage.path && selectedImages.some(img => 
      img.path && img.path.includes(newImage.path.split('/')[0])
    )) {
      return true;
    }

    return false;
  }

  private isFilenameSimilar(filename1: string, filename2: string): boolean {
    const norm1 = filename1.toLowerCase().replace(/[^a-z0-9]/g, '');
    const norm2 = filename2.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Exact match or very similar (within 2 characters difference)
    if (norm1 === norm2) return true;
    if (Math.abs(norm1.length - norm2.length) <= 2) return true;

    return false;
  }

  generateRankingReport(
    products: ProductData[],
    allRankedImages: Record<string, ImageFile[]>
  ): any {
    const report: any = {};

    for (const product of products) {
      const productId = product.id;
      const rankedImages = allRankedImages[productId] || [];

      report[productId] = {
        product_id: productId,
        reference: product.reference,
        ean: product.ean,
        selected_count: rankedImages.length,
        selected_images: rankedImages.map(img => ({
          filename: img.filename,
          path: img.path,
          size: img.size_in_bytes,
          format: img.format,
          width: img.width,
          height: img.height,
          match_score: img.match_score,
          match_strategy: img.match_strategy
        })),
        average_quality: rankedImages.length > 0 
          ? rankedImages.reduce((sum, img) => sum + (img.match_score || 0), 0) / rankedImages.length
          : 0
      };
    }

    return {
      total_products: products.length,
      total_images_selected: Object.values(allRankedImages).reduce((sum, images) => sum + images.length, 0),
      products_without_images: products.filter(p => !allRankedImages[p.id]).length,
      products_with_images: products.filter(p => allRankedImages[p.id]).length,
      by_product: report
    };
  }
}