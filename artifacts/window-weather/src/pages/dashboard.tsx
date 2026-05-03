import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Thermometer, Droplets, Wind, Clock, RefreshCw,
  BellOff, Bell, MapPin, CheckCircle, XCircle, ChevronRight,
  CloudRain, Leaf, Wind as WindIcon, Info
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
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
  const hourlyItems = forecast?.hours?.slice(0, 12) ?? [];
  const rainChance = weather?.precipitationProbability ?? 0;
  const aqi = weather?.airQualityIndex ?? 0;
  const pollenLevel = (weather?.pollenLevel ?? "low") as PollenLevel;
  const aqiInfo = aqiLabel(aqi);
  const maxRainChance = settings?.maxRainChance ?? 40;
  const maxAqi = settings?.maxAqi ?? 50;

  return (
    <div className="p-8 max-w-4xl">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
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

        {/* Main status card */}
        <Card className="p-6 mb-5 overflow-hidden relative">
          <div className={cn("absolute inset-0 opacity-5 transition-colors duration-700", friendly ? "bg-emerald-500" : "bg-slate-400")} />
          <div className="relative">
            <div className="flex items-start justify-between mb-5">
              <div className="flex-1 min-w-0">
                {weatherLoading || settingsLoading ? (
                  <>
                    <Skeleton className="h-8 w-48 mb-2" />
                    <Skeleton className="h-4 w-64" />
                  </>
                ) : (
                  <AnimatePresence mode="wait">
                    <motion.div key={String(friendly)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                      <div className="flex items-center gap-2 mb-2">
                        {weather && (friendly
                          ? <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                          : <XCircle className="w-5 h-5 text-muted-foreground shrink-0" />
                        )}
                        <h2 className="text-lg font-semibold leading-tight">
                          {weather?.recommendation ?? (enabled ? "Checking weather…" : "Set a location to begin")}
                        </h2>
                      </div>
                      {weather?.timeOfDayTip && !friendly && (
                        <div className="flex items-start gap-1.5 mb-2">
                          <Info className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                          <p className="text-xs text-muted-foreground">{weather.timeOfDayTip}</p>
                        </div>
                      )}
                      {weather && (
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {weather.reasons?.map((r, i) => (
                            <Badge key={i} variant={friendly ? "default" : "secondary"} className="text-xs font-normal">{r}</Badge>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                )}
              </div>
              <div className="flex gap-2 shrink-0 ml-4">
                <Button size="sm" variant={windowState === "open" ? "default" : "outline"} onClick={() => logWindowAction("opened")} disabled={createEvent.isPending || !enabled}>Open</Button>
                <Button size="sm" variant={windowState === "closed" ? "default" : "outline"} onClick={() => logWindowAction("closed")} disabled={createEvent.isPending || !enabled}>Close</Button>
              </div>
            </div>

            {/* Metrics grid */}
            <div className="grid grid-cols-3 gap-x-6 gap-y-4 pt-4 border-t border-border">
              <MetricCard icon={Thermometer} label="Temperature" loading={weatherLoading}>
                <span className="text-2xl font-semibold">{weather?.temperature?.toFixed(1) ?? "—"}</span>
                <span className="text-sm text-muted-foreground ml-1">°F</span>
                {settings && weather && (
                  <span className={cn("text-xs ml-2", weather.temperature < settings.indoorTemp ? "text-emerald-600" : "text-orange-500")}>
                    {weather.temperature < settings.indoorTemp ? "↓ cooler than inside" : "↑ warmer than inside"}
                  </span>
                )}
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

        {/* Hourly forecast */}
        <Card className="p-5 mb-5">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">Hourly forecast</h3>
          {forecastLoading || (enabled && hourlyItems.length === 0) ? (
            <div className="flex gap-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 w-16 rounded-lg" />)}</div>
          ) : !enabled ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Set a location to see the forecast.</p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {hourlyItems.map((h, i) => {
                const isNow = h.hour === nowHour;
                const hasRain = h.precipitationProbability > maxRainChance;
                const pollen = h.pollenLevel as PollenLevel;
                const highPollen = pollen === "high" || pollen === "very-high";
                const hourAqiInfo = aqiLabel(h.airQualityIndex);

                return (
                  <motion.div
                    key={h.hour}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className={cn(
                      "shrink-0 w-16 rounded-xl flex flex-col items-center gap-1 py-2.5 px-1.5 border text-center",
                      isNow && "border-primary bg-primary/5",
                      !isNow && h.isWindowFriendly && "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800",
                      !isNow && !h.isWindowFriendly && (highPollen ? pollenBg(pollen) : "bg-muted border-border")
                    )}
                  >
                    <span className="text-xs text-muted-foreground font-medium">{h.hour}:00</span>
                    <span className="text-sm font-semibold">{h.temperature.toFixed(0)}°</span>
                    {hasRain ? (
                      <div className="flex items-center gap-0.5">
                        <CloudRain className="w-3 h-3 text-sky-500" />
                        <span className="text-xs text-sky-600 dark:text-sky-400">{h.precipitationProbability}%</span>
                      </div>
                    ) : highPollen ? (
                      <Leaf className={cn("w-3 h-3", pollenColor(pollen))} />
                    ) : (
                      <div className={cn("w-2 h-2 rounded-full", h.isWindowFriendly ? "bg-emerald-500" : "bg-muted-foreground/30")} />
                    )}
                    {h.airQualityIndex > maxAqi && (
                      <span className={cn("text-[10px] leading-none font-medium", hourAqiInfo.cls)}>AQI {h.airQualityIndex}</span>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500" /> Window-friendly</div>
            <div className="flex items-center gap-1.5"><CloudRain className="w-3 h-3 text-sky-500" /> Rain</div>
            <div className="flex items-center gap-1.5"><Leaf className="w-3 h-3 text-orange-500" /> High pollen</div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-muted-foreground/30" /> Not recommended</div>
          </div>
        </Card>

        {/* Work hours notice */}
        {settings && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
            <Clock className="w-3.5 h-3.5" />
            <span>Monitoring during work hours: {settings.workStartHour}:00 – {settings.workEndHour}:00 on work days</span>
            <button onClick={() => window.location.href = "/settings"} className="flex items-center gap-0.5 text-primary hover:underline ml-1">
              Change <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
