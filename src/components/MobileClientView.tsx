import { useEffect, useState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Lock,
  MapPin,
  Zap,
  MessageSquare,
  Volume2,
  Key,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Link2,
  Smartphone,
  Radio,
  Loader2
} from "lucide-react";
import { TrackdBridge, type LinkState } from "../plugins/trackd";
import { projectId } from "../lib/firebase";

export default function MobileClientView() {
  const [loading, setLoading] = useState(true);
  const [pin, setPin] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [configSaved, setConfigSaved] = useState(false);
  const [sirenPlaying, setSirenPlaying] = useState(false);

  // Account linking state
  const [linkState, setLinkState] = useState<LinkState | null>(null);
  const [linkEmail, setLinkEmail] = useState("");
  const [linkPassword, setLinkPassword] = useState("");
  const [linkDeviceId, setLinkDeviceId] = useState("");
  const [linkingBusy, setLinkingBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const [status, setStatus] = useState({
    deviceAdmin: false,
    batteryOptimization: false,
    backgroundLocation: false,
    accessibility: false,
    overlay: false,
    sms: false
  });

  const checkPermissions = async () => {
    try {
      setLoading(true);
      const [res, link, devStatus] = await Promise.all([
        TrackdBridge.checkPermissionsStatus(),
        TrackdBridge.getLinkState().catch(() => null),
        TrackdBridge.getDeviceStatus().catch(() => null)
      ]);

      setStatus({
        deviceAdmin: Boolean(res.deviceAdmin),
        batteryOptimization: Boolean(res.batteryOptimizationIgnored),
        backgroundLocation: Boolean(res.backgroundLocation),
        accessibility: Boolean(res.accessibilityService),
        overlay: Boolean(res.overlay),
        sms: Boolean(res.smsPermission)
      });

      if (link) {
        setLinkState(link);
      }
      if (devStatus?.emergencyContact) {
        setEmergencyPhone(devStatus.emergencyContact);
      }
    } catch (e) {
      console.error("TrackdBridge check error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkPermissions();
  }, []);

  const activeCount = Object.values(status).filter(Boolean).length;
  const isFullyArmed = activeCount >= 4;

  const handleSaveConfig = async () => {
    if (!pin || pin.length < 4) {
      alert("Master PIN must be at least 4 digits");
      return;
    }
    try {
      await TrackdBridge.setCommandCredentials({
        pin,
        emergencyPhone: emergencyPhone.trim()
      });
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 3000);
    } catch (e) {
      alert("Failed to save credentials: " + e);
    }
  };

  const handleTestSiren = async () => {
    if (sirenPlaying) {
      try {
        await TrackdBridge.stopHardwareSiren();
        setSirenPlaying(false);
      } catch (e) {
        console.error(e);
      }
      return;
    }

    try {
      setSirenPlaying(true);
      await TrackdBridge.testHardwareSiren({ durationMs: 4000 });
      setTimeout(() => setSirenPlaying(false), 4200);
    } catch (e) {
      setSirenPlaying(false);
      alert("Hardware siren error: " + e);
    }
  };

  const handleLinkAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkEmail.trim() || !linkPassword.trim()) {
      setLinkError("Email and account password are required.");
      return;
    }
    const devId = linkDeviceId.trim() || `android-${Date.now().toString(36)}`;
    setLinkingBusy(true);
    setLinkError(null);
    try {
      await TrackdBridge.configureAccount({
        email: linkEmail.trim(),
        password: linkPassword,
        deviceId: devId,
        projectId
      });
      await checkPermissions();
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "Account linking failed");
    } finally {
      setLinkingBusy(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen px-4 pt-6 pb-12 max-w-lg mx-auto text-slate-100 selection:bg-emerald-500/20 selection:text-emerald-400">
      {/* Sentinel Header */}
      <header className="flex items-center justify-between pb-4 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.2)]">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="font-bold text-base tracking-wide flex items-center gap-1.5 text-white">
              TRACKD <span className="text-emerald-400">SENTINEL</span>
            </h1>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] font-mono text-emerald-400 font-medium">DAEMON ACTIVE</span>
            </div>
          </div>
        </div>

        <button
          onClick={checkPermissions}
          className="p-2 rounded-xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.07] text-slate-400 transition"
          title="Refresh Clearance"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-emerald-400" : ""}`} />
        </button>
      </header>

      {/* Central Defense Ring Hero */}
      <div className="my-5 p-5 rounded-2xl bg-[#0F172A]/70 border border-white/5 flex flex-col items-center text-center relative overflow-hidden shadow-2xl">
        <div className="absolute inset-0 bg-emerald-500/5 blur-3xl pointer-events-none" />

        <div className="relative w-28 h-28 my-1 flex items-center justify-center">
          {/* Animated radar rings */}
          <div className="absolute inset-0 rounded-full border border-dashed border-emerald-500/30 animate-[spin_12s_linear_infinite]" />
          <div
            className={`w-24 h-24 rounded-full flex items-center justify-center border transition-all duration-500 ${
              isFullyArmed
                ? "bg-emerald-500/10 border-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.25)]"
                : "bg-amber-500/10 border-amber-400 shadow-[0_0_30px_rgba(245,158,11,0.25)]"
            }`}
          >
            {isFullyArmed ? (
              <ShieldCheck className="w-12 h-12 text-emerald-400" />
            ) : (
              <ShieldAlert className="w-12 h-12 text-amber-400 animate-pulse" />
            )}
          </div>
        </div>

        <h2 className="text-lg font-bold text-white mt-3">
          {isFullyArmed ? "SENTINEL ARMED & MONITORED" : "CLEARANCE REQUIRED"}
        </h2>
        <p className="text-xs text-slate-400 mt-1 max-w-xs">
          {isFullyArmed
            ? "Silent GPS listeners active. Offline GSM backdoor armed."
            : "Grant required system privileges below to guard against app kill and permit offline recovery."}
        </p>

        {/* Telemetry Status Strip */}
        <div className="grid grid-cols-3 gap-2 w-full mt-4 pt-4 border-t border-white/5 text-left text-xs font-mono">
          <div className="p-2 rounded-xl bg-white/[0.02] border border-white/5">
            <span className="text-[10px] text-slate-400 block">Defense</span>
            <span className="text-emerald-400 font-semibold">{activeCount}/6 Guarded</span>
          </div>
          <div className="p-2 rounded-xl bg-white/[0.02] border border-white/5">
            <span className="text-[10px] text-slate-400 block">Backend</span>
            <span className="text-blue-400 font-semibold">Firebase FCM</span>
          </div>
          <div className="p-2 rounded-xl bg-white/[0.02] border border-white/5">
            <span className="text-[10px] text-slate-400 block">Fail-Safe</span>
            <span className="text-amber-400 font-semibold">2G/4G SMS</span>
          </div>
        </div>
      </div>

      {/* Permission Defense Matrix */}
      <div className="space-y-2 flex-1">
        <div className="flex items-center justify-between px-1 mb-1">
          <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">Security Clearance</span>
          <span className="text-[11px] font-mono text-emerald-400 font-semibold">{activeCount}/6 Clearance Active</span>
        </div>

        {[
          {
            key: "deviceAdmin",
            label: "Device Administrator",
            desc: "Locks screen & executes emergency wipe",
            icon: Lock,
            act: () => TrackdBridge.requestDeviceAdmin()
          },
          {
            key: "batteryOptimization",
            label: "Battery Saver Bypass",
            desc: "Prevents HyperOS / MIUI background freeze",
            icon: Zap,
            act: () => TrackdBridge.requestIgnoreBatteryOptimization()
          },
          {
            key: "backgroundLocation",
            label: "Background Location",
            desc: "Silent GPS tracking without map canvas",
            icon: MapPin,
            act: () => TrackdBridge.requestBackgroundLocation()
          },
          {
            key: "sms",
            label: "SMS Traps & Triggers",
            desc: "Wakes phone on offline #LOCATE# commands",
            icon: MessageSquare,
            act: () => TrackdBridge.requestSmsPermissions()
          },
          {
            key: "accessibility",
            label: "App Decoy & Anti-Power Menu",
            desc: "Blocks fake shutdowns and protects banking apps",
            icon: ShieldCheck,
            act: () => TrackdBridge.openAccessibilitySettings()
          },
          {
            key: "overlay",
            label: "Lost-Mode Screen Overlay",
            desc: "Displays uncloseable recovery card over apps",
            icon: AlertCircle,
            act: () => TrackdBridge.openOverlaySettings()
          }
        ].map((item) => {
          const isGranted = Boolean(status[item.key as keyof typeof status]);
          return (
            <div
              key={item.key}
              onClick={() => {
                if (!isGranted) item.act();
              }}
              className={`flex items-center justify-between p-3 rounded-xl border transition ${
                isGranted
                  ? "bg-slate-900/40 border-white/5 cursor-default"
                  : "bg-amber-950/20 border-amber-500/30 hover:border-amber-500/60 cursor-pointer"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`p-2 rounded-lg shrink-0 ${
                    isGranted ? "bg-white/[0.03] text-slate-300" : "bg-amber-500/10 text-amber-400"
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-semibold text-slate-200 truncate">{item.label}</h3>
                  <p className="text-[11px] text-slate-500 leading-tight truncate">{item.desc}</p>
                </div>
              </div>
              <div className="shrink-0 ml-2">
                {isGranted ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <span className="text-[10px] font-semibold text-amber-400 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 uppercase">
                    Grant
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Account Cloud Link Card */}
      <div className="mt-5 p-4 rounded-xl bg-[#0F172A]/70 border border-white/5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5 text-emerald-400" /> Cloud Handset Link
          </h3>
          <span className="text-[10px] font-mono text-slate-400">
            {linkState?.configured ? "SYNCHRONIZED" : "UNLINKED"}
          </span>
        </div>

        {linkState?.configured ? (
          <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300">
            <Radio className="w-4 h-4 shrink-0 text-emerald-400 animate-pulse" />
            <div className="min-w-0">
              <span className="font-semibold block truncate">Linked: {linkState.email}</span>
              <span className="text-[10px] font-mono text-emerald-400/80 truncate block">
                ID: {linkState.deviceId || "Registered"}
              </span>
            </div>
          </div>
        ) : (
          <form onSubmit={handleLinkAccount} className="space-y-2">
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Link this phone to your Trackd web console account to synchronize live GPS fixes with your fleet.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="email"
                placeholder="Account email"
                value={linkEmail}
                onChange={(e) => setLinkEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
              <input
                type="password"
                placeholder="Account password"
                value={linkPassword}
                onChange={(e) => setLinkPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <input
              type="text"
              placeholder="Custom device name (e.g. Redmi Note 14 Pro)"
              value={linkDeviceId}
              onChange={(e) => setLinkDeviceId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs text-white focus:outline-none focus:border-emerald-500"
            />
            {linkError && (
              <p className="text-[11px] text-red-400 bg-red-950/20 p-2 rounded border border-red-500/30">
                {linkError}
              </p>
            )}
            <button
              type="submit"
              disabled={linkingBusy}
              className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] font-semibold text-xs text-white transition flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-600/20"
            >
              {linkingBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
              Bind Handset to Web Radar
            </button>
          </form>
        )}
      </div>

      {/* Emergency Offline Credentials Card */}
      <div className="mt-4 p-4 rounded-xl bg-[#0F172A]/70 border border-white/5 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
          <Key className="w-3.5 h-3.5 text-blue-400" /> Offline Command Credentials
        </h3>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Master PIN (for SMS)</label>
            <input
              type="password"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="e.g. 7492"
              className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Trusted Secondary Phone</label>
            <input
              type="tel"
              value={emergencyPhone}
              onChange={(e) => setEmergencyPhone(e.target.value)}
              placeholder="+233..."
              className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <button
          onClick={handleSaveConfig}
          className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:scale-[0.98] font-semibold text-xs text-white transition flex items-center justify-center gap-1.5 shadow-lg shadow-blue-600/20"
        >
          {configSaved ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-300" /> Credentials Armed
            </>
          ) : (
            "Save Sentinel Credentials"
          )}
        </button>
      </div>

      {/* Local Diagnostic Button Only */}
      <div className="mt-4">
        <button
          onClick={handleTestSiren}
          className={`w-full py-3.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-2 transition active:scale-[0.98] ${
            sirenPlaying
              ? "bg-rose-950/40 border-rose-500/50 text-rose-300 animate-pulse"
              : "bg-white/[0.03] hover:bg-white/[0.06] border-white/10 text-slate-300"
          }`}
        >
          <Volume2 className={`w-4 h-4 ${sirenPlaying ? "text-rose-400" : "text-amber-400"}`} />
          {sirenPlaying ? "Hardware Siren Ringing! (Tap to silence)" : "Test Hardware Siren (Silent Bypass Check)"}
        </button>
      </div>
    </div>
  );
}
