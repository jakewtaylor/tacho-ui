export type VehicleRecord = {
  vehicle_first_use: string | null;
  vehicle_last_use: string | null;
  vehicle_odometer_begin: number;
  vehicle_odometer_end: number;
  vehicle_registration: {
    vehicle_registration_nation: number;
    vehicle_registration_number: string;
  };
};

export type VehicleUsage = {
  firstUse: string;
  lastUse: string;
  registration: string;
  nation: number;
  odoBegin: number;
  odoEnd: number;
};

export function extractVehicles(data: any): VehicleUsage[] {
  const g1 = data?.card_vehicles_used_1?.card_vehicle_records;
  const g2 = data?.card_vehicles_used_2?.card_vehicle_records;
  const raw: VehicleRecord[] =
    Array.isArray(g1) && g1.length > 0 ? g1 : Array.isArray(g2) ? g2 : [];

  return raw
    .filter((r) => r && r.vehicle_first_use && !r.vehicle_first_use.startsWith('0001'))
    .map((r) => ({
      firstUse: r.vehicle_first_use!,
      lastUse: r.vehicle_last_use ?? r.vehicle_first_use!,
      registration: r.vehicle_registration?.vehicle_registration_number ?? '',
      nation: r.vehicle_registration?.vehicle_registration_nation ?? 0,
      odoBegin: r.vehicle_odometer_begin,
      odoEnd: r.vehicle_odometer_end,
    }));
}

// Find the vehicle whose usage window overlaps the given shift window.
// Vehicle records and shift records come from independent sources but should
// align — for our sample they share start/end timestamps to the second.
export function vehicleForShift(
  vehicles: VehicleUsage[],
  shiftStart: string,
  shiftEnd: string | null
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
