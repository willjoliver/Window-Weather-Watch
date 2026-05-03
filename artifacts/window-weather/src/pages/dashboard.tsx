import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Thermometer, Droplets, Wind, Clock, RefreshCw,
  BellOff, Bell, MapPin, CheckCircle, XCircle, ChevronRight
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
  useCreateEvent,
  getGetEventsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "@/hooks/use-location";
import { cn } from "@/lib/utils";

function WeatherMetric({
  icon: Icon,
  label,
  value,
  unit,
  loading,
}: {
  icon: React.ElementType;
  label: string;
  value?: number | null;
  unit: string;
  loading: boolean;
}) {
  return (
    <div className="flex flex-col gap-1" data-testid={`metric-${label.toLowerCase().replace(/ /g, "-")}`}>
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-medium uppercase tracking-wide">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      {loading ? (
        <Skeleton className="h-7 w-20" />
      ) : (
        <div className="text-2xl font-semibold text-foreground">
          {value !== undefined && value !== null ? value.toFixed(1) : "—"}
          <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { location, requestLocation } = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [monitoring, setMonitoring] = useState(false);
  const [windowState, setWindowState] = useState<"open" | "closed" | null>(null);
  const prevFriendly = useRef<boolean | null>(null);
  const createEvent = useCreateEvent();

  const enabled = location.status === "granted";
  const lat = location.status === "granted" ? location.lat : 0;
  const lon = location.status === "granted" ? location.lon : 0;

  const { data: weather, isLoading: weatherLoading, refetch: refetchWeather } = useGetCurrentWeather(
    { lat, lon },
    { query: { enabled, queryKey: getGetCurrentWeatherQueryKey({ lat, lon }) } }
  );
  const { data: summary, isLoading: summaryLoading } = useGetTodaySummary(
    { lat, lon },
    { query: { enabled, queryKey: getGetTodaySummaryQueryKey({ lat, lon }) } }
  );
  const { data: forecast, isLoading: forecastLoading } = useGetWeatherForecast(
    { lat, lon },
    { query: { enabled, queryKey: getGetWeatherForecastQueryKey({ lat, lon }) } }
  );
  const { data: settings } = useGetSettings();

  const interval = settings?.checkIntervalMinutes ?? 30;

  useEffect(() => {
    if (!monitoring || !enabled) return;
    const id = setInterval(async () => {
      const result = await refetchWeather();
      const fresh = result.data?.isWindowFriendly;
      if (fresh !== undefined && prevFriendly.current !== null && fresh !== prevFriendly.current) {
        if (Notification.permission === "granted") {
          new Notification(fresh ? "Open your window!" : "Close your window", {
            body: fresh
              ? "Conditions are great right now."
              : result.data?.recommendation ?? "Conditions have changed.",
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
            <h1 className="text-2xl font-semibold text-foreground">Good{nowHour < 12 ? " morning" : nowHour < 18 ? " afternoon" : " evening"}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleMonitoring}
              data-testid="button-toggle-monitoring"
              className={cn(monitoring && "border-primary text-primary bg-primary/5")}
            >
              {monitoring ? <Bell className="w-4 h-4 mr-1.5" /> : <BellOff className="w-4 h-4 mr-1.5" />}
              {monitoring ? "Monitoring on" : "Monitor off"}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => refetchWeather()} data-testid="button-refresh">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Location denied */}
        {location.status === "denied" && (
          <Card className="p-6 mb-6 border-destructive/30 bg-destructive/5">
            <div className="flex items-center gap-3">
              <MapPin className="w-5 h-5 text-destructive" />
              <div>
                <p className="font-medium text-foreground">Location access needed</p>
                <p className="text-sm text-muted-foreground">{location.error}</p>
              </div>
              <Button size="sm" variant="outline" onClick={requestLocation} className="ml-auto">
                Retry
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
                {weatherLoading ? (
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
                        {friendly ? (
                          <CheckCircle className="w-5 h-5 text-emerald-600" />
                        ) : (
                          <XCircle className="w-5 h-5 text-muted-foreground" />
                        )}
                        <h2 className="text-lg font-semibold">{weather?.recommendation}</h2>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {weather?.reasons?.map((r, i) => (
                          <Badge
                            key={i}
                            variant={friendly ? "default" : "secondary"}
                            className="text-xs font-normal"
                            data-testid={`badge-reason-${i}`}
                          >
                            {r}
                          </Badge>
                        ))}
                      </div>
                    </motion.div>
                  </AnimatePresence>
                )}
              </div>
              <div className="flex gap-2 shrink-0 ml-4">
                <Button
                  size="sm"
                  variant={windowState === "open" ? "default" : "outline"}
                  onClick={() => logWindowAction("opened")}
                  data-testid="button-log-open"
                  disabled={createEvent.isPending}
                >
                  Open
                </Button>
                <Button
                  size="sm"
                  variant={windowState === "closed" ? "default" : "outline"}
                  onClick={() => logWindowAction("closed")}
                  data-testid="button-log-close"
                  disabled={createEvent.isPending}
                >
                  Close
                </Button>
              </div>
            </div>

            {/* Metrics row */}
            <div className="grid grid-cols-3 gap-6 pt-4 border-t border-border">
              <WeatherMetric
                icon={Thermometer}
                label="Temperature"
                value={weather?.temperature}
                unit="°C"
                loading={weatherLoading}
              />
              <WeatherMetric
                icon={Droplets}
                label="Humidity"
                value={weather?.humidity}
                unit="%"
                loading={weatherLoading}
              />
              <WeatherMetric
                icon={Wind}
                label="Wind speed"
                value={weather?.windSpeed}
                unit="km/h"
                loading={weatherLoading}
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
              <div className="flex gap-6 text-sm">
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
                  <span className="font-medium">{summary.minTemp?.toFixed(1)}°C – {summary.maxTemp?.toFixed(1)}°C</span>
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {/* Hourly forecast */}
        <Card className="p-5 mb-5">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">Hourly forecast</h3>
          {forecastLoading ? (
            <div className="flex gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-14 rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {hourlyItems.map((h, i) => {
                const isNow = h.hour === nowHour;
                return (
                  <motion.div
                    key={h.hour}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    data-testid={`forecast-hour-${h.hour}`}
                    className={cn(
                      "shrink-0 w-14 rounded-xl flex flex-col items-center gap-1 py-2.5 px-1 border text-center",
                      isNow && "border-primary bg-primary/5",
                      !isNow && h.isWindowFriendly && "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800",
                      !isNow && !h.isWindowFriendly && "bg-muted border-border"
                    )}
                  >
                    <span className="text-xs text-muted-foreground font-medium">{h.hour}:00</span>
                    <span className="text-sm font-semibold">{h.temperature.toFixed(0)}°</span>
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      h.isWindowFriendly ? "bg-emerald-500" : "bg-muted-foreground/30"
                    )} />
                  </motion.div>
                );
              })}
            </div>
          )}
          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500" /> Window-friendly</div>
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
            <a href="/settings" className="flex items-center gap-0.5 text-primary hover:underline ml-1">
              Change <ChevronRight className="w-3 h-3" />
            </a>
          </div>
        )}
      </motion.div>
    </div>
  );
}
