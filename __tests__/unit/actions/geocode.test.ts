import { describe, it, expect, vi, beforeEach } from 'vitest';
import { geocodeAddressAction } from '@/actions/geocode';

// Mock the geocoding service
vi.mock('@/services/geocoding', () => ({
  geocodeAddress: vi.fn(),
}));

import { geocodeAddress } from '@/services/geocoding';

const mockGeocodeAddress = geocodeAddress as ReturnType<typeof vi.fn>;

describe('geocode server actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('geocodeAddressAction', () => {
    it('returns error for empty address', async () => {
      const result = await geocodeAddressAction('');
      expect(result).toEqual({ success: false, error: 'Adres jest wymagany.' });
      expect(mockGeocodeAddress).not.toHaveBeenCalled();
    });

    it('returns error for whitespace-only address', async () => {
      const result = await geocodeAddressAction('   ');
      expect(result).toEqual({ success: false, error: 'Adres jest wymagany.' });
      expect(mockGeocodeAddress).not.toHaveBeenCalled();
    });

    it('returns error for address exceeding 200 characters', async () => {
      const longAddress = 'a'.repeat(201);
      const result = await geocodeAddressAction(longAddress);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('200');
      }
      expect(mockGeocodeAddress).not.toHaveBeenCalled();
    });

    it('accepts address at exactly 200 characters', async () => {
      const address = 'a'.repeat(200);
      mockGeocodeAddress.mockResolvedValue({ latitude: 52.0, longitude: 21.0 });

      const result = await geocodeAddressAction(address);

      expect(result.success).toBe(true);
      expect(mockGeocodeAddress).toHaveBeenCalled();
    });

    it('returns success with coordinates for valid address', async () => {
      const coords = { latitude: 52.2297, longitude: 21.0122 };
      mockGeocodeAddress.mockResolvedValue(coords);

      const result = await geocodeAddressAction('Warszawa, Polska');

      expect(result).toEqual({ success: true, data: coords });
      expect(mockGeocodeAddress).toHaveBeenCalledWith('Warszawa, Polska');
    });

    it('trims address before processing', async () => {
      mockGeocodeAddress.mockResolvedValue({ latitude: 52.0, longitude: 21.0 });

      await geocodeAddressAction('  Kraków, Polska  ');

      expect(mockGeocodeAddress).toHaveBeenCalledWith('Kraków, Polska');
    });

    it('returns success with null when geocoding finds no results (per requirement 6.5)', async () => {
      mockGeocodeAddress.mockResolvedValue(null);

      const result = await geocodeAddressAction('Nonexistent Place XYZ');

      expect(result).toEqual({ success: true, data: null });
    });

    it('returns success with null when geocoding service throws (per requirement 6.5)', async () => {
      mockGeocodeAddress.mockRejectedValue(new Error('Network error'));

      const result = await geocodeAddressAction('Warszawa, Polska');

      // Per requirement 6.5: geocoding failure should NOT be an error
      expect(result).toEqual({ success: true, data: null });
    });
  });
});
