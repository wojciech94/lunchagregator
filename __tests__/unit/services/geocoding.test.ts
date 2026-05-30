import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { geocodeAddress, calculateDistance } from '@/services/geocoding';

describe('GeocodingService', () => {
  describe('geocodeAddress', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('returns coordinates for a valid address', async () => {
      const mockResponse = [{ lat: '52.2297', lon: '21.0122', display_name: 'Warsaw' }];
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await geocodeAddress('Warsaw, Poland');

      expect(result).toEqual({ latitude: 52.2297, longitude: 21.0122 });
      expect(fetch).toHaveBeenCalledTimes(1);
      const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(calledUrl).toContain('nominatim.openstreetmap.org');
      expect(calledUrl).toContain('Warsaw');
    });

    it('returns null for empty address', async () => {
      const result = await geocodeAddress('');
      expect(result).toBeNull();
      expect(fetch).not.toHaveBeenCalled();
    });

    it('returns null for whitespace-only address', async () => {
      const result = await geocodeAddress('   ');
      expect(result).toBeNull();
      expect(fetch).not.toHaveBeenCalled();
    });

    it('returns null when API returns no results', async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => [],
      });

      const result = await geocodeAddress('nonexistent place xyz123');
      expect(result).toBeNull();
    });

    it('returns null when API returns non-ok status', async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await geocodeAddress('Warsaw');
      expect(result).toBeNull();
    });

    it('returns null on network error', async () => {
      (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

      const result = await geocodeAddress('Warsaw');
      expect(result).toBeNull();
    });

    it('returns null on timeout (abort)', async () => {
      (fetch as ReturnType<typeof vi.fn>).mockImplementation((_url: string, options?: { signal?: AbortSignal }) => {
        return new Promise((_, reject) => {
          // Simulate the abort signal being triggered
          if (options?.signal) {
            options.signal.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted', 'AbortError'));
            });
          }
        });
      });

      // Use fake timers to trigger the 10s timeout quickly
      vi.useFakeTimers();
      const promise = geocodeAddress('Warsaw');
      await vi.advanceTimersByTimeAsync(10_000);
      const result = await promise;
      expect(result).toBeNull();
      vi.useRealTimers();
    });

    it('returns null when lat/lon are not valid numbers', async () => {
      const mockResponse = [{ lat: 'invalid', lon: 'invalid', display_name: 'Bad' }];
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await geocodeAddress('Bad address');
      expect(result).toBeNull();
    });

    it('passes correct query parameters to Nominatim', async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => [{ lat: '50.0', lon: '20.0', display_name: 'Test' }],
      });

      await geocodeAddress('  Kraków, Polska  ');

      const calledUrl = new URL((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(calledUrl.searchParams.get('q')).toBe('Kraków, Polska');
      expect(calledUrl.searchParams.get('format')).toBe('json');
      expect(calledUrl.searchParams.get('limit')).toBe('1');
    });
  });

  describe('calculateDistance', () => {
    it('returns 0 for identical points', () => {
      const point = { latitude: 52.2297, longitude: 21.0122 };
      expect(calculateDistance(point, point)).toBe(0);
    });

    it('is symmetric (A→B == B→A)', () => {
      const warsaw = { latitude: 52.2297, longitude: 21.0122 };
      const krakow = { latitude: 50.0647, longitude: 19.9450 };

      const distAB = calculateDistance(warsaw, krakow);
      const distBA = calculateDistance(krakow, warsaw);

      expect(distAB).toBe(distBA);
    });

    it('returns non-negative values', () => {
      const a = { latitude: -33.8688, longitude: 151.2093 }; // Sydney
      const b = { latitude: 51.5074, longitude: -0.1278 }; // London

      expect(calculateDistance(a, b)).toBeGreaterThanOrEqual(0);
    });

    it('calculates known distance approximately correctly (Warsaw to Kraków ~252 km)', () => {
      const warsaw = { latitude: 52.2297, longitude: 21.0122 };
      const krakow = { latitude: 50.0647, longitude: 19.9450 };

      const distance = calculateDistance(warsaw, krakow);

      // Should be approximately 252 km
      expect(distance).toBeGreaterThan(240);
      expect(distance).toBeLessThan(260);
    });

    it('rounds to 1 decimal place', () => {
      const a = { latitude: 52.2297, longitude: 21.0122 };
      const b = { latitude: 52.2500, longitude: 21.0500 };

      const distance = calculateDistance(a, b);
      const decimalPart = distance.toString().split('.')[1];

      // Should have at most 1 decimal place
      expect(decimalPart === undefined || decimalPart.length <= 1).toBe(true);
    });

    it('handles antipodal points (max distance ~20000 km)', () => {
      const north = { latitude: 90, longitude: 0 };
      const south = { latitude: -90, longitude: 0 };

      const distance = calculateDistance(north, south);

      // Should be approximately half the Earth's circumference
      expect(distance).toBeGreaterThan(19900);
      expect(distance).toBeLessThan(20100);
    });
  });
});
