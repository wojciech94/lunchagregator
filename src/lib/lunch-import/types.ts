import type { ExtractedDish } from '@/services/ai-analyzer';

export interface LunchImportPreview {
  restaurant: { id: string; name: string; address: string };
  sourceUrl: string;
  fetchedAt: string;
  excerpt: string;
  conditions: string;
  date: null;
  extractionMethod: 'ai' | 'html';
  dishes: Pick<ExtractedDish, 'name' | 'price' | 'description' | 'items'>[];
  warnings: string[];
}

export type ImportPreviewResult =
  | { success: true; data: LunchImportPreview }
  | { success: false; error: string };
