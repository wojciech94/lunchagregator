import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getOffer,
  createOffer,
  updateOffer,
  deleteOffer,
} from '@/services/offers';

// Mock Supabase client
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();

const mockFrom = vi.fn(() => ({
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
  delete: mockDelete,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      from: mockFrom,
    })
  ),
}));

const TEST_USER_ID = '123e4567-e89b-12d3-a456-426614174001';

// Helper to create a valid DB row
function createDbRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '123e4567-e89b-12d3-a456-426614174000',
    dish_name: 'Pierogi ruskie',
    items: [],
    price: 25.0,
    currency: 'PLN',
    description: 'Tradycyjne pierogi',
    restaurant_id: null,
    restaurant_name: 'Restauracja Polska',
    restaurant_address: 'ul. Główna 1, Warszawa',
    restaurant_location: null,
    available_date: new Date().toISOString().split('T')[0],
    cuisine_type: 'polska',
    dietary_tags: ['vegetarian'],
    allergens: ['gluten', 'mleko'],
    source_type: 'text',
    user_id: TEST_USER_ID,
    session_token: 'test-session-token',
    created_at: '2024-01-01T12:00:00Z',
    updated_at: '2024-01-01T12:00:00Z',
    ...overrides,
  };
}

// Helper to create valid create input
function createValidInput(overrides: Record<string, unknown> = {}) {
  const today = new Date().toISOString().split('T')[0];
  return {
    dishName: 'Pierogi ruskie',
    price: 25.0,
    restaurantName: 'Restauracja Polska',
    availableDate: today,
    sourceType: 'text',
    description: 'Tradycyjne pierogi',
    cuisineType: 'polska',
    dietaryTags: ['vegetarian'],
    allergens: ['gluten', 'mleko'],
    restaurantAddress: 'ul. Główna 1, Warszawa',
    ...overrides,
  };
}

describe('OfferService CRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getOffer', () => {
    it('returns offer when found', async () => {
      const dbRow = createDbRow();
      mockSelect.mockReturnValue({ eq: mockEq });
      mockEq.mockReturnValue({ single: mockSingle });
      mockSingle.mockResolvedValue({ data: dbRow, error: null });

      const result = await getOffer(dbRow.id as string);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(dbRow.id);
        expect(result.data.dishName).toBe('Pierogi ruskie');
        expect(result.data.price).toBe(25.0);
        expect(result.data.restaurantName).toBe('Restauracja Polska');
        expect(result.data.dietaryTags).toEqual(['vegetarian']);
        expect(result.data.userId).toBe(TEST_USER_ID);
      }
    });

    it('returns error when offer not found', async () => {
      mockSelect.mockReturnValue({ eq: mockEq });
      mockEq.mockReturnValue({ single: mockSingle });
      mockSingle.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });

      const result = await getOffer('non-existent-id');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Offer not found');
      }
    });

    it('returns error on database failure', async () => {
      mockSelect.mockReturnValue({ eq: mockEq });
      mockEq.mockReturnValue({ single: mockSingle });
      mockSingle.mockResolvedValue({
        data: null,
        error: { code: 'UNKNOWN', message: 'Connection error' },
      });

      const result = await getOffer('some-id');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Failed to fetch offer');
      }
    });
  });

  describe('createOffer', () => {
    it('creates offer with valid data and sets user_id', async () => {
      const input = createValidInput();
      const dbRow = createDbRow();

      mockInsert.mockReturnValue({ select: vi.fn().mockReturnValue({ single: mockSingle }) });
      mockSingle.mockResolvedValue({ data: dbRow, error: null });

      const result = await createOffer(input, TEST_USER_ID);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dishName).toBe('Pierogi ruskie');
        expect(result.data.userId).toBe(TEST_USER_ID);
      }
    });

    it('returns validation errors for invalid data', async () => {
      const input = {
        dishName: '', // empty - invalid
        price: -1, // negative - invalid
        restaurantName: 'Test',
        availableDate: '2020-01-01', // past date - invalid
        sourceType: 'text',
      };

      const result = await createOffer(input, TEST_USER_ID);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Validation failed');
        expect(result.fieldErrors).toBeDefined();
        expect(result.fieldErrors!['dishName']).toBeDefined();
        expect(result.fieldErrors!['price']).toBeDefined();
        expect(result.fieldErrors!['availableDate']).toBeDefined();
      }
    });

    it('returns error when user ID is empty', async () => {
      const input = createValidInput();

      const result = await createOffer(input, '');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('User ID is required');
      }
    });

    it('returns error on database insert failure', async () => {
      const input = createValidInput();

      mockInsert.mockReturnValue({
        select: vi.fn().mockReturnValue({ single: mockSingle }),
      });
      mockSingle.mockResolvedValue({
        data: null,
        error: { message: 'Insert failed' },
      });

      const result = await createOffer(input, TEST_USER_ID);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Failed to create offer');
      }
    });

    it('rejects dish name exceeding 100 characters', async () => {
      const input = createValidInput({ dishName: 'a'.repeat(101) });

      const result = await createOffer(input, TEST_USER_ID);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.fieldErrors!['dishName']).toBeDefined();
      }
    });

    it('rejects price above 9999.99', async () => {
      const input = createValidInput({ price: 10000 });

      const result = await createOffer(input, TEST_USER_ID);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.fieldErrors!['price']).toBeDefined();
      }
    });
  });

  describe('updateOffer', () => {
    it('updates offer with valid data', async () => {
      const dbRow = createDbRow();

      // Update call
      mockUpdate.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({ single: mockSingle }),
        }),
      });
      mockSingle.mockResolvedValueOnce({ data: dbRow, error: null });

      const result = await updateOffer(dbRow.id as string, { dishName: 'Updated name' });

      expect(result.success).toBe(true);
    });

    it('returns validation errors for invalid update data', async () => {
      const result = await updateOffer('some-id', { price: -5 });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Validation failed');
        expect(result.fieldErrors!['price']).toBeDefined();
      }
    });

    it('returns error on database update failure', async () => {
      mockUpdate.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({ single: mockSingle }),
        }),
      });
      mockSingle.mockResolvedValueOnce({
        data: null,
        error: { message: 'Update failed' },
      });

      const result = await updateOffer('some-id', { dishName: 'Updated' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Failed to update offer');
      }
    });
  });

  describe('deleteOffer', () => {
    it('deletes offer successfully', async () => {
      mockDelete.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      const result = await deleteOffer('some-id');

      expect(result.success).toBe(true);
    });

    it('returns error on database delete failure', async () => {
      mockDelete.mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          error: { message: 'Delete failed' },
        }),
      });

      const result = await deleteOffer('some-id');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Failed to delete offer');
      }
    });
  });
});
