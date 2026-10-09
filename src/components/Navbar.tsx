import { Shield, Crosshair, Download, LogOut, User as UserIcon } from "lucide-react";
import type { User } from "firebase/auth";

interface NavbarProps {
  currentTab: "track" | "download";
  onSwitchTab: (tab: "track" | "download") => void;
  user?: User | null;
  onSignOut?: () => void;
  showAccountBadge?: boolean;
}

export default function Navbar({
  currentTab,
  onSwitchTab,
  user,
  onSignOut,
  showAccountBadge = true,
}: NavbarProps) {
  return (
    <header className="w-full border-b border-white/10 bg-[#0B0F19]/95 backdrop-blur-md px-4 sm:px-6 py-3 sticky top-0 z-[1200] select-none">
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
        {/* Brand Logo - Trackd Only */}
        <button
          type="button"
          onClick={() => onSwitchTab("track")}
          className="flex items-center gap-2 group text-left focus:outline-none"
          title="Trackd Anti-Theft Security"
        >
          <div className="w-7 h-7 rounded-lg bg-blue-600/15 border border-blue-500/30 flex items-center justify-center text-blue-400 group-hover:border-blue-400/50 group-hover:bg-blue-600/25 transition">
            <Shield className="w-4 h-4 fill-blue-500/10" />
          </div>
          <span className="text-base font-bold tracking-tight text-white group-hover:text-blue-100 transition">
            Trackd
          </span>
        </button>

        {/* Right Nav Row: Vertically Centered, No Wrap */}
        <nav className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Track Phone Button: Icon on mobile, Icon + text on desktop */}
          <button
            type="button"
            onClick={() => onSwitchTab("track")}
            title="Track phone"
            aria-label="Track phone"
            className={`flex items-center justify-center gap-1.5 h-8 px-2.5 sm:px-3.5 rounded-lg text-xs font-semibold transition active:scale-95 ${
              currentTab === "track"
                ? "bg-blue-600 text-white shadow-sm shadow-blue-600/30 border border-blue-500/40"
                : "text-neutral-400 hover:text-white hover:bg-white/5 border border-transparent"
            }`}
          >
            <Crosshair className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Track phone</span>
          </button>

          {/* Get App Button: Shortened label, never wraps */}
          <button
            type="button"
            onClick={() => onSwitchTab("download")}
            title="Get app for Android"
            aria-label="Get app"
            className={`flex items-center justify-center gap-1.5 h-8 px-3 sm:px-3.5 rounded-lg text-xs font-semibold transition active:scale-95 border ${
              currentTab === "download"
                ? "bg-white text-black border-white shadow-sm font-bold"
                : "bg-[#1C1D21] text-white border-white/10 hover:border-white/25 hover:bg-[#25262B]"
            }`}
          >
            <Download className="w-3.5 h-3.5 shrink-0 hidden xs:inline" />
            <span className="whitespace-nowrap">Get app</span>
          </button>

          {/* User Account / Sign Out if logged in */}
          {user && showAccountBadge && (
            <div className="flex items-center gap-1.5 pl-1.5 border-l border-white/10">
              <span
                className="hidden md:inline text-[11px] font-mono text-neutral-400 truncate max-w-[130px]"
                title={user.email ?? "Logged In"}
              >
                {user.email}
              </span>
              {onSignOut ? (
                <button
                  type="button"
                  onClick={onSignOut}
                  title="Sign Out"
                  aria-label="Sign Out"
                  className="flex items-center justify-center h-8 w-8 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              ) : (
                <div className="flex items-center justify-center h-8 w-8 rounded-lg text-blue-400 bg-blue-500/10 border border-blue-500/20">
                  <UserIcon className="w-3.5 h-3.5" />
                </div>
              )}
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
