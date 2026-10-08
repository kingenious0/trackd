import { useCallback, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import {
  BellRing,
  CheckCircle2,
  CircleDashed,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Smartphone
} from "lucide-react";
import { TrackdBridge, type DeviceStatus } from "../plugins/trackd";

/**
 * Step 4 of onboarding: native permission triggers. Must be opened inside
 * the Trackd Android app — on the web it shows guidance instead.
 */
export default function PermissionChecklist() {
  const isNative = Capacitor.isNativePlatform();
  const [status, setStatus] = useState<DeviceStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isNative) return;
    try {
      setStatus(await TrackdBridge.getDeviceStatus());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status check failed");
    }
  }, [isNative]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!isNative) {
    return (
      <section className="card-flat p-3">
        <div className="flex items-center gap-2 px-1">
          <ShieldAlert className="h-4 w-4 text-accent" />
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Step 4 · Protect this handset
          </h2>
        </div>
        <p className="mt-2 px-1 text-xs leading-relaxed text-muted">
          Open this console inside the Trackd Android app on the phone you registered, and the
          permission triggers (Device Admin, Location, Accessibility, Overlay, SMS) will appear
          here.
        </p>
      </section>
    );
  }

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : `${key} failed`);
    } finally {
      setBusy(null);
      await refresh();
    }
  };

  const rows: {
    key: string;
    label: string;
    hint: string;
    done: boolean | null;
    actionLabel: string;
    action: () => Promise<unknown>;
  }[] = [
    {
      key: "admin",
      label: "Device Admin",
      hint: "Locks the uninstall button, enables remote wipe",
      done: status?.deviceAdminActive ?? null,
      actionLabel: "Enable",
      action: () => TrackdBridge.requestDeviceAdmin()
    },
    {
      key: "accessibility",
      label: "Accessibility · Trackd Financial Guard",
      hint: "Arms the banking-app crash decoy",
      done: status?.accessibilityEnabled ?? null,
      actionLabel: "Open settings",
      action: () => TrackdBridge.openAccessibilitySettings()
    },
    {
      key: "overlay",
      label: "Display over other apps",
      hint: "Required to draw the fake crash dialog",
      done: null,
      actionLabel: "Allow",
      action: () => TrackdBridge.requestOverlayPermission()
    },
    {
      key: "permissions",
      label: "Location · SMS · Phone",
      hint: "Offline #LOCATE# replies and SIM-swap alerts",
      done: null,
      actionLabel: "Open app settings",
      action: () => TrackdBridge.openAppSettings()
    }
  ];

  return (
    <section className="card-flat p-3">
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-accent" />
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Step 4 · Protect this handset
          </h2>
        </div>
        <button
          className="rounded-lg p-1.5 text-muted transition hover:bg-raised hover:text-ink"
          onClick={refresh}
          aria-label="Refresh permission status"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li
            key={row.key}
            className="flex items-center justify-between gap-2 rounded-xl bg-app px-3 py-2"
          >
            <div className="flex min-w-0 items-start gap-2">
              {row.done === true ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-secure" />
              ) : row.done === false ? (
                <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              ) : (
                <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
              )}
              <div className="min-w-0">
                <p className="text-xs font-semibold">{row.label}</p>
                <p className="text-[11px] leading-snug text-muted">{row.hint}</p>
              </div>
            </div>
            <button
              className="btn-outline shrink-0 !rounded-lg !px-3 !py-1.5 !text-xs"
              disabled={busy !== null}
              onClick={() => run(row.key, row.action)}
            >
              {busy === row.key && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {row.actionLabel}
            </button>
          </li>
        ))}
      </ul>

      {status && (
        <div className="mt-2 grid grid-cols-2 gap-1.5 px-1 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <BellRing className="h-3.5 w-3.5" />
            Emergency:{" "}
            <strong className="font-mono text-ink">{status.emergencyContact ?? "—"}</strong>
          </span>
          <span>
            SIM baseline:{" "}
            <strong className="text-ink">{status.simRegistered ? "saved" : "pending"}</strong>
          </span>
        </div>
      )}

      {error && (
        <p className="mt-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
