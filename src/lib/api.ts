import { Capacitor } from "@capacitor/core";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe
} from "firebase/firestore";
import { db } from "./firebase";
import type { Device, TelemetryLog, TriggerReason, UserProfile } from "./types";
import {
  DEMO_DEVICE_ID,
  DEMO_USER_ID,
  demoAppendTelemetry,
  demoReset,
  demoSubscribeDevices,
  demoSubscribeTelemetry,
  demoUpdateDevice,
  isDemoMode
} from "./demo";

const USERS = "users";
const DEVICES = "devices";
const LOGS = "telemetry_logs";

const API_ORIGIN = Capacitor.isNativePlatform()
  ? ((import.meta.env.VITE_API_ORIGIN as string | undefined) ??
    "https://trackd-livid.vercel.app")
  : "";

export function apiUrl(path: string): string {
  return `${API_ORIGIN}${path}`;
}

function toIso(value: unknown): string {
  if (value && typeof value === "object" && "toDate" in value) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

export async function fetchProfile(userId: string): Promise<UserProfile | null> {
  if (isDemoMode()) {
    return {
      fullName: "Demo User",
      email: "demo@trackd.local",
      phoneNumber: "+233240000000",
      emergencyContactPhone: "+233240000000",
      masterPinHash: "",
      createdAt: new Date().toISOString()
    };
  }
  const snapshot = await getDoc(doc(db(), USERS, userId));
  if (!snapshot.exists()) return null;
  const data = snapshot.data() as Partial<UserProfile>;
  return {
    fullName: data.fullName ?? "",
    email: data.email ?? "",
    phoneNumber: data.phoneNumber ?? "",
    emergencyContactPhone: data.emergencyContactPhone ?? "",
    masterPinHash: data.masterPinHash ?? "",
    encryptedPin: data.encryptedPin,
    createdAt: data.createdAt ? toIso(data.createdAt) : new Date().toISOString()
  };
}

export async function saveProfile(userId: string, profile: Partial<UserProfile>): Promise<void> {
  if (isDemoMode()) return;
  await setDoc(doc(db(), USERS, userId), profile, { merge: true });
}

export function subscribeDevices(
  userId: string,
  onData: (devices: Device[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  if (isDemoMode()) return demoSubscribeDevices(onData);
  const q = query(collection(db(), DEVICES), where("userId", "==", userId));
  return onSnapshot(
    q,
    (snapshot) => {
      const devices = snapshot.docs.map((item) => {
        const data = item.data() as Partial<Device>;
        return {
          id: item.id,
          userId: data.userId ?? userId,
          deviceName: data.deviceName ?? "Unnamed device",
          deviceModel: data.deviceModel,
          fcmToken: data.fcmToken,
          registeredSimSerial: data.registeredSimSerial,
          isStolen: Boolean(data.isStolen),
          requestLocate: Boolean(data.requestLocate),
          requestWipe: Boolean(data.requestWipe),
          lastSeenAt: data.lastSeenAt ? toIso(data.lastSeenAt) : new Date(0).toISOString(),
          lastTelemetry: data.lastTelemetry,
          battery: typeof data.battery === "number" ? data.battery : undefined
        } satisfies Device;
      });
      onData(devices);
    },
    (error) => onError?.(error)
  );
}

export async function fetchDevices(userId: string): Promise<Device[]> {
  if (isDemoMode()) return [];
  const q = query(collection(db(), DEVICES), where("userId", "==", userId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((item) => {
    const data = item.data() as Partial<Device>;
    return {
      id: item.id,
      userId: data.userId ?? userId,
      deviceName: data.deviceName ?? "Unnamed device",
      deviceModel: data.deviceModel,
      fcmToken: data.fcmToken,
      registeredSimSerial: data.registeredSimSerial,
      isStolen: Boolean(data.isStolen),
      requestLocate: Boolean(data.requestLocate),
      requestWipe: Boolean(data.requestWipe),
      lastSeenAt: data.lastSeenAt ? toIso(data.lastSeenAt) : new Date(0).toISOString(),
      lastTelemetry: data.lastTelemetry,
      battery: typeof data.battery === "number" ? data.battery : undefined
    } satisfies Device;
  });
}

export function subscribeDevice(
  deviceId: string,
  onData: (device: Device | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  if (isDemoMode()) {
    return demoSubscribeDevices((devices) => onData(devices[0] ?? null));
  }
  return onSnapshot(
    doc(db(), DEVICES, deviceId),
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(null);
        return;
      }
      const data = snapshot.data() as Partial<Device>;
      onData({
        id: snapshot.id,
        userId: data.userId ?? "",
        deviceName: data.deviceName ?? "Unnamed device",
        deviceModel: data.deviceModel,
        fcmToken: data.fcmToken,
        registeredSimSerial: data.registeredSimSerial,
        isStolen: Boolean(data.isStolen),
        requestLocate: Boolean(data.requestLocate),
        requestWipe: Boolean(data.requestWipe),
        lastSeenAt: data.lastSeenAt ? toIso(data.lastSeenAt) : new Date(0).toISOString(),
        lastTelemetry: data.lastTelemetry,
        battery: typeof data.battery === "number" ? data.battery : undefined
      });
    },
    (error) => onError?.(error)
  );
}

export function subscribeTelemetry(
  deviceId: string,
  userId: string,
  onData: (logs: TelemetryLog[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  if (isDemoMode()) return demoSubscribeTelemetry(onData);
  const q = query(
    collection(db(), LOGS),
    where("deviceId", "==", deviceId),
    where("userId", "==", userId),
    limit(250)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const logs = snapshot.docs
        .map((item) => {
          const data = item.data() as Record<string, unknown>;
          return {
            id: item.id,
            deviceId: (data.deviceId as string) ?? deviceId,
            userId: (data.userId as string) ?? userId,
            lat: Number(data.lat ?? 0),
            lng: Number(data.lng ?? 0),
            accuracy: Number(data.accuracy ?? 0),
            battery: Number(data.battery ?? 0),
            triggerReason: (data.triggerReason as TriggerReason) ?? "LOCATE_REQUEST",
            timestamp: toIso(data.timestamp)
          } satisfies TelemetryLog;
        })
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      onData(logs);
    },
    (error) => onError?.(error)
  );
}

export async function createDevice(userId: string, input: Partial<Device>): Promise<string> {
  if (isDemoMode()) return DEMO_DEVICE_ID;
  const payload = {
    userId,
    deviceName: input.deviceName || "My device",
    deviceModel: input.deviceModel ?? "",
    fcmToken: "",
    registeredSimSerial: "",
    isStolen: false,
    requestLocate: false,
    requestWipe: false,
    lastSeenAt: new Date().toISOString(),
    lastTelemetry: null
  };
  const created = await addDoc(collection(db(), DEVICES), payload);
  return created.id;
}

export async function updateDevice(deviceId: string, patch: Partial<Device>): Promise<void> {
  if (isDemoMode()) {
    if (deviceId === DEMO_DEVICE_ID && patch.userId === DEMO_USER_ID) delete patch.userId;
    demoUpdateDevice(patch);
    return;
  }
  const { id: _ignored, ...fields } = patch as Device & { id?: string };
  await updateDoc(doc(db(), DEVICES, deviceId), {
    ...fields,
    lastSeenAt: new Date().toISOString()
  });
}

export async function appendTelemetry(entry: {
  deviceId: string;
  userId: string;
  lat: number;
  lng: number;
  accuracy: number;
  battery: number;
  triggerReason: TriggerReason;
}): Promise<void> {
  if (isDemoMode()) {
    demoAppendTelemetry(entry.triggerReason);
    return;
  }
  await addDoc(collection(db(), LOGS), {
    ...entry,
    timestamp: new Date().toISOString()
  });
  await updateDevice(entry.deviceId, {
    lastSeenAt: new Date().toISOString(),
    lastTelemetry: {
      lat: entry.lat,
      lng: entry.lng,
      accuracy: entry.accuracy,
      battery: entry.battery,
      trigger: entry.triggerReason
    }
  });
}

export async function resetDemo(): Promise<void> {
  demoReset();
}

export async function wakeDevice(deviceId: string, action: string): Promise<boolean> {
  if (isDemoMode()) return true;
  try {
    const res = await fetch(apiUrl("/api/admin/wake-device"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, action })
    });
    return res.ok;
  } catch {
    return false;
  }
}

export type { Device, TelemetryLog, TriggerReason, UserProfile } from "./types";
