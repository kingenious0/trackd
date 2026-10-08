import { useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { signOut } from "firebase/auth";
import { Crosshair, LogOut, MonitorPlay, Radio, TriangleAlert } from "lucide-react";
import { auth } from "../lib/firebase";
import { subscribeDevices, subscribeTelemetry, updateDevice } from "../lib/api";
import type { Device, RemoteCommand, TelemetryLog } from "../lib/types";
import {
  DEMO_USER_ID,
  demoAppendTelemetry,
  demoDelay,
  demoReset,
  setDemoMode
} from "../lib/demo";
import { formatLastSeen } from "../lib/format";
import ThemeToggle, { type Theme } from "../components/ThemeToggle";
import StatusPills from "../components/StatusPills";
import ActionToolbar from "../components/ActionToolbar";
import MapPanel from "../components/MapPanel";
import CheatSheet from "../components/CheatSheet";
import DeviceOnboarding from "../components/DeviceOnboarding";
import PermissionChecklist from "../components/PermissionChecklist";

interface Props {
  user?: User;
  demo?: boolean;
  onExitDemo?: () => void;
}

export default function ConsolePage({ user, demo = false, onExitDemo }: Props) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light"
  );

  const uid = demo ? DEMO_USER_ID : (user?.uid ?? "");
  const email = demo ? "demo@trackd.local" : (user?.email ?? "");

  const selectedDevice = useMemo(
    () => devices.find((device) => device.id === selectedId) ?? devices[0] ?? null,
    [devices, selectedId]
  );

  useEffect(() => {
    if (!uid) return;
    setLoading(true);
    setStreamError(null);
    const unsubscribe = subscribeDevices(
      uid,
      (rows) => {
        setDevices(rows);
        setSelectedId((current) => current ?? rows[0]?.id ?? null);
        setLoading(false);
      },
      (error) => {
        console.error(error);
        setStreamError(error.message);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [uid]);

  useEffect(() => {
    if (!selectedId || !uid) {
      setTelemetry([]);
      return;
    }
    const unsubscribe = subscribeTelemetry(
      selectedId,
      uid,
      (rows) => setTelemetry(rows),
      (error) => {
        console.error(error);
        setStreamError(error.message);
      }
    );
    return unsubscribe;
  }, [selectedId, uid]);

  useEffect(() => {
    if (!demo || !selectedDevice) return;
    const interval = window.setInterval(() => demoAppendTelemetry("SMS_COMMAND"), 8000);
    return () => window.clearInterval(interval);
  }, [demo, selectedDevice]);

  const runCommand = async (command: RemoteCommand) => {
    if (!selectedDevice) return;
    switch (command) {
      case "STOLEN":
        await updateDevice(selectedDevice.id, { isStolen: true });
        break;
      case "SAFE":
        await updateDevice(selectedDevice.id, { isStolen: false });
        break;
      case "LOCATE":
        await updateDevice(selectedDevice.id, { requestLocate: true });
        if (demo) {
          await demoDelay(900);
          demoAppendTelemetry("LOCATE_REQUEST");
          await updateDevice(selectedDevice.id, { requestLocate: false });
        }
        break;
      case "WIPE":
        await updateDevice(selectedDevice.id, { requestWipe: true, isStolen: false });
        if (demo) {
          await demoDelay(800);
          demoReset();
        }
        break;
    }
  };

  const leaveDemo = () => {
    setDemoMode(false);
    onExitDemo?.();
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-app">
      <MapPanel telemetry={telemetry} theme={theme} stolen={Boolean(selectedDevice?.isStolen)} />

      <aside className="absolute inset-x-3 bottom-3 top-auto z-[500] max-h-[72vh] overflow-y-auto md:inset-x-auto md:inset-y-4 md:left-4 md:max-h-none md:w-[384px]">
        <div className="panel flex flex-col gap-4 p-4">
          <header className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-white">
                <Crosshair className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-sm font-semibold leading-tight">Trackd</h1>
                  {demo && (
                    <span className="pill border-warning/50 bg-warning/10 text-warning">
                      DEMO
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-muted">{email}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ThemeToggle value={theme} onChange={setTheme} />
              <button
                className="btn-outline h-9 w-9 !p-0"
                aria-label={demo ? "Leave demo" : "Sign out"}
                title={demo ? "Leave demo" : "Sign out"}
                onClick={demo ? leaveDemo : () => signOut(auth())}
              >
                {demo ? <MonitorPlay className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}
              </button>
            </div>
          </header>

          {demo && (
            <p className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-relaxed text-warning">
              Demo mode — the device, map fixes and commands are simulated locally. Nothing is
              saved and no phone is contacted.
            </p>
          )}

          {streamError && (
            <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              Live sync error: {streamError}
            </p>
          )}

          {devices.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {devices.map((device) => (
                <button
                  key={device.id}
                  onClick={() => setSelectedId(device.id)}
                  className={
                    "pill " +
                    (device.id === selectedDevice?.id
                      ? "border-accent/60 bg-accent/10 text-accent"
                      : "border-line bg-raised text-muted hover:text-ink")
                  }
                >
                  {device.deviceName}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="card-flat flex items-center justify-center gap-2 py-10 text-sm text-muted">
              <Radio className="h-4 w-4 animate-pulse text-accent" />
              Connecting to your fleet…
            </div>
          ) : !selectedDevice ? (
            <DeviceOnboarding user={user} demo={demo} onCreated={() => undefined} />
          ) : (
            <>
              <section className="card-flat p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold">{selectedDevice.deviceName}</p>
                    <p className="truncate text-xs text-muted">
                      {selectedDevice.deviceModel || "Android device"}
                    </p>
                  </div>
                  <span
                    className={
                      "pill shrink-0 " +
                      (selectedDevice.isStolen
                        ? "border-danger/50 bg-danger/10 text-danger"
                        : "border-secure/50 bg-secure/10 text-secure")
                    }
                  >
                    {selectedDevice.isStolen ? "Stolen" : "Secured"}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted">
                  <span className="rounded-lg bg-app px-2.5 py-1.5">
                    Battery{" "}
                    <strong className="text-ink">
                      {selectedDevice.lastTelemetry?.battery != null
                        ? `${selectedDevice.lastTelemetry.battery}%`
                        : "—"}
                    </strong>
                  </span>
                  <span className="rounded-lg bg-app px-2.5 py-1.5">
                    Last seen <strong className="text-ink">{formatLastSeen(selectedDevice.lastSeenAt)}</strong>
                  </span>
                </div>
              </section>

              <StatusPills device={selectedDevice} telemetry={telemetry} />
              <ActionToolbar device={selectedDevice} onCommand={runCommand} demo={demo} />
              <CheatSheet deviceName={selectedDevice.deviceName} />
              {!demo && <PermissionChecklist />}
            </>
          )}

          <footer className="flex items-center justify-between border-t border-line pt-3 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <TriangleAlert className="h-3.5 w-3.5" />
              Works offline via SMS fallback
            </span>
            <span>Trackd</span>
          </footer>
        </div>
      </aside>
    </div>
  );
}
