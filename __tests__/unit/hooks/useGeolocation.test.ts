/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useGeolocation } from "@/hooks/useGeolocation";

// Mock navigator.geolocation
const mockGetCurrentPosition = vi.fn();
const mockPermissionsQuery = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();

  Object.defineProperty(global.navigator, "geolocation", {
    value: {
      getCurrentPosition: mockGetCurrentPosition,
    },
    writable: true,
    configurable: true,
  });

  Object.defineProperty(global.navigator, "permissions", {
    value: {
      query: mockPermissionsQuery,
    },
    writable: true,
    configurable: true,
  });

  mockPermissionsQuery.mockResolvedValue({ state: "prompt" });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useGeolocation", () => {
  it("should return initial state", () => {
    const { result } = renderHook(() => useGeolocation());

    expect(result.current.coordinates).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.permissionState).toBeNull();
    expect(typeof result.current.requestLocation).toBe("function");
  });

  it("should set coordinates on successful geolocation", async () => {
    mockPermissionsQuery.mockResolvedValue({ state: "granted" });
    mockGetCurrentPosition.mockImplementation((success) => {
      success({
        coords: {
          latitude: 52.2297,
          longitude: 21.0122,
        },
      });
    });

    const { result } = renderHook(() => useGeolocation());

    await act(async () => {
      result.current.requestLocation();
      // Allow permissions query promise to resolve
      await Promise.resolve();
    });

    expect(result.current.coordinates).toEqual({
      latitude: 52.2297,
      longitude: 21.0122,
    });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.permissionState).toBe("granted");
  });

  it("should set error when permission is denied", async () => {
    mockPermissionsQuery.mockResolvedValue({ state: "denied" });
    mockGetCurrentPosition.mockImplementation((_success, error) => {
      error({
        code: 1, // PERMISSION_DENIED
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
        message: "User denied Geolocation",
      });
    });

    const { result } = renderHook(() => useGeolocation());

    await act(async () => {
      result.current.requestLocation();
      await Promise.resolve();
    });

    expect(result.current.coordinates).toBeNull();
    expect(result.current.error).toContain("odrzucony");
    expect(result.current.error).toContain("ręcznie");
    expect(result.current.loading).toBe(false);
    expect(result.current.permissionState).toBe("denied");
  });

  it("should set error when position is unavailable", async () => {
    mockGetCurrentPosition.mockImplementation((_success, error) => {
      error({
        code: 2, // POSITION_UNAVAILABLE
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
        message: "Position unavailable",
      });
    });

    const { result } = renderHook(() => useGeolocation());

    await act(async () => {
      result.current.requestLocation();
    });

    expect(result.current.coordinates).toBeNull();
    expect(result.current.error).toContain("lokalizacji");
    expect(result.current.loading).toBe(false);
  });

  it("should set error on timeout", async () => {
    mockGetCurrentPosition.mockImplementation((_success, error) => {
      error({
        code: 3, // TIMEOUT
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
        message: "Timeout expired",
      });
    });

    const { result } = renderHook(() => useGeolocation());

    await act(async () => {
      result.current.requestLocation();
    });

    expect(result.current.coordinates).toBeNull();
    expect(result.current.error).toContain("czas oczekiwania");
    expect(result.current.loading).toBe(false);
  });

  it("should set error when geolocation is not supported", async () => {
    Object.defineProperty(global.navigator, "geolocation", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    const { result } = renderHook(() => useGeolocation());

    await act(async () => {
      result.current.requestLocation();
    });

    expect(result.current.coordinates).toBeNull();
    expect(result.current.error).toContain("nie jest wspierana");
    expect(result.current.loading).toBe(false);
  });

  it("should set loading to true while requesting location", async () => {
    mockGetCurrentPosition.mockImplementation(() => {
      // Don't call success or error — simulates pending state
    });

    const { result } = renderHook(() => useGeolocation());

    await act(async () => {
      result.current.requestLocation();
    });

    expect(result.current.loading).toBe(true);
  });

  it("should pass 10-second timeout option to getCurrentPosition", async () => {
    mockGetCurrentPosition.mockImplementation(() => {});

    const { result } = renderHook(() => useGeolocation());

    await act(async () => {
      result.current.requestLocation();
    });

    expect(mockGetCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      expect.objectContaining({
        timeout: 10000,
      })
    );
  });
});
