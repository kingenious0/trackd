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
}

export class WebTrackdBridge extends WebPlugin implements TrackdBridgePlugin {
  async scanInstalledFintechApps(): Promise<ScanResult> {
    return { installed: [], total: 0 };
  }
  async requestDeviceAdmin(): Promise<void> {
    throw this.unavailable("Device admin is only available on Android");
  }
  async isDeviceAdminActive(): Promise<{ active: boolean }> {
    return { active: false };
  }
  async saveEmergencyContact(): Promise<{ saved: boolean }> {
    throw this.unavailable("Secure storage is only available on Android");
  }
  async saveDeviceCredentials(): Promise<{ saved: boolean }> {
    throw this.unavailable("Secure storage is only available on Android");
  }
  async configureAccount(): Promise<{ uid: string }> {
    throw this.unavailable("Account linking is only available on Android");
  }
  async checkAccessibilityPermission(): Promise<{ enabled: boolean }> {
    return { enabled: false };
  }
  async openAccessibilitySettings(): Promise<void> {
    throw this.unavailable("Accessibility settings are only available on Android");
  }
  async openAppSettings(): Promise<void> {
    throw this.unavailable("App settings are only available on Android");
  }
  async requestOverlayPermission(): Promise<void> {
    throw this.unavailable("Overlay permission is only available on Android");
  }
  async getDeviceStatus(): Promise<DeviceStatus> {
    return {
      isStolen: false,
      deviceAdminActive: false,
      accessibilityEnabled: false,
      emergencyContact: null,
      simRegistered: false
    };
  }
  async markStolen(): Promise<{ isStolen: boolean }> {
    throw this.unavailable("Theft mode is only available on Android");
  }
}

export const TrackdBridge = registerPlugin<TrackdBridgePlugin>("TrackdBridge", {
  web: () => new WebTrackdBridge()
});
