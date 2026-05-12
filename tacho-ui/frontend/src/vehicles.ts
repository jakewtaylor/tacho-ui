import type { db } from "../wailsjs/go/models";

// VehicleUsage describes one driver→vehicle usage window. Shape matches the
// Wails-generated db.DriverVehicle exactly — the TS alias just gives it a name
// that reads more naturally on the consuming side.
export type VehicleUsage = db.DriverVehicle;

// Find the vehicle whose usage window overlaps the given shift window.
// Vehicle records and shift records come from independent sources but should
// align — for our sample they share start/end timestamps to the second.
export function vehicleForShift(
  vehicles: VehicleUsage[],
  shiftStart: string,
  shiftEnd: string | null,
): VehicleUsage | null {
  if (!shiftEnd) return null;
  const start = new Date(shiftStart).getTime();
  const end = new Date(shiftEnd).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;

  let best: { v: VehicleUsage; overlap: number } | null = null;
  for (const v of vehicles) {
    const vStart = new Date(v.firstUse).getTime();
    const vEnd = new Date(v.lastUse).getTime();
    if (Number.isNaN(vStart) || Number.isNaN(vEnd)) continue;
    const overlap = Math.min(end, vEnd) - Math.max(start, vStart);
    if (overlap <= 0) continue;
    if (!best || overlap > best.overlap) best = { v, overlap };
  }
  return best?.v ?? null;
}
