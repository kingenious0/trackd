import { useCallback, useEffect, useRef, useState } from "react";
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

const ALL_ALIASES = [
  "location",
  "sms",
  "notifications",
  "phoneState",
  "phoneNumbers"
];

let autoRequested = false;

/** Requests the tracking permission set once per session via system dialogs. */
export async function autoRequestTrackingPermissions(): Promise<void> {
  if (autoRequested) return;
  autoRequested = true;
  try {
    const current = await TrackdBridge.checkPermissions({ permissions: ALL_ALIASES });
    const pending = ALL_ALIASES.filter((alias) => current.permissions[alias] !== "granted");
    if (pending.length > 0) {
      await TrackdBridge.requestPermissions({ permissions: pending });
    }
  } catch {
    /* the checklist rows let the user retry manually */
  }
}

type RowState = "granted" | "prompt" | "denied" | null;

/**
 * Step 4 of onboarding: native permission triggers. On Android the system
 * permission dialogs are requested automatically on first mount; the web
 * build shows guidance instead.
 */
export default function PermissionChecklist() {
  const isNative = Capacitor.isNativePlatform();
  const [status, setStatus] = useState<DeviceStatus | null>(null);
  const [perm, setPerm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);

  const sync = useCallback(async () => {
    if (!isNative) return;
    try {
      const [deviceStatus, permStatus] = await Promise.all([
        TrackdBridge.getDeviceStatus(),
        TrackdBridge.checkPermissions({ permissions: ALL_ALIASES })
      ]);
      setStatus(deviceStatus);
      setPerm(permStatus.permissions);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status check failed");
    }
  }, [isNative]);

  useEffect(() => {
    if (!isNative || mounted.current) return;
    mounted.current = true;
    (async () => {
      await sync();
      await autoRequestTrackingPermissions();
      await sync();
    })();
  }, [isNative, sync]);

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

  const rowState = (aliases: string[]): RowState => {
    const states = aliases.map((alias) => perm[alias]);
    if (states.some((state) => state === undefined)) return null;
    if (states.some((state) => state === "prompt" || state === "prompt-with-rationale")) {
      return "prompt";
    }
    if (states.every((state) => state === "granted")) return "granted";
    return "denied";
  };

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That step needs the app settings screen");
    } finally {
      setBusy(null);
      await sync();
    }
  };

  const requestRow = (aliases: string[]) => async () => {
    const result = await TrackdBridge.requestPermissions({ permissions: aliases });
    setPerm((previous) => ({ ...previous, ...result.permissions }));
  };

  const rows: {
    key: string;
    label: string;
    hint: string;
    aliases?: string[];
    done: boolean | null;
    actionLabel?: string;
    action?: () => Promise<unknown>;
  }[] = [
    /* V2: Device Admin / Remote Wipe held for V2 (code preserved) */
    /*
    {
      key: "admin",
      label: "Device Admin",
      hint: "Locks the uninstall button, enables remote wipe",
      done: status?.deviceAdminActive ?? null,
      actionLabel: "Enable",
      action: () => TrackdBridge.requestDeviceAdmin()
    },
    */
    {
      key: "location",
      label: "Location",
      hint: "Live GPS fixes for the map and #LOCATE replies",
      aliases: ["location"],
      done: rowState(["location"]) === "granted" ? true : rowState(["location"]) === null ? null : false,
      actionLabel: rowState(["location"]) === "denied" ? "Settings" : "Allow",
      action:
        rowState(["location"]) === "denied"
          ? () => TrackdBridge.openAppSettings()
          : requestRow(["location"])
    },
    {
      key: "sms",
      label: "SMS commands",
      hint: "Offline #LOCATE / #WIPE via text message",
      aliases: ["sms"],
      done: rowState(["sms"]) === "granted" ? true : rowState(["sms"]) === null ? null : false,
      actionLabel: rowState(["sms"]) === "denied" ? "Settings" : "Allow",
      action:
        rowState(["sms"]) === "denied"
          ? () => TrackdBridge.openAppSettings()
          : requestRow(["sms"])
    },
    {
      key: "phone",
      label: "Phone & notifications",
      hint: "SIM-swap alerts and theft push alerts",
      aliases: ["phoneState", "phoneNumbers", "notifications"],
      done:
        rowState(["phoneState", "phoneNumbers", "notifications"]) === "granted"
          ? true
          : rowState(["phoneState", "phoneNumbers", "notifications"]) === null
            ? null
            : false,
      actionLabel:
        rowState(["phoneState", "phoneNumbers", "notifications"]) === "denied"
          ? "Settings"
          : "Allow",
      action:
        rowState(["phoneState", "phoneNumbers", "notifications"]) === "denied"
          ? () => TrackdBridge.openAppSettings()
          : requestRow(["phoneState", "phoneNumbers", "notifications"])
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
          onClick={() => run("refresh", sync)}
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
            {row.action && (
              <button
                className="btn-outline shrink-0 !rounded-lg !px-3 !py-1.5 !text-xs"
                disabled={busy !== null || row.done === true}
                onClick={() => run(row.key, row.action!)}
              >
                {busy === row.key && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {row.done === true ? "Granted" : row.actionLabel}
              </button>
            )}
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
