import { useEffect, useMemo } from "react";
import { Circle, MapContainer, Marker, Polyline, Popup, TileLayer, ZoomControl, useMap } from "react-leaflet";
import type { LatLngExpression, LatLngTuple } from "leaflet";
import L from "leaflet";
import type { TelemetryLog } from "../lib/types";

const pinIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const FALLBACK_CENTER: LatLngTuple = [5.6037, -0.187];

const CARTO_KEY = (import.meta.env.VITE_CARTO_API_KEY as string | undefined)?.trim();
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const CARTO_ATTR = `${OSM_ATTR} &copy; <a href="https://carto.com/attributions">CARTO</a>`;

const TILES: Record<"light" | "dark", { url: string; attribution: string; className: string }> = {
  light: CARTO_KEY
    ? {
        url: `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`,
        attribution: CARTO_ATTR,
        className: ""
      }
    : {
        url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        attribution: OSM_ATTR,
        className: ""
      },
  dark: CARTO_KEY
    ? {
        url: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`,
        attribution: CARTO_ATTR,
        className: ""
      }
    : {
        url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        attribution: OSM_ATTR,
        className: ""
      }
};

function FlyToLatest({ position }: { position: LatLngTuple | null }) {
  const map = useMap();
  useEffect(() => {
    if (!position) return;
    map.flyTo(position, Math.max(map.getZoom(), 16), { duration: 0.8 });
  }, [map, position?.[0], position?.[1]]);
  return null;
}

interface Props {
  telemetry: TelemetryLog[];
  theme: "light" | "dark";
  stolen?: boolean;
  lastKnown?: { lat: number; lng: number; accuracy?: number; trigger?: string } | null;
}

export default function MapPanel({ telemetry, theme, stolen = false, lastKnown }: Props) {
  const fixes = useMemo(
    () =>
      telemetry
        .map((row) => ({ ...row, lat: Number(row.lat), lng: Number(row.lng) }))
        .filter(
          (row) =>
            Number.isFinite(row.lat) &&
            Number.isFinite(row.lng) &&
            !(row.lat === 0 && row.lng === 0)
        ),
    [telemetry]
  );

  const latest = fixes[fixes.length - 1];
  const trail: LatLngExpression[] = fixes.map((fix) => [fix.lat, fix.lng]);
  const fallbackFix =
    lastKnown &&
    Number.isFinite(lastKnown.lat) &&
    Number.isFinite(lastKnown.lng) &&
    !(lastKnown.lat === 0 && lastKnown.lng === 0)
      ? lastKnown
      : null;
  const showFix = latest
    ? {
        lat: latest.lat,
        lng: latest.lng,
        accuracy: latest.accuracy,
        detail: `${latest.triggerReason} · ${new Date(latest.timestamp).toLocaleString()}`
      }
    : fallbackFix
      ? {
          lat: fallbackFix.lat,
          lng: fallbackFix.lng,
          accuracy: fallbackFix.accuracy ?? 0,
          detail: `Last known position${fallbackFix.trigger ? ` · ${fallbackFix.trigger}` : ""}`
        }
      : null;
  const center: LatLngTuple = showFix ? [showFix.lat, showFix.lng] : FALLBACK_CENTER;
  const accent = stolen ? "#d93025" : "#1a73e8";

  return (
    <div className="absolute inset-0">
      <MapContainer
        center={center}
        zoom={16}
        scrollWheelZoom
        zoomControl={false}
        className="leaflet-container"
      >
        <TileLayer
          url={TILES[theme].url}
          attribution={TILES[theme].attribution}
          className={TILES[theme].className}
        />
        <ZoomControl position="bottomright" />
        <FlyToLatest position={showFix ? [showFix.lat, showFix.lng] : null} />

        {trail.length > 1 && (
          <Polyline
            positions={trail}
            pathOptions={{ color: accent, weight: 3, opacity: 0.7 }}
          />
        )}

        {showFix && (
          <>
            <Marker position={[showFix.lat, showFix.lng]} icon={pinIcon}>
              <Popup>
                <div className="text-sm">
                  <p className="font-semibold">
                    {showFix.lat.toFixed(5)}, {showFix.lng.toFixed(5)}
                  </p>
                  <p className="text-muted">{showFix.detail}</p>
                </div>
              </Popup>
            </Marker>
            {(showFix.accuracy ?? 0) > 0 && (
              <Circle
                center={[showFix.lat, showFix.lng]}
                radius={showFix.accuracy ?? 0}
                pathOptions={{
                  color: accent,
                  weight: 1,
                  fillColor: accent,
                  fillOpacity: 0.12
                }}
              />
            )}
          </>
        )}
      </MapContainer>
    </div>
  );
}
