import { Crosshair, Download, LogOut, User as UserIcon } from "lucide-react";
import type { User } from "firebase/auth";
import TrackdLogo from "./TrackdLogo";

interface NavbarProps {
  currentTab: "track" | "download" | "admin";
  onSwitchTab: (tab: "track" | "download" | "admin") => void;
  user?: User | null;
  onSignOut?: () => void;
  showAccountBadge?: boolean;
  onSwitchToAdmin?: () => void;
}

export default function Navbar({
  currentTab,
  onSwitchTab,
  user,
  onSignOut,
  showAccountBadge = true,
  onSwitchToAdmin,
}: NavbarProps) {
  return (
    <header className="w-full border-b border-white/10 bg-[#070B14]/95 backdrop-blur-md px-4 sm:px-6 py-2.5 sticky top-0 z-[1200] select-none">
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
        {/* Brand Logo - Trackd Official Emblem & Wordmark */}
        <button
          type="button"
          onClick={() => onSwitchTab("track")}
          className="flex items-center group text-left focus:outline-none"
          title="Trackd Anti-Theft Security"
        >
          <TrackdLogo size="md" showBeta={true} />
        </button>

        {/* Right Nav Row: Vertically Centered, No Wrap */}
        <nav className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Track Phone Button */}
          <button
            type="button"
            onClick={() => onSwitchTab("track")}
            title="Track phone"
            aria-label="Track phone"
            className={`flex items-center justify-center gap-1.5 h-8 px-2.5 sm:px-3.5 rounded-lg text-xs font-semibold transition active:scale-95 ${
              currentTab === "track"
                ? "bg-gradient-to-r from-[#00F29D] to-[#00DCA0] text-[#070B14] font-bold shadow-md shadow-[#00F29D]/20 border border-[#00F29D]/50"
                : "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent"
            }`}
          >
            <Crosshair className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Track phone</span>
          </button>

          {/* Get App Button */}
          <button
            type="button"
            onClick={() => onSwitchTab("download")}
            title="Get app for Android"
            aria-label="Get app"
            className={`flex items-center justify-center gap-1.5 h-8 px-3 sm:px-3.5 rounded-lg text-xs font-semibold transition active:scale-95 border ${
              currentTab === "download"
                ? "bg-white text-black border-white shadow-sm font-bold"
                : "bg-[#0E1526] text-white border-white/10 hover:border-[#00F29D]/30 hover:bg-[#141E34]"
            }`}
          >
            <Download className="w-3.5 h-3.5 shrink-0 hidden xs:inline" />
            <span className="whitespace-nowrap">Get app (Android)</span>
          </button>

          {/* Admin Console Shortcut (STRICTLY visible ONLY for the master admin account) */}
          {user && user.email?.toLowerCase() === "kingenious0@gmail.com" && (
            <button
              type="button"
              onClick={() => (onSwitchToAdmin ? onSwitchToAdmin() : onSwitchTab("admin"))}
              title="Trackd Admin Console"
              aria-label="Admin Console"
              className={`flex items-center justify-center gap-1 h-8 px-2.5 rounded-lg text-xs font-semibold font-mono transition active:scale-95 border ${
                currentTab === "admin"
                  ? "bg-purple-600 text-white border-purple-400 shadow-sm font-bold"
                  : "bg-purple-950/40 text-purple-300 border-purple-500/30 hover:bg-purple-900/50"
              }`}
            >
              <span>Admin</span>
            </button>
          )}

          {/* User Account / Sign Out if logged in */}
          {user && showAccountBadge && (
            <div className="flex items-center gap-1.5 pl-1.5 border-l border-white/10">
              <span
                className="hidden md:inline text-[11px] font-mono text-slate-400 truncate max-w-[130px]"
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
                  className="flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              ) : (
                <div className="flex items-center justify-center h-8 w-8 rounded-lg text-[#00F29D] bg-[#00F29D]/10 border border-[#00F29D]/20">
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
