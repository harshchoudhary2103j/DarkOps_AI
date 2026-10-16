import { describe, it, expect } from 'vitest';
import { isPointInPolygon } from '../../src/domain/polygon.utils';
import { GeoJSONPolygon } from '../../src/domain/types';

describe('Point-in-Polygon (Ray Casting) Utility', () => {
  // A square polygon covering [0,0] to [10,10]
  // GeoJSON coordinates are [longitude, latitude]
  const squarePolygon: GeoJSONPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0]
      ]
    ]
  };

  it('correctly identifies a point strictly inside the polygon', () => {
    // point: lat=5, lon=5
    expect(isPointInPolygon({ latitude: 5, longitude: 5 }, squarePolygon)).toBe(true);
  });

  it('correctly identifies a point strictly outside the polygon', () => {
    expect(isPointInPolygon({ latitude: 15, longitude: 5 }, squarePolygon)).toBe(false);
    expect(isPointInPolygon({ latitude: 5, longitude: 15 }, squarePolygon)).toBe(false);
    expect(isPointInPolygon({ latitude: -1, longitude: 5 }, squarePolygon)).toBe(false);
  });

  it('includes points exactly on polygon vertices (boundary inclusion)', () => {
    expect(isPointInPolygon({ latitude: 0, longitude: 0 }, squarePolygon)).toBe(true);
    expect(isPointInPolygon({ latitude: 10, longitude: 10 }, squarePolygon)).toBe(true);
    expect(isPointInPolygon({ latitude: 10, longitude: 0 }, squarePolygon)).toBe(true);
    expect(isPointInPolygon({ latitude: 0, longitude: 10 }, squarePolygon)).toBe(true);
  });

  it('includes points exactly on polygon edges (boundary inclusion)', () => {
    expect(isPointInPolygon({ latitude: 5, longitude: 0 }, squarePolygon)).toBe(true);
    expect(isPointInPolygon({ latitude: 0, longitude: 5 }, squarePolygon)).toBe(true);
    expect(isPointInPolygon({ latitude: 10, longitude: 5 }, squarePolygon)).toBe(true);
    expect(isPointInPolygon({ latitude: 5, longitude: 10 }, squarePolygon)).toBe(true);
  });

  it('correctly handles polygon with an interior hole', () => {
    // Exterior: [0,0] to [10,10], Hole: [3,3] to [7,7]
    const polygonWithHole: GeoJSONPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0]
        ],
        [
          [3, 3],
          [7, 3],
          [7, 7],
          [3, 7],
          [3, 3]
        ]
      ]
    };

    // Point outside hole but inside exterior
    expect(isPointInPolygon({ latitude: 1, longitude: 1 }, polygonWithHole)).toBe(true);
    // Point inside hole (must return false)
    expect(isPointInPolygon({ latitude: 5, longitude: 5 }, polygonWithHole)).toBe(false);
  });

  it('returns false for malformed or empty polygon', () => {
    expect(isPointInPolygon({ latitude: 5, longitude: 5 }, { type: 'Polygon', coordinates: [] })).toBe(false);
    expect(isPointInPolygon({ latitude: 5, longitude: 5 }, null as any)).toBe(false);
  });
});
