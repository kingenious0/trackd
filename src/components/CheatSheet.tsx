import { Copy, MessageSquare, Smartphone } from "lucide-react";
import { useState } from "react";
import type { User } from "firebase/auth";
import { Capacitor } from "@capacitor/core";
import { SMS_COMMANDS } from "../lib/types";
import { fetchProfile } from "../lib/api";
import { decryptPin } from "../lib/crypto";

interface Props {
  deviceName: string;
  user?: User;
}

type ActionState = "idle" | "busy" | "sent" | "copied" | "error";

interface CommandState {
  [command: string]: ActionState;
}

/** True when the UA suggests a device with native SMS capability */
function canOpenSmsLink(): boolean {
  if (Capacitor.isNativePlatform()) return true;
  const ua = navigator.userAgent.toLowerCase();
  return /android|iphone|ipad|ipod/.test(ua);
}

export default function CheatSheet({ deviceName, user }: Props) {
  const [states, setStates] = useState<CommandState>({});
  const [error, setError] = useState<string | null>(null);

  const setState = (command: string, state: ActionState) =>
    setStates((prev) => ({ ...prev, [command]: state }));

  const handleSend = async (command: string) => {
    if (!user) {
      setError("Sign in to use one-tap SMS sending.");
      return;
    }

    setState(command, "busy");
    setError(null);

    try {
      const profile = await fetchProfile(user.uid);
      const isMobile = canOpenSmsLink();

      let pin = "";
      if (profile?.encryptedPin) {
        pin = (await decryptPin(profile.encryptedPin, user.uid)) ?? "";
      }

      if (isMobile) {
        if (!profile?.phoneNumber) {
          setError("No device phone number on file. Re-run onboarding or configure phone.");
          setState(command, "error");
          return;
        }
        if (!pin) {
          setError("No PIN stored. Re-run onboarding to save your PIN.");
          setState(command, "error");
          return;
        }
        const smsBody = `${command}#${pin}`;
        const phone = profile.phoneNumber;
        const sep = Capacitor.getPlatform() === "android" ? "?" : "&";
        window.open(`sms:${phone}${sep}body=${encodeURIComponent(smsBody)}`, "_self");
        setState(command, "sent");
      } else {
        // Desktop: copy to clipboard
        const smsBody = pin ? `${command}#${pin}` : `${command}#`;
        await navigator.clipboard.writeText(smsBody);
        setState(command, "copied");
        if (!pin) {
          setError("Command copied without PIN. Save your PIN in onboarding or dashboard to embed it automatically!");
        }
      }

      setTimeout(() => setState(command, "idle"), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setState(command, "error");
      setTimeout(() => setState(command, "idle"), 3000);
    }
  };

  const isMobile = canOpenSmsLink();

  return (
    <section className="card-flat p-3">
      <div className="mb-2 flex items-center gap-2 px-1">
        <Smartphone className="h-4 w-4 text-accent" />
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          Offline SMS commands
        </h2>
      </div>

      <p className="mb-3 px-1 text-xs leading-relaxed text-muted">
        If <span className="text-ink">{deviceName}</span> has no data, borrow any phone and text
        these to the SIM inside it.{" "}
        {isMobile ? (
          <span className="text-accent">Tap Send to open SMS with command pre-filled.</span>
        ) : (
          <span className="text-ink">Click Copy — your PIN is embedded automatically.</span>
        )}
      </p>

      {error && (
        <p className="mb-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-[11px] text-danger">
          {error}
        </p>
      )}

      <ul className="space-y-1.5">
        {SMS_COMMANDS.map((entry) => {
          const state = states[entry.command] ?? "idle";
          const busy = state === "busy";

          return (
            <li
              key={entry.command}
              className="flex items-start justify-between gap-2 rounded-xl bg-app px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <code className="font-mono text-xs font-semibold text-accent">
                    {entry.command}#
                  </code>
                  {/* PIN always masked in UI */}
                  <code className="font-mono text-xs font-semibold text-warning tracking-widest">
                    ****
                  </code>
                </div>
                <p className="text-[11px] leading-snug text-muted">{entry.purpose}</p>
                {state === "sent" && (
                  <p className="text-[10px] text-secure">SMS composer opened ✓</p>
                )}
                {state === "copied" && (
                  <p className="text-[10px] text-secure">Copied with PIN ✓</p>
                )}
              </div>

              <button
                className={
                  "mt-0.5 shrink-0 flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-medium transition " +
                  (busy
                    ? "opacity-50 cursor-wait bg-raised text-muted"
                    : isMobile
                      ? "bg-accent/10 text-accent hover:bg-accent/20"
                      : "bg-raised text-muted hover:bg-raised hover:text-ink")
                }
                onClick={() => handleSend(entry.command)}
                disabled={busy}
                aria-label={isMobile ? `Send ${entry.command} via SMS` : `Copy ${entry.command}`}
              >
                {isMobile ? (
                  <>
                    <MessageSquare className="h-3.5 w-3.5" />
                    {busy ? "…" : "Send"}
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    {state === "copied" ? "Copied" : "Copy"}
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-[11px] leading-relaxed text-warning">
        Commands are verified against the PIN hash on the device. Wrong PINs are silently
        discarded.
      </p>
    </section>
  );
}
