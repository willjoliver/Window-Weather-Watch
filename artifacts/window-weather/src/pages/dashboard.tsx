import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Thermometer, Droplets, Clock, RefreshCw,
  BellOff, Bell, MapPin, ChevronRight,
  CloudRain, Leaf, Wind as WindIcon, Info, BellRing,
  Sun, Moon, Cloud, CloudFog, CloudSnow, CloudLightning,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

function pollenColor(level: PollenLevel) {
  return {
    low: "text-emerald-600",
    moderate: "text-yellow-600",
    high: "text-orange-600",
    "very-high": "text-red-600",
  }[level];
}

function pollenBg(level: PollenLevel) {
  return {
    low: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800",
    moderate: "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-800",
    high: "bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-800",
    "very-high": "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800",
  }[level];
}

function aqiLabel(aqi: number) {
  if (aqi <= 50) return { text: "Good", cls: "text-emerald-600" };
  if (aqi <= 100) return { text: "Moderate", cls: "text-yellow-600" };
  if (aqi <= 150) return { text: "Sensitive", cls: "text-orange-600" };
  return { text: "Unhealthy", cls: "text-red-600" };
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
  "clear-day": "from-sky-600 via-sky-500 to-cyan-400",
  "clear-night": "from-indigo-950 via-[#232046] to-slate-900",
  "cloudy-day": "from-slate-600 via-slate-500 to-slate-400",
  "cloudy-night": "from-slate-900 via-slate-800 to-slate-700",
  fog: "from-stone-600 via-stone-500 to-stone-400",
  rain: "from-cyan-950 via-slate-800 to-cyan-900",
  snow: "from-sky-800 via-sky-700 to-indigo-600",
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

function MetricCard({
  icon: Icon,
  label,
  children,
  loading,
  iconClass,
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
  loading: boolean;
  iconClass?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-medium uppercase tracking-wide">
        <Icon className={cn("w-3.5 h-3.5", iconClass)} />
        {label}
      </div>
      {loading ? <Skeleton className="h-7 w-20" /> : <div className="text-foreground">{children}</div>}
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
  const aqiInfo = aqiLabel(aqi);
  const maxRainChance = settings?.maxRainChance ?? 40;
  const maxAqi = settings?.maxAqi ?? 50;

  const temps = hourlyItems.map((h) => h.temperature);
  const minT = temps.length ? Math.min(...temps) : 0;
  const maxT = temps.length ? Math.max(...temps) : 1;
  const tSpan = Math.max(maxT - minT, 1);

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              Good{nowHour < 12 ? " morning" : nowHour < 18 ? " afternoon" : " evening"}
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              {settingsLoading ? <Skeleton className="h-4 w-48" /> : locationName ? (
                <>
                  <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <p className="text-sm text-muted-foreground truncate max-w-xs">{locationName}</p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Background push toggle — only show if supported and server has VAPID configured */}
            {push.state !== "unsupported" && (
              <Button
                variant="outline"
                size="sm"
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
                className={cn(push.state === "subscribed" && "border-primary text-primary bg-primary/5")}
                title={push.state === "subscribed" ? "Background push on — click to disable" : "Enable background push notifications"}
              >
                <BellRing className="w-4 h-4 mr-1.5" />
                {push.state === "subscribed" ? "Push on" : "Push off"}
              </Button>
            )}
            {push.state === "subscribed" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await push.sendTest();
                  toast({ title: "Test notification sent", description: "You should receive it within a few seconds." });
                }}
                title="Send a test push notification"
              >
                Test
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={toggleMonitoring} className={cn(monitoring && "border-primary text-primary bg-primary/5")}>
              {monitoring ? <Bell className="w-4 h-4 mr-1.5" /> : <BellOff className="w-4 h-4 mr-1.5" />}
              {monitoring ? "Monitoring on" : "Monitor off"}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => refetchWeather()}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* No location */}
        {!settingsLoading && !enabled && (
          <Card className="p-6 mb-6 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
            <div className="flex items-center gap-3">
              <MapPin className="w-5 h-5 text-amber-600" />
              <div>
                <p className="font-medium text-foreground">No location set</p>
                <p className="text-sm text-muted-foreground">Add your address in Settings to start monitoring weather.</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => window.location.href = "/settings"} className="ml-auto">Go to Settings</Button>
            </div>
          </Card>
        )}

        {/* Hero — the verdict, big */}
        <div className={cn("rounded-3xl p-6 md:p-8 mb-5 text-white relative overflow-hidden bg-gradient-to-br transition-all duration-700", SKY_GRADIENTS[sky])}>
          <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-white/10 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-28 -left-16 w-72 h-72 rounded-full bg-black/10 blur-3xl pointer-events-none" />
          <div className="relative">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-white/75 text-sm mb-2">
                  <SkyIcon kind={sky} className="w-4 h-4" />
                  <span>{weatherLoading ? "Reading the sky…" : weather?.weatherDescription ?? "Set a location to begin"}</span>
                </div>
                <AnimatePresence mode="wait">
                  <motion.h2
                    key={String(friendly)}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                    className="text-4xl md:text-5xl font-bold tracking-tight leading-none"
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
                {!weatherLoading && weather?.recommendation && (
                  <p className="text-white/85 mt-3 max-w-lg leading-relaxed">{weather.recommendation}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                {weatherLoading ? (
                  <Skeleton className="h-16 w-24 bg-white/20" />
                ) : (
                  <>
                    <div className="text-6xl md:text-7xl font-bold tracking-tight leading-none">
                      {weather?.temperature?.toFixed(0) ?? "—"}°
                    </div>
                    {settings && weather && (
                      <div className="text-white/70 text-xs mt-1.5">
                        {weather.temperature < settings.indoorTemp ? "↓ cooler than inside" : "↑ warmer than inside"}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {weather?.timeOfDayTip && !friendly && (
              <div className="flex items-start gap-1.5 mt-4">
                <Info className="w-3.5 h-3.5 text-white/70 mt-0.5 shrink-0" />
                <p className="text-sm text-white/80">{weather.timeOfDayTip}</p>
              </div>
            )}

            {weather && (weather.reasons?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-4">
                {weather.reasons!.map((r, i) => (
                  <span key={i} className="text-xs font-normal px-2.5 py-1 rounded-full bg-white/15 border border-white/10 backdrop-blur-sm">{r}</span>
                ))}
              </div>
            )}

            <div className="flex gap-2 mt-5">
              <Button
                size="sm"
                onClick={() => logWindowAction("opened")}
                disabled={createEvent.isPending || !enabled}
                className={cn(
                  "bg-white text-slate-900 hover:bg-white/85 border border-transparent shadow-sm",
                  windowState === "open" && "bg-slate-900 text-white hover:bg-slate-800"
                )}
              >
                Log open
              </Button>
              <Button
                size="sm"
                onClick={() => logWindowAction("closed")}
                disabled={createEvent.isPending || !enabled}
                className={cn(
                  "bg-white text-slate-900 hover:bg-white/85 border border-transparent shadow-sm",
                  windowState === "closed" && "bg-slate-900 text-white hover:bg-slate-800"
                )}
              >
                Log closed
              </Button>
            </div>
          </div>
        </div>

        {/* Metrics grid */}
        <Card className="p-5 mb-5">
          <div className="grid grid-cols-3 gap-x-6 gap-y-4">
            <MetricCard icon={Thermometer} label="Feels like" loading={weatherLoading}>
              <span className="text-2xl font-semibold">{weather?.temperature?.toFixed(1) ?? "—"}</span>
              <span className="text-sm text-muted-foreground ml-1">°F</span>
            </MetricCard>

            <MetricCard icon={Droplets} label="Humidity" loading={weatherLoading}>
              <span className="text-2xl font-semibold">{weather?.humidity?.toFixed(0) ?? "—"}</span>
              <span className="text-sm text-muted-foreground ml-1">%</span>
            </MetricCard>

            <MetricCard icon={WindIcon} label="Wind" loading={weatherLoading}>
              <span className="text-2xl font-semibold">{weather?.windSpeed?.toFixed(0) ?? "—"}</span>
              <span className="text-sm text-muted-foreground ml-1">mph</span>
              {weather && weather.windSpeed >= 3 && weather.windSpeed <= (settings?.maxWindSpeed ?? 20) && (
                <span className="text-xs ml-2 text-emerald-600">good for cross-ventilation</span>
              )}
            </MetricCard>

            <MetricCard icon={CloudRain} label="Rain chance" loading={weatherLoading} iconClass={rainChance > maxRainChance ? "text-sky-500" : undefined}>
              <span className={cn("text-2xl font-semibold", rainChance > maxRainChance && "text-sky-600 dark:text-sky-400")}>
                {rainChance}
              </span>
              <span className="text-sm text-muted-foreground ml-1">%</span>
            </MetricCard>

            <MetricCard icon={WindIcon} label="Air quality" loading={weatherLoading}>
              <span className={cn("text-2xl font-semibold", aqiInfo.cls)}>{aqi}</span>
              <span className={cn("text-sm ml-2 font-medium", aqiInfo.cls)}>{aqiInfo.text}</span>
            </MetricCard>

            <MetricCard icon={Leaf} label="Pollen" loading={weatherLoading}>
              <span className={cn("text-lg font-semibold capitalize", pollenColor(pollenLevel))}>
                {pollenLevel.replace("-", " ")}
              </span>
            </MetricCard>
          </div>
        </Card>

        {/* Today summary */}
        {!summaryLoading && summary && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <Card className="p-5 mb-5">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Today's strategy</h3>
              <p className="text-sm text-foreground mb-3">{summary.overallRecommendation}</p>
              <div className="flex flex-wrap gap-6 text-sm">
                <div>
                  <span className="text-muted-foreground">Window-friendly hours: </span>
                  <span className="font-medium">{summary.friendlyHoursCount}</span>
                </div>
                {summary.bestWindowStart !== null && (
                  <div>
                    <span className="text-muted-foreground">Best window: </span>
                    <span className="font-medium">{summary.bestWindowStart}:00 – {(summary.bestWindowEnd ?? summary.bestWindowStart) + 1}:00</span>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Temp range: </span>
                  <span className="font-medium">{summary.minTemp?.toFixed(0)}°F – {summary.maxTemp?.toFixed(0)}°F</span>
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {/* Hourly forecast — temperature timeline */}
        <Card className="p-5 mb-5">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">Hourly forecast</h3>
          {forecastLoading || (enabled && hourlyItems.length === 0) ? (
            <div className="flex gap-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 w-10 rounded-lg" />)}</div>
          ) : !enabled ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Set a location to see the forecast.</p>
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
                    <span className={cn("text-[11px] font-semibold", isNow && "text-primary")}>{h.temperature.toFixed(0)}°</span>
                    <div
                      style={{ height: `${barH}px` }}
                      className={cn(
                        "w-5 rounded-full transition-colors",
                        isNow
                          ? "bg-primary"
                          : h.isWindowFriendly
                            ? "bg-emerald-500/90"
                            : "bg-muted-foreground/25"
                      )}
                    />
                    <span className={cn("text-[10px] text-muted-foreground", isNow && "text-primary font-semibold")}>
                      {isNow ? "Now" : formatHour(h.hour)}
                    </span>
                    <div className="h-3.5 flex items-center">
                      {hasRain ? (
                        <CloudRain className="w-3 h-3 text-sky-500" />
                      ) : highPollen ? (
                        <Leaf className={cn("w-3 h-3", pollenColor(pollen))} />
                      ) : h.airQualityIndex > maxAqi ? (
                        <span className={cn("text-[9px] font-medium", aqiLabel(h.airQualityIndex).cls)}>AQI</span>
                      ) : null}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500" /> Window-friendly</div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-primary" /> Now</div>
            <div className="flex items-center gap-1.5"><CloudRain className="w-3 h-3 text-sky-500" /> Rain</div>
            <div className="flex items-center gap-1.5"><Leaf className="w-3 h-3 text-orange-500" /> High pollen</div>
          </div>
        </Card>

        {/* Work hours notice */}
        {settings && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
            <Clock className="w-3.5 h-3.5" />
            <span>Notifications fire on any change, day or night · Work hours {settings.workStartHour}:00–{settings.workEndHour}:00 shape the forecast</span>
            <button onClick={() => window.location.href = "/settings"} className="flex items-center gap-0.5 text-primary hover:underline ml-1">
              Change <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
