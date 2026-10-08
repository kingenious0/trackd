import { Battery, Eye, MapPin, Radio, ShieldAlert, ShieldCheck } from "lucide-react";
import type { Device, TelemetryLog } from "../lib/types";
import { formatLastSeen } from "../lib/format";

interface Props {
  device: Device;
  telemetry: TelemetryLog[];
}

export default function StatusPills({ device, telemetry }: Props) {
  const latest = telemetry[telemetry.length - 1];
  const battery = device.lastTelemetry?.battery ?? latest?.battery ?? null;
  const reason = latest?.triggerReason ?? device.lastTelemetry?.trigger ?? null;
  const fix =
    device.lastTelemetry ??
    (latest ? { lat: latest.lat, lng: latest.lng, accuracy: latest.accuracy, battery: 0, trigger: "" } : null);

  const items = [
    {
      key: "status",
      label: "Status",
      icon: device.isStolen ? ShieldAlert : ShieldCheck,
      value: device.isStolen ? "STOLEN" : "SECURED",
      tone: device.isStolen ? "text-danger" : "text-secure"
    },
    {
      key: "battery",
      label: "Battery",
      icon: Battery,
      value: battery == null ? "—" : `${battery}%`,
      tone: ""
    },
    {
      key: "seen",
      label: "Last seen",
      icon: Eye,
      value: formatLastSeen(device.lastSeenAt),
      tone: ""
    },
    {
      key: "trigger",
      label: "Last trigger",
      icon: Radio,
      value: reason ?? "—",
      tone: ""
    },
    {
      key: "fix",
      label: "Last fix",
      icon: MapPin,
      value: fix ? `${fix.lat.toFixed(4)}, ${fix.lng.toFixed(4)}` : "no fix yet",
      tone: ""
    }
  ];

  return (
    <section className="grid grid-cols-2 gap-2">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.key}
            className={
              "card-flat flex items-center gap-2.5 px-3 py-2.5 " +
              (item.key === "fix" ? "col-span-2" : "")
            }
          >
            <Icon className={"h-4 w-4 shrink-0 " + (item.tone || "text-muted")} />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-muted">{item.label}</p>
              <p
                className={
                  "truncate text-xs font-semibold " + (item.tone || "text-ink")
                }
              >
                {item.value}
              </p>
            </div>
          </div>
        );
      })}
    </section>
  );
}
