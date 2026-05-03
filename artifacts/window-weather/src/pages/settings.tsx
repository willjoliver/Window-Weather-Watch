import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Save, Bell, Thermometer, Droplets, Wind, Clock, Calendar } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Form, FormField, FormItem, FormLabel, FormControl, FormDescription } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const schema = z.object({
  minTemp: z.number().min(-20).max(40),
  maxTemp: z.number().min(-20).max(40),
  maxHumidity: z.number().min(10).max(100),
  maxWindSpeed: z.number().min(0).max(120),
  workDays: z.array(z.number()).min(1, "Select at least one work day"),
  workStartHour: z.number().min(0).max(23),
  workEndHour: z.number().min(1).max(24),
  notificationsEnabled: z.boolean(),
  checkIntervalMinutes: z.number().min(5).max(120),
});

type FormValues = z.infer<typeof schema>;

export default function Settings() {
  const { data: settings, isLoading } = useGetSettings();
  const updateSettings = useUpdateSettings();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      minTemp: 16,
      maxTemp: 26,
      maxHumidity: 70,
      maxWindSpeed: 30,
      workDays: [1, 2, 3, 4, 5],
      workStartHour: 8,
      workEndHour: 18,
      notificationsEnabled: true,
      checkIntervalMinutes: 30,
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        minTemp: settings.minTemp,
        maxTemp: settings.maxTemp,
        maxHumidity: settings.maxHumidity,
        maxWindSpeed: settings.maxWindSpeed,
        workDays: settings.workDays as number[],
        workStartHour: settings.workStartHour,
        workEndHour: settings.workEndHour,
        notificationsEnabled: settings.notificationsEnabled,
        checkIntervalMinutes: settings.checkIntervalMinutes,
      });
    }
  }, [settings]);

  function onSubmit(values: FormValues) {
    updateSettings.mutate(
      { data: values },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
          toast({ title: "Settings saved" });
        },
        onError: () => {
          toast({ title: "Failed to save settings", variant: "destructive" });
        },
      }
    );
  }

  return (
    <div className="p-8 max-w-2xl">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <div className="mb-8">
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Configure your comfort thresholds and work schedule</p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

              {/* Temperature */}
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-5">
                  <Thermometer className="w-4 h-4 text-primary" />
                  <h2 className="font-semibold text-sm">Temperature range</h2>
                </div>
                <div className="space-y-5">
                  <FormField
                    control={form.control}
                    name="minTemp"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex justify-between items-center mb-2">
                          <FormLabel className="text-sm">Minimum temperature</FormLabel>
                          <span className="text-sm font-semibold text-primary" data-testid="value-min-temp">{field.value}°C</span>
                        </div>
                        <FormControl>
                          <Slider
                            min={-10}
                            max={30}
                            step={1}
                            value={[field.value]}
                            onValueChange={([v]) => field.onChange(v)}
                            data-testid="slider-min-temp"
                          />
                        </FormControl>
                        <FormDescription className="text-xs">Alert to close window below this temperature</FormDescription>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="maxTemp"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex justify-between items-center mb-2">
                          <FormLabel className="text-sm">Maximum temperature</FormLabel>
                          <span className="text-sm font-semibold text-primary" data-testid="value-max-temp">{field.value}°C</span>
                        </div>
                        <FormControl>
                          <Slider
                            min={10}
                            max={40}
                            step={1}
                            value={[field.value]}
                            onValueChange={([v]) => field.onChange(v)}
                            data-testid="slider-max-temp"
                          />
                        </FormControl>
                        <FormDescription className="text-xs">Alert to close window above this temperature</FormDescription>
                      </FormItem>
                    )}
                  />
                </div>
              </Card>

              {/* Humidity & Wind */}
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-5">
                  <Droplets className="w-4 h-4 text-primary" />
                  <h2 className="font-semibold text-sm">Humidity &amp; wind</h2>
                </div>
                <div className="space-y-5">
                  <FormField
                    control={form.control}
                    name="maxHumidity"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex justify-between items-center mb-2">
                          <FormLabel className="text-sm">Maximum humidity</FormLabel>
                          <span className="text-sm font-semibold text-primary" data-testid="value-max-humidity">{field.value}%</span>
                        </div>
                        <FormControl>
                          <Slider
                            min={30}
                            max={100}
                            step={5}
                            value={[field.value]}
                            onValueChange={([v]) => field.onChange(v)}
                            data-testid="slider-max-humidity"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="maxWindSpeed"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex justify-between items-center mb-2">
                          <div className="flex items-center gap-1.5">
                            <Wind className="w-3.5 h-3.5 text-muted-foreground" />
                            <FormLabel className="text-sm">Maximum wind speed</FormLabel>
                          </div>
                          <span className="text-sm font-semibold text-primary" data-testid="value-max-wind">{field.value} km/h</span>
                        </div>
                        <FormControl>
                          <Slider
                            min={0}
                            max={80}
                            step={5}
                            value={[field.value]}
                            onValueChange={([v]) => field.onChange(v)}
                            data-testid="slider-max-wind"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </Card>

              {/* Work schedule */}
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-5">
                  <Calendar className="w-4 h-4 text-primary" />
                  <h2 className="font-semibold text-sm">Work schedule</h2>
                </div>
                <FormField
                  control={form.control}
                  name="workDays"
                  render={({ field }) => (
                    <FormItem className="mb-5">
                      <FormLabel className="text-sm mb-2 block">Work days</FormLabel>
                      <div className="flex gap-2">
                        {DAYS.map((day, idx) => {
                          const active = field.value.includes(idx);
                          return (
                            <button
                              key={day}
                              type="button"
                              data-testid={`day-${day.toLowerCase()}`}
                              onClick={() => {
                                if (active) {
                                  field.onChange(field.value.filter((d) => d !== idx));
                                } else {
                                  field.onChange([...field.value, idx].sort());
                                }
                              }}
                              className={`w-10 h-10 rounded-lg text-xs font-semibold border transition-colors ${
                                active
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-muted text-muted-foreground border-border hover:border-primary/50"
                              }`}
                            >
                              {day}
                            </button>
                          );
                        })}
                      </div>
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="workStartHour"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex justify-between items-center mb-2">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                            <FormLabel className="text-sm">Start hour</FormLabel>
                          </div>
                          <span className="text-sm font-semibold text-primary" data-testid="value-start-hour">{field.value}:00</span>
                        </div>
                        <FormControl>
                          <Slider
                            min={0}
                            max={12}
                            step={1}
                            value={[field.value]}
                            onValueChange={([v]) => field.onChange(v)}
                            data-testid="slider-start-hour"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="workEndHour"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex justify-between items-center mb-2">
                          <FormLabel className="text-sm">End hour</FormLabel>
                          <span className="text-sm font-semibold text-primary" data-testid="value-end-hour">{field.value}:00</span>
                        </div>
                        <FormControl>
                          <Slider
                            min={12}
                            max={24}
                            step={1}
                            value={[field.value]}
                            onValueChange={([v]) => field.onChange(v)}
                            data-testid="slider-end-hour"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </Card>

              {/* Notifications */}
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-5">
                  <Bell className="w-4 h-4 text-primary" />
                  <h2 className="font-semibold text-sm">Notifications</h2>
                </div>
                <FormField
                  control={form.control}
                  name="notificationsEnabled"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between mb-4">
                      <div>
                        <FormLabel className="text-sm">Enable notifications</FormLabel>
                        <FormDescription className="text-xs">Get browser alerts when window conditions change</FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-notifications"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="checkIntervalMinutes"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex justify-between items-center mb-2">
                        <FormLabel className="text-sm">Check interval</FormLabel>
                        <span className="text-sm font-semibold text-primary" data-testid="value-interval">every {field.value} min</span>
                      </div>
                      <FormControl>
                        <Slider
                          min={5}
                          max={60}
                          step={5}
                          value={[field.value]}
                          onValueChange={([v]) => field.onChange(v)}
                          data-testid="slider-interval"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </Card>

              <Button
                type="submit"
                className="w-full"
                disabled={updateSettings.isPending}
                data-testid="button-save-settings"
              >
                <Save className="w-4 h-4 mr-2" />
                {updateSettings.isPending ? "Saving..." : "Save settings"}
              </Button>
            </form>
          </Form>
        )}
      </motion.div>
    </div>
  );
}
