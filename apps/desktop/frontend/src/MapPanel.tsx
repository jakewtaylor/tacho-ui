import { useEffect, useMemo } from "react";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  useMap,
} from "@vis.gl/react-google-maps";
import { MapPin } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@tacholens/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@tacholens/ui/components/empty";
import { type GnssPoint } from "./gnss";

const HEIGHT = 420;

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "";
const MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID ?? "TACHO_VIEWER_DARK";

type Props = {
  points: GnssPoint[];
  /** yyyy-mm-dd — only show GNSS samples whose timestamp falls on this UTC date. */
  dateFilter?: string;
  /** Optional override for the title. */
  title?: string;
};

export function MapPanel({ points: allPoints, dateFilter, title }: Props) {
  const points = useMemo<GnssPoint[]>(() => {
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
        (new Date(cur.timestamp).getTime() -
          new Date(prev.timestamp).getTime()) /
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
    title ??
    (dateFilter
      ? `Driving map · ${dateFilter}`
      : `Driving map · ${points.length.toLocaleString()} GNSS samples`);

  if (!API_KEY) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{headerText}</CardTitle>
        </CardHeader>
        <CardContent>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MapPin />
              </EmptyMedia>
              <EmptyTitle>Google Maps API key not configured</EmptyTitle>
              <EmptyDescription>
                Create{" "}
                <code className="rounded bg-muted px-1">
                  frontend/.env.local
                </code>{" "}
                with{" "}
                <code className="rounded bg-muted px-1">
                  VITE_GOOGLE_MAPS_API_KEY
                </code>
                , enable the "Maps JavaScript API" on the key, then restart{" "}
                <code>wails dev</code>.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    );
  }

  if (dateFilter && points.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{headerText}</CardTitle>
          <CardDescription>
            No GNSS samples recorded for this day.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b">
        <CardTitle>{headerText}</CardTitle>
      </CardHeader>
      <div style={{ height: HEIGHT }}>
        <APIProvider apiKey={API_KEY}>
          <Map
            mapId={MAP_ID}
            defaultCenter={{ lat: 51.5, lng: 0 }}
            defaultZoom={5}
            gestureHandling="cooperative"
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
                title={`${p.timestamp.replace("T", " ").replace("Z", "")} · ${p.latitude.toFixed(3)}, ${p.longitude.toFixed(3)}`}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: "var(--color-driving)",
                    border: "2px solid white",
                    boxShadow: "0 0 4px rgba(0,0,0,0.4)",
                  }}
                />
              </AdvancedMarker>
            ))}
          </Map>
        </APIProvider>
      </div>
      <CardFooter className="text-xs text-muted-foreground">
        {points.length.toLocaleString()} GNSS samples. Lines connect consecutive
        samples within the same continuous driving window (gap &lt; 12h).
      </CardFooter>
    </Card>
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
        strokeColor: "#4ade80",
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
