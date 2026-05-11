export type CardEvent = {
  kind: 'event' | 'fault';
  type: number;
  begin: string;
  end: string | null;
  vehicleRegistration: string;
  vehicleNation: number;
};

type RawEntry = {
  event_type?: number;
  fault_type?: number;
  event_begin_time?: string | null;
  event_end_time?: string | null;
  fault_begin_time?: string | null;
  fault_end_time?: string | null;
  event_vehicle_registration?: { vehicle_registration_nation?: number; vehicle_registration_number?: string };
  fault_vehicle_registration?: { vehicle_registration_nation?: number; vehicle_registration_number?: string };
};

function flatten(records: any[] | undefined, innerKey: string): RawEntry[] {
  if (!Array.isArray(records)) return [];
  const out: RawEntry[] = [];
  for (const bucket of records) {
    const inner = bucket?.[innerKey];
    if (Array.isArray(inner)) out.push(...inner);
  }
  return out;
}

export function extractEventsAndFaults(data: any): CardEvent[] {
  const events1 = flatten(data?.card_event_data_1?.card_event_records_array, 'card_event_records');
  const events2 = flatten(data?.card_event_data_2?.card_event_records_array, 'card_event_records');
  const faults1 = flatten(data?.card_fault_data_1?.card_fault_records_array, 'card_fault_records');
  const faults2 = flatten(data?.card_fault_data_2?.card_fault_records_array, 'card_fault_records');

  const rows: CardEvent[] = [];

  for (const e of [...events1, ...events2]) {
    const begin = e.event_begin_time ?? null;
    if (!begin || begin.startsWith('0001')) continue;
    rows.push({
      kind: 'event',
      type: e.event_type ?? 0,
      begin,
      end: e.event_end_time ?? null,
      vehicleRegistration: e.event_vehicle_registration?.vehicle_registration_number ?? '',
      vehicleNation: e.event_vehicle_registration?.vehicle_registration_nation ?? 0,
    });
  }
  for (const f of [...faults1, ...faults2]) {
    const begin = f.fault_begin_time ?? null;
    if (!begin || begin.startsWith('0001')) continue;
    rows.push({
      kind: 'fault',
      type: f.fault_type ?? 0,
      begin,
      end: f.fault_end_time ?? null,
      vehicleRegistration: f.fault_vehicle_registration?.vehicle_registration_number ?? '',
      vehicleNation: f.fault_vehicle_registration?.vehicle_registration_nation ?? 0,
    });
  }

  return rows.sort((a, b) => b.begin.localeCompare(a.begin)); // newest first
}

export function durationMinutes(begin: string, end: string | null): number | null {
  if (!end) return null;
  const a = new Date(begin).getTime();
  const b = new Date(end).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 60000);
}
