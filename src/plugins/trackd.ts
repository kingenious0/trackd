import { registerPlugin, WebPlugin } from "@capacitor/core";

export interface InstalledFintechApp {
  packageName: string;
  appName: string;
}

export interface ScanResult {
  installed: InstalledFintechApp[];
  total: number;
}

export interface DeviceStatus {
  isStolen: boolean;
  deviceAdminActive: boolean;
  accessibilityEnabled: boolean;
  emergencyContact: string | null;
  simRegistered: boolean;
  batteryLevel?: number;
  overlayEnabled?: boolean;
  deviceName?: string;
  deviceModel?: string;
  deviceManufacturer?: string;
  deviceBrand?: string;
  hasPinConfigured?: boolean;
  locationGranted?: boolean;
  smsGranted?: boolean;
  batteryOptimizationIgnored?: boolean;
  fcmToken?: string;
}

export interface PermissionsOverview {
  deviceAdmin: boolean;
  batteryOptimizationIgnored: boolean;
  backgroundLocation: boolean;
  accessibilityService: boolean;
  overlay: boolean;
  smsPermission: boolean;
}

export interface TrackdBridgePlugin {
  scanInstalledFintechApps(): Promise<ScanResult>;
  requestDeviceAdmin(): Promise<void>;
  isDeviceAdminActive(): Promise<{ active: boolean }>;
  saveEmergencyContact(options: { phone: string; pin: string }): Promise<{ saved: boolean }>;
  saveDeviceCredentials(options: {
    emergencyPhone: string;
    pinHash: string;
    simSerial: string;
  }): Promise<{ saved: boolean }>;
  configureAccount(options: {
    email: string;
    password: string;
    deviceId: string;
    projectId: string;
  }): Promise<{ uid: string }>;
  unlinkAccount(): Promise<{ unlinked: boolean }>;
  checkAccessibilityPermission(): Promise<{ enabled: boolean }>;
  openAccessibilitySettings(): Promise<void>;
  openAppSettings(): Promise<void>;
  requestOverlayPermission(): Promise<void>;
  getDeviceStatus(): Promise<DeviceStatus>;
  markStolen(options: { stolen: boolean }): Promise<{ isStolen: boolean }>;
  checkPermissions(options: { permissions: string[] }): Promise<PermissionStatus>;
  requestPermissions(options: { permissions: string[] }): Promise<PermissionStatus>;
  getLinkState(): Promise<LinkState>;
  isBatteryOptimizationIgnored(): Promise<{ ignored: boolean }>;
  requestIgnoreBatteryOptimization(): Promise<void>;
  testHardwareSiren(options?: { durationMs?: number }): Promise<{ playing: boolean }>;
  stopHardwareSiren(): Promise<{ stopped: boolean }>;
  promptBiometric(): Promise<{ authenticated: boolean; available?: boolean; error?: string }>;
  pickContact(): Promise<{ phone: string; name?: string }>;
  getFcmToken(): Promise<{ token: string }>;
  getDeviceInfo(): Promise<DeviceInfo>;
  openAutostartSettings(): Promise<{ success: boolean; component: string }>;
}

export interface DeviceInfo {
  manufacturer: string;
  brand: string;
  model: string;
  androidVersion: string;
  sdkInt: number;
  isTranssion: boolean;
  isXiaomi: boolean;
  isSamsung: boolean;
  isOppo: boolean;
  isVivo: boolean;
}

export interface PermissionStatus {
  permissions: Record<string, string>;
}

export interface LinkState {
  configured: boolean;
  deviceId: string | null;
  uid: string | null;
  email: string | null;
}

export class WebTrackdBridge extends WebPlugin implements TrackdBridgePlugin {
  async scanInstalledFintechApps(): Promise<ScanResult> {
    return { installed: [], total: 0 };
  }
  async requestDeviceAdmin(): Promise<void> {
    console.warn("Device admin is only available on Android native");
  }
  async isDeviceAdminActive(): Promise<{ active: boolean }> {
    return { active: false };
  }
  async saveEmergencyContact(options: { phone: string; pin: string }): Promise<{ saved: boolean }> {
    localStorage.setItem("trackd_pin", options.pin);
    localStorage.setItem("trackd_emergency_phone", options.phone);
    return { saved: true };
  }
  async saveDeviceCredentials(): Promise<{ saved: boolean }> {
    return { saved: true };
  }
  async pickContact(): Promise<{ phone: string; name?: string }> {
    const mock = window.prompt("Enter emergency contact phone number:", "+233540000000");
    if (!mock) throw new Error("Contact selection cancelled");
    return { phone: mock.replace(/[^0-9+]/g, ""), name: "Selected Contact" };
  }
  async configureAccount(options: {
    email: string;
    password: string;
    deviceId: string;
    projectId: string;
  }): Promise<{ uid: string }> {
    localStorage.setItem(
      "trackd_link_state",
      JSON.stringify({
        configured: true,
        deviceId: options.deviceId,
        uid: "mock-uid-" + options.email,
        email: options.email
      })
    );
    return { uid: "mock-uid-" + options.email };
  }
  async unlinkAccount(): Promise<{ unlinked: boolean }> {
    localStorage.removeItem("trackd_link_state");
    return { unlinked: true };
  }
  async checkAccessibilityPermission(): Promise<{ enabled: boolean }> {
    return { enabled: false };
  }
  async openAccessibilitySettings(): Promise<void> {
    console.warn("Accessibility settings only available on Android");
  }
  async openAppSettings(): Promise<void> {
    console.warn("App settings only available on Android");
  }
  async requestOverlayPermission(): Promise<void> {
    console.warn("Overlay permission only available on Android");
  }
  async getDeviceStatus(): Promise<DeviceStatus> {
    return {
      isStolen: false,
      deviceAdminActive: false,
      accessibilityEnabled: false,
      emergencyContact: localStorage.getItem("trackd_emergency_phone"),
      simRegistered: false
    };
  }
  async markStolen(): Promise<{ isStolen: boolean }> {
    return { isStolen: true };
  }
  async checkPermissions(): Promise<PermissionStatus> {
    return { permissions: {} };
  }
  async requestPermissions(): Promise<PermissionStatus> {
    return { permissions: {} };
  }
  async getLinkState(): Promise<LinkState> {
    const raw = localStorage.getItem("trackd_link_state");
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {}
    }
    return { configured: false, deviceId: null, uid: null, email: null };
  }
  async isBatteryOptimizationIgnored(): Promise<{ ignored: boolean }> {
    return { ignored: false };
  }
  async requestIgnoreBatteryOptimization(): Promise<void> {
    console.warn("Battery optimization settings only on Android");
  }
  async testHardwareSiren(): Promise<{ playing: boolean }> {
    console.log("Hardware siren simulated in browser (web demo)");
    return { playing: true };
  }
  async stopHardwareSiren(): Promise<{ stopped: boolean }> {
    return { stopped: true };
  }
  async getFcmToken(): Promise<{ token: string }> {
    return { token: "" };
  }
  async promptBiometric(): Promise<{ authenticated: boolean; available?: boolean; error?: string }> {
    return { authenticated: true };
  }
  async getDeviceInfo(): Promise<DeviceInfo> {
    return {
      manufacturer: "Generic",
      brand: "Web",
      model: "Browser",
      androidVersion: "14",
      sdkInt: 34,
      isTranssion: false,
      isXiaomi: false,
      isSamsung: false,
      isOppo: false,
      isVivo: false
    };
  }
  async openAutostartSettings(): Promise<{ success: boolean; component: string }> {
    console.warn("Autostart settings only available on Android native");
    return { success: false, component: "web" };
  }
}

const rawBridge = registerPlugin<TrackdBridgePlugin>("TrackdBridge", {
  web: () => new WebTrackdBridge()
});

export type ExtendedTrackdBridge = TrackdBridgePlugin & {
  checkPermissionsStatus(): Promise<PermissionsOverview>;
  setCommandCredentials(options: { pin: string; emergencyPhone?: string }): Promise<{ saved: boolean }>;
  requestBackgroundLocation(): Promise<void>;
  requestSmsPermissions(): Promise<void>;
  openOverlaySettings(): Promise<void>;
};

/**
 * Extended TrackdBridge with proxy delegation for native Capacitor bridge.
 */
export const TrackdBridge: ExtendedTrackdBridge = new Proxy(rawBridge as unknown as ExtendedTrackdBridge, {
  get(target, prop, receiver) {
    if (prop === 'checkPermissionsStatus') {
      return async (): Promise<PermissionsOverview> => {
        try {
          const [deviceStatus, permResult, battResult] = await Promise.all([
            rawBridge.getDeviceStatus().catch(() => ({
              deviceAdminActive: false,
              accessibilityEnabled: false,
              isStolen: false,
              emergencyContact: null,
              simRegistered: false,
            } as DeviceStatus)),
            rawBridge.checkPermissions({ permissions: ["location", "sms"] }).catch(() => ({
              permissions: {} as Record<string, string>
            })),
            rawBridge.isBatteryOptimizationIgnored().catch(() => ({ ignored: false }))
          ]);

          const rawPermMap = (permResult as unknown as Record<string, string>) ?? {};
          const nestedPermMap = (permResult.permissions ?? {}) as Record<string, string>;
          const locGranted = Boolean(deviceStatus.locationGranted || rawPermMap["location"] === "granted" || nestedPermMap["location"] === "granted");
          const smsGranted = Boolean(deviceStatus.smsGranted || rawPermMap["sms"] === "granted" || nestedPermMap["sms"] === "granted");

          return {
            deviceAdmin: Boolean(deviceStatus.deviceAdminActive),
            batteryOptimizationIgnored: Boolean(deviceStatus.batteryOptimizationIgnored || battResult.ignored),
            backgroundLocation: locGranted,
            accessibilityService: Boolean(deviceStatus.accessibilityEnabled),
            overlay: Boolean(deviceStatus.overlayEnabled),
            smsPermission: smsGranted
          };
        } catch {
          return {
            deviceAdmin: false,
            batteryOptimizationIgnored: false,
            backgroundLocation: false,
            accessibilityService: false,
            overlay: false,
            smsPermission: false
          };
        }
      };
    }

    if (prop === 'setCommandCredentials') {
      return async (options: { pin: string; emergencyPhone?: string }): Promise<{ saved: boolean }> => {
        return rawBridge.saveEmergencyContact({
          phone: options.emergencyPhone || "",
          pin: options.pin
        });
      };
    }

    if (prop === 'requestBackgroundLocation') {
      return async (): Promise<void> => {
        await rawBridge.requestPermissions({ permissions: ["location"] });
      };
    }

    if (prop === 'requestSmsPermissions') {
      return async (): Promise<void> => {
        await rawBridge.requestPermissions({ permissions: ["sms"] });
      };
    }

    if (prop === 'openOverlaySettings') {
      return async (): Promise<void> => {
        await rawBridge.requestOverlayPermission();
      };
    }

    return Reflect.get(target, prop, receiver);
  }
});

