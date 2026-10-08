import { useState } from "react";
import { Crosshair, Loader2, ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import type { Device, RemoteCommand } from "../lib/types";
import WipeDialog from "./WipeDialog";

interface Props {
  device: Device;
  onCommand: (command: RemoteCommand) => Promise<void>;
  demo?: boolean;
}

type BusyKey = RemoteCommand | null;

export default function ActionToolbar({ device, onCommand, demo = false }: Props) {
  const [busy, setBusy] = useState<BusyKey>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [wipeOpen, setWipeOpen] = useState(false);

  const run = async (command: RemoteCommand) => {
    setBusy(command);
    setMessage(null);
    try {
      await onCommand(command);
      if (!demo) {
        // Silent FCM ping so a dozing phone wakes and its listener fires.
        // Firestore flags remain the authoritative command channel.
        fetch("/api/admin/wake-device", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId: device.id, action: command })
        }).catch(() => undefined);
      }
      setMessage({
        kind: "ok",
        text:
          command === "LOCATE"
            ? "Locate requested — waiting for the phone to report its position."
            : command === "WIPE"
              ? "Wipe dispatched. If the phone is offline, send #WIPE#[PIN] by SMS."
              : command === "STOLEN"
                ? "Theft mode armed. Decoy and alerts activate when the phone syncs."
                : "Device marked safe. Theft mode disarmed."
      });
    } catch (error) {
      setMessage({
        kind: "err",
        text: error instanceof Error ? error.message : `${command} failed`
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="card-flat p-3">
      <h2 className="mb-2.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
        Remote actions
      </h2>

      <div className="grid grid-cols-2 gap-2">
        <button
          className="btn-solid !rounded-xl !py-3"
          disabled={busy !== null}
          onClick={() => run("LOCATE")}
        >
          {busy === "LOCATE" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Crosshair className="h-4 w-4" />
          )}
          Locate now
        </button>

        <button
          className={device.isStolen ? "btn-outline !rounded-xl !py-3" : "btn-danger !rounded-xl !py-3"}
          disabled={busy !== null || device.isStolen}
          onClick={() => run("STOLEN")}
        >
          {busy === "STOLEN" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldAlert className="h-4 w-4" />
          )}
          Mark stolen
        </button>

        <button
          className="btn-secure !rounded-xl !py-3"
          disabled={busy !== null || !device.isStolen}
          onClick={() => run("SAFE")}
        >
          {busy === "SAFE" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
          Mark safe
        </button>

        <button
          className="btn-danger-outline !rounded-xl !py-3"
          disabled={busy !== null}
          onClick={() => setWipeOpen(true)}
        >
          {busy === "WIPE" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <TriangleAlert className="h-4 w-4" />
          )}
          Factory wipe
        </button>
      </div>

      {message && (
        <p
          className={
            "mt-2.5 rounded-xl border px-3 py-2 text-xs leading-relaxed " +
            (message.kind === "ok"
              ? "border-secure/30 bg-secure/10 text-secure"
              : "border-danger/30 bg-danger/10 text-danger")
          }
        >
          {message.text}
        </p>
      )}

      <WipeDialog
        open={wipeOpen}
        deviceName={device.deviceName}
        onClose={() => setWipeOpen(false)}
        onConfirm={async () => {
          setWipeOpen(false);
          await run("WIPE");
        }}
      />
    </section>
  );
}
