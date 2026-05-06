import { useLocation } from "wouter";
import { LayoutDashboard, History, Settings, Wind, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/forecast", label: "7-Day Forecast", icon: CalendarDays },
  { href: "/history", label: "History", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
];

function XpChromeBtn({ label, variant = "default" }: { label: string; variant?: "default" | "close" }) {
  return (
    <button
      className={cn("xp-chrome-btn", variant === "close" && "xp-chrome-btn-close")}
      title={label}
    >
      {variant === "close" ? "✕" : label === "Minimize" ? "─" : "□"}
    </button>
  );
}

function Clock() {
  const [time, setTime] = useState(() =>
    new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  );
  useEffect(() => {
    const id = setInterval(() => {
      setTime(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
    }, 10000);
    return () => clearInterval(id);
  }, []);
  return <span>{time}</span>;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [pathname, navigate] = useLocation();

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "linear-gradient(180deg, #0a66b3 0%, #1884d4 40%, #1e90d8 100%)" }}
    >
      {/* XP Window */}
      <div
        className="flex-1 flex flex-col m-1 md:m-3"
        style={{ boxShadow: "2px 2px 14px rgba(0,0,0,0.65), inset 0 0 0 1px rgba(255,255,255,0.12)" }}
      >
        {/* Titlebar */}
        <div className="xp-titlebar flex items-center justify-between px-2 shrink-0 select-none" style={{ height: "30px" }}>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-sm flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.18)" }}>
              <Wind className="w-3 h-3 text-white" />
            </div>
            <span className="text-white font-bold text-[12px] leading-none" style={{ fontFamily: "'Trebuchet MS', sans-serif", textShadow: "1px 1px 0 rgba(0,0,0,0.4)" }}>
              Window Weather Watch
            </span>
          </div>
          <div className="flex items-center gap-[3px]">
            <XpChromeBtn label="Minimize" />
            <XpChromeBtn label="Maximize" />
            <XpChromeBtn label="Close" variant="close" />
          </div>
        </div>

        {/* Window body */}
        <div className="flex flex-1 overflow-hidden xp-window-border" style={{ background: "#ece9d8" }}>

          {/* Sidebar — XP Explorer task pane — desktop only */}
          <aside className="hidden md:flex flex-col shrink-0 border-r overflow-y-auto" style={{ width: "180px", background: "#fff", borderColor: "#aca899" }}>
            <div className="xp-task-header flex items-center gap-1.5">
              <Wind className="w-3 h-3 opacity-80" />
              Navigation
            </div>
            <div className="flex flex-col py-1">
              {navItems.map(({ href, label, icon: Icon }) => {
                const active = pathname === href;
                return (
                  <button
                    key={href}
                    onClick={() => navigate(href)}
                    data-testid={`nav-${label.toLowerCase()}`}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 text-[11px] text-left w-full transition-colors",
                      active ? "bg-[#316ac5] text-white" : "text-[#0000cc] hover:bg-[#e8f0fd]"
                    )}
                    style={{ fontFamily: "'Tahoma','Geneva',sans-serif" }}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="mt-auto">
              <div className="xp-separator" />
              <p className="text-[10px] px-2 py-1.5" style={{ color: "#7f7c73" }}>Weather: Open-Meteo</p>
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 overflow-auto pb-[52px] md:pb-0" style={{ background: "#ece9d8" }}>
            {children}
          </main>
        </div>
      </div>

      {/* XP Taskbar — mobile only */}
      <nav className="md:hidden xp-taskbar fixed bottom-0 inset-x-0 z-50 flex items-center px-1" style={{ height: "30px" }}>
        <button className="xp-start-btn flex items-center gap-1 h-[22px] mr-2 shrink-0">
          <Wind className="w-3 h-3" />
          <span>start</span>
        </button>
        <div className="flex flex-1 gap-1 overflow-hidden">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <button
                key={href}
                onClick={() => navigate(href)}
                data-testid={`nav-mobile-${label.toLowerCase()}`}
                className={cn("xp-taskbar-tab flex items-center gap-1 flex-1 min-w-0 h-[22px]", active && "active")}
              >
                <Icon className="w-3 h-3 shrink-0" />
                <span className="truncate text-[10px]">{label.replace("7-Day ", "")}</span>
              </button>
            );
          })}
        </div>
        <div className="ml-2 px-2 h-[22px] flex items-center text-white text-[10px] shrink-0 border-l" style={{ borderColor: "#3a7bd5", fontFamily: "'Tahoma',sans-serif" }}>
          <Clock />
        </div>
      </nav>
    </div>
  );
}
