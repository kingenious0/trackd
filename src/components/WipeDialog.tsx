import { FormEvent, useState } from "react";
import { Loader2, TriangleAlert, X } from "lucide-react";

const PHRASE = "WIPE DEVICE";

interface Props {
  open: boolean;
  deviceName: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export default function WipeDialog({ open, deviceName, onClose, onConfirm }: Props) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (typed.trim().toUpperCase() !== PHRASE) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
      setTyped("");
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 px-4">
      <div className="panel w-full max-w-md border-danger/40 p-6">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <TriangleAlert className="h-6 w-6 text-danger" />
            <h3 className="text-lg font-semibold">Irreversible action</h3>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-4 text-sm leading-relaxed text-muted">
          This dispatches a high-priority wipe command to <strong className="text-ink">{deviceName}</strong>.
          All data, accounts and Trackd configuration will be destroyed and cannot be recovered.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
              Type <span className="font-mono text-danger">{PHRASE}</span> to confirm
            </span>
            <input
              className="input font-mono"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={PHRASE}
              autoFocus
              autoComplete="off"
            />
          </label>

          <div className="flex gap-3">
            <button type="button" className="btn-outline flex-1" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn-danger flex-1"
              disabled={busy || typed.trim().toUpperCase() !== PHRASE}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Wipe now
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
