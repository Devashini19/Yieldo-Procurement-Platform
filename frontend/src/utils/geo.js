// Geofence radius for automatic arrival check-in (in meters)
export const GEOFENCE_RADIUS_METERS = 500;

// Haversine formula to compute great-circle distance between two points on Earth
export function getDistanceMeters(lat1, lon1, lat2, lon2) {
  if (
    lat1 === undefined ||
    lon1 === undefined ||
    lat2 === undefined ||
    lon2 === undefined ||
    lat1 === null ||
    lon1 === null ||
    lat2 === null ||
    lon2 === null
  ) {
    return null;
  }

  const R = 6371e3; // Earth radius in metres
  const phi1 = (Number(lat1) * Math.PI) / 180;
  const phi2 = (Number(lat2) * Math.PI) / 180;
  const deltaPhi = ((Number(lat2) - Number(lat1)) * Math.PI) / 180;
  const deltaLambda = ((Number(lon2) - Number(lon1)) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

export function formatDistance(meters, lang = "en") {
  if (meters === null || meters === undefined) return "";
  if (meters < 1000) {
    return lang === "ta" ? `${Math.round(meters)} மீ` : `${Math.round(meters)} m`;
  }
  const km = (meters / 1000).toFixed(1);
  return lang === "ta" ? `${km} கி.மீ` : `${km} km`;
}
