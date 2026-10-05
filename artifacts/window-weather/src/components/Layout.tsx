import { useLocation } from "wouter";
import { LayoutDashboard, History, Settings, Wind, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/forecast", label: "7-Day Forecast", icon: CalendarDays },
  { href: "/history", label: "History", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [pathname, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground md:flex">
      {/* Sidebar — desktop */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-border bg-card px-3 py-5">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2.5 px-2 mb-7 text-left"
        >
          <span className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shrink-0">
            <Wind className="w-4.5 h-4.5 text-primary-foreground" />
          </span>
          <span className="leading-tight">
            <span className="block font-semibold text-sm">Window Weather</span>
            <span className="block text-xs text-muted-foreground">Watch</span>
          </span>
        </button>
        <nav className="flex flex-col gap-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <button
                key={href}
                onClick={() => navigate(href)}
                data-testid={`nav-${label.toLowerCase()}`}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </button>
            );
          })}
        </nav>
        <p className="mt-auto px-3 text-xs text-muted-foreground">Weather: Open-Meteo</p>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 pb-20 md:pb-0">
        {children}
      </main>

      {/* Bottom tab bar — mobile */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="grid grid-cols-4">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <button
                key={href}
                onClick={() => navigate(href)}
                data-testid={`nav-mobile-${label.toLowerCase()}`}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[10px] transition-colors",
                  active ? "text-primary font-medium" : "text-muted-foreground"
                )}
              >
                <Icon className="w-5 h-5" />
                {label.replace("7-Day ", "")}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
