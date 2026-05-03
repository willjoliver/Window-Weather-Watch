import { Router } from "express";
import { GetCurrentWeatherQueryParams, GetWeatherForecastQueryParams, GetTodaySummaryQueryParams } from "@workspace/api-zod";
import { db } from "@workspace/db";

const router = Router();

function getWeatherDescription(code: number): string {
  if (code === 0) return "Clear sky";
  if (code <= 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code <= 49) return "Foggy";
  if (code <= 59) return "Drizzle";
  if (code <= 69) return "Rain";
  if (code <= 79) return "Snow";
  if (code <= 84) return "Rain showers";
  if (code <= 94) return "Thunderstorm";
  return "Severe thunderstorm";
}

function isWindowFriendly(
  temp: number,
  humidity: number,
  windSpeed: number,
  weatherCode: number,
  precipProbability: number,
  settings: {
    minTemp: number;
    maxTemp: number;
    maxHumidity: number;
    maxWindSpeed: number;
    maxRainChance: number;
  }
): { friendly: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (temp < settings.minTemp) {
    reasons.push(`Too cold (${temp.toFixed(0)}°F, min is ${settings.minTemp}°F)`);
  }
  if (temp > settings.maxTemp) {
    reasons.push(`Too warm (${temp.toFixed(0)}°F, max is ${settings.maxTemp}°F)`);
  }
  if (humidity > settings.maxHumidity) {
    reasons.push(`Too humid (${humidity.toFixed(0)}%, max is ${settings.maxHumidity}%)`);
  }
  if (windSpeed > settings.maxWindSpeed) {
    reasons.push(`Too windy (${windSpeed.toFixed(0)} mph, max is ${settings.maxWindSpeed} mph)`);
  }
  if (precipProbability > settings.maxRainChance) {
    reasons.push(`${precipProbability}% chance of rain`);
  }
  if (weatherCode >= 50 && weatherCode <= 99) {
    reasons.push("Precipitation or storms in the area");
  }

  if (reasons.length === 0) {
    reasons.push(`Conditions are ideal — ${temp.toFixed(0)}°F, ${humidity.toFixed(0)}% humidity`);
  }

  return { friendly: reasons.length === 1 && reasons[0].startsWith("Conditions are ideal"), reasons };
}

async function fetchOpenMeteo(lat: number, lon: number) {
  const url = [
    `https://api.open-meteo.com/v1/forecast`,
    `?latitude=${lat}&longitude=${lon}`,
    `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code`,
    `&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,precipitation_probability`,
    `&timezone=auto&forecast_days=1`,
    `&temperature_unit=fahrenheit&wind_speed_unit=mph`,
  ].join("");

  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch weather data");
  return res.json() as Promise<{
    current: {
      time: string;
      temperature_2m: number;
      relative_humidity_2m: number;
      wind_speed_10m: number;
      weather_code: number;
    };
    hourly: {
      time: string[];
      temperature_2m: number[];
      relative_humidity_2m: number[];
      wind_speed_10m: number[];
      weather_code: number[];
      precipitation_probability: number[];
    };
  }>;
}

async function getSettings() {
  const rows = await db.query.settingsTable.findMany({ limit: 1 });
  if (rows.length === 0) {
    const inserted = await db.insert((await import("@workspace/db")).settingsTable).values({}).returning();
    return inserted[0];
  }
  return rows[0];
}

router.get("/weather/current", async (req, res) => {
  const parsed = GetCurrentWeatherQueryParams.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "lat and lon are required" });
  }
  const { lat, lon } = parsed.data;
  const settings = await getSettings();
  const data = await fetchOpenMeteo(lat, lon);
  const { current, hourly } = data;

  // Get precipitation probability for the current hour from hourly data
  const nowStr = current.time.substring(0, 13); // "2026-05-03T13"
  const currentHourIdx = hourly.time.findIndex((t) => t.startsWith(nowStr));
  const precipProbability = currentHourIdx >= 0 ? (hourly.precipitation_probability[currentHourIdx] ?? 0) : 0;

  const { friendly, reasons } = isWindowFriendly(
    current.temperature_2m,
    current.relative_humidity_2m,
    current.wind_speed_10m,
    current.weather_code,
    precipProbability,
    settings
  );

  return res.json({
    temperature: current.temperature_2m,
    humidity: current.relative_humidity_2m,
    windSpeed: current.wind_speed_10m,
    weatherCode: current.weather_code,
    weatherDescription: getWeatherDescription(current.weather_code),
    precipitationProbability: precipProbability,
    isWindowFriendly: friendly,
    recommendation: friendly
      ? "Great time to open your window!"
      : "Keep your window closed for now.",
    reasons,
    timestamp: new Date().toISOString(),
  });
});

router.get("/weather/forecast", async (req, res) => {
  const parsed = GetWeatherForecastQueryParams.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "lat and lon are required" });
  }
  const { lat, lon } = parsed.data;
  const settings = await getSettings();
  const data = await fetchOpenMeteo(lat, lon);
  const { hourly } = data;

  const hours = hourly.time.map((time, i) => {
    const hour = new Date(time).getHours();
    const temp = hourly.temperature_2m[i];
    const humidity = hourly.relative_humidity_2m[i];
    const windSpeed = hourly.wind_speed_10m[i];
    const weatherCode = hourly.weather_code[i];
    const precipProbability = hourly.precipitation_probability[i] ?? 0;
    const { friendly } = isWindowFriendly(temp, humidity, windSpeed, weatherCode, precipProbability, settings);
    return { hour, temperature: temp, humidity, windSpeed, isWindowFriendly: friendly, weatherCode, precipitationProbability: precipProbability };
  });

  return res.json({
    date: new Date().toISOString().split("T")[0],
    hours,
  });
});

router.get("/weather/today-summary", async (req, res) => {
  const parsed = GetTodaySummaryQueryParams.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "lat and lon are required" });
  }
  const { lat, lon } = parsed.data;
  const settings = await getSettings();
  const data = await fetchOpenMeteo(lat, lon);
  const { hourly } = data;

  const hours = hourly.time.map((time, i) => {
    const hour = new Date(time).getHours();
    const temp = hourly.temperature_2m[i];
    const humidity = hourly.relative_humidity_2m[i];
    const windSpeed = hourly.wind_speed_10m[i];
    const weatherCode = hourly.weather_code[i];
    const precipProbability = hourly.precipitation_probability[i] ?? 0;
    const { friendly } = isWindowFriendly(temp, humidity, windSpeed, weatherCode, precipProbability, settings);
    return { hour, temperature: temp, isWindowFriendly: friendly };
  });

  const friendlyHours = hours.filter((h) => h.isWindowFriendly);
  const temps = hours.map((h) => h.temperature);

  let bestWindowStart: number | null = null;
  let bestWindowEnd: number | null = null;
  let currentRun = 0;
  let bestRun = 0;
  let runStart = 0;

  for (let i = 0; i < hours.length; i++) {
    if (hours[i].isWindowFriendly) {
      if (currentRun === 0) runStart = hours[i].hour;
      currentRun++;
      if (currentRun > bestRun) {
        bestRun = currentRun;
        bestWindowStart = runStart;
        bestWindowEnd = hours[i].hour;
      }
    } else {
      currentRun = 0;
    }
  }

  const overallRecommendation =
    friendlyHours.length === 0
      ? "Weather won't be suitable for open windows today."
      : friendlyHours.length >= 6
        ? "Great day for fresh air — windows can be open for much of the day."
        : `Windows can be open for about ${friendlyHours.length} hours today.`;

  return res.json({
    date: new Date().toISOString().split("T")[0],
    friendlyHoursCount: friendlyHours.length,
    bestWindowStart,
    bestWindowEnd,
    minTemp: Math.min(...temps),
    maxTemp: Math.max(...temps),
    overallRecommendation,
  });
});

export default router;
