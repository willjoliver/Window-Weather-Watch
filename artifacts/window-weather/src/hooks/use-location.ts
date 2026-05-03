// Location is now sourced from saved settings (locationLat/locationLon).
// This hook is no longer used for geolocation — kept for reference only.

export type LocationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "granted"; lat: number; lon: number }
  | { status: "denied"; error: string };
