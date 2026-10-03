/**
 * Decoders for the shapes a PostGIS point arrives in.
 *
 * Every one of these is a real possibility rather than a guess:
 * `parseLocation` in services/offers.ts handled GeoJSON and WKT, and neither is
 * what PostgREST returns. WKT and EWKT were both accepted on insert in this
 * test run, and both came back as the same WKB hex string. GeoJSON stays
 * supported because a `.select()` of a projected column or an RPC can produce
 * it, and dropping a working branch to fix another is how regressions happen.
 */

/**
 * WKB for a POINT, little-endian, as PostgREST returns it for a
 * GEOGRAPHY(POINT, 4326) column:
 *
 *   01                  byte order (1 = little-endian)
 *   010000              geometry type 1 (Point), little-endian
 *   20E61000            SRID 4326, little-endian
 *   <8 bytes>           longitude, float64
 *   <8 bytes>           latitude, float64
 *
 * 25 bytes with an SRID, 21 without. The SRID-less form is accepted because a
 * WKB point is legitimately written without one, and the length is what tells
 * the two apart.
 */
export function decodeWkbPointHex(value: string): { longitude: number; latitude: number } | null {
  const hex = value.trim();

  // 25 bytes, so 50 hex characters: a 1-byte order flag, then type, SRID,
  // longitude and latitude. A SRID-less point is 21 bytes and is accepted
  // too, so the length is checked rather than assumed.
  const match = hex.match(/^0([01])[0-9a-f]{48}$|^0([01])[0-9a-f]{40}$/i);
  if (!match) return null;
  const littleEndian = (match[1] ?? match[2]) === '1';
  const pairs = hex.match(/.{2}/g)!;
  const bytes = new Uint8Array(pairs.length);
  for (let i = 0; i < pairs.length; i++) {
    bytes[i] = parseInt(pairs[i], 16);
  }

  // The geometry type must be a Point. PostGIS writes EWKB, where the type has
  // the SRID flag 0x20000000 set on top of 1 -- so 4326 arrives as 0x20000001,
  // which is 536870913, not 1. Masking off the flag covers both plain WKB (1)
// and EWKB (0x20000001).
  //
  // The check matters because the bytes after the header are only two float64s
  // when it is a point. Reading them anyway invents a location out of
  // unrelated data -- an all-zero buffer of the right length would decode to
  // (0, 0), Null Island in the Gulf of Guinea.
  const EWKB_SRID_FLAG = 0x20000000;
  const type = new DataView(bytes.buffer, 1, 4).getUint32(0, littleEndian);
  if ((type & ~EWKB_SRID_FLAG) !== 1) return null;

  // Read float64 straight out of the payload. `new Float64Array(buffer)` would
  // be endianness-guessing, so DataView is the honest tool.
  //
  // Offsets are into the full byte array rather than a slice: byte 0 is the
  // order flag, 1-4 the type, and the SRID takes 5-8 when it is present. The
  // payload starts after the SRID, so its offset depends on which of the two
  // accepted lengths matched.
  const payloadOffset = pairs.length === 25 ? 9 : 5;
  const view = new DataView(bytes.buffer, payloadOffset, 16);
  const longitude = view.getFloat64(0, littleEndian);
  const latitude = view.getFloat64(8, littleEndian);

  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  if (latitude < -90 || latitude > 90) return null;
  if (longitude < -180 || longitude > 180) return null;

  return { longitude, latitude };
}

/**
 * WKT `POINT(lon lat)`, optionally with an `SRID=4326;` prefix.
 * `SRID=4326;POINT(...)` is EWKT and is accepted by PostgREST on insert.
 */
export function parseWktPoint(value: string): { longitude: number; latitude: number } | null {
  const match = value
    .trim()
    .match(/^(?:SRID=\d+;)?POINT\s*\(\s*([+-]?[\d.]+)\s+([+-]?[\d.]+)\s*\)$/i);
  if (!match) return null;

  const longitude = parseFloat(match[1]);
  const latitude = parseFloat(match[2]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  return { longitude, latitude };
}

/**
 * GeoJSON `{ type: 'Point', coordinates: [lon, lat] }`, in the shapes
 * PostgREST and PostGIS can produce: an object, or a JSON string of one.
 */
export function parseGeoJsonPoint(
  value: unknown,
): { longitude: number; latitude: number } | null {
  if (typeof value === 'string') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
    return parseGeoJsonPoint(parsed);
  }

  if (typeof value !== 'object' || value === null) return null;

  const geo = value as { type?: unknown; coordinates?: unknown };
  if (geo.type !== 'Point' || !Array.isArray(geo.coordinates)) return null;

  const [longitude, latitude] = geo.coordinates;
  if (typeof longitude !== 'number' || typeof latitude !== 'number') return null;
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;

  return { longitude, latitude };
}

/**
 * Tries every known representation. Order is cheapest-and-most-specific first:
 * a string that is all hex is unambiguous, WKT is unambiguous, and JSON is the
 * broadest.
 */
export function parsePostGisPoint(
  value: unknown,
): { longitude: number; latitude: number } | null {
  if (value === null || value === undefined) return null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;

    const wkb = decodeWkbPointHex(trimmed);
    if (wkb) return wkb;

    const wkt = parseWktPoint(trimmed);
    if (wkt) return wkt;
  }

  return parseGeoJsonPoint(value);
}