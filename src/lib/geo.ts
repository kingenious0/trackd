export interface AddressDetails {
  displayName: string;
  suburb?: string;
  neighbourhood?: string;
  quarter?: string;
  city?: string;
  town?: string;
  village?: string;
  road?: string;
  state?: string;
  country?: string;
}

const geoCache = new Map<string, string>();

/**
 * Reverse geocodes latitude & longitude into a human-readable area name
 * using OpenStreetMap Nominatim with in-memory caching.
 */
export async function getAreaName(lat: number, lng: number): Promise<string> {
  // Avoid querying invalid or uninitialized coordinates
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
    return "Locating…";
  }

  // Cache key rounded to ~11 meters precision (4 decimals)
  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (geoCache.has(cacheKey)) {
    return geoCache.get(cacheKey)!;
  }

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "Trackd-Web-Console/1.0"
        }
      }
    );

    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);

    const data = await res.json();
    const addr = (data.address || {}) as Record<string, string | undefined>;

    // Extract most recognizable landmarks, suburbs, or districts
    const primary =
      addr.suburb ||
      addr.neighbourhood ||
      addr.quarter ||
      addr.residential ||
      addr.road ||
      addr.village ||
      addr.hamlet;

    const secondary =
      addr.city ||
      addr.town ||
      addr.municipality ||
      addr.county ||
      addr.state_district ||
      addr.state ||
      addr.country;

    let resolvedName = "";
    if (primary && secondary) {
      resolvedName = `${primary}, ${secondary}`;
    } else if (data.display_name) {
      resolvedName = data.display_name.split(",").slice(0, 3).join(",").trim();
    } else {
      resolvedName = `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`;
    }

    geoCache.set(cacheKey, resolvedName);
    return resolvedName;
  } catch (err) {
    console.warn("Reverse geocoding error:", err);
    const fallback = `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`;
    return fallback;
  }
}
