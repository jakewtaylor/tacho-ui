import type { db } from "../wailsjs/go/models";

export type GnssPoint = db.GnssPoint;

// Bounding box across all points, with a configurable padding factor.
export function boundsOf(
  points: GnssPoint[],
  padding = 0.5,
): {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
} | null {
  if (points.length === 0) return null;
  let minLon = Infinity,
    maxLon = -Infinity,
    minLat = Infinity,
    maxLat = -Infinity;
  for (const p of points) {
    if (p.longitude < minLon) minLon = p.longitude;
    if (p.longitude > maxLon) maxLon = p.longitude;
    if (p.latitude < minLat) minLat = p.latitude;
    if (p.latitude > maxLat) maxLat = p.latitude;
  }
  const lonPad = Math.max(1, (maxLon - minLon) * padding);
  const latPad = Math.max(1, (maxLat - minLat) * padding);
  return {
    minLon: minLon - lonPad,
    maxLon: maxLon + lonPad,
    minLat: minLat - latPad,
    maxLat: maxLat + latPad,
  };
}
