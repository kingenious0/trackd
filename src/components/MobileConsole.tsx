import { useEffect, useRef, useState, type FormEvent } from "react";
import type { User } from "firebase/auth";
import { Capacitor } from "@capacitor/core";
import {
  Crosshair,
  Link2,
  Loader2,
  LogOut,
  Map as MapIcon,
  MonitorPlay,
  Radio,
  ShieldCheck,
  Signal,
  Terminal,
  TriangleAlert
} from "lucide-react";
import { projectId } from "../lib/firebase";
import { formatLastSeen } from "../lib/format";
import type { Device, RemoteCommand, TelemetryLog } from "../lib/types";
import ThemeToggle, { type Theme } from "./ThemeToggle";
import StatusPills from "./StatusPills";
import ActionToolbar from "./ActionToolbar";
import CheatSheet from "./CheatSheet";
import DeviceOnboarding from "./DeviceOnboarding";
import PermissionChecklist, { autoRequestTrackingPermissions } from "./PermissionChecklist";
import { TrackdBridge, type LinkState } from "../plugins/trackd";

type Tab = "status" | "protect" | "commands";

interface Props {
  user?: User;
  demo: boolean;
  email: string;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  devices: Device[];
  selectedDevice: Device | null;
  selectedId: string | null;
  onSelectDevice: (id: string) => void;
  telemetry: TelemetryLog[];
  loading: boolean;
  streamError: string | null;
  onSignOut: () => void;
  onLeaveDemo: () => void;
  runCommand: (command: RemoteCommand) => Promise<void>;
}

function LinkCard({
  user,
  deviceId,
  onLinked
}: {
  user?: User;
  deviceId: string;
  onLinked: () => void;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const link = async (event: FormEvent) => {
    event.preventDefault();
    if (!user?.email || !password.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await TrackdBridge.configureAccount({
        email: user.email,
        password,
        deviceId,
        projectId
      });
      onLinked();
    } catch {
      setError("Linking failed — check your password and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={link} className="card-flat space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 text-warning" />
        <p className="text-sm font-semibold">Link this phone</p>
      </div>
      <p className="text-xs leading-relaxed text-muted">
        This phone isn&apos;t linked to your console yet — location sync and remote commands stay
        off until you link it with your account password.
      </p>
      <div className="flex gap-2">
        <input
          className="input flex-1"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Account password"
          autoComplete="current-password"
        />
        <button className="btn-solid shrink-0" type="submit" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Link
        </button>
      </div>
      {error && (
        <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

export default function MobileConsole(props: Props) {
  const {
    user,
    demo,
    email,
    theme,
    onThemeChange,
    devices,
    selectedDevice,
    onSelectDevice,
    telemetry,
    loading,
    streamError,
    onSignOut,
    onLeaveDemo,
    runCommand
  } = props;

  const [tab, setTab] = useState<Tab>("status");
  const [linkState, setLinkState] = useState<LinkState | null>(null);
  const requestedRef = useRef(false);

  const refreshLinkState = async () => {
    try {
      setLinkState(await TrackdBridge.getLinkState());
    } catch {
      setLinkState(null);
    }
  };

  useEffect(() => {
    refreshLinkState();
  }, [selectedDevice?.id]);

  useEffect(() => {
    if (!selectedDevice || requestedRef.current) return;
    requestedRef.current = true;
    autoRequestTrackingPermissions();
  }, [selectedDevice]);

  const needsLink =
    Capacitor.isNativePlatform() &&
    !demo &&
    Boolean(selectedDevice) &&
    linkState !== null &&
    !linkState.configured;

  const live = !streamError;

  const tabs: { key: Tab; label: string; icon: typeof MapIcon }[] = [
    { key: "status", label: "Status", icon: MapIcon },
    { key: "protect", label: "Protect", icon: ShieldCheck },
    { key: "commands", label: "Commands", icon: Terminal }
  ];

  return (
    <>
      {/* floating app bar */}
      <header className="pointer-events-auto absolute inset-x-3 top-3 z-[600] flex items-center justify-between gap-2 rounded-2xl border border-line bg-panel/90 px-3 py-2 shadow-float backdrop-blur">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent text-white">
            <Crosshair className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold leading-none">Trackd</span>
              <span
                className={
                  "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium " +
                  (live ? "bg-secure/10 text-secure" : "bg-danger/10 text-danger")
                }
              >
                <Radio className={"h-2.5 w-2.5 " + (live ? "animate-pulse" : "")} />
                {live ? "live" : "sync"}
              </span>
              {demo && (
                <span className="rounded-full bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                  DEMO
                </span>
              )}
            </div>
            <p className="truncate text-[11px] leading-tight text-muted">{email}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <ThemeToggle value={theme} onChange={onThemeChange} />
          <button
            className="btn-outline h-8 w-8 !p-0"
            aria-label={demo ? "Leave demo" : "Sign out"}
            onClick={demo ? onLeaveDemo : onSignOut}
          >
            {demo ? <MonitorPlay className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {/* bottom sheet */}
      <aside className="absolute inset-x-0 bottom-0 z-[550] flex max-h-[74vh] flex-col overflow-hidden rounded-t-3xl border border-line bg-panel shadow-float">
        <div className="flex justify-center pt-2">
          <span className="h-1 w-10 rounded-full bg-line" />
        </div>

        <nav className="mt-2 grid grid-cols-3 gap-1 px-4">
          {tabs.map((item) => {
            const Icon = item.icon;
            const active = tab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                className={
                  "flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold transition " +
                  (active
                    ? "bg-accent/10 text-accent"
                    : "text-muted hover:bg-raised hover:text-ink")
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div
          className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3"
          style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}
        >
          <div className="flex flex-col gap-3">
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

            {tab === "status" && (
              <>
                {devices.length > 1 && (
                  <div className="flex flex-wrap gap-2">
                    {devices.map((device) => (
                      <button
                        key={device.id}
                        onClick={() => onSelectDevice(device.id)}
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
                  <DeviceOnboarding
                    user={user}
                    demo={demo}
                    onCreated={() => window.setTimeout(refreshLinkState, 400)}
                  />
                ) : (
                  <>
                    {needsLink && (
                      <LinkCard
                        user={user}
                        deviceId={selectedDevice.id}
                        onLinked={refreshLinkState}
                      />
                    )}

                    <section className="card-flat p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-base font-semibold">
                            {selectedDevice.deviceName}
                          </p>
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
                              : selectedDevice.battery != null
                                ? `${selectedDevice.battery}%`
                                : "—"}
                          </strong>
                        </span>
                        <span className="rounded-lg bg-app px-2.5 py-1.5">
                          Last seen{" "}
                          <strong className="text-ink">
                            {formatLastSeen(selectedDevice.lastSeenAt)}
                          </strong>
                        </span>
                      </div>
                    </section>

                    <StatusPills device={selectedDevice} telemetry={telemetry} />
                    <ActionToolbar device={selectedDevice} onCommand={runCommand} demo={demo} />
                  </>
                )}
              </>
            )}

            {tab === "protect" && !demo && selectedDevice && <PermissionChecklist />}

            {tab === "commands" && selectedDevice && (
              <CheatSheet deviceName={selectedDevice.deviceName} user={user} />
            )}

            {(tab === "protect" || tab === "commands") && !selectedDevice && (
              <div className="card-flat flex items-center gap-2 py-8 text-sm text-muted">
                <TriangleAlert className="h-4 w-4 text-warning" />
                Register a device first.
              </div>
            )}

            <footer className="flex items-center justify-between border-t border-line pt-3 text-[11px] text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Signal className="h-3.5 w-3.5" />
                Works offline via SMS fallback
              </span>
              <span>Trackd</span>
            </footer>
          </div>
        </div>
      </aside>
    </>
  );
}
