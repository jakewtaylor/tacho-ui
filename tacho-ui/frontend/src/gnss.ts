export type GnssPoint = {
  timestamp: string;
  longitude: number;
  latitude: number;
  odometer: number;
};

export function extractGnssPoints(data: any): GnssPoint[] {
  const records =
    data?.gnss_accumulated_driving?.gnss_accumulated_driving_records ??
    data?.gnss_auth_accumulated_driving?.gnss_auth_accumulated_driving_records ??
    [];
  if (!Array.isArray(records)) return [];

  const points: GnssPoint[] = [];
  for (const r of records) {
    const ts = r?.time_stamp;
    const coords = r?.gnss_place_record?.geo_coordinates;
    if (!ts || ts.startsWith('0001')) continue;
    if (!coords || typeof coords.longitude !== 'number' || typeof coords.latitude !== 'number') {
      continue;
    }
    // Filter clearly-invalid points (placeholder "no fix" values are sometimes 0,0).
    if (coords.longitude === 0 && coords.latitude === 0) continue;
    points.push({
      timestamp: ts,
      longitude: coords.longitude,
      latitude: coords.latitude,
      odometer: r.vehicle_odometer_value ?? 0,
    });
  }
  return points.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

// Bounding box across all points, with a configurable padding factor.
export function boundsOf(points: GnssPoint[], padding = 0.5): {
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
