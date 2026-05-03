import { useState, useEffect } from "react";

export type LocationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "granted"; lat: number; lon: number }
  | { status: "denied"; error: string };

export function useLocation() {
  const [location, setLocation] = useState<LocationState>({ status: "idle" });

  function requestLocation() {
    setLocation({ status: "loading" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          status: "granted",
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        });
      },
      (err) => {
        setLocation({
          status: "denied",
          error: err.message || "Location access denied",
        });
      }
    );
  }

  useEffect(() => {
    requestLocation();
  }, []);

  return { location, requestLocation };
}
