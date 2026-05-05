import { motion } from "framer-motion";
import { Wind, Thermometer, Droplets, BarChart3, Clock, Calendar, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useGetEvents, getGetEventsQueryKey, useGetEventStats } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatCard({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number | null | undefined;
  loading: boolean;
}) {
  return (
    <Card className="p-4" data-testid={`stat-${label.toLowerCase().replace(/ /g, "-")}`}>
      <div className="flex items-center gap-2 mb-2 text-muted-foreground">
        <Icon className="w-4 h-4" />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      {loading ? (
        <Skeleton className="h-7 w-16" />
      ) : (
        <div className="text-2xl font-semibold">{value ?? "—"}</div>
      )}
    </Card>
  );
}

export default function History() {
  const { data: events, isLoading: eventsLoading } = useGetEvents(
    { limit: 50 },
    { query: { queryKey: getGetEventsQueryKey({ limit: 50 }) } }
  );
  const { data: stats, isLoading: statsLoading } = useGetEventStats();

  const avgDuration =
    stats?.avgOpenDurationMinutes != null
      ? stats.avgOpenDurationMinutes < 60
        ? `${Math.round(stats.avgOpenDurationMinutes)} min`
        : `${(stats.avgOpenDurationMinutes / 60).toFixed(1)} hr`
      : null;

  const mostCommonHour =
    stats?.mostCommonOpenHour != null
      ? new Date(2000, 0, 1, stats.mostCommonOpenHour).toLocaleString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })
      : null;

  return (
    <div className="p-8 max-w-3xl">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <div className="mb-8">
          <h1 className="text-2xl font-semibold">History</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Your window activity over the past week</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-7">
          <StatCard icon={TrendingUp} label="Times opened" value={stats?.totalOpens} loading={statsLoading} />
          <StatCard icon={BarChart3} label="Times closed" value={stats?.totalCloses} loading={statsLoading} />
          <StatCard icon={Clock} label="Avg open duration" value={avgDuration} loading={statsLoading} />
          <StatCard icon={Calendar} label="Days with open window" value={stats?.daysWithWindowOpen} loading={statsLoading} />
        </div>

        {mostCommonHour && (
          <Card className="p-4 mb-7 flex items-center gap-3 bg-primary/5 border-primary/20">
            <Clock className="w-4 h-4 text-primary" />
            <p className="text-sm text-foreground">
              You usually open your window around <strong>{mostCommonHour}</strong>
            </p>
          </Card>
        )}

        {/* Event list */}
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">Recent events</h2>

        {eventsLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : !events || events.length === 0 ? (
          <Card className="p-10 text-center">
            <Wind className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No window events recorded yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Use the Open/Close buttons on the dashboard to log activity.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {events.map((event, i) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <Card
                  className={cn(
                    "p-4 flex items-start justify-between border-l-4",
                    event.action === "opened"
                      ? "border-l-emerald-500 dark:border-l-emerald-600"
                      : "border-l-slate-300 dark:border-l-slate-600"
                  )}
                  data-testid={`event-card-${event.id}`}
                >
                  <div className="flex items-start gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-semibold capitalize">{event.action}</span>
                        <Badge variant="secondary" className="text-xs font-normal capitalize">
                          {event.triggeredBy}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">{formatTime(event.createdAt)}</div>
                    </div>
                  </div>
                  {(event.temperature != null || event.humidity != null || event.windSpeed != null) && (
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {event.temperature != null && (
                        <div className="flex items-center gap-1">
                          <Thermometer className="w-3.5 h-3.5" />
                          {((event.temperature * 9) / 5 + 32).toFixed(1)}°F
                        </div>
                      )}
                      {event.humidity != null && (
                        <div className="flex items-center gap-1">
                          <Droplets className="w-3.5 h-3.5" />
                          {event.humidity.toFixed(0)}%
                        </div>
                      )}
                      {event.windSpeed != null && (
                        <div className="flex items-center gap-1">
                          <Wind className="w-3.5 h-3.5" />
                          {(event.windSpeed * 0.621371).toFixed(1)} mph
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
