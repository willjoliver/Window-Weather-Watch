import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Thermometer, Droplets, Wind, Clock, RefreshCw,
  BellOff, Bell, MapPin, CheckCircle, XCircle, ChevronRight, CloudRain
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

function WeatherMetric({
  icon: Icon,
  label,
  value,
  unit,
  loading,
  highlight,
}: {
  icon: React.ElementType;
  label: string;
  value?: number | null;
  unit: string;
  loading: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-medium uppercase tracking-wide">
        <Icon className={cn("w-3.5 h-3.5", highlight && "text-sky-500")} />
        <span className={highlight ? "text-sky-600 dark:text-sky-400" : ""}>{label}</span>
      </div>
      {loading ? (
        <Skeleton className="h-7 w-20" />
      ) : (
        <div className={cn("text-2xl font-semibold", highlight ? "text-sky-600 dark:text-sky-400" : "text-foreground")}>
          {value !== undefined && value !== null ? (unit === "%" && label === "Rain chance" ? `${value}` : value.toFixed(label === "Rain chance" ? 0 : 1)) : "—"}
          <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>
        </div>
      )}
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
            body: fresh ? "Conditions are great right now." : result.data?.recommendation ?? "Conditions have changed.",
            icon: "/favicon.ico",
          });
        }
        toast({
          title: fresh ? "Open your window!" : "Close your window",
          description: fresh ? "Conditions are great right now." : result.data?.recommendation,
        });
      }
      if (fresh !== undefined) prevFriendly.current = fresh;
    }, interval * 60 * 1000);
    return () => clearInterval(id);
  }, [monitoring, enabled, interval]);

  useEffect(() => {
    if (weather) prevFriendly.current = weather.isWindowFriendly;
  }, [weather]);

  async function toggleMonitoring() {
    if (!monitoring && Notification.permission !== "granted") {
      await Notification.requestPermission();
    }
    setMonitoring((v) => !v);
  }

  function logWindowAction(action: "opened" | "closed") {
    createEvent.mutate(
      {
        data: {
          action,
          triggeredBy: "user",
          temperature: weather?.temperature ?? undefined,
          humidity: weather?.humidity ?? undefined,
          windSpeed: weather?.windSpeed ?? undefined,
        },
      },
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

  return (
    <div className="p-8 max-w-4xl">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              Good{nowHour < 12 ? " morning" : nowHour < 18 ? " afternoon" : " evening"}
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              {settingsLoading ? (
                <Skeleton className="h-4 w-48" />
              ) : locationName ? (
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
            <Button
              variant="outline"
              size="sm"
              onClick={toggleMonitoring}
              className={cn(monitoring && "border-primary text-primary bg-primary/5")}
            >
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
              <Button size="sm" variant="outline" onClick={() => window.location.href = "/settings"} className="ml-auto">
                Go to Settings
              </Button>
            </div>
          </Card>
        )}

        {/* Main status card */}
        <Card className="p-6 mb-5 overflow-hidden relative">
          <div
            className={cn(
              "absolute inset-0 opacity-5 transition-colors duration-700",
              friendly ? "bg-emerald-500" : "bg-slate-400"
            )}
          />
          <div className="relative">
            <div className="flex items-start justify-between mb-5">
              <div>
                {weatherLoading || settingsLoading ? (
                  <>
                    <Skeleton className="h-8 w-48 mb-2" />
                    <Skeleton className="h-4 w-64" />
                  </>
                ) : (
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={String(friendly)}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {weather ? (
                          friendly ? (
                            <CheckCircle className="w-5 h-5 text-emerald-600" />
                          ) : (
                            <XCircle className="w-5 h-5 text-muted-foreground" />
                          )
                        ) : null}
                        <h2 className="text-lg font-semibold">
                          {weather?.recommendation ?? (enabled ? "Checking weather…" : "Set a location to begin")}
                        </h2>
                      </div>
                      {weather && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {weather.reasons?.map((r, i) => (
                            <Badge
                              key={i}
                              variant={friendly ? "default" : "secondary"}
                              className="text-xs font-normal"
                            >
                              {r}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                )}
              </div>
              <div className="flex gap-2 shrink-0 ml-4">
                <Button
                  size="sm"
                  variant={windowState === "open" ? "default" : "outline"}
                  onClick={() => logWindowAction("opened")}
                  disabled={createEvent.isPending || !enabled}
                >
                  Open
                </Button>
                <Button
                  size="sm"
                  variant={windowState === "closed" ? "default" : "outline"}
                  onClick={() => logWindowAction("closed")}
                  disabled={createEvent.isPending || !enabled}
                >
                  Close
                </Button>
              </div>
            </div>

            {/* Metrics row */}
            <div className="grid grid-cols-4 gap-6 pt-4 border-t border-border">
              <WeatherMetric icon={Thermometer} label="Temperature" value={weather?.temperature} unit="°F" loading={weatherLoading} />
              <WeatherMetric icon={Droplets} label="Humidity" value={weather?.humidity} unit="%" loading={weatherLoading} />
              <WeatherMetric icon={Wind} label="Wind speed" value={weather?.windSpeed} unit="mph" loading={weatherLoading} />
              <WeatherMetric
                icon={CloudRain}
                label="Rain chance"
                value={rainChance}
                unit="%"
                loading={weatherLoading}
                highlight={rainChance > (settings?.maxRainChance ?? 40)}
              />
            </div>
          </div>
        </Card>

        {/* Today summary */}
        {!summaryLoading && summary && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            <Card className="p-5 mb-5">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Today's outlook</h3>
              <p className="text-sm text-foreground mb-3">{summary.overallRecommendation}</p>
              <div className="flex flex-wrap gap-6 text-sm">
                <div>
                  <span className="text-muted-foreground">Window-friendly hours: </span>
                  <span className="font-medium">{summary.friendlyHoursCount}</span>
                </div>
                {summary.bestWindowStart !== null && (
                  <div>
                    <span className="text-muted-foreground">Best window: </span>
                    <span className="font-medium">
                      {summary.bestWindowStart}:00 – {(summary.bestWindowEnd ?? summary.bestWindowStart) + 1}:00
                    </span>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Range: </span>
                  <span className="font-medium">
                    {summary.minTemp?.toFixed(0)}°F – {summary.maxTemp?.toFixed(0)}°F
                  </span>
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {/* Hourly forecast */}
        <Card className="p-5 mb-5">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">Hourly forecast</h3>
          {forecastLoading || (enabled && hourlyItems.length === 0) ? (
            <div className="flex gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-14 rounded-lg" />
              ))}
            </div>
          ) : !enabled ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Set a location to see the forecast.</p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {hourlyItems.map((h, i) => {
                const isNow = h.hour === nowHour;
                const hasRain = h.precipitationProbability > (settings?.maxRainChance ?? 40);
                return (
                  <motion.div
                    key={h.hour}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className={cn(
                      "shrink-0 w-16 rounded-xl flex flex-col items-center gap-1 py-2.5 px-1 border text-center",
                      isNow && "border-primary bg-primary/5",
                      !isNow && h.isWindowFriendly && "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800",
                      !isNow && !h.isWindowFriendly && "bg-muted border-border"
                    )}
                  >
                    <span className="text-xs text-muted-foreground font-medium">{h.hour}:00</span>
                    <span className="text-sm font-semibold">{h.temperature.toFixed(0)}°</span>
                    {hasRain ? (
                      <div className="flex items-center gap-0.5">
                        <CloudRain className="w-3 h-3 text-sky-500" />
                        <span className="text-xs text-sky-600 dark:text-sky-400">{h.precipitationProbability}%</span>
                      </div>
                    ) : (
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        h.isWindowFriendly ? "bg-emerald-500" : "bg-muted-foreground/30"
                      )} />
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500" /> Window-friendly</div>
            <div className="flex items-center gap-1.5"><CloudRain className="w-3 h-3 text-sky-500" /> Rain forecast</div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-muted-foreground/30" /> Not recommended</div>
          </div>
        </Card>

        {/* Work hours notice */}
        {settings && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
            <Clock className="w-3.5 h-3.5" />
            <span>
              Monitoring during work hours: {settings.workStartHour}:00 – {settings.workEndHour}:00 on work days
            </span>
            <button
              onClick={() => window.location.href = "/settings"}
              className="flex items-center gap-0.5 text-primary hover:underline ml-1"
            >
              Change <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
