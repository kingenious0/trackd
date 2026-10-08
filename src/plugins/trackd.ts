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
  async configureAccount(): Promise<{ uid: string }> {
    throw this.unavailable("Account linking is only available on Android");
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
}

const rawBridge = registerPlugin<TrackdBridgePlugin>("TrackdBridge", {
  web: () => new WebTrackdBridge()
});

/**
 * Extended TrackdBridge with convenient helper methods for MobileClientView.
 */
export const TrackdBridge = {
  ...rawBridge,

  async checkPermissionsStatus(): Promise<PermissionsOverview> {
    try {
      const [deviceStatus, permResult, battResult] = await Promise.all([
        rawBridge.getDeviceStatus().catch(() => ({
          deviceAdminActive: false,
          accessibilityEnabled: false
        })),
        rawBridge.checkPermissions({ permissions: ["location", "sms"] }).catch(() => ({
          permissions: {} as Record<string, string>
        })),
        rawBridge.isBatteryOptimizationIgnored().catch(() => ({ ignored: false }))
      ]);

      const permissionsMap = (permResult.permissions ?? {}) as Record<string, string>;
      const locGranted = permissionsMap["location"] === "granted";
      const smsGranted = permissionsMap["sms"] === "granted";

      return {
        deviceAdmin: Boolean(deviceStatus.deviceAdminActive),
        batteryOptimizationIgnored: Boolean(battResult.ignored),
        backgroundLocation: locGranted,
        accessibilityService: Boolean(deviceStatus.accessibilityEnabled),
        overlay: false, // will update if granted
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
  },

  async setCommandCredentials(options: { pin: string; emergencyPhone?: string }): Promise<{ saved: boolean }> {
    return rawBridge.saveEmergencyContact({
      phone: options.emergencyPhone || "",
      pin: options.pin
    });
  },

  async requestBackgroundLocation(): Promise<void> {
    await rawBridge.requestPermissions({ permissions: ["location"] });
  },

  async requestSmsPermissions(): Promise<void> {
    await rawBridge.requestPermissions({ permissions: ["sms"] });
  },

  async openOverlaySettings(): Promise<void> {
    await rawBridge.requestOverlayPermission();
  }
};
