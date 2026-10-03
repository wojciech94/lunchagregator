/**
 * The WKB hex in this file is not invented. It was copied from what the local
 * stack returned for `POINT(21.0122 52.2297)` inserted into a
 * `GEOGRAPHY(POINT, 4326)` column and read back through PostgREST:
 *
 *   0101000020E6100000DE02098A1F03354013F241CF661D4A40
 *
 * `parseLocation` in services/offers.ts parsed only GeoJSON and WKT, so it
 * returned null for every one of these and every offer detail reported
 * `restaurantLocation: null` while the coordinates sat in the database.
 */

import { describe, expect, it } from 'vitest';
import {
  decodeWkbPointHex,
  parseGeoJsonPoint,
  parsePostGisPoint,
  parseWktPoint,
} from './postgis';

/** Copied verbatim from the local stack, for POINT(21.0122 52.2297). */
const WKB_LITTLE_ENDIAN = '0101000020E6100000DE02098A1F03354013F241CF661D4A40';

describe('decodeWkbPointHex', () => {
  it('decodes what PostgREST actually returned', () => {
    expect(decodeWkbPointHex(WKB_LITTLE_ENDIAN)).toEqual({
      longitude: 21.0122,
      latitude: 52.2297,
    });
  });

  it('decodes big-endian WKB too', () => {
    // Same point, byte-swapped. Byte order flag 0.
    const bigEndian =
      '00' +
      '00000001' +
      '20E61000' +
      '4035031F8A0902DE' +
      '404A1D66CF41F213';
    expect(decodeWkbPointHex(bigEndian)).toEqual({
      longitude: 21.0122,
      latitude: 52.2297,
    });
  });

  it('rejects other geometry types rather than inventing coordinates', () => {
    // 25 valid hex bytes, but the type is 2 (LineString) instead of 1. The 16
    // bytes after the header are not two float64s, so reading them would place
    // a point somewhere meaningless.
    const linestring = '01' + '02000000' + '20E61000' + '00'.repeat(16);
    expect(decodeWkbPointHex(linestring)).toBeNull();

    const polygon = '01' + '03000000' + '20E61000' + '00'.repeat(16);
    expect(decodeWkbPointHex(polygon)).toBeNull();

    // The SRID flag on a non-point type is still not a point.
    const flagged = '01' + '03000020' + '20E61000' + '00'.repeat(16);
    expect(decodeWkbPointHex(flagged)).toBeNull();
  });

  it('does not read an all-zero buffer as Null Island', () => {
    // Right length, valid hex, every byte zero. The type field reads as 0,
    // which is not a point, so nothing is returned. Decoding it as (0, 0)
    // would put an offer in the Gulf of Guinea on the strength of a buffer
    // that says nothing at all.
    expect(decodeWkbPointHex('0'.repeat(50))).toBeNull();

    // A genuine (0, 0) is still reported as one: the type is a real point
    // there, so the coordinates are meaningful even though they are null.
    const nullIsland = '01' + '01000020' + '20E61000' + '00'.repeat(16);
    expect(decodeWkbPointHex(nullIsland)).toEqual({ longitude: 0, latitude: 0 });
  });

  it('rejects coordinates outside the valid range', () => {
    // A latitude of 999 cannot be a real point, so returning it would put a
    // bogus location on the map rather than admitting the value is wrong.
    const bytes = new Uint8Array(16);
    const view = new DataView(bytes.buffer);
    view.setFloat64(0, 21.0122, true);
    view.setFloat64(8, 999, true);
    const hex =
      '01' +
      '01000020' +
      'E6100000' +
      Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    expect(decodeWkbPointHex(hex)).toBeNull();
  });

  it('tolerates surrounding whitespace', () => {
    expect(decodeWkbPointHex(`  ${WKB_LITTLE_ENDIAN}\n`)).toEqual({
      longitude: 21.0122,
      latitude: 52.2297,
    });
  });

  it('rejects strings that are not WKB at all', () => {
    expect(decodeWkbPointHex('')).toBeNull();
    expect(decodeWkbPointHex('not hex at all')).toBeNull();
    expect(decodeWkbPointHex('0'.repeat(10))).toBeNull();
    expect(decodeWkbPointHex('zz'.repeat(25))).toBeNull();
  });
});

describe('parseWktPoint', () => {
  it('parses WKT', () => {
    expect(parseWktPoint('POINT(21.0122 52.2297)')).toEqual({
      longitude: 21.0122,
      latitude: 52.2297,
    });
  });

  it('parses EWKT with an SRID prefix', () => {
    expect(parseWktPoint('SRID=4326;POINT(21.0122 52.2297)')).toEqual({
      longitude: 21.0122,
      latitude: 52.2297,
    });
  });

  it('handles negative coordinates', () => {
    expect(parseWktPoint('POINT(-73.9857 40.7484)')).toEqual({
      longitude: -73.9857,
      latitude: 40.7484,
    });
  });

  it('rejects other geometry types', () => {
    expect(parseWktPoint('LINESTRING(0 0, 1 1)')).toBeNull();
    expect(parseWktPoint('POINT(21.0122)')).toBeNull();
  });
});

describe('parseGeoJsonPoint', () => {
  it('parses an object', () => {
    expect(
      parseGeoJsonPoint({ type: 'Point', coordinates: [21.0122, 52.2297] }),
    ).toEqual({ longitude: 21.0122, latitude: 52.2297 });
  });

  it('parses a JSON string', () => {
    expect(
      parseGeoJsonPoint('{"type":"Point","coordinates":[21.0122,52.2297]}'),
    ).toEqual({ longitude: 21.0122, latitude: 52.2297 });
  });

  it('rejects other types', () => {
    expect(parseGeoJsonPoint({ type: 'LineString', coordinates: [[0, 0]] })).toBeNull();
    expect(parseGeoJsonPoint({ type: 'Point', coordinates: ['a', 'b'] })).toBeNull();
    expect(parseGeoJsonPoint('not json')).toBeNull();
    expect(parseGeoJsonPoint(null)).toBeNull();
  });
});

describe('parsePostGisPoint', () => {
  it('prefers the real database format', () => {
    expect(parsePostGisPoint(WKB_LITTLE_ENDIAN)).toEqual({
      longitude: 21.0122,
      latitude: 52.2297,
    });
  });

  it('still handles the formats that worked before', () => {
    // Removing a working branch to add another is how regressions happen, and
    // these are the shapes test fixtures and projected columns produce.
    expect(parsePostGisPoint('POINT(21.0122 52.2297)')).toEqual({
      longitude: 21.0122,
      latitude: 52.2297,
    });
    expect(
      parsePostGisPoint({ type: 'Point', coordinates: [21.0122, 52.2297] }),
    ).toEqual({ longitude: 21.0122, latitude: 52.2297 });
  });

  it('returns null for absence', () => {
    expect(parsePostGisPoint(null)).toBeNull();
    expect(parsePostGisPoint(undefined)).toBeNull();
    expect(parsePostGisPoint('')).toBeNull();
    expect(parsePostGisPoint('   ')).toBeNull();
  });

  it('never throws on arbitrary input', () => {
    for (const value of [{}, [], 'POINT(', '0x10', 42, true, NaN]) {
      expect(() => parsePostGisPoint(value)).not.toThrow();
    }
  });
});