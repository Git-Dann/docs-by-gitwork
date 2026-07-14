"use client";

/**
 * Brief weather — current conditions for the viewer's home hub, from Open-Meteo
 * (free, no API key, no attribution, CORS-friendly). Purely ambient; a fetch
 * failure just hides the row. Gated on `enabled` so it only fires with the brief.
 */

import { useQuery } from "@tanstack/react-query";

export interface WeatherData {
  city: string;
  tempC: number;
  code: number;
  isDay: boolean;
  windMph: number;
  humidity: number;
  highC: number;
  lowC: number;
}

/** Home hub by timezone (matches the Desk globe hubs); defaults to Manchester. */
const HUBS: Record<string, { name: string; lat: number; lon: number }> = {
  "Europe/London": { name: "Manchester", lat: 53.48, lon: -2.24 },
  "Asia/Karachi": { name: "Islamabad", lat: 33.68, lon: 73.05 },
};

async function fetchWeather(): Promise<WeatherData> {
  const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "Europe/London";
  const hub = HUBS[tz] ?? HUBS["Europe/London"];
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${hub.lat}&longitude=${hub.lon}` +
    `&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m,is_day` +
    `&daily=temperature_2m_max,temperature_2m_min&wind_speed_unit=mph&timezone=auto&forecast_days=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`weather ${res.status}`);
  const j = await res.json();
  const c = j.current ?? {};
  const d = j.daily ?? {};
  return {
    city: hub.name,
    tempC: Math.round(c.temperature_2m ?? 0),
    code: Number(c.weather_code ?? 0),
    isDay: c.is_day === 1,
    windMph: Math.round(c.wind_speed_10m ?? 0),
    humidity: Math.round(c.relative_humidity_2m ?? 0),
    highC: Math.round((d.temperature_2m_max ?? [0])[0] ?? 0),
    lowC: Math.round((d.temperature_2m_min ?? [0])[0] ?? 0),
  };
}

export function useWeather(enabled: boolean) {
  return useQuery({
    queryKey: ["brief", "weather"] as const,
    queryFn: fetchWeather,
    enabled,
    staleTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
