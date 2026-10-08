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
  review?: { receipt: string; dishes: (LunchImportPreview['dishes'][number] & { itemKey: string })[] } | null;
}

export interface ImportPublicationSummary {
  saved: { itemKey: string; offerId: string; existing: boolean; missingCoordinates: boolean }[];
  failed: { itemKey: string; error: string }[];
}

export type ImportPreviewResult =
  | { success: true; data: LunchImportPreview }
  | { success: false; error: string };
