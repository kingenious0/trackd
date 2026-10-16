export type TriggerReason =
  | "SHUTDOWN"
  | "SIM_CHANGE"
  | "SMS_COMMAND"
  | "LOCATE_REQUEST"
  | "FCM_WAKE"
  | "APP_LINKED"
  | "APP_START"
  | "PERIODIC"
  | "BOOT";
export type RemoteCommand = "STOLEN" | "SAFE" | "LOCATE" | "WIPE";

export interface UserProfile {
  fullName: string;
  email: string;
  phoneNumber: string;
  emergencyContactPhone: string;
  masterPinHash: string;
  /** AES-GCM encrypted PIN blob: `<iv_b64>.<ciphertext_b64>`, keyed to user UID */
  encryptedPin?: string;
  createdAt: string;
}

export interface TelemetrySnapshot {
  lat: number;
  lng: number;
  accuracy: number;
  battery: number;
  trigger: string;
}

export interface Device {
  id: string;
  userId: string;
  deviceName: string;
  deviceModel?: string;
  fcmToken?: string;
  registeredSimSerial?: string;
  isStolen: boolean;
  requestLocate: boolean;
  requestWipe?: boolean;
  requestSiren?: boolean;
  stopSiren?: boolean;
  lastSeenAt: string;
  lastTelemetry?: TelemetrySnapshot;
  battery?: number;
}

export interface TelemetryLog {
  id: string;
  deviceId: string;
  userId: string;
  lat: number;
  lng: number;
  accuracy: number;
  battery: number;
  triggerReason: TriggerReason;
  timestamp: string;
}

export const SMS_COMMANDS = [
  { command: "#LOCATE", purpose: "Device replies with live GPS coordinates via SMS" },
  { command: "#SIREN", purpose: "Sounds a 100% max-volume emergency alert" },
  { command: "#SILENCE", purpose: "Silences the emergency alert" },
  { command: "#STOLEN", purpose: "Arms lost mode and financial app protection" },
  { command: "#SAFE", purpose: "Disarms lost mode and restores normal operation" },
  { command: "#WIPE", purpose: "Remotely erases and factory resets the device" }
] as const;
