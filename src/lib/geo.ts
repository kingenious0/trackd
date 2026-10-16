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
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      {
        headers: {
          Accept: "application/json",
          "Accept-Language": "en",
          "User-Agent": "Trackd-Web-Controller/1.0"
        }
      }
    );

    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);

    const data = await res.json();
    const addr = (data.address || {}) as Record<string, string | undefined>;

    // Priority 1: High-precision landmarks / campus buildings / POIs
    const landmark =
      addr.amenity ||          // e.g. "UBA Bank", "USTED Clinic", "Pharmacy"
      addr.building ||         // e.g. "New Auditorium", "Administration Block"
      addr.university ||       // e.g. "AAMUSTED", "KNUST"
      addr.college ||
      addr.school ||
      addr.leisure ||          // e.g. "Sports Field", "Tennis Court"
      addr.shop ||             // e.g. "Supermarket"
      addr.office ||
      addr.place;

    // Priority 2: Specific road or street
    const road = addr.road || addr.pedestrian || addr.footway || addr.residential;

    // Priority 3: Suburb or quarter
    const suburb = addr.suburb || addr.neighbourhood || addr.quarter || addr.village;

    // Priority 4: City or town
    const city = addr.city || addr.town || addr.municipality || addr.county || "Kumasi";

    let resolvedName = "";

    if (landmark) {
      // E.g. "Near New Auditorium, AAMUSTED, Tanoso" or "UBA Bank, Bantama"
      const locationParts = [landmark];
      if (road && road !== landmark) locationParts.push(road);
      if (suburb && suburb !== landmark) locationParts.push(suburb);
      else if (city && city !== landmark) locationParts.push(city);
      resolvedName = `Near ${locationParts.slice(0, 3).join(", ")}`;
    } else if (road && suburb) {
      resolvedName = `${road}, ${suburb}`;
    } else if (road && city) {
      resolvedName = `${road}, ${city}`;
    } else if (suburb && city) {
      resolvedName = `${suburb}, ${city}`;
    } else if (data.display_name) {
      resolvedName = data.display_name.split(",").slice(0, 3).join(", ").trim();
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
