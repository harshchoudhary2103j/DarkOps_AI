import { GeoJSONPolygon } from './types';

export interface LatLngPoint {
  latitude: number;
  longitude: number;
}

/**
 * Determines if a given geographic point (lat, lon) is inside or on the boundary
 * of a GeoJSON Polygon using the ray-casting algorithm.
 *
 * GeoJSON polygon coordinate convention: [longitude, latitude].
 * Boundary points are considered inside (inclusive).
 */
export function isPointInPolygon(point: LatLngPoint, polygon: GeoJSONPolygon): boolean {
  if (!polygon || !polygon.coordinates || polygon.coordinates.length === 0) {
    return false;
  }

  // The first ring is the exterior ring
  const exteriorRing = polygon.coordinates[0];
  if (!exteriorRing || exteriorRing.length < 4) {
    return false;
  }

  const px = point.longitude;
  const py = point.latitude;
  let inside = false;

  for (let i = 0, j = exteriorRing.length - 1; i < exteriorRing.length; j = i++) {
    const xi = exteriorRing[i][0];
    const yi = exteriorRing[i][1];
    const xj = exteriorRing[j][0];
    const yj = exteriorRing[j][1];

    // Check if point is exactly on vertex
    if (Math.abs(xi - px) < 1e-9 && Math.abs(yi - py) < 1e-9) {
      return true;
    }

    // Check if point lies on segment between (xi, yi) and (xj, yj)
    const onSegment = isPointOnSegment(px, py, xi, yi, xj, yj);
    if (onSegment) {
      return true;
    }

    // Ray casting intersection test
    const intersect =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;

    if (intersect) {
      inside = !inside;
    }
  }

  // If inside exterior ring, check if point falls inside any interior holes (if any)
  if (inside && polygon.coordinates.length > 1) {
    for (let h = 1; h < polygon.coordinates.length; h++) {
      const holeRing = polygon.coordinates[h];
      if (isPointInRing(px, py, holeRing)) {
        return false; // Inside a hole means outside the polygon
      }
    }
  }

  return inside;
}

function isPointOnSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  epsilon = 1e-7
): boolean {
  // Check bounding box first
  const minX = Math.min(x1, x2) - epsilon;
  const maxX = Math.max(x1, x2) + epsilon;
  const minY = Math.min(y1, y2) - epsilon;
  const maxY = Math.max(y1, y2) + epsilon;

  if (px < minX || px > maxX || py < minY || py > maxY) {
    return false;
  }

  // Cross product to test collinearity: (px - x1)*(y2 - y1) - (py - y1)*(x2 - x1)
  const crossProduct = Math.abs((px - x1) * (y2 - y1) - (py - y1) * (x2 - x1));
  return crossProduct < epsilon;
}

function isPointInRing(px: number, py: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];

    const intersect =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;

    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
}
