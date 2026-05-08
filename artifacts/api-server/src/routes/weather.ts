import { Router } from "express";
import { GetCurrentWeatherQueryParams, GetWeatherForecastQueryParams, GetTodaySummaryQueryParams } from "@workspace/api-zod";
import { db } from "@workspace/db";

const router = Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

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

function classifyAqi(aqi: number): "good" | "moderate" | "unhealthy-sensitive" | "unhealthy" {
  if (aqi <= 50) return "good";
  if (aqi <= 100) return "moderate";
  if (aqi <= 150) return "unhealthy-sensitive";
  return "unhealthy";
}

function classifyPollen(birch: number | null, grass: number | null): "low" | "moderate" | "high" | "very-high" {
  const total = (birch ?? 0) + (grass ?? 0);
  if (total < 10) return "low";
  if (total < 50) return "moderate";
  if (total < 200) return "high";
  return "very-high";
}

// ─── Tomorrow.io pollen cache ─────────────────────────────────────────────────
// Tomorrow.io free tier: 500 calls/day. We cache for 6 hours → max 4 calls/day.
// Provides tree, grass, and weed pollen indices natively.
// Falls back to Open-Meteo birch+grass if key not set or call fails.

type PollenLevel = "low" | "moderate" | "high" | "very-high";

interface TomorrowPollenCache {
  tree: PollenLevel;
  grass: PollenLevel;
  weed: PollenLevel;
  cachedAt: number;
  lat: number;
  lon: number;
}

let tomorrowPollenCache: TomorrowPollenCache | null = null;
const TOMORROW_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// Tomorrow.io pollen index: 0=None, 1=Very Low, 2=Low, 3=Medium, 4=High, 5=Very High
function tomorrowIndexToLevel(index: number | null): PollenLevel {
  if (!index || index <= 2) return "low";
  if (index === 3) return "moderate";
  if (index === 4) return "high";
  return "very-high";
}

function worstPollenLevel(levels: PollenLevel[]): PollenLevel {
  const order: PollenLevel[] = ["low", "moderate", "high", "very-high"];
  let worst = 0;
  for (const l of levels) {
    const idx = order.indexOf(l);
    if (idx > worst) worst = idx;
  }
  return order[worst];
}

async function fetchTomorrowPollen(lat: number, lon: number): Promise<TomorrowPollenCache | null> {
  const apiKey = process.env.TOMORROW_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `https://api.tomorrow.io/v4/weather/realtime?location=${lat},${lon}&fields=treeIndex,grassIndex,weedIndex&apikey=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json() as {
      data?: { values?: { treeIndex?: number; grassIndex?: number; weedIndex?: number } };
    };
    const values = data?.data?.values ?? {};
    return {
      tree: tomorrowIndexToLevel(values.treeIndex ?? null),
      grass: tomorrowIndexToLevel(values.grassIndex ?? null),
      weed: tomorrowIndexToLevel(values.weedIndex ?? null),
      cachedAt: Date.now(),
      lat,
      lon,
    };
  } catch {
    return null;
  }
}

async function getPollenLevel(
  lat: number,
  lon: number,
  fallbackBirch: number | null,
  fallbackGrass: number | null
): Promise<{ level: PollenLevel; source: "tomorrow.io" | "open-meteo" }> {
  const apiKey = process.env.TOMORROW_API_KEY;
  if (apiKey) {
    const now = Date.now();
    const cacheValid =
      tomorrowPollenCache &&
      now - tomorrowPollenCache.cachedAt < TOMORROW_CACHE_TTL_MS &&
      Math.abs(tomorrowPollenCache.lat - lat) < 0.01 &&
      Math.abs(tomorrowPollenCache.lon - lon) < 0.01;

    if (!cacheValid) {
      const fresh = await fetchTomorrowPollen(lat, lon);
      if (fresh) tomorrowPollenCache = fresh;
    }

    if (tomorrowPollenCache) {
      return {
        level: worstPollenLevel([tomorrowPollenCache.tree, tomorrowPollenCache.grass, tomorrowPollenCache.weed]),
        source: "tomorrow.io",
      };
    }
  }

  return { level: classifyPollen(fallbackBirch, fallbackGrass), source: "open-meteo" };
}

type Settings = {
  minTemp: number;
  maxTemp: number;
  maxHumidity: number;
  maxWindSpeed: number;
  maxRainChance: number;
  maxAqi: number;
  indoorTemp: number;
  indoorTempHeat: number;
  indoorTempCool: number;
};

// Pick the effective indoor target based on whether we're in heating or cooling mode.
// If outdoor temp is below the heat setpoint we're likely heating; above cool setpoint = AC on.
function effectiveIndoorTemp(outdoorTemp: number, settings: Settings): number {
  // Heating mode: outdoor is cold enough that the furnace is likely running
  if (outdoorTemp <= settings.indoorTempHeat) return settings.indoorTempHeat;
  // Cooling mode: outdoor is at or above the AC setpoint
  if (outdoorTemp >= settings.indoorTempCool) return settings.indoorTempCool;
  // Shoulder season (between setpoints): compare against the cool setpoint.
  // Opening a window is only worth it if outdoor air is cooler than the AC target;
  // the heat setpoint is irrelevant once it's warm enough outside that heat isn't running.
  return settings.indoorTempCool;
}

function analyzeConditions(
  temp: number,
  humidity: number,
  windSpeed: number,
  weatherCode: number,
  precipProbability: number,
  aqi: number,
  pollenLevel: "low" | "moderate" | "high" | "very-high",
  hour: number,
  settings: Settings
): { friendly: boolean; reasons: string[]; recommendation: string } {
  const issues: string[] = [];
  const positives: string[] = [];

  const indoorTarget = effectiveIndoorTemp(temp, settings);
  const outdoorCoolerThanIndoor = temp < indoorTarget;

  // Temperature
  if (temp < settings.minTemp) {
    issues.push(`Too cold outside (${temp.toFixed(0)}°F, your min is ${settings.minTemp}°F)`);
  } else if (temp > settings.maxTemp) {
    issues.push(`Too warm outside (${temp.toFixed(0)}°F — importing this heat will make your AC work harder)`);
  } else if (!outdoorCoolerThanIndoor) {
    issues.push(`Outdoor air (${temp.toFixed(0)}°F) is warmer than your thermostat (${indoorTarget}°F) — won't help cool the house`);
  }

  // Humidity
  if (humidity > settings.maxHumidity) {
    issues.push(`Too humid outside (${humidity.toFixed(0)}%) — will make your home feel sticky`);
  }

  // Wind
  if (windSpeed > settings.maxWindSpeed) {
    issues.push(`Too gusty (${windSpeed.toFixed(0)} mph)`);
  } else if (windSpeed >= 3 && windSpeed <= settings.maxWindSpeed) {
    positives.push(`light breeze (${windSpeed.toFixed(0)} mph) is good for cross-ventilation`);
  }

  // Rain
  if (precipProbability > settings.maxRainChance) {
    issues.push(`${precipProbability}% chance of rain`);
  }
  if (weatherCode >= 50 && weatherCode <= 99) {
    issues.push("Precipitation or storms in the area");
  }

  // Air quality
  const aqiClass = classifyAqi(aqi);
  if (aqiClass === "unhealthy") {
    issues.push(`Air quality is unhealthy (AQI ${aqi})`);
  } else if (aqiClass === "unhealthy-sensitive") {
    issues.push(`Air quality is poor for sensitive groups (AQI ${aqi})`);
  } else if (aqiClass === "moderate") {
    issues.push(`Air quality is only moderate (AQI ${aqi})`);
  }

  // Pollen
  if (pollenLevel === "very-high") {
    issues.push("Very high pollen — keep windows closed if anyone has allergies");
  } else if (pollenLevel === "high") {
    issues.push("High pollen count outside");
  } else if (pollenLevel === "moderate") {
    issues.push("Moderate pollen — may affect allergy sufferers");
  }

  const friendly = issues.length === 0;

  // Build recommendation with time-of-day awareness
  let recommendation: string;
  if (friendly) {
    if (hour >= 5 && hour < 10) {
      recommendation = "Great morning window — flush the house with cool air before heat builds.";
    } else if (hour >= 17 && hour <= 21) {
      recommendation = positives.length > 0
        ? `Good evening conditions — open opposite windows for cross-ventilation (${positives[0]}).`
        : "Good evening conditions — open opposite windows to let the heat out.";
    } else if (hour > 21 || hour < 5) {
      recommendation = "Night air is good — consider opening windows for overnight cooling.";
    } else {
      recommendation = positives.length > 0
        ? `Conditions are good right now — ${positives[0]}.`
        : "Conditions are good — open your window.";
    }
  } else {
    // If rain or precipitation is present, block opening windows immediately.
    if (
      issues.some((r) => r.toLowerCase().includes("rain") || r.includes("Precipitation") || r.includes("storms"))
    ) {
      recommendation = "Keep windows closed — rain or precipitation is present.";
    } else if (issues.some((r) => r.includes("pollen") || r.includes("Air quality"))) {
      recommendation = "Keep windows closed — outdoor air quality isn't good right now.";
    } else if (hour >= 10 && hour < 17 && (temp > indoorTarget || humidity > settings.maxHumidity)) {
      // Midday heat/humidity is only the controlling reason when precipitation isn't an issue.
      recommendation = "Midday heat and humidity — let your AC handle it. Try again this evening.";
    } else {
      recommendation = "Keep your window closed for now.";
    }
  }

  const reasons = friendly
    ? [`Conditions are ideal — ${temp.toFixed(0)}°F, ${humidity.toFixed(0)}% humidity${positives.length > 0 ? `, ${positives[0]}` : ""}`]
    : issues;

  return { friendly, reasons, recommendation };
}

function getTimeOfDayTip(hour: number): string {
  if (hour >= 5 && hour < 10) return "Morning is the best time to flush the house with cool air.";
  if (hour >= 10 && hour < 17) return "Midday heat is building — keep windows closed and let AC work.";
  if (hour >= 17 && hour <= 21) return "Evening conditions often improve — good time to check again.";
  return "Overnight air is often the coolest — good for passive cooling.";
}

// ─── Data Fetching ──────────────────────────────────────────────────────────

// Map Tomorrow.io weather codes → approximate WMO codes (used for description + rain detection)
function tomorrowCodeToWmo(code: number): number {
  if (code === 1000) return 0;  // Clear
  if (code <= 1102) return 2;   // Mostly clear / partly cloudy
  if (code === 1001) return 3;  // Cloudy
  if (code === 2000 || code === 2100) return 45; // Fog
  if (code === 4000) return 51; // Drizzle
  if (code === 4200) return 61; // Light rain
  if (code === 4001) return 63; // Rain
  if (code === 4201) return 65; // Heavy rain
  if (code >= 5000 && code <= 5101) return 71; // Snow
  if (code >= 6000 && code <= 6201) return 66; // Freezing rain
  if (code >= 7000 && code <= 7102) return 77; // Ice pellets
  if (code === 8000) return 95; // Thunderstorm
  return 3;
}

type OpenMeteoShape = {
  current: { time: string; temperature_2m: number; relative_humidity_2m: number; wind_speed_10m: number; weather_code: number };
  hourly: { time: string[]; temperature_2m: number[]; relative_humidity_2m: number[]; wind_speed_10m: number[]; weather_code: number[]; precipitation_probability: number[] };
};

async function fetchTomorrowWeather(lat: number, lon: number): Promise<OpenMeteoShape> {
  const apiKey = process.env.TOMORROW_API_KEY;
  if (!apiKey) throw new Error("TOMORROW_API_KEY not set");
  const res = await fetch(
    `https://api.tomorrow.io/v4/weather/forecast?location=${lat},${lon}&timesteps=1h&units=imperial&apikey=${apiKey}`,
    { signal: AbortSignal.timeout(8000) }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Tomorrow.io ${res.status}: ${body}`);
  }
  const json = await res.json() as {
    timelines: {
      hourly: Array<{ time: string; values: { temperature: number; humidity: number; windSpeed: number; weatherCode: number; precipitationProbability: number } }>;
    };
  };
  const hourly = json.timelines.hourly;
  // Build an OpenMeteo-shaped object so the rest of the route code is unchanged
  const now = hourly[0];
  return {
    current: {
      time: now.time.substring(0, 16).replace("T", "T"), // keep ISO format
      temperature_2m: now.values.temperature,
      relative_humidity_2m: now.values.humidity,
      wind_speed_10m: now.values.windSpeed,
      weather_code: tomorrowCodeToWmo(now.values.weatherCode),
    },
    hourly: {
      time: hourly.map((h) => h.time.substring(0, 16)),
      temperature_2m: hourly.map((h) => h.values.temperature),
      relative_humidity_2m: hourly.map((h) => h.values.humidity),
      wind_speed_10m: hourly.map((h) => h.values.windSpeed),
      weather_code: hourly.map((h) => tomorrowCodeToWmo(h.values.weatherCode)),
      precipitation_probability: hourly.map((h) => h.values.precipitationProbability),
    },
  };
}

// Cache Open-Meteo responses for 10 minutes to stay well within the 10k/day free limit.
const WEATHER_CACHE_TTL_MS = 10 * 60 * 1000;
const AQ_CACHE_TTL_MS = 10 * 60 * 1000;

interface WeatherCache {
  data: Awaited<ReturnType<typeof _fetchOpenMeteo>>;
  cachedAt: number;
  lat: number;
  lon: number;
  forecastDays: number;
}
interface AqCache {
  data: Awaited<ReturnType<typeof _fetchAirQuality>>;
  cachedAt: number;
  lat: number;
  lon: number;
  forecastDays: number;
}
let weatherCache: WeatherCache | null = null;
let aqCache: AqCache | null = null;

async function _fetchOpenMeteo(lat: number, lon: number, forecastDays = 1): Promise<OpenMeteoShape> {
  const url = [
    `https://api.open-meteo.com/v1/forecast`,
    `?latitude=${lat}&longitude=${lon}`,
    forecastDays === 1 ? `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code` : "",
    `&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,precipitation_probability`,
    `&timezone=auto&forecast_days=${forecastDays}`,
    `&temperature_unit=fahrenheit&wind_speed_unit=mph`,
  ].join("");
  const res = await fetch(url, {
    headers: { "User-Agent": "WindowWeatherWatch/1.0 (personal home automation app)" },
  });
  if (!res.ok) {
    if (res.status === 429 && forecastDays === 1) {
      // Rate-limited — fall back to Tomorrow.io
      return fetchTomorrowWeather(lat, lon);
    }
    const body = await res.text().catch(() => "(unreadable)");
    throw new Error(`Open-Meteo ${res.status}: ${body}`);
  }
  return res.json() as Promise<OpenMeteoShape>;
}

async function fetchOpenMeteo(lat: number, lon: number, forecastDays = 1) {
  const now = Date.now();
  if (
    weatherCache &&
    now - weatherCache.cachedAt < WEATHER_CACHE_TTL_MS &&
    weatherCache.forecastDays === forecastDays &&
    Math.abs(weatherCache.lat - lat) < 0.01 &&
    Math.abs(weatherCache.lon - lon) < 0.01
  ) {
    return weatherCache.data;
  }
  const data = await _fetchOpenMeteo(lat, lon, forecastDays);
  weatherCache = { data, cachedAt: now, lat, lon, forecastDays };
  return data;
}

async function _fetchAirQuality(lat: number, lon: number, forecastDays = 1) {
  try {
    const url = [
      `https://air-quality-api.open-meteo.com/v1/air-quality`,
      `?latitude=${lat}&longitude=${lon}`,
      forecastDays === 1 ? `&current=us_aqi,birch_pollen,grass_pollen` : "",
      `&hourly=us_aqi,birch_pollen,grass_pollen`,
      `&timezone=auto&forecast_days=${forecastDays}`,
    ].join("");
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    return res.json() as Promise<{
      current: { time: string; us_aqi: number | null; birch_pollen: number | null; grass_pollen: number | null };
      hourly: { time: string[]; us_aqi: (number | null)[]; birch_pollen: (number | null)[]; grass_pollen: (number | null)[] };
    }>;
  } catch {
    return null;
  }
}

async function fetchAirQuality(lat: number, lon: number, forecastDays = 1) {
  const now = Date.now();
  if (
    aqCache &&
    now - aqCache.cachedAt < AQ_CACHE_TTL_MS &&
    aqCache.forecastDays === forecastDays &&
    Math.abs(aqCache.lat - lat) < 0.01 &&
    Math.abs(aqCache.lon - lon) < 0.01
  ) {
    return aqCache.data;
  }
  const data = await _fetchAirQuality(lat, lon, forecastDays);
  aqCache = { data, cachedAt: now, lat, lon, forecastDays };
  return data;
}

async function getSettings() {
  const rows = await db.query.settingsTable.findMany({ limit: 1 });
  if (rows.length === 0) {
    const inserted = await db.insert((await import("@workspace/db")).settingsTable).values({}).returning();
    return inserted[0];
  }
  return rows[0];
}

// ─── Routes ─────────────────────────────────────────────────────────────────

router.get("/weather/current", async (req, res) => {
  try {
  const parsed = GetCurrentWeatherQueryParams.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "lat and lon are required" });

  const { lat, lon } = parsed.data;
  const [settings, weatherData, aqData] = await Promise.all([
    getSettings(),
    fetchOpenMeteo(lat, lon),
    fetchAirQuality(lat, lon),
  ]);

  const { current, hourly } = weatherData;
  const nowStr = current.time.substring(0, 13);
  const currentHourIdx = hourly.time.findIndex((t) => t.startsWith(nowStr));
  const precipProbability = currentHourIdx >= 0 ? (hourly.precipitation_probability[currentHourIdx] ?? 0) : 0;

  const aqi = aqData?.current?.us_aqi ?? 0;
  const birchPollen = aqData?.current?.birch_pollen ?? null;
  const grassPollen = aqData?.current?.grass_pollen ?? null;
  const { level: pollenLevel } = await getPollenLevel(lat, lon, birchPollen, grassPollen);

  const hour = new Date(current.time).getHours();

  const { friendly, reasons, recommendation } = analyzeConditions(
    current.temperature_2m,
    current.relative_humidity_2m,
    current.wind_speed_10m,
    current.weather_code,
    precipProbability,
    aqi,
    pollenLevel,
    hour,
    settings
  );

  return res.json({
    temperature: current.temperature_2m,
    humidity: current.relative_humidity_2m,
    windSpeed: current.wind_speed_10m,
    weatherCode: current.weather_code,
    weatherDescription: getWeatherDescription(current.weather_code),
    precipitationProbability: precipProbability,
    airQualityIndex: aqi,
    pollenLevel,
    timeOfDayTip: getTimeOfDayTip(hour),
    isWindowFriendly: friendly,
    recommendation,
    reasons,
    timestamp: new Date().toISOString(),
  });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    return res.status(500).json({ error: message, stack });
  }
});

router.get("/weather/forecast", async (req, res) => {
  const parsed = GetWeatherForecastQueryParams.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "lat and lon are required" });

  const { lat, lon } = parsed.data;
  const [settings, weatherData, aqData] = await Promise.all([
    getSettings(),
    fetchOpenMeteo(lat, lon),
    fetchAirQuality(lat, lon),
  ]);
  const { hourly } = weatherData;

  const hours = hourly.time.map((time, i) => {
    const hour = new Date(time).getHours();
    const temp = hourly.temperature_2m[i];
    const humidity = hourly.relative_humidity_2m[i];
    const windSpeed = hourly.wind_speed_10m[i];
    const weatherCode = hourly.weather_code[i];
    const precipProbability = hourly.precipitation_probability[i] ?? 0;

    const aqHourIdx = aqData?.hourly?.time?.findIndex((t) => t === time) ?? -1;
    const aqi = aqHourIdx >= 0 ? (aqData!.hourly.us_aqi[aqHourIdx] ?? 0) : 0;
    const birch = aqHourIdx >= 0 ? (aqData!.hourly.birch_pollen[aqHourIdx] ?? null) : null;
    const grass = aqHourIdx >= 0 ? (aqData!.hourly.grass_pollen[aqHourIdx] ?? null) : null;
    const pollenLevel = classifyPollen(birch, grass);

    const { friendly } = analyzeConditions(temp, humidity, windSpeed, weatherCode, precipProbability, aqi, pollenLevel, hour, settings);
    return { hour, temperature: temp, humidity, windSpeed, isWindowFriendly: friendly, weatherCode, precipitationProbability: precipProbability, airQualityIndex: aqi, pollenLevel };
  });

  return res.json({ date: new Date().toISOString().split("T")[0], hours });
});

router.get("/weather/today-summary", async (req, res) => {
  const parsed = GetTodaySummaryQueryParams.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "lat and lon are required" });

  const { lat, lon } = parsed.data;
  const [settings, weatherData, aqData] = await Promise.all([
    getSettings(),
    fetchOpenMeteo(lat, lon),
    fetchAirQuality(lat, lon),
  ]);
  const { hourly } = weatherData;

  const hours = hourly.time.map((time, i) => {
    const hour = new Date(time).getHours();
    const temp = hourly.temperature_2m[i];
    const humidity = hourly.relative_humidity_2m[i];
    const windSpeed = hourly.wind_speed_10m[i];
    const weatherCode = hourly.weather_code[i];
    const precipProbability = hourly.precipitation_probability[i] ?? 0;
    const aqHourIdx = aqData?.hourly?.time?.findIndex((t) => t === time) ?? -1;
    const aqi = aqHourIdx >= 0 ? (aqData!.hourly.us_aqi[aqHourIdx] ?? 0) : 0;
    const birch = aqHourIdx >= 0 ? (aqData!.hourly.birch_pollen[aqHourIdx] ?? null) : null;
    const grass = aqHourIdx >= 0 ? (aqData!.hourly.grass_pollen[aqHourIdx] ?? null) : null;
    const pollenLevel = classifyPollen(birch, grass);
    const { friendly } = analyzeConditions(temp, humidity, windSpeed, weatherCode, precipProbability, aqi, pollenLevel, hour, settings);
    return { hour, temperature: temp, isWindowFriendly: friendly };
  });

  const friendlyHours = hours.filter((h) => h.isWindowFriendly);
  const temps = hours.map((h) => h.temperature);

  let bestWindowStart: number | null = null;
  let bestWindowEnd: number | null = null;
  let currentRun = 0, bestRun = 0, runStart = 0;
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

  const morningFriendly = hours.filter((h) => h.hour >= 5 && h.hour < 10 && h.isWindowFriendly).length;
  const eveningFriendly = hours.filter((h) => h.hour >= 17 && h.hour <= 21 && h.isWindowFriendly).length;

  let overallRecommendation: string;
  if (friendlyHours.length === 0) {
    overallRecommendation = "Weather won't be suitable for open windows today — let the AC handle it.";
  } else if (morningFriendly >= 2 && eveningFriendly >= 2) {
    overallRecommendation = `Good day for the open-close strategy: flush the house in the morning, close up mid-day, then reopen in the evening.`;
  } else if (morningFriendly >= 2) {
    overallRecommendation = `Morning looks good (${morningFriendly} window-friendly hours) — open early, then close before midday heat.`;
  } else if (eveningFriendly >= 2) {
    overallRecommendation = `Evening is the best window today (${eveningFriendly} good hours) — conditions improve after the afternoon.`;
  } else {
    overallRecommendation = `Windows can be open for about ${friendlyHours.length} hour${friendlyHours.length === 1 ? "" : "s"} today.`;
  }

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

router.get("/weather/weekly", async (req, res) => {
  const parsed = GetCurrentWeatherQueryParams.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "lat and lon are required" });

  const { lat, lon } = parsed.data;
  const [settings, weatherData, aqData] = await Promise.all([
    getSettings(),
    fetchOpenMeteo(lat, lon, 7),
    fetchAirQuality(lat, lon, 7),
  ]);

  const { hourly } = weatherData;

  // Group hourly data by date
  type HourEntry = {
    hour: number;
    temp: number;
    humidity: number;
    windSpeed: number;
    weatherCode: number;
    precipProbability: number;
    aqi: number;
    birch: number | null;
    grass: number | null;
  };
  const dayMap = new Map<string, HourEntry[]>();

  for (let i = 0; i < hourly.time.length; i++) {
    const time = hourly.time[i];
    const date = time.split("T")[0];
    const hour = new Date(time).getHours();
    const aqIdx = aqData?.hourly?.time?.findIndex((t) => t === time) ?? -1;
    const entry: HourEntry = {
      hour,
      temp: hourly.temperature_2m[i],
      humidity: hourly.relative_humidity_2m[i],
      windSpeed: hourly.wind_speed_10m[i],
      weatherCode: hourly.weather_code[i],
      precipProbability: hourly.precipitation_probability[i] ?? 0,
      aqi: aqIdx >= 0 ? (aqData!.hourly.us_aqi[aqIdx] ?? 0) : 0,
      birch: aqIdx >= 0 ? (aqData!.hourly.birch_pollen[aqIdx] ?? null) : null,
      grass: aqIdx >= 0 ? (aqData!.hourly.grass_pollen[aqIdx] ?? null) : null,
    };
    if (!dayMap.has(date)) dayMap.set(date, []);
    dayMap.get(date)!.push(entry);
  }

  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  const days = Array.from(dayMap.entries()).map(([date, hours]) => {
    const temps = hours.map((h) => h.temp);
    const highTemp = Math.max(...temps);
    const lowTemp = Math.min(...temps);
    const maxPrecipProbability = Math.max(...hours.map((h) => h.precipProbability));
    const maxAqiDay = Math.max(...hours.map((h) => h.aqi));
    const midday = hours.find((h) => h.hour === 12) ?? hours[Math.floor(hours.length / 2)];
    const weatherCode = midday.weatherCode;
    const totalBirch = hours.reduce((s, h) => s + (h.birch ?? 0), 0) / hours.length;
    const totalGrass = hours.reduce((s, h) => s + (h.grass ?? 0), 0) / hours.length;
    const pollenLevel = classifyPollen(totalBirch, totalGrass);

    // Determine friendly hours
    const friendlyHours = hours.filter((h) => {
      const pl = classifyPollen(h.birch, h.grass);
      return analyzeConditions(h.temp, h.humidity, h.windSpeed, h.weatherCode, h.precipProbability, h.aqi, pl, h.hour, settings).friendly;
    });

    const morningWindowHours = Math.min(8, friendlyHours.filter((h) => h.hour >= settings.workStartHour && h.hour < settings.workEndHour).length);
    const eveningWindowHours = Math.min(5, friendlyHours.filter((h) => h.hour >= settings.workEndHour && h.hour <= 22).length);

    // Best continuous run
    let bestWindowStart: number | null = null;
    let bestWindowEnd: number | null = null;
    let currentRun = 0, bestRun = 0, runStart = 0;
    for (const h of hours) {
      const pl = classifyPollen(h.birch, h.grass);
      const { friendly } = analyzeConditions(h.temp, h.humidity, h.windSpeed, h.weatherCode, h.precipProbability, h.aqi, pl, h.hour, settings);
      if (friendly) {
        if (currentRun === 0) runStart = h.hour;
        currentRun++;
        if (currentRun > bestRun) { bestRun = currentRun; bestWindowStart = runStart; bestWindowEnd = h.hour; }
      } else { currentRun = 0; }
    }

    // Strategy
    const strategy: "both" | "morning" | "evening" | "throughout" | "none" =
      friendlyHours.length === 0 ? "none"
      : friendlyHours.length >= 10 ? "throughout"
      : morningWindowHours >= 2 && eveningWindowHours >= 2 ? "both"
      : morningWindowHours >= 2 ? "morning"
      : eveningWindowHours >= 2 ? "evening"
      : "none";

    // Recommendation
    let overallRecommendation: string;
    if (strategy === "none") {
      const reasons = [];
      if (maxPrecipProbability > settings.maxRainChance) reasons.push("rain");
      if (maxAqiDay > settings.maxAqi) reasons.push("poor air quality");
      if (pollenLevel === "high" || pollenLevel === "very-high") reasons.push("high pollen");
      if (highTemp > settings.maxTemp) reasons.push("heat");
      overallRecommendation = reasons.length > 0
        ? `Keep windows closed — ${reasons.join(" and ")} expected.`
        : "Conditions aren't suitable for open windows today.";
    } else if (strategy === "throughout") {
      overallRecommendation = `Great day — windows can stay open most of the day (${friendlyHours.length} good hours).`;
    } else if (strategy === "both") {
      overallRecommendation = `Good conditions during work hours (${morningWindowHours}h) and again in the evening (${eveningWindowHours}h).`;
    } else if (strategy === "morning") {
      overallRecommendation = `Open windows during work hours (${morningWindowHours} good hour${morningWindowHours !== 1 ? "s" : ""}) — close before conditions worsen.`;
    } else {
      overallRecommendation = `Evening is the best window (${eveningWindowHours} good hour${eveningWindowHours !== 1 ? "s" : ""}) — conditions improve after the afternoon heat.`;
    }

    const dayOfWeek = new Date(date + "T12:00:00").getDay();

    return {
      date,
      dayName: DAYS[dayOfWeek],
      highTemp,
      lowTemp,
      maxPrecipProbability,
      weatherCode,
      weatherDescription: getWeatherDescription(weatherCode),
      airQualityIndex: maxAqiDay,
      pollenLevel,
      friendlyHoursCount: friendlyHours.length,
      morningWindowHours,
      eveningWindowHours,
      bestWindowStart,
      bestWindowEnd,
      strategy,
      overallRecommendation,
    };
  });

  return res.json({ days });
});

export default router;
