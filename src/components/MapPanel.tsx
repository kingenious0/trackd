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

const TILES = {
  light: {
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
  },
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
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
}

export default function MapPanel({ telemetry, theme, stolen = false }: Props) {
  const fixes = useMemo(
    () =>
      telemetry
        .filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lng))
        .map((row) => ({ ...row, lat: Number(row.lat), lng: Number(row.lng) })),
    [telemetry]
  );

  const latest = fixes[fixes.length - 1];
  const trail: LatLngExpression[] = fixes.map((fix) => [fix.lat, fix.lng]);
  const center: LatLngTuple = latest ? [latest.lat, latest.lng] : FALLBACK_CENTER;
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
        <TileLayer url={TILES[theme].url} attribution={TILES[theme].attribution} />
        <ZoomControl position="bottomright" />
        <FlyToLatest position={latest ? [latest.lat, latest.lng] : null} />

        {trail.length > 1 && (
          <Polyline
            positions={trail}
            pathOptions={{ color: accent, weight: 3, opacity: 0.7 }}
          />
        )}

        {latest && (
          <>
            <Marker position={[latest.lat, latest.lng]} icon={pinIcon}>
              <Popup>
                <div className="text-sm">
                  <p className="font-semibold">
                    {latest.lat.toFixed(5)}, {latest.lng.toFixed(5)}
                  </p>
                  <p className="text-muted">
                    {latest.triggerReason} · {new Date(latest.timestamp).toLocaleString()}
                  </p>
                </div>
              </Popup>
            </Marker>
            {latest.accuracy > 0 && (
              <Circle
                center={[latest.lat, latest.lng]}
                radius={latest.accuracy}
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
