// Per-journey map view. Renders a polyline through every recorded
// position during the journey's time window — border-crossing waypoints
// from EF_Border_Crossings, plus any EF_GNSS_Places samples in between
// — so an itinerary like "F → B → NL → D" reads as a route on a map
// instead of a string of country codes.

import { useEffect, useMemo } from "react";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  useMap,
} from "@vis.gl/react-google-maps";

import type { db } from "../wailsjs/go/models";
import type { BorderTrip, Journey } from "./borderCrossings";
import { nationAlpha } from "./nations";

const HEIGHT = 320;
const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "";
const MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID ?? "TACHO_VIEWER_DARK";

type Waypoint = {
  ts: string; // ISO timestamp
  lat: number;
  lng: number;
  kind: "border" | "gnss";
  // For border markers: the country code to label with. For "enter"
  // markers (vehicle entering this country) the chip is filled; for
  // "leave" markers it's outlined.
  countryCode?: number;
  countryRole?: "leave" | "enter";
  title: string; // hover tooltip
};

export function JourneyMap({
  journey,
  gnssPoints,
}: {
  journey: Journey;
  gnssPoints: db.GnssPoint[];
}) {
  const waypoints = useMemo<Waypoint[]>(() => {
    const out: Waypoint[] = [];
    // Emit waypoints from each leg.
    for (const leg of journey.legs) {
      addLegWaypoints(leg, out);
    }
    // Filter and add GNSS samples that fall within the journey window.
    const startMs = Date.parse(journey.startAt);
    const endMs = Date.parse(journey.endAt);
    for (const p of gnssPoints) {
      const t = Date.parse(p.timestamp);
      if (t < startMs || t > endMs) continue;
      if (p.latitude === 0 && p.longitude === 0) continue;
      out.push({
        ts: p.timestamp,
        lat: p.latitude,
        lng: p.longitude,
        kind: "gnss",
        title: `${p.timestamp.replace("T", " ").replace("Z", "")} · ${p.latitude.toFixed(3)}, ${p.longitude.toFixed(3)}`,
      });
    }
    // Sort chronologically.
    out.sort((a, b) => a.ts.localeCompare(b.ts));
    return out;
  }, [journey, gnssPoints]);

  if (!API_KEY) {
    // Reuse the existing MapPanel "no API key" UX would be ideal but
    // we don't want to bloat journey rows with that empty state every
    // time. Just stay silent — the main MapPanel already nags the user.
    return null;
  }

  if (waypoints.length === 0) {
    return (
      <div className="border-t bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
        No coordinates recorded for this journey.
      </div>
    );
  }

  return (
    <div className="border-t" style={{ height: HEIGHT }}>
      <APIProvider apiKey={API_KEY}>
        <Map
          mapId={MAP_ID}
          defaultCenter={{ lat: waypoints[0].lat, lng: waypoints[0].lng }}
          defaultZoom={6}
          gestureHandling="cooperative"
          disableDefaultUI={false}
          colorScheme="DARK"
          clickableIcons={false}
        >
          <FitToWaypoints waypoints={waypoints} />
          <RoutePolyline waypoints={waypoints} />
          {waypoints.map((w, i) => (
            <AdvancedMarker
              key={`${w.kind}-${i}`}
              position={{ lat: w.lat, lng: w.lng }}
              title={w.title}
            >
              {w.kind === "border" ? (
                <BorderPin code={w.countryCode!} role={w.countryRole!} />
              ) : (
                <GnssDot />
              )}
            </AdvancedMarker>
          ))}
        </Map>
      </APIProvider>
    </div>
  );
}

function addLegWaypoints(leg: BorderTrip, out: Waypoint[]) {
  if (leg.kind === "crossing") {
    if (leg.latitude || leg.longitude) {
      out.push({
        ts: leg.at,
        lat: leg.latitude,
        lng: leg.longitude,
        kind: "border",
        countryCode: leg.to,
        countryRole: "enter",
        title: `${leg.at.replace("T", " ").replace("Z", "")} · entered ${nationAlpha(leg.to)} from ${nationAlpha(leg.from)}`,
      });
    }
    return;
  }
  if (leg.kind === "offmap") {
    if (leg.fromLatitude || leg.fromLongitude) {
      out.push({
        ts: leg.leftAt,
        lat: leg.fromLatitude,
        lng: leg.fromLongitude,
        kind: "border",
        countryCode: leg.from,
        countryRole: "leave",
        title: `${leg.leftAt.replace("T", " ").replace("Z", "")} · left ${nationAlpha(leg.from)} (off-map)`,
      });
    }
    if (leg.toLatitude || leg.toLongitude) {
      out.push({
        ts: leg.rejoinedAt,
        lat: leg.toLatitude,
        lng: leg.toLongitude,
        kind: "border",
        countryCode: leg.to,
        countryRole: "enter",
        title: `${leg.rejoinedAt.replace("T", " ").replace("Z", "")} · entered ${nationAlpha(leg.to)} (rejoined map)`,
      });
    }
    return;
  }
  // orphan
  if (leg.latitude || leg.longitude) {
    out.push({
      ts: leg.at,
      lat: leg.latitude,
      lng: leg.longitude,
      kind: "border",
      countryCode: leg.to,
      countryRole: "enter",
      title: `${leg.at.replace("T", " ").replace("Z", "")} · partial record`,
    });
  }
}

function FitToWaypoints({ waypoints }: { waypoints: Waypoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (!map || waypoints.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    for (const w of waypoints) {
      bounds.extend({ lat: w.lat, lng: w.lng });
    }
    if (waypoints.length === 1) {
      map.setCenter(bounds.getCenter());
      map.setZoom(11);
    } else {
      map.fitBounds(bounds, 48);
    }
  }, [map, waypoints]);
  return null;
}

function RoutePolyline({ waypoints }: { waypoints: Waypoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (!map || waypoints.length < 2) return;
    const polyline = new google.maps.Polyline({
      path: waypoints.map((w) => ({ lat: w.lat, lng: w.lng })),
      strokeColor: "#60a5fa",
      strokeOpacity: 0.9,
      strokeWeight: 3,
      geodesic: true,
    });
    polyline.setMap(map);
    return () => {
      polyline.setMap(null);
    };
  }, [map, waypoints]);
  return null;
}

function BorderPin({
  code,
  role,
}: {
  code: number;
  role: "leave" | "enter";
}) {
  const filled = role === "enter";
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        padding: "2px 6px",
        borderRadius: 6,
        fontSize: 10,
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontWeight: 600,
        background: filled ? "rgb(59 130 246)" : "rgba(15, 23, 42, 0.85)",
        color: filled ? "white" : "rgb(226 232 240)",
        border: "1px solid " + (filled ? "rgb(59 130 246)" : "rgb(71 85 105)"),
        boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
        transform: "translateY(-50%)",
      }}
    >
      {nationAlpha(code)}
    </div>
  );
}

function GnssDot() {
  return (
    <div
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: "rgb(74 222 128)",
        border: "1.5px solid white",
        boxShadow: "0 0 4px rgba(0,0,0,0.4)",
      }}
    />
  );
}
