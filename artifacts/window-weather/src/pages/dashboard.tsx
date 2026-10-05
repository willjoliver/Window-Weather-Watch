import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Thermometer, Droplets, Clock, RefreshCw,
  BellOff, Bell, MapPin, ChevronRight,
  CloudRain, Leaf, Wind as WindIcon, Info, BellRing,
  Sun, Moon, Cloud, CloudFog, CloudSnow, CloudLightning,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { usePush } from "@/hooks/use-push";
import {
  useGetCurrentWeather,
  getGetCurrentWeatherQueryKey,
  useGetTodaySummary,
  getGetTodaySummaryQueryKey,
  useGetWeatherForecast,
  getGetWeatherForecastQueryKey,
  useGetSettings,
  getGetSettingsQueryKey,
  useCreateEvent,
  getGetEventsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

type PollenLevel = "low" | "moderate" | "high" | "very-high";

function pollenColorLight(level: PollenLevel) {
  return {
    low: "text-emerald-200",
    moderate: "text-yellow-200",
    high: "text-orange-200",
    "very-high": "text-red-200",
  }[level];
}

function aqiLabelLight(aqi: number) {
  if (aqi <= 50) return { text: "Good", cls: "text-emerald-200" };
  if (aqi <= 100) return { text: "Moderate", cls: "text-yellow-200" };
  if (aqi <= 150) return { text: "Sensitive", cls: "text-orange-200" };
  return { text: "Unhealthy", cls: "text-red-200" };
}

type SkyKind =
  | "clear-day" | "clear-night"
  | "cloudy-day" | "cloudy-night"
  | "fog" | "rain" | "snow" | "storm";

function skyKind(code: number | undefined, hour: number): SkyKind {
  const isDay = hour >= 6 && hour < 20;
  if (code === undefined) return isDay ? "cloudy-day" : "cloudy-night";
  if (code === 0) return isDay ? "clear-day" : "clear-night";
  if (code === 1 || code === 2 || code === 3) return isDay ? "cloudy-day" : "cloudy-night";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 67) return "rain";
  if (code >= 71 && code <= 77) return "snow";
  if (code >= 80 && code <= 82) return "rain";
  if (code >= 95) return "storm";
  return isDay ? "cloudy-day" : "cloudy-night";
}

const SKY_GRADIENTS: Record<SkyKind, string> = {
  "clear-day": "from-sky-700 via-sky-600 to-blue-500",
  "clear-night": "from-indigo-950 via-[#232046] to-slate-900",
  "cloudy-day": "from-slate-700 via-slate-600 to-slate-500",
  "cloudy-night": "from-slate-900 via-slate-800 to-slate-700",
  fog: "from-stone-700 via-stone-600 to-stone-500",
  rain: "from-slate-900 via-cyan-950 to-slate-800",
  snow: "from-sky-900 via-sky-800 to-indigo-700",
  storm: "from-violet-950 via-slate-900 to-indigo-950",
};

function SkyIcon({ kind, className }: { kind: SkyKind; className?: string }) {
  switch (kind) {
    case "clear-day": return <Sun className={className} />;
    case "clear-night": return <Moon className={className} />;
    case "cloudy-day":
    case "cloudy-night": return <Cloud className={className} />;
    case "fog": return <CloudFog className={className} />;
    case "rain": return <CloudRain className={className} />;
    case "snow": return <CloudSnow className={className} />;
    case "storm": return <CloudLightning className={className} />;
  }
}

/** Frosted-glass card floating over the sky. */
function GlassCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-white/30 bg-white/[0.16] backdrop-blur-2xl",
        "shadow-[0_8px_32px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.4)]",
        className
      )}
    >
      {children}
    </div>
  );
}

function GlassPillButton({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium backdrop-blur-xl transition-all",
        active
          ? "bg-white text-slate-900 border-transparent shadow-lg"
          : "bg-white/15 text-white border-white/25 hover:bg-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]"
      )}
    >
      {children}
    </button>
  );
}

function GlassMetric({
  icon: Icon,
  label,
  children,
  loading,
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
  loading: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-white/75 text-[11px] font-medium uppercase tracking-wider">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      {loading
        ? <Skeleton className="h-7 w-20 bg-white/20" />
        : <div className="text-white">{children}</div>}
    </div>
  );
}

export default function Dashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [monitoring, setMonitoring] = useState(false);
  const [windowState, setWindowState] = useState<"open" | "closed" | null>(null);
  const prevFriendly = useRef<boolean | null>(null);
  const createEvent = useCreateEvent();
  const push = usePush();

  const { data: settings, isLoading: settingsLoading } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() },
  });

  const lat = settings?.locationLat ?? null;
  const lon = settings?.locationLon ?? null;
  const locationName = settings?.locationName ?? null;
  const enabled = lat !== null && lon !== null;

  const { data: weather, isLoading: weatherLoading, refetch: refetchWeather } = useGetCurrentWeather(
    { lat: lat ?? 0, lon: lon ?? 0 },
    { query: { enabled, queryKey: getGetCurrentWeatherQueryKey({ lat: lat ?? 0, lon: lon ?? 0 }) } }
  );
  const { data: summary, isLoading: summaryLoading } = useGetTodaySummary(
    { lat: lat ?? 0, lon: lon ?? 0 },
    { query: { enabled, queryKey: getGetTodaySummaryQueryKey({ lat: lat ?? 0, lon: lon ?? 0 }) } }
  );
  const { data: forecast, isLoading: forecastLoading } = useGetWeatherForecast(
    { lat: lat ?? 0, lon: lon ?? 0 },
    { query: { enabled, queryKey: getGetWeatherForecastQueryKey({ lat: lat ?? 0, lon: lon ?? 0 }) } }
  );

  const interval = settings?.checkIntervalMinutes ?? 30;

  useEffect(() => {
    if (!monitoring || !enabled) return;
    const id = setInterval(async () => {
      const result = await refetchWeather();
      const fresh = result.data?.isWindowFriendly;
      if (fresh !== undefined && prevFriendly.current !== null && fresh !== prevFriendly.current) {
        if (Notification.permission === "granted") {
          new Notification(fresh ? "Open your window!" : "Close your window", {
            body: result.data?.recommendation ?? "Conditions have changed.",
            icon: "/favicon.ico",
          });
        }
        toast({ title: fresh ? "Open your window!" : "Close your window", description: result.data?.recommendation });
      }
      if (fresh !== undefined) prevFriendly.current = fresh;
    }, interval * 60 * 1000);
    return () => clearInterval(id);
  }, [monitoring, enabled, interval]);

  useEffect(() => {
    if (weather) prevFriendly.current = weather.isWindowFriendly;
  }, [weather]);

  async function toggleMonitoring() {
    if (!monitoring && Notification.permission !== "granted") await Notification.requestPermission();
    setMonitoring((v) => !v);
  }

  function logWindowAction(action: "opened" | "closed") {
    createEvent.mutate(
      { data: { action, triggeredBy: "user", temperature: weather?.temperature ?? undefined, humidity: weather?.humidity ?? undefined, windSpeed: weather?.windSpeed ?? undefined } },
      {
        onSuccess: () => {
          setWindowState(action === "opened" ? "open" : "closed");
          queryClient.invalidateQueries({ queryKey: getGetEventsQueryKey() });
          toast({ title: action === "opened" ? "Window logged as open" : "Window logged as closed" });
        },
      }
    );
  }

  const friendly = weather?.isWindowFriendly;
  const nowHour = new Date().getHours();
  const hourlyItems = forecast?.hours ?? [];
  const sky = skyKind(weather?.weatherCode, nowHour);

  function formatHour(hour: number): string {
    if (hour === 0) return "12am";
    if (hour < 12) return `${hour}am`;
    if (hour === 12) return "12pm";
    return `${hour - 12}pm`;
  }
  const rainChance = weather?.precipitationProbability ?? 0;
  const aqi = weather?.airQualityIndex ?? 0;
  const pollenLevel = (weather?.pollenLevel ?? "low") as PollenLevel;
  const aqiInfo = aqiLabelLight(aqi);
  const maxRainChance = settings?.maxRainChance ?? 40;
  const maxAqi = settings?.maxAqi ?? 50;

  const temps = hourlyItems.map((h) => h.temperature);
  const minT = temps.length ? Math.min(...temps) : 0;
  const maxT = temps.length ? Math.max(...temps) : 1;
  const tSpan = Math.max(maxT - minT, 1);

  return (
    <div className="relative min-h-full">
      {/* Ambient sky backdrop */}
      <div className={cn("absolute inset-0 bg-gradient-to-b transition-all duration-700", SKY_GRADIENTS[sky])} />
      <div className="absolute inset-0 bg-gradient-to-b from-white/15 via-transparent to-black/15 pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-white/10 blur-3xl pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative p-4 md:p-8 max-w-4xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-white drop-shadow-md">
              Good{nowHour < 12 ? " morning" : nowHour < 18 ? " afternoon" : " evening"}
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              {settingsLoading ? <Skeleton className="h-4 w-48 bg-white/20" /> : locationName ? (
                <>
                  <MapPin className="w-3.5 h-3.5 text-white/70 shrink-0" />
                  <p className="text-sm text-white/70 truncate max-w-xs">{locationName}</p>
                </>
              ) : (
                <p className="text-sm text-white/70">
                  {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {push.state !== "unsupported" && (
              <GlassPillButton
                active={push.state === "subscribed"}
                title={push.state === "subscribed" ? "Background push on — click to disable" : "Enable background push notifications"}
                onClick={async () => {
                  if (push.state === "subscribed") {
                    await push.unsubscribe();
                    toast({ title: "Background notifications off" });
                  } else {
                    const ok = await push.subscribe();
                    if (ok) {
                      toast({ title: "Background notifications on", description: "You'll get notified even when this tab is closed." });
                      push.sendTest();
                    } else if (push.state === "denied") {
                      toast({ title: "Notifications blocked", description: "Allow notifications in your browser settings.", variant: "destructive" });
                    } else if (push.error) {
                      toast({ title: "Push not available", description: push.error });
                    }
                  }
                }}
              >
                <BellRing className="w-3.5 h-3.5" />
                {push.state === "subscribed" ? "Push on" : "Push off"}
              </GlassPillButton>
            )}
            {push.state === "subscribed" && (
              <GlassPillButton
                title="Send a test push notification"
                onClick={async () => {
                  await push.sendTest();
                  toast({ title: "Test notification sent", description: "You should receive it within a few seconds." });
                }}
              >
                Test
              </GlassPillButton>
            )}
            <GlassPillButton active={monitoring} onClick={toggleMonitoring}>
              {monitoring ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
              {monitoring ? "Monitoring on" : "Monitor off"}
            </GlassPillButton>
            <button
              onClick={() => refetchWeather()}
              title="Refresh"
              className="w-8 h-8 rounded-full inline-flex items-center justify-center border border-white/25 bg-white/15 text-white backdrop-blur-xl hover:bg-white/25 transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* No location */}
        {!settingsLoading && !enabled && (
          <GlassCard className="p-6 mb-6">
            <div className="flex items-center gap-3">
              <MapPin className="w-5 h-5 text-white" />
              <div>
                <p className="font-medium text-white">No location set</p>
                <p className="text-sm text-white/70">Add your address in Settings to start monitoring weather.</p>
              </div>
              <button
                onClick={() => window.location.href = "/settings"}
                className="ml-auto rounded-full bg-white text-slate-900 text-xs font-medium px-4 py-2 hover:bg-white/85 transition-colors"
              >
                Go to Settings
              </button>
            </div>
          </GlassCard>
        )}

        {/* Hero — floating over the sky */}
        <div className="relative px-1 pt-1 pb-7">
          <div className="flex items-center gap-2 text-white/75 text-sm mb-3">
            <SkyIcon kind={sky} className="w-4 h-4" />
            <span>{weatherLoading ? "Reading the sky…" : weather?.weatherDescription ?? "Set a location to begin"}</span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <AnimatePresence mode="wait">
              <motion.h2
                key={String(friendly)}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -14 }}
                transition={{ duration: 0.35 }}
                className="text-5xl md:text-6xl font-bold tracking-tight leading-[1.05] text-white drop-shadow-lg"
              >
                {weatherLoading
                  ? "Checking…"
                  : !enabled
                    ? "Set a location"
                    : friendly
                      ? "Open the windows"
                      : "Keep them closed"}
              </motion.h2>
            </AnimatePresence>
            <div className="text-right shrink-0">
              {weatherLoading ? (
                <Skeleton className="h-20 w-28 bg-white/20" />
              ) : (
                <>
                  <div className="text-7xl md:text-8xl font-bold tracking-tight leading-none text-white drop-shadow-lg">
                    {weather?.temperature?.toFixed(0) ?? "—"}°
                  </div>
                  {settings && weather && (
                    <div className="text-white/70 text-xs mt-2">
                      {weather.temperature < settings.indoorTemp ? "↓ cooler than inside" : "↑ warmer than inside"}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {!weatherLoading && weather?.recommendation && (
            <p className="text-white/90 mt-4 max-w-xl text-lg leading-relaxed drop-shadow">{weather.recommendation}</p>
          )}

          {weather?.timeOfDayTip && !friendly && (
            <div className="flex items-start gap-1.5 mt-3">
              <Info className="w-3.5 h-3.5 text-white/70 mt-0.5 shrink-0" />
              <p className="text-sm text-white/80">{weather.timeOfDayTip}</p>
            </div>
          )}

          {weather && (weather.reasons?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-4">
              {weather.reasons!.map((r, i) => (
                <span
                  key={i}
                  className="text-xs font-normal px-3 py-1.5 rounded-full bg-white/15 border border-white/25 text-white backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]"
                >
                  {r}
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-2 mt-5">
            <GlassPillButton active={windowState === "open"} onClick={() => logWindowAction("opened")}>
              Log open
            </GlassPillButton>
            <GlassPillButton active={windowState === "closed"} onClick={() => logWindowAction("closed")}>
              Log closed
            </GlassPillButton>
          </div>
        </div>

        {/* Metrics */}
        <GlassCard className="p-5 mb-5">
          <div className="grid grid-cols-3 gap-x-6 gap-y-5">
            <GlassMetric icon={Thermometer} label="Feels like" loading={weatherLoading}>
              <span className="text-2xl font-semibold">{weather?.temperature?.toFixed(1) ?? "—"}</span>
              <span className="text-sm text-white/75 ml-1">°F</span>
            </GlassMetric>

            <GlassMetric icon={Droplets} label="Humidity" loading={weatherLoading}>
              <span className="text-2xl font-semibold">{weather?.humidity?.toFixed(0) ?? "—"}</span>
              <span className="text-sm text-white/75 ml-1">%</span>
            </GlassMetric>

            <GlassMetric icon={WindIcon} label="Wind" loading={weatherLoading}>
              <span className="text-2xl font-semibold">{weather?.windSpeed?.toFixed(0) ?? "—"}</span>
              <span className="text-sm text-white/75 ml-1">mph</span>
              {weather && weather.windSpeed >= 3 && weather.windSpeed <= (settings?.maxWindSpeed ?? 20) && (
                <span className="text-xs ml-2 text-emerald-200">good for cross-ventilation</span>
              )}
            </GlassMetric>

            <GlassMetric icon={CloudRain} label="Rain chance" loading={weatherLoading}>
              <span className={cn("text-2xl font-semibold", rainChance > maxRainChance ? "text-sky-200" : "text-white")}>
                {rainChance}
              </span>
              <span className="text-sm text-white/75 ml-1">%</span>
            </GlassMetric>

            <GlassMetric icon={WindIcon} label="Air quality" loading={weatherLoading}>
              <span className={cn("text-2xl font-semibold", aqiInfo.cls)}>{aqi}</span>
              <span className={cn("text-sm ml-2 font-medium", aqiInfo.cls)}>{aqiInfo.text}</span>
            </GlassMetric>

            <GlassMetric icon={Leaf} label="Pollen" loading={weatherLoading}>
              <span className={cn("text-lg font-semibold capitalize", pollenColorLight(pollenLevel))}>
                {pollenLevel.replace("-", " ")}
              </span>
            </GlassMetric>
          </div>
        </GlassCard>

        {/* Today summary */}
        {!summaryLoading && summary && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <GlassCard className="p-5 mb-5">
              <h3 className="text-[11px] font-semibold text-white/75 uppercase tracking-wider mb-3">Today's strategy</h3>
              <p className="text-[15px] text-white mb-3 leading-relaxed">{summary.overallRecommendation}</p>
              <div className="flex flex-wrap gap-6 text-sm">
                <div>
                  <span className="text-white/60">Window-friendly hours: </span>
                  <span className="font-medium text-white">{summary.friendlyHoursCount}</span>
                </div>
                {summary.bestWindowStart !== null && (
                  <div>
                    <span className="text-white/60">Best window: </span>
                    <span className="font-medium text-white">{summary.bestWindowStart}:00 – {(summary.bestWindowEnd ?? summary.bestWindowStart) + 1}:00</span>
                  </div>
                )}
                <div>
                  <span className="text-white/60">Temp range: </span>
                  <span className="font-medium text-white">{summary.minTemp?.toFixed(0)}°F – {summary.maxTemp?.toFixed(0)}°F</span>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {/* Hourly forecast */}
        <GlassCard className="p-5 mb-5">
          <h3 className="text-[11px] font-semibold text-white/75 uppercase tracking-wider mb-4">Hourly forecast</h3>
          {forecastLoading || (enabled && hourlyItems.length === 0) ? (
            <div className="flex gap-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 w-10 rounded-lg bg-white/20" />)}</div>
          ) : !enabled ? (
            <p className="text-sm text-white/70 py-4 text-center">Set a location to see the forecast.</p>
          ) : (
            <div className="flex items-end gap-1.5 overflow-x-auto pb-2 pt-1">
              {hourlyItems.map((h, i) => {
                const isNow = h.hour === nowHour;
                const hasRain = h.precipitationProbability > maxRainChance;
                const pollen = h.pollenLevel as PollenLevel;
                const highPollen = pollen === "high" || pollen === "very-high";
                const barH = 14 + ((h.temperature - minT) / tSpan) * 52;

                return (
                  <motion.div
                    key={h.hour}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.03, 0.5) }}
                    className="flex flex-col items-center gap-1 shrink-0 w-10"
                    title={`${formatHour(h.hour)}: ${h.temperature.toFixed(0)}°F${hasRain ? `, ${h.precipitationProbability}% rain` : ""}${highPollen ? `, ${pollen} pollen` : ""}`}
                  >
                    <span className={cn("text-[11px] font-semibold text-white", isNow && "text-white")}>{h.temperature.toFixed(0)}°</span>
                    <div
                      style={{ height: `${barH}px` }}
                      className={cn(
                        "w-5 rounded-full transition-colors",
                        isNow
                          ? "bg-white shadow-lg"
                          : h.isWindowFriendly
                            ? "bg-emerald-300/90"
                            : "bg-white/25"
                      )}
                    />
                    <span className={cn("text-[10px] text-white/60", isNow && "text-white font-semibold")}>
                      {isNow ? "Now" : formatHour(h.hour)}
                    </span>
                    <div className="h-3.5 flex items-center">
                      {hasRain ? (
                        <CloudRain className="w-3 h-3 text-sky-200" />
                      ) : highPollen ? (
                        <Leaf className={cn("w-3 h-3", pollenColorLight(pollen))} />
                      ) : h.airQualityIndex > maxAqi ? (
                        <span className={cn("text-[9px] font-medium", aqiLabelLight(h.airQualityIndex).cls)}>AQI</span>
                      ) : null}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-xs text-white/70">
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-300" /> Window-friendly</div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-white" /> Now</div>
            <div className="flex items-center gap-1.5"><CloudRain className="w-3 h-3 text-sky-200" /> Rain</div>
            <div className="flex items-center gap-1.5"><Leaf className="w-3 h-3 text-orange-200" /> High pollen</div>
          </div>
        </GlassCard>

        {/* Work hours notice */}
        {settings && (
          <div className="flex items-center gap-2 text-xs text-white/60 px-1 pb-2">
            <Clock className="w-3.5 h-3.5" />
            <span>Notifications fire on any change, day or night · Work hours {settings.workStartHour}:00–{settings.workEndHour}:00 shape the forecast</span>
            <button onClick={() => window.location.href = "/settings"} className="flex items-center gap-0.5 text-white hover:underline ml-1 font-medium">
              Change <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
