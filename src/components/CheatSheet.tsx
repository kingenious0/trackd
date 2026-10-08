import { Copy, Smartphone } from "lucide-react";
import { useState } from "react";
import { SMS_COMMANDS } from "../lib/types";

interface Props {
  deviceName: string;
}

export default function CheatSheet({ deviceName }: Props) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  };

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
        these to the SIM inside it. Replace{" "}
        <span className="font-mono text-ink">[PIN]</span> with your command PIN.
      </p>

      <ul className="space-y-1.5">
        {SMS_COMMANDS.map((entry) => (
          <li
            key={entry.command}
            className="flex items-start justify-between gap-2 rounded-xl bg-app px-3 py-2"
          >
            <div className="min-w-0">
              <code className="font-mono text-xs font-semibold text-accent">
                {entry.command}#[PIN]
              </code>
              <p className="text-[11px] leading-snug text-muted">{entry.purpose}</p>
              {copied === `${entry.command}#[PIN]` && (
                <p className="text-[10px] text-secure">Copied</p>
              )}
            </div>
            <button
              className="mt-0.5 shrink-0 rounded-lg p-1.5 text-muted transition hover:bg-raised hover:text-ink"
              onClick={() => copy(`${entry.command}#[PIN]`)}
              aria-label={`Copy ${entry.command}`}
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>

      <p className="mt-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-[11px] leading-relaxed text-warning">
        Commands are verified against the PIN hash on the device. Wrong PINs are silently
        discarded.
      </p>
    </section>
  );
}
