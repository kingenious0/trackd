import { FormEvent, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { Capacitor } from "@capacitor/core";
import { Cpu, KeyRound, Loader2, Smartphone } from "lucide-react";
import { fetchProfile, createDevice, saveProfile } from "../lib/api";
import { projectId } from "../lib/firebase";
import { sha256Hex, toUnsignedE164 } from "../lib/crypto";
import { TrackdBridge } from "../plugins/trackd";

interface Props {
  user?: User;
  demo?: boolean;
  onCreated: () => void;
}

export default function DeviceOnboarding({ user, demo = false, onCreated }: Props) {
  const isNative = Capacitor.isNativePlatform();
  const [deviceName, setDeviceName] = useState("Primary phone");
  const [deviceModel, setDeviceModel] = useState("");
  const [phone, setPhone] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (demo || !user) return;
    fetchProfile(user.uid)
      .then((profile) => {
        if (profile?.phoneNumber) setPhone(profile.phoneNumber);
        if (profile?.emergencyContactPhone) setEmergencyPhone(profile.emergencyContactPhone);
      })
      .catch(() => setInfo("No profile yet — complete the fields below."));
  }, [demo, user]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!emergencyPhone.trim() || !/^\d{4}$/.test(pin)) {
      setError("Emergency contact and a 4-digit Master Recovery PIN are required.");
      return;
    }
    if (!demo && isNative && !password.trim()) {
      setError("Enter your Trackd account password so this phone can link to your console.");
      return;
    }

    setBusy(true);
    try {
      const ownerId = demo ? "demo-user" : (user?.uid ?? "");
      if (!demo && user) {
        await saveProfile(user.uid, {
          fullName: user.displayName ?? "",
          email: user.email ?? "",
          phoneNumber: toUnsignedE164(phone),
          emergencyContactPhone: toUnsignedE164(emergencyPhone),
          masterPinHash: await sha256Hex(pin),
          createdAt: new Date().toISOString()
        });
      }

      const deviceId = await createDevice(ownerId, {
        deviceName: deviceName.trim() || "My Device",
        deviceModel: deviceModel.trim()
      });

      if (!demo && user && password) {
        try {
          await TrackdBridge.configureAccount({
            email: user.email ?? "",
            password,
            deviceId,
            projectId
          });
          await TrackdBridge.saveDeviceCredentials({
            emergencyPhone: toUnsignedE164(emergencyPhone),
            pinHash: await sha256Hex(pin),
            simSerial: ""
          });
          setInfo("Device registered and this phone is now linked to your console.");
        } catch {
          setInfo("Device registered, but linking failed. Re-check your password in Protect.");
        }
      } else {
        setInfo(
          demo
            ? "Demo device registered."
            : "Device registered. Open the Android app and sign in to link this phone."
        );
      }

      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card-flat p-4">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-raised">
          <Cpu className="h-5 w-5 text-accent" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Register your first device</h2>
          <p className="text-xs text-muted">
            Trackd needs a device record to anchor telemetry and remote commands.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
            Device label
          </span>
          <div className="relative">
            <Smartphone className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted" />
            <input
              className="input pl-9"
              value={deviceName}
              onChange={(event) => setDeviceName(event.target.value)}
              placeholder="Primary phone"
            />
          </div>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
            Model (optional)
          </span>
          <input
            className="input"
            value={deviceModel}
            onChange={(event) => setDeviceModel(event.target.value)}
            placeholder="Samsung Galaxy A54"
          />
        </label>

        {!demo && (
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
              Your phone number
            </span>
            <input
              className="input"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+233 24 000 0000"
              autoComplete="tel"
            />
          </label>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
              Emergency contact
            </span>
            <input
              className="input"
              value={emergencyPhone}
              onChange={(event) => setEmergencyPhone(event.target.value)}
              placeholder="+233 24 000 0000"
              autoComplete="tel"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
              Master Recovery PIN
            </span>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted" />
              <input
                className="input pl-9 font-mono"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
                placeholder="4921"
              />
            </div>
          </label>
        </div>

        {!demo && (
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
              Account password {isNative ? "(required — links this phone)" : "(links this phone, not stored)"}
            </span>
            <input
              className="input"
              type="password"
              required={isNative}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              autoComplete={isNative ? "current-password" : "off"}
            />
          </label>
        )}

        {error && (
          <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        {info && (
          <p className="rounded-xl border border-line bg-app px-3 py-2 text-xs leading-relaxed text-muted">
            {info}
          </p>
        )}

        <button className="btn-solid w-full" type="submit" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Register device
        </button>
      </form>
    </section>
  );
}
