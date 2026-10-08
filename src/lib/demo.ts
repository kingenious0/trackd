import type { Device, TelemetryLog, TriggerReason } from "./types";

const DEMO_KEY = "trackd_demo";

export const DEMO_DEVICE_ID = "demo-device-0000";
export const DEMO_USER_ID = "demo-user";

export function isDemoMode(): boolean {
  try {
    return localStorage.getItem(DEMO_KEY) === "1";
  } catch {
    return false;
  }
}

export function setDemoMode(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(DEMO_KEY, "1");
    else localStorage.removeItem(DEMO_KEY);
  } catch {
    /* storage unavailable — demo stays session-only */
  }
}

const CENTER = { lat: 5.6037, lng: -0.187 };
const TRIGGERS: TriggerReason[] = ["SMS_COMMAND", "LOCATE_REQUEST", "SHUTDOWN"];

function mockDevice(stolen = false): Device {
  return {
    id: DEMO_DEVICE_ID,
    userId: DEMO_USER_ID,
    deviceName: "Galaxy A54 (Demo)",
    deviceModel: "Samsung Galaxy A54",
    registeredSimSerial: "8900000000000000000",
    isStolen: stolen,
    requestLocate: false,
    requestWipe: false,
    lastSeenAt: new Date().toISOString(),
    lastTelemetry: { lat: CENTER.lat, lng: CENTER.lng, accuracy: 14, battery: 76, trigger: "LOCATE_REQUEST" }
  };
}

function mockPoint(index: number, deviceId: string, userId: string): TelemetryLog {
  const wave = index / 6;
  const jitter = (seed: number) => Math.sin(index * 1.7 + seed) * 0.0016;
  return {
    id: `demo-point-${index}`,
    deviceId,
    userId,
    lat: Number((CENTER.lat + Math.sin(wave) * 0.004 + jitter(1)).toFixed(6)),
    lng: Number((CENTER.lng + Math.cos(wave * 0.8) * 0.005 + jitter(3)).toFixed(6)),
    accuracy: 8 + ((index * 5) % 22),
    battery: Math.max(6, 94 - Math.floor(index / 5)),
    triggerReason: TRIGGERS[index % TRIGGERS.length],
    timestamp: new Date(Date.now() - Math.max(0, 40 - index) * 90_000).toISOString()
  };
}

interface DemoState {
  device: Device;
  telemetry: TelemetryLog[];
  counter: number;
}

function freshState(): DemoState {
  return {
    device: mockDevice(),
    telemetry: Array.from({ length: 40 }, (_, i) => mockPoint(i, DEMO_DEVICE_ID, DEMO_USER_ID)),
    counter: 40
  };
}

let state: DemoState = freshState();
const deviceListeners = new Set<(devices: Device[]) => void>();
const telemetryListeners = new Set<(logs: TelemetryLog[]) => void>();

function emitDevices() {
  deviceListeners.forEach((listener) => listener([state.device]));
}

function emitTelemetry() {
  telemetryListeners.forEach((listener) => listener([...state.telemetry]));
}

export function demoSubscribeDevices(onData: (devices: Device[]) => void): () => void {
  deviceListeners.add(onData);
  onData([state.device]);
  return () => deviceListeners.delete(onData);
}

export function demoSubscribeTelemetry(onData: (logs: TelemetryLog[]) => void): () => void {
  telemetryListeners.add(onData);
  onData([...state.telemetry]);
  return () => telemetryListeners.delete(onData);
}

export function demoUpdateDevice(patch: Partial<Device>) {
  state.device = { ...state.device, ...patch, lastSeenAt: new Date().toISOString() };
  emitDevices();
}

export function demoAppendTelemetry(triggerReason: TriggerReason = "LOCATE_REQUEST") {
  state.counter += 1;
  const point = mockPoint(state.counter, DEMO_DEVICE_ID, DEMO_USER_ID);
  point.triggerReason = triggerReason;
  point.timestamp = new Date().toISOString();
  point.battery = state.device.lastTelemetry?.battery ?? point.battery;
  state.telemetry = [...state.telemetry, point].slice(-250);
  state.device = {
    ...state.device,
    lastSeenAt: point.timestamp,
    lastTelemetry: {
      lat: point.lat,
      lng: point.lng,
      accuracy: point.accuracy,
      battery: point.battery,
      trigger: triggerReason
    }
  };
  emitTelemetry();
  emitDevices();
}

export function demoReset() {
  state = freshState();
  emitDevices();
  emitTelemetry();
}

export const demoDelay = (ms = 700) => new Promise<void>((resolve) => setTimeout(resolve, ms));
