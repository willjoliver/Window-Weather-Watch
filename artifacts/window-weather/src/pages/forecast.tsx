import { motion } from "framer-motion";
import { CloudRain, Thermometer, Leaf, Wind, Sun, Cloud, CloudSnow, Zap, Droplets, CheckCircle, XCircle, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useGetWeeklyForecast, getGetWeeklyForecastQueryKey, useGetSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

type PollenLevel = "low" | "moderate" | "high" | "very-high";
type Strategy = "both" | "morning" | "evening" | "throughout" | "none";

function WeatherIcon({ code, className }: { code: number; className?: string }) {
  if (code === 0) return <Sun className={cn("text-yellow-500", className)} />;
  if (code <= 2) return <Cloud className={cn("text-slate-400", className)} />;
  if (code === 3) return <Cloud className={cn("text-slate-500", className)} />;
  if (code <= 49) return <Cloud className={cn("text-slate-400", className)} />;
  if (code <= 69) return <CloudRain className={cn("text-sky-500", className)} />;
  if (code <= 79) return <CloudSnow className={cn("text-blue-400", className)} />;
  if (code <= 84) return <CloudRain className={cn("text-sky-600", className)} />;
  return <Zap className={cn("text-yellow-500", className)} />;
}

function pollenDot(level: PollenLevel) {
  return {
    low: "bg-emerald-500",
    moderate: "bg-yellow-500",
    high: "bg-orange-500",
    "very-high": "bg-red-500",
  }[level];
}

function strategyConfig(strategy: Strategy) {
  const configs = {
    both: { label: "Morning + evening", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300", icon: "🌅🌆" },
    morning: { label: "Morning window", color: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300", icon: "🌅" },
    evening: { label: "Evening window", color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300", icon: "🌆" },
    throughout: { label: "Open all day", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300", icon: "☀️" },
    none: { label: "Keep closed", color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400", icon: "🚫" },
  };
  return configs[strategy];
}

export default function Forecast() {
  const { data: settings } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });

  const lat = settings?.locationLat ?? null;
  const lon = settings?.locationLon ?? null;
  const enabled = lat !== null && lon !== null;

  const { data, isLoading } = useGetWeeklyForecast(
    { lat: lat ?? 0, lon: lon ?? 0 },
    { query: { enabled, queryKey: getGetWeeklyForecastQueryKey({ lat: lat ?? 0, lon: lon ?? 0 }) } }
  );

  const workStart = settings?.workStartHour ?? 9;
  const workEnd = settings?.workEndHour ?? 17;
  const workLabel = `${workStart % 12 || 12}${workStart < 12 ? "am" : "pm"}–${workEnd % 12 || 12}${workEnd < 12 ? "am" : "pm"}`;
  const workSlots = Math.min(8, workEnd - workStart);

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="mb-8">
          <h1 className="text-2xl font-semibold">7-Day Forecast</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Plan your window schedule for the week ahead</p>
        </div>

        {!enabled && !isLoading && (
          <Card className="p-6 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
            <p className="text-sm font-medium">No location set — add your address in Settings to see the forecast.</p>
          </Card>
        )}

        <div className="space-y-3">
          {isLoading
            ? Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-xl" />)
            : data?.days?.map((day, i) => {
                const isToday = day.date === today;
                const strategy = day.strategy as Strategy;
                const pollen = day.pollenLevel as PollenLevel;
                const cfg = strategyConfig(strategy);
                const hasIssues = strategy === "none";

                return (
                  <motion.div
                    key={day.date}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06 }}
                  >
                    <Card className={cn("p-5 transition-colors", isToday && "border-primary ring-1 ring-primary/20")}>
                      <div className="flex items-start gap-4">
                        {/* Day + icon */}
                        <div className="w-24 shrink-0">
                          <div className="flex items-center gap-1.5 mb-1">
                            <WeatherIcon code={day.weatherCode} className="w-4 h-4" />
                            <span className={cn("text-sm font-semibold", isToday && "text-primary")}>
                              {isToday ? "Today" : day.dayName}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {new Date(day.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">{day.weatherDescription}</p>
                        </div>

                        {/* Temp */}
                        <div className="w-20 shrink-0">
                          <div className="flex items-center gap-1 mb-0.5">
                            <Thermometer className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Temp</span>
                          </div>
                          <div className="text-sm font-semibold">{day.highTemp.toFixed(0)}°<span className="text-muted-foreground font-normal">/{day.lowTemp.toFixed(0)}°F</span></div>
                        </div>

                        {/* Conditions badges */}
                        <div className="flex flex-wrap gap-1.5 flex-1 items-start">
                          {day.maxPrecipProbability > (settings?.maxRainChance ?? 40) && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                              <CloudRain className="w-3 h-3" />{day.maxPrecipProbability}% rain
                            </span>
                          )}
                          {day.airQualityIndex > (settings?.maxAqi ?? 50) && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
                              <Wind className="w-3 h-3" />AQI {day.airQualityIndex}
                            </span>
                          )}
                          {(pollen === "high" || pollen === "very-high") && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
                              <Leaf className="w-3 h-3" />{pollen.replace("-", " ")} pollen
                            </span>
                          )}
                          {day.maxPrecipProbability <= (settings?.maxRainChance ?? 40) && day.airQualityIndex <= (settings?.maxAqi ?? 50) && pollen !== "high" && pollen !== "very-high" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                              <Droplets className="w-3 h-3" />Clean air
                            </span>
                          )}
                        </div>

                        {/* Strategy */}
                        <div className="shrink-0 text-right">
                          <span className={cn("inline-block px-2.5 py-1 rounded-lg text-xs font-medium mb-1", cfg.color)}>
                            {cfg.icon} {cfg.label}
                          </span>
                          {day.friendlyHoursCount > 0 && (
                            <p className="text-xs text-muted-foreground">{day.friendlyHoursCount} good hour{day.friendlyHoursCount !== 1 ? "s" : ""}</p>
                          )}
                        </div>
                      </div>

                      {/* Recommendation + window times */}
                      <div className={cn("mt-3 pt-3 border-t border-border flex items-start justify-between gap-4")}>
                        <div className="flex items-start gap-1.5 flex-1">
                          {hasIssues
                            ? <XCircle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                            : <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                          }
                          <p className="text-sm text-muted-foreground">{day.overallRecommendation}</p>
                        </div>

                        {/* Work Hours/Evening bars */}
                        <div className="shrink-0 flex flex-col gap-1 min-w-[120px]">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground w-14 text-right">Work hrs</span>
                            <div className="flex gap-0.5">
                              {Array.from({ length: workSlots }).map((_, j) => (
                                <div key={j} className={cn("w-3.5 h-3.5 rounded-sm", j < day.morningWindowHours ? "bg-sky-400" : "bg-muted")} />
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground w-14 text-right">Evening</span>
                            <div className="flex gap-0.5">
                              {Array.from({ length: 5 }).map((_, j) => (
                                <div key={j} className={cn("w-3.5 h-3.5 rounded-sm", j < day.eveningWindowHours ? "bg-indigo-400" : "bg-muted")} />
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                );
              })}
        </div>

        {/* Legend */}
        {data && (
          <div className="mt-6 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5"><div className="w-3.5 h-3.5 rounded-sm bg-sky-400" /> Work hours ({workLabel})</div>
            <div className="flex items-center gap-1.5"><div className="w-3.5 h-3.5 rounded-sm bg-indigo-400" /> Evening hours (after {workEnd % 12 || 12}pm)</div>
            <div className="flex items-center gap-1.5"><div className="w-3.5 h-3.5 rounded-sm bg-muted" /> Not window-friendly</div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
