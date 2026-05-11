import { useEffect, useMemo } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  useMap,
} from '@vis.gl/react-google-maps';
import { extractGnssPoints, type GnssPoint } from './gnss';

const HEIGHT = 420;

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';
const MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID ?? 'TACHO_VIEWER_DARK';

type Props = {
  data: any;
  /** yyyy-mm-dd — only show GNSS samples whose timestamp falls on this UTC date. */
  dateFilter?: string;
  /** Optional override for the section heading. */
  title?: string;
};

export function MapPanel({ data, dateFilter, title }: Props) {
  const allPoints = useMemo<GnssPoint[]>(() => extractGnssPoints(data), [data]);
  const points = useMemo(() => {
    if (!dateFilter) return allPoints;
    return allPoints.filter((p) => p.timestamp.startsWith(dateFilter));
  }, [allPoints, dateFilter]);

  const segments = useMemo<GnssPoint[][]>(() => {
    if (points.length < 2) return points.length === 1 ? [points] : [];
    const out: GnssPoint[][] = [];
    let current: GnssPoint[] = [points[0]];
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const cur = points[i];
      const gapH =
        (new Date(cur.timestamp).getTime() - new Date(prev.timestamp).getTime()) /
        3_600_000;
      if (gapH > 12) {
        if (current.length > 0) out.push(current);
        current = [cur];
      } else {
        current.push(cur);
      }
    }
    if (current.length > 0) out.push(current);
    return out;
  }, [points]);

  if (allPoints.length === 0) return null;

  const headerText =
    title ?? (dateFilter ? `Driving map · ${dateFilter}` : `Driving map · ${points.length.toLocaleString()} GNSS samples`);

  if (!API_KEY) {
    return (
      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-(--color-muted)">
          {headerText}
        </h2>
        <div className="rounded-lg border border-(--color-border) bg-(--color-surface) px-4 py-6 text-sm">
          <p className="mb-2 font-semibold">Google Maps API key not configured</p>
          <p className="text-(--color-muted)">
            Create{' '}
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">
              tacho-ui/frontend/.env.local
            </code>{' '}
            with:
          </p>
          <pre className="mt-2 overflow-auto rounded bg-black/35 p-3 text-xs">
{`VITE_GOOGLE_MAPS_API_KEY=your-key-here
# Optional: a cloud-styled Map ID
VITE_GOOGLE_MAPS_MAP_ID=your-map-id`}
          </pre>
          <p className="mt-2 text-xs text-(--color-muted)">
            Enable "Maps JavaScript API" on the key in Google Cloud Console. Then{' '}
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">wails dev</code>{' '}
            (or rebuild) to pick it up.
          </p>
        </div>
      </section>
    );
  }

  if (dateFilter && points.length === 0) {
    return (
      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-(--color-muted)">
          {headerText}
        </h2>
        <div className="rounded-lg border border-(--color-border) bg-(--color-surface) px-4 py-6 text-center text-sm text-(--color-muted)">
          No GNSS samples recorded for this day.
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-(--color-muted)">
        {headerText}
      </h2>
      <div className="overflow-hidden rounded-lg border border-(--color-border) bg-(--color-surface)">
        <div style={{ height: HEIGHT }}>
          <APIProvider apiKey={API_KEY}>
            <Map
              mapId={MAP_ID}
              defaultCenter={{ lat: 51.5, lng: 0 }}
              defaultZoom={5}
              gestureHandling="greedy"
              disableDefaultUI={false}
              colorScheme="DARK"
              clickableIcons={false}
            >
              <FitToPoints points={points} />
              <Polylines segments={segments} />
              {points.map((p, i) => (
                <AdvancedMarker
                  key={i}
                  position={{ lat: p.latitude, lng: p.longitude }}
                  title={`${p.timestamp.replace('T', ' ').replace('Z', '')} · ${p.latitude.toFixed(3)}, ${p.longitude.toFixed(3)}`}
                >
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: 'oklch(0.78 0.18 145)',
                      border: '2px solid white',
                      boxShadow: '0 0 4px rgba(0,0,0,0.4)',
                    }}
                  />
                </AdvancedMarker>
              ))}
            </Map>
          </APIProvider>
        </div>
        <p className="px-3 py-2 text-xs text-(--color-muted)">
          {points.length.toLocaleString()} GNSS samples. Lines connect consecutive samples within the same continuous driving window (gap &lt; 12h).
        </p>
      </div>
    </section>
  );
}

function FitToPoints({ points }: { points: GnssPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (!map || points.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    for (const p of points) {
      bounds.extend({ lat: p.latitude, lng: p.longitude });
    }
    if (points.length === 1) {
      map.setCenter(bounds.getCenter());
      map.setZoom(12);
    } else {
      map.fitBounds(bounds, 48);
    }
  }, [map, points]);
  return null;
}

function Polylines({ segments }: { segments: GnssPoint[][] }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const lines: google.maps.Polyline[] = [];
    for (const seg of segments) {
      if (seg.length < 2) continue;
      const polyline = new google.maps.Polyline({
        path: seg.map((p) => ({ lat: p.latitude, lng: p.longitude })),
        strokeColor: '#4ade80',
        strokeOpacity: 0.85,
        strokeWeight: 3,
        geodesic: true,
      });
      polyline.setMap(map);
      lines.push(polyline);
    }
    return () => {
      for (const line of lines) line.setMap(null);
    };
  }, [map, segments]);
  return null;
}
