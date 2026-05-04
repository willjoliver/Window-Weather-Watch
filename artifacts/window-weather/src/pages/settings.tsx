import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Save, Bell, Thermometer, Droplets, Wind, Clock, Calendar, MapPin, Search, Loader2, CloudRain, Leaf, Home } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Form, FormField, FormItem, FormLabel, FormControl, FormDescription } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import {
  useGetSettings,
  useUpdateSettings,
  getGetSettingsQueryKey,
  getGetCurrentWeatherQueryKey,
  getGetWeatherForecastQueryKey,
  getGetTodaySummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const schema = z.object({
  minTemp: z.number().min(20).max(90),
  maxTemp: z.number().min(40).max(110),
  maxHumidity: z.number().min(10).max(100),
  maxWindSpeed: z.number().min(0).max(60),
  maxRainChance: z.number().min(0).max(100),
  maxAqi: z.number().min(0).max(200),
  indoorTemp: z.number().min(60).max(85),
  indoorTempHeat: z.number().min(60).max(85),
  indoorTempCool: z.number().min(60).max(85),
  workDays: z.array(z.number()).min(1, "Select at least one work day"),
  workStartHour: z.number().min(0).max(23),
  workEndHour: z.number().min(1).max(24),
  notificationsEnabled: z.boolean(),
  checkIntervalMinutes: z.number().min(5).max(120),
  locationName: z.string().nullable(),
  locationLat: z.number().nullable(),
  locationLon: z.number().nullable(),
});

type FormValues = z.infer<typeof schema>;

async function geocodeAddress(address: string): Promise<{ lat: number; lon: number } | null> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,
    { headers: { "User-Agent": "WindowWeatherApp/1.0" } }
  );
  const data = await res.json();
  if (!data || data.length === 0) return null;
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}

export default function Settings() {
  const { data: settings, isLoading } = useGetSettings();
  const updateSettings = useUpdateSettings();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [addressInput, setAddressInput] = useState("");
  const [geocoding, setGeocoding] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      minTemp: 61, maxTemp: 79, maxHumidity: 70, maxWindSpeed: 20,
      maxRainChance: 40, maxAqi: 50, indoorTemp: 72,
      indoorTempHeat: 68, indoorTempCool: 74,
      workDays: [1, 2, 3, 4, 5], workStartHour: 9, workEndHour: 17,
      notificationsEnabled: true, checkIntervalMinutes: 30,
      locationName: null, locationLat: null, locationLon: null,
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        minTemp: settings.minTemp, maxTemp: settings.maxTemp,
        maxHumidity: settings.maxHumidity, maxWindSpeed: settings.maxWindSpeed,
        maxRainChance: settings.maxRainChance, maxAqi: settings.maxAqi,
        indoorTemp: settings.indoorTemp,
        indoorTempHeat: (settings as any).indoorTempHeat ?? 68,
        indoorTempCool: (settings as any).indoorTempCool ?? 74,
        workDays: settings.workDays as number[],
        workStartHour: settings.workStartHour, workEndHour: settings.workEndHour,
        notificationsEnabled: settings.notificationsEnabled,
        checkIntervalMinutes: settings.checkIntervalMinutes,
        locationName: settings.locationName ?? null,
        locationLat: settings.locationLat ?? null,
        locationLon: settings.locationLon ?? null,
      });
      if (settings.locationName) setAddressInput(settings.locationName);
    }
  }, [settings]);

  async function handleGeocode() {
    if (!addressInput.trim()) return;
    setGeocoding(true);
    try {
      const result = await geocodeAddress(addressInput);
      if (!result) { toast({ title: "Address not found", variant: "destructive" }); return; }
      form.setValue("locationLat", result.lat);
      form.setValue("locationLon", result.lon);
      form.setValue("locationName", addressInput.trim());
      toast({ title: "Location found", description: `${result.lat.toFixed(4)}°N, ${Math.abs(result.lon).toFixed(4)}°W` });
    } catch {
      toast({ title: "Geocoding failed", variant: "destructive" });
    } finally {
      setGeocoding(false);
    }
  }

  function onSubmit(values: FormValues) {
    updateSettings.mutate({ data: values }, {
      onSuccess: (updated) => {
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        if (updated.locationLat && updated.locationLon) {
          queryClient.invalidateQueries({ queryKey: getGetCurrentWeatherQueryKey({ lat: updated.locationLat, lon: updated.locationLon }) });
          queryClient.invalidateQueries({ queryKey: getGetWeatherForecastQueryKey({ lat: updated.locationLat, lon: updated.locationLon }) });
          queryClient.invalidateQueries({ queryKey: getGetTodaySummaryQueryKey({ lat: updated.locationLat, lon: updated.locationLon }) });
        }
        toast({ title: "Settings saved" });
      },
      onError: () => toast({ title: "Failed to save settings", variant: "destructive" }),
    });
  }

  const currentLat = form.watch("locationLat");
  const currentLon = form.watch("locationLon");

  return (
    <div className="p-8 max-w-2xl">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <div className="mb-8">
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Configure your location, comfort thresholds, and work schedule</p>
        </div>

        {isLoading ? (
          <div className="space-y-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}</div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

              {/* Location */}
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <MapPin className="w-4 h-4 text-primary" />
                  <h2 className="font-semibold text-sm">Location</h2>
                </div>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Input value={addressInput} onChange={(e) => setAddressInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleGeocode())}
                      placeholder="Enter your address…" className="flex-1" />
                    <Button type="button" variant="secondary" onClick={handleGeocode} disabled={geocoding || !addressInput.trim()}>
                      {geocoding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    </Button>
                  </div>
                  {currentLat !== null && currentLon !== null
                    ? <p className="text-xs text-muted-foreground">Coordinates: {currentLat?.toFixed(4)}°N, {Math.abs(currentLon ?? 0).toFixed(4)}°W</p>
                    : <p className="text-xs text-amber-600 dark:text-amber-400">No location set — enter an address and search.</p>
                  }
                </div>
              </Card>

              {/* Temperature */}
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Thermometer className="w-4 h-4 text-primary" />
                  <h2 className="font-semibold text-sm">Temperature (°F)</h2>
                </div>
                <div className="space-y-5">
                  <FormField control={form.control} name="indoorTempHeat" render={({ field }) => (
                    <FormItem>
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-1.5"><Home className="w-3.5 h-3.5 text-muted-foreground" /><FormLabel className="text-sm">Heat thermostat</FormLabel></div>
                        <span className="text-sm font-semibold text-primary">{field.value}°F</span>
                      </div>
                      <FormControl><Slider min={60} max={80} step={1} value={[field.value]} onValueChange={([v]) => field.onChange(v)} /></FormControl>
                      <FormDescription className="text-xs">Your thermostat setting in winter/heating mode (e.g. 68°F)</FormDescription>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="indoorTempCool" render={({ field }) => (
                    <FormItem>
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-1.5"><Home className="w-3.5 h-3.5 text-muted-foreground" /><FormLabel className="text-sm">AC thermostat</FormLabel></div>
                        <span className="text-sm font-semibold text-primary">{field.value}°F</span>
                      </div>
                      <FormControl><Slider min={60} max={85} step={1} value={[field.value]} onValueChange={([v]) => field.onChange(v)} /></FormControl>
                      <FormDescription className="text-xs">Your thermostat setting in summer/cooling mode (e.g. 74°F)</FormDescription>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="minTemp" render={({ field }) => (
                    <FormItem>
                      <div className="flex justify-between items-center mb-2">
                        <FormLabel className="text-sm">Minimum outdoor temp</FormLabel>
                        <span className="text-sm font-semibold text-primary">{field.value}°F</span>
                      </div>
                      <FormControl><Slider min={20} max={75} step={1} value={[field.value]} onValueChange={([v]) => field.onChange(v)} /></FormControl>
                      <FormDescription className="text-xs">Too cold below this — keep windows closed</FormDescription>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="maxTemp" render={({ field }) => (
                    <FormItem>
                      <div className="flex justify-between items-center mb-2">
                        <FormLabel className="text-sm">Maximum outdoor temp</FormLabel>
                        <span className="text-sm font-semibold text-primary">{field.value}°F</span>
                      </div>
                      <FormControl><Slider min={60} max={105} step={1} value={[field.value]} onValueChange={([v]) => field.onChange(v)} /></FormControl>
                      <FormDescription className="text-xs">Too hot above this — importing heat makes AC work harder</FormDescription>
                    </FormItem>
                  )} />
                </div>
              </Card>

              {/* Humidity, Wind & Rain */}
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Droplets className="w-4 h-4 text-primary" />
                  <h2 className="font-semibold text-sm">Humidity, wind &amp; rain</h2>
                </div>
                <div className="space-y-5">
                  <FormField control={form.control} name="maxHumidity" render={({ field }) => (
                    <FormItem>
                      <div className="flex justify-between items-center mb-2">
                        <FormLabel className="text-sm">Max humidity</FormLabel>
                        <span className="text-sm font-semibold text-primary">{field.value}%</span>
                      </div>
                      <FormControl><Slider min={30} max={100} step={5} value={[field.value]} onValueChange={([v]) => field.onChange(v)} /></FormControl>
                      <FormDescription className="text-xs">Muggy outside = sticky inside; let the AC dehumidify</FormDescription>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="maxWindSpeed" render={({ field }) => (
                    <FormItem>
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-1.5"><Wind className="w-3.5 h-3.5 text-muted-foreground" /><FormLabel className="text-sm">Max wind speed</FormLabel></div>
                        <span className="text-sm font-semibold text-primary">{field.value} mph</span>
                      </div>
                      <FormControl><Slider min={0} max={50} step={5} value={[field.value]} onValueChange={([v]) => field.onChange(v)} /></FormControl>
                      <FormDescription className="text-xs">A light breeze (3–15 mph) is ideal for cross-ventilation</FormDescription>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="maxRainChance" render={({ field }) => (
                    <FormItem>
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-1.5"><CloudRain className="w-3.5 h-3.5 text-muted-foreground" /><FormLabel className="text-sm">Max rain probability</FormLabel></div>
                        <span className="text-sm font-semibold text-primary">{field.value}%</span>
                      </div>
                      <FormControl><Slider min={0} max={100} step={5} value={[field.value]} onValueChange={([v]) => field.onChange(v)} /></FormControl>
                    </FormItem>
                  )} />
                </div>
              </Card>

              {/* Air quality & pollen */}
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Leaf className="w-4 h-4 text-primary" />
                  <h2 className="font-semibold text-sm">Air quality &amp; pollen</h2>
                </div>
                <FormField control={form.control} name="maxAqi" render={({ field }) => (
                  <FormItem>
                    <div className="flex justify-between items-center mb-2">
                      <FormLabel className="text-sm">Max air quality index (AQI)</FormLabel>
                      <span className="text-sm font-semibold text-primary">{field.value}</span>
                    </div>
                    <FormControl><Slider min={0} max={150} step={10} value={[field.value]} onValueChange={([v]) => field.onChange(v)} /></FormControl>
                    <FormDescription className="text-xs">
                      0–50 Good · 51–100 Moderate · 101–150 Unhealthy for sensitive groups · &gt;150 Unhealthy
                    </FormDescription>
                  </FormItem>
                )} />
                <p className="text-xs text-muted-foreground mt-4">
                  Pollen warnings are based on current grass and tree pollen data. High or very-high pollen will always flag the window as not recommended.
                </p>
              </Card>

              {/* Work schedule */}
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Calendar className="w-4 h-4 text-primary" />
                  <h2 className="font-semibold text-sm">Work schedule</h2>
                </div>
                <FormField control={form.control} name="workDays" render={({ field }) => (
                  <FormItem className="mb-5">
                    <FormLabel className="text-sm mb-2 block">Work days</FormLabel>
                    <div className="flex gap-2">
                      {DAYS.map((day, idx) => {
                        const active = field.value.includes(idx);
                        return (
                          <button key={day} type="button"
                            onClick={() => field.onChange(active ? field.value.filter((d) => d !== idx) : [...field.value, idx].sort())}
                            className={`w-10 h-10 rounded-lg text-xs font-semibold border transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border hover:border-primary/50"}`}>
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  </FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="workStartHour" render={({ field }) => (
                    <FormItem>
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-muted-foreground" /><FormLabel className="text-sm">Start</FormLabel></div>
                        <span className="text-sm font-semibold text-primary">{field.value === 0 ? "12am" : field.value < 12 ? `${field.value}am` : field.value === 12 ? "12pm" : `${field.value - 12}pm`}</span>
                      </div>
                      <FormControl><Slider min={0} max={12} step={1} value={[field.value]} onValueChange={([v]) => field.onChange(v)} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="workEndHour" render={({ field }) => (
                    <FormItem>
                      <div className="flex justify-between items-center mb-2">
                        <FormLabel className="text-sm">End</FormLabel>
                        <span className="text-sm font-semibold text-primary">{field.value === 0 ? "12am" : field.value < 12 ? `${field.value}am` : field.value === 12 ? "12pm" : `${field.value - 12}pm`}</span>
                      </div>
                      <FormControl><Slider min={12} max={24} step={1} value={[field.value]} onValueChange={([v]) => field.onChange(v)} /></FormControl>
                    </FormItem>
                  )} />
                </div>
              </Card>

              {/* Notifications */}
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Bell className="w-4 h-4 text-primary" />
                  <h2 className="font-semibold text-sm">Notifications</h2>
                </div>
                <FormField control={form.control} name="notificationsEnabled" render={({ field }) => (
                  <FormItem className="flex items-center justify-between mb-4">
                    <div>
                      <FormLabel className="text-sm">Enable notifications</FormLabel>
                      <FormDescription className="text-xs">Browser alerts when conditions change</FormDescription>
                    </div>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="checkIntervalMinutes" render={({ field }) => (
                  <FormItem>
                    <div className="flex justify-between items-center mb-2">
                      <FormLabel className="text-sm">Check interval</FormLabel>
                      <span className="text-sm font-semibold text-primary">every {field.value} min</span>
                    </div>
                    <FormControl><Slider min={5} max={60} step={5} value={[field.value]} onValueChange={([v]) => field.onChange(v)} /></FormControl>
                  </FormItem>
                )} />
              </Card>

              <Button type="submit" className="w-full" disabled={updateSettings.isPending}>
                <Save className="w-4 h-4 mr-2" />
                {updateSettings.isPending ? "Saving…" : "Save settings"}
              </Button>
            </form>
          </Form>
        )}
      </motion.div>
    </div>
  );
}
