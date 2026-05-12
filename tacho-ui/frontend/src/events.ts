export type CardEvent = {
  // 'event' or 'fault' — kept as plain string to match the Wails binding shape.
  kind: string;
  type: number;
  begin: string;
  end: string | null;
  vehicleRegistration: string;
  vehicleNation: number;
};

export function durationMinutes(
  begin: string,
  end: string | null,
): number | null {
  if (!end) return null;
  const a = new Date(begin).getTime();
  const b = new Date(end).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 60000);
}
