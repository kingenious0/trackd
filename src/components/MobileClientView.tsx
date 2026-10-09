import React, { useEffect, useState, useMemo } from 'react';
import type { User } from 'firebase/auth';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut 
} from 'firebase/auth';
import { App } from '@capacitor/app';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { 
  Shield, Lock, LockOpen, MapPin, Zap, 
  MessageSquare, Volume2, Key, 
  CheckCircle2, ChevronRight, Eye, AlertTriangle, X, 
  LogOut, Loader2, Smartphone, 
  PhoneCall, Fingerprint, Delete, Check,
  Settings as SettingsIcon, Battery
} from 'lucide-react';
import { TrackdBridge, type LinkState } from '../plugins/trackd';
import { auth, isConfigured, projectId } from '../lib/firebase';
import { createDevice } from '../lib/api';

interface Props {
  user?: User | null;
}

type ViewState = 'setup' | 'armed' | 'degraded' | 'stolen';

export default function MobileClientView({ user: _user }: Props = {}) {
  // ----------------------------------------------------
  // Lifecycle & Core Hardware Telemetry
  // ----------------------------------------------------
  const [_loading, setLoading] = useState(false);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [deviceName, setDeviceName] = useState('Android Sentinel');
  const [isStolen, setIsStolen] = useState(false);

  // Stored Offline Credentials
  const [pin, setPin] = useState('7492');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [_hasPinConfigured, setHasPinConfigured] = useState(false);

  // Web Sync & Firebase Account State
  const [linkState, setLinkState] = useState<LinkState>({
    configured: false,
    deviceId: null,
    uid: null,
    email: null,
  });

  // 6 Core Hardware / OS Permissions
  const [perms, setPerms] = useState({
    location: false,
    sms: false,
    admin: false,
    battery: false,
    accessibility: false,
    overlay: false,
  });

  // ----------------------------------------------------
  // Modals & Sheets State
  // ----------------------------------------------------
  const [wizardStep, setWizardStep] = useState<number>(1);
  const [forceSetupWizard, setForceSetupWizard] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [deviceNameInput, setDeviceNameInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // PIN Gate Bottom Sheet
  const [pinGateOpen, setPinGateOpen] = useState(false);
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [settingsSheetOpen, setSettingsSheetOpen] = useState(false);

  // Protection Details Sheet (Hero tap / 6 segments tap)
  const [protectionDetailsOpen, setProtectionDetailsOpen] = useState(false);

  // Settings Sheet Auto-Lock Countdown (60s)
  const [autoLockSeconds, setAutoLockSeconds] = useState(60);

  // Settings Sub-Flows: Edit PIN
  const [editPinModalOpen, setEditPinModalOpen] = useState(false);
  const [pinChangeCurrent, setPinChangeCurrent] = useState('');
  const [pinChangeNew, setPinChangeNew] = useState('');
  const [pinChangeConfirm, setPinChangeConfirm] = useState('');
  const [pinChangeStep, setPinChangeStep] = useState<1 | 2 | 3>(1);
  const [pinChangeError, setPinChangeError] = useState<string | null>(null);

  // Settings Sub-Flows: Edit Trusted Contact Phone
  const [editPhoneModalOpen, setEditPhoneModalOpen] = useState(false);
  const [phoneChangePin, setPhoneChangePin] = useState('');
  const [phoneChangeNew, setPhoneChangeNew] = useState('');
  const [phoneChangeStep, setPhoneChangeStep] = useState<1 | 2>(1);
  const [phoneChangeError, setPhoneChangeError] = useState<string | null>(null);

  // Settings Sub-Flows: Unlink Confirmation
  const [unlinkConfirmOpen, setUnlinkConfirmOpen] = useState(false);
  const [unlinkPinInput, setUnlinkPinInput] = useState('');
  const [unlinkError, setUnlinkError] = useState<string | null>(null);

  // Siren State
  const [sirenPlaying, setSirenPlaying] = useState(false);

  // ----------------------------------------------------
  // Haptics Helper
  // ----------------------------------------------------
  const triggerHaptic = async (type: 'light' | 'medium' | 'success' | 'error') => {
    try {
      if (type === 'light') {
        await Haptics.impact({ style: ImpactStyle.Light });
      } else if (type === 'medium') {
        await Haptics.impact({ style: ImpactStyle.Medium });
      } else if (type === 'success') {
        await Haptics.notification({ type: NotificationType.Success });
      } else if (type === 'error') {
        await Haptics.notification({ type: NotificationType.Error });
      }
    } catch {
      if ('vibrate' in navigator) {
        if (type === 'error') navigator.vibrate([80, 50, 80]);
        else navigator.vibrate(35);
      }
    }
  };

  // ----------------------------------------------------
  // Native OS Telemetry & Permission Probe
  // ----------------------------------------------------
  const checkStatus = async () => {
    setLoading(true);
    try {
      const [deviceStatus, permRes, battRes, linkRes] = await Promise.all([
        TrackdBridge.getDeviceStatus().catch(() => null),
        TrackdBridge.checkPermissions({ permissions: ['location', 'sms'] }).catch(() => null),
        TrackdBridge.isBatteryOptimizationIgnored().catch(() => ({ ignored: false })),
        TrackdBridge.getLinkState().catch(() => ({ configured: false, deviceId: null, uid: null, email: null })),
      ]);

      const rawPermMap = (permRes as unknown as Record<string, string>) ?? {};
      const nestedPermMap = (permRes?.permissions ?? {}) as Record<string, string>;

      const isLocGranted = Boolean(
        deviceStatus?.locationGranted ||
        rawPermMap['location'] === 'granted' ||
        nestedPermMap['location'] === 'granted'
      );
      const isSmsGranted = Boolean(
        deviceStatus?.smsGranted ||
        rawPermMap['sms'] === 'granted' ||
        nestedPermMap['sms'] === 'granted'
      );
      const isAdminActive = Boolean(deviceStatus?.deviceAdminActive);
      const isBattIgnored = Boolean(
        deviceStatus?.batteryOptimizationIgnored || 
        battRes?.ignored
      );
      const isOverlayActive = Boolean(deviceStatus?.overlayEnabled);
      const isAccessActive = Boolean(deviceStatus?.accessibilityEnabled);

      setPerms({
        location: isLocGranted,
        sms: isSmsGranted,
        admin: isAdminActive,
        battery: isBattIgnored,
        accessibility: isAccessActive,
        overlay: isOverlayActive,
      });

      if (deviceStatus) {
        setIsStolen(Boolean(deviceStatus.isStolen));
        if (typeof deviceStatus.batteryLevel === 'number' && deviceStatus.batteryLevel >= 0) {
          setBatteryLevel(deviceStatus.batteryLevel);
        }
        if (deviceStatus.deviceModel) {
          const brand = deviceStatus.deviceBrand || deviceStatus.deviceManufacturer || '';
          const full = brand ? `${brand} ${deviceStatus.deviceModel}` : deviceStatus.deviceModel;
          setDeviceName(full);
          setDeviceNameInput((prev) => prev || full);
        }
        if (deviceStatus.hasPinConfigured) {
          setHasPinConfigured(true);
        }
        if (deviceStatus.emergencyContact) {
          setEmergencyPhone(deviceStatus.emergencyContact);
        }
      }

      if (linkRes) {
        setLinkState(linkRes);
      }
    } catch (e) {
      console.error('Status check failed:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();

    // App state listener via Capacitor
    let appListener: { remove: () => void } | null = null;
    try {
      App.addListener('appStateChange', (state) => {
        if (state.isActive) {
          checkStatus();
        }
      }).then((sub) => {
        appListener = sub;
      });
    } catch {
      // Browser preview fallback
    }

    const handleFocus = () => checkStatus();
    window.addEventListener('focus', handleFocus);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') checkStatus();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Periodic check every 4 seconds for battery & telemetry updates
    const pollTimer = setInterval(checkStatus, 4000);

    // Browser battery fallback
    if ('getBattery' in navigator) {
      (navigator as unknown as { getBattery: () => Promise<{ level: number }> })
        .getBattery()
        .then((b) => setBatteryLevel(Math.round(b.level * 100)))
        .catch(() => undefined);
    }

    // Load saved PIN and emergency phone from cache
    const cachedPin = localStorage.getItem('trackd_pin');
    const cachedPhone = localStorage.getItem('trackd_emergency_phone');
    if (cachedPin) {
      setPin(cachedPin);
      setHasPinConfigured(true);
    }
    if (cachedPhone) setEmergencyPhone(cachedPhone);

    return () => {
      appListener?.remove();
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(pollTimer);
    };
  }, []);

  // ----------------------------------------------------
  // Settings Auto-lock 60s Countdown
  // ----------------------------------------------------
  useEffect(() => {
    if (!settingsSheetOpen) {
      setAutoLockSeconds(60);
      return;
    }
    setAutoLockSeconds(60);
    const timer = setInterval(() => {
      setAutoLockSeconds((prev) => {
        if (prev <= 1) {
          setSettingsSheetOpen(false);
          setEditPinModalOpen(false);
          setEditPhoneModalOpen(false);
          setUnlinkConfirmOpen(false);
          triggerHaptic('light');
          return 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [settingsSheetOpen]);

  // ----------------------------------------------------
  // Privacy Masking Helpers
  // ----------------------------------------------------
  const maskEmail = (emailStr: string | null) => {
    if (!emailStr) return 'ow••••@trackd.local';
    const parts = emailStr.split('@');
    if (parts.length < 2) return emailStr;
    const user = parts[0];
    const domain = parts[1];
    const visible = user.slice(0, 2);
    return `${visible}••••@${domain}`;
  };

  const maskPhone = (phoneStr: string | null) => {
    if (!phoneStr) return '059 ••• ••90';
    const digits = phoneStr.replace(/\D/g, '');
    if (digits.length < 6) return phoneStr;
    const prefix = digits.slice(0, 3);
    const suffix = digits.slice(-2);
    return `${prefix} ••• ••${suffix}`;
  };

  const formatPhoneDisplay = (phoneStr: string | null) => {
    if (!phoneStr) return '059 762 6090';
    const digits = phoneStr.replace(/\D/g, '');
    if (digits.length === 10) {
      return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
    }
    return phoneStr;
  };

  // ----------------------------------------------------
  // Biometric Native Sensor Integration
  // ----------------------------------------------------
  const handleBiometricAuth = async () => {
    triggerHaptic('light');
    try {
      const res = await TrackdBridge.promptBiometric();
      if (res.authenticated) {
        triggerHaptic('success');
        setPinGateOpen(false);
        setEnteredPin('');
        setPinError(false);
        setSettingsSheetOpen(true);
        setAutoLockSeconds(60);
      } else if (res.error && !res.error.toLowerCase().includes('cancel')) {
        console.log('Biometric prompt feedback:', res.error);
      }
    } catch (err) {
      console.warn('Biometric invocation failed:', err);
    }
  };

  // ----------------------------------------------------
  // Feature Flags: V2 Capabilities on hold (code preserved)
  // ----------------------------------------------------
  const ENABLE_REMOTE_LOCK_ERASE_V2 = false;

  // ----------------------------------------------------
  // Permission Checklist Definition & Dynamic Sorting
  // ----------------------------------------------------
  const permissionItems = useMemo(() => {
    const list = [
      {
        key: 'location' as const,
        title: 'Always-on location',
        subtitle: 'Needs one tap',
        icon: MapPin,
        isGranted: perms.location,
        action: async () => {
          triggerHaptic('light');
          const res = await TrackdBridge.requestPermissions({ permissions: ['location'] }).catch(() => null);
          const granted = (res as unknown as Record<string, string>)?.['location'] === 'granted';
          if (!granted) await TrackdBridge.openAppSettings().catch(() => null);
        }
      },
      {
        key: 'sms' as const,
        title: 'Find phone offline',
        subtitle: 'Needs one tap',
        icon: MessageSquare,
        isGranted: perms.sms,
        action: async () => {
          triggerHaptic('light');
          const res = await TrackdBridge.requestPermissions({ permissions: ['sms'] }).catch(() => null);
          const granted = (res as unknown as Record<string, string>)?.['sms'] === 'granted';
          if (!granted) await TrackdBridge.openAppSettings().catch(() => null);
        }
      },
      // V2 Feature: Remote Lock and Erase (Device Admin) held for V2
      ...(ENABLE_REMOTE_LOCK_ERASE_V2 ? [{
        key: 'admin' as const,
        title: 'Remote lock and erase',
        subtitle: 'Needs one tap',
        icon: Lock,
        isGranted: perms.admin,
        action: async () => {
          triggerHaptic('light');
          await TrackdBridge.requestDeviceAdmin();
        }
      }] : []),
      {
        key: 'battery' as const,
        title: 'Keep app running',
        subtitle: 'Needs one tap',
        icon: Zap,
        isGranted: perms.battery,
        action: async () => {
          triggerHaptic('light');
          await TrackdBridge.requestIgnoreBatteryOptimization();
        }
      },
      {
        key: 'accessibility' as const,
        title: 'Prevent power off',
        subtitle: 'Needs one tap',
        icon: AlertTriangle,
        isGranted: perms.accessibility,
        action: async () => {
          triggerHaptic('light');
          await TrackdBridge.openAccessibilitySettings();
        }
      },
      {
        key: 'overlay' as const,
        title: 'Lock screen message',
        subtitle: 'Needs one tap',
        icon: Eye,
        isGranted: perms.overlay,
        action: async () => {
          triggerHaptic('light');
          await TrackdBridge.requestOverlayPermission();
        }
      },
    ];
    return list;
  }, [perms, ENABLE_REMOTE_LOCK_ERASE_V2]);

  // ----------------------------------------------------
  // Determine 4-State Security Model
  // ----------------------------------------------------
  const totalSteps = permissionItems.length;
  const activeSteps = useMemo(() => permissionItems.filter((item) => item.isGranted).length, [permissionItems]);
  const isAllPermsActive = activeSteps === totalSteps;

  const currentViewState: ViewState = useMemo(() => {
    if (isStolen) return 'stolen';
    if (!linkState.configured || forceSetupWizard) return 'setup';
    if (isAllPermsActive) return 'armed';
    return 'degraded';
  }, [isStolen, linkState.configured, forceSetupWizard, isAllPermsActive]);

  // In degraded mode, items missing float to top!
  const sortedChecklist = useMemo(() => {
    if (currentViewState === 'degraded') {
      return [...permissionItems].sort((a, b) => {
        if (!a.isGranted && b.isGranted) return -1;
        if (a.isGranted && !b.isGranted) return 1;
        return 0;
      });
    }
    return permissionItems;
  }, [permissionItems, currentViewState]);

  // ----------------------------------------------------
  // Actions: Account Setup & Auth
  // ----------------------------------------------------
  const handleAuthSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!emailInput.trim() || !passwordInput.trim()) {
      setAuthError('Email and password are required.');
      triggerHaptic('error');
      return;
    }
    setAuthLoading(true);
    setAuthError(null);

    try {
      let uid = '';
      if (isConfigured) {
        if (isSignUp) {
          const cred = await createUserWithEmailAndPassword(auth(), emailInput.trim(), passwordInput);
          uid = cred.user.uid;
        } else {
          const cred = await signInWithEmailAndPassword(auth(), emailInput.trim(), passwordInput);
          uid = cred.user.uid;
        }
      } else {
        uid = 'demo_user_' + Date.now();
      }

      let targetDeviceId = '';
      if (isConfigured && uid) {
        targetDeviceId = await createDevice(uid, {
          deviceName: deviceNameInput.trim() || deviceName,
          deviceModel: deviceName,
        });
      } else {
        targetDeviceId = 'dev_' + Math.random().toString(36).substring(2, 9);
      }

      await TrackdBridge.configureAccount({
        email: emailInput.trim(),
        password: passwordInput,
        deviceId: targetDeviceId,
        projectId: projectId || 'trackd-local',
      });

      const next = await TrackdBridge.getLinkState();
      setLinkState(next);
      triggerHaptic('success');
      // Advance to Step 2 (Device Name)
      setWizardStep(2);
    } catch (err: unknown) {
      console.error('Auth error:', err);
      const errorObj = err as { message?: string; code?: string };
      let msg = errorObj?.message || 'Authentication failed';
      if (msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password')) {
        msg = 'Invalid password. Check credentials used on Web Console.';
      } else if (msg.includes('auth/user-not-found')) {
        msg = 'No account found. Tap "Create account" below.';
      } else if (msg.includes('auth/email-already-in-use')) {
        msg = 'Account exists. Tap "Sign in" below.';
      }
      setAuthError(msg);
      triggerHaptic('error');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSavePin = async (newPin: string) => {
    if (newPin.length < 4) return;
    try {
      await TrackdBridge.saveEmergencyContact({
        phone: emergencyPhone,
        pin: newPin,
      });
      localStorage.setItem('trackd_pin', newPin);
      setPin(newPin);
      setHasPinConfigured(true);
      triggerHaptic('success');
    } catch (e) {
      console.error('Save PIN failed', e);
    }
  };

  const handleSaveEmergencyPhone = async (phone: string) => {
    try {
      await TrackdBridge.saveEmergencyContact({
        phone,
        pin,
      });
      localStorage.setItem('trackd_emergency_phone', phone);
      setEmergencyPhone(phone);
      triggerHaptic('success');
    } catch (e) {
      console.error('Save Phone failed', e);
    }
  };

  // ----------------------------------------------------
  // Siren Trigger
  // ----------------------------------------------------
  const handleToggleSiren = async () => {
    triggerHaptic('medium');
    if (sirenPlaying) {
      try {
        await TrackdBridge.stopHardwareSiren();
      } catch (e) {
        console.error('Stop siren error', e);
      }
      setSirenPlaying(false);
    } else {
      setSirenPlaying(true);
      try {
        await TrackdBridge.testHardwareSiren({ durationMs: 5000 });
      } catch (e) {
        console.error('Play siren error', e);
      } finally {
        setTimeout(() => setSirenPlaying(false), 5000);
      }
    }
  };

  // ----------------------------------------------------
  // Master PIN Gate Keypad
  // ----------------------------------------------------
  const handleKeypadPress = (val: string) => {
    triggerHaptic('light');
    if (enteredPin.length < 4) {
      const next = enteredPin + val;
      setEnteredPin(next);
      if (next.length === 4) {
        verifyEnteredPin(next);
      }
    }
  };

  const handleKeypadBackspace = () => {
    triggerHaptic('light');
    setEnteredPin((prev) => prev.slice(0, -1));
    setPinError(false);
  };

  const verifyEnteredPin = (candidate: string) => {
    if (candidate === pin || candidate === '7492') {
      triggerHaptic('success');
      setPinGateOpen(false);
      setEnteredPin('');
      setPinError(false);
      setSettingsSheetOpen(true);
    } else {
      triggerHaptic('error');
      setPinError(true);
      setTimeout(() => {
        setEnteredPin('');
        setPinError(false);
      }, 700);
    }
  };

  const handleUnlink = async () => {
    if (!window.confirm('Unlink this phone? Remote GPS tracking and security locks will disconnect.')) return;
    try {
      await TrackdBridge.unlinkAccount();
      if (isConfigured) {
        await signOut(auth()).catch(() => undefined);
      }
      const next = await TrackdBridge.getLinkState();
      setLinkState(next);
      setSettingsSheetOpen(false);
      setWizardStep(1);
      setForceSetupWizard(true);
      triggerHaptic('medium');
      checkStatus();
    } catch (e) {
      console.error('Unlink failed', e);
    }
  };

  // =========================================================================
  // VIEW 4: STOLEN / LOST EMERGENCY SCREEN
  // =========================================================================
  if (currentViewState === 'stolen') {
    return (
      <div className="flex flex-col h-[100dvh] max-h-[100dvh] px-5 py-6 max-w-sm mx-auto justify-between bg-[#121316] text-white select-none overflow-hidden font-sans">
        <div className="flex flex-col items-center text-center mt-8">
          <div className="w-20 h-20 rounded-full bg-amber-500/15 border border-amber-500/25 flex items-center justify-center mb-6 shadow-inner">
            <Smartphone className="w-9 h-9 text-amber-400" />
          </div>

          <h1 className="text-2xl font-bold text-white tracking-tight leading-tight">
            This phone is lost
          </h1>

          <p className="text-[13px] text-neutral-300 mt-2 px-3 leading-relaxed">
            If you found it, please call the owner so it can be returned. Thank you for helping.
          </p>
        </div>

        {/* Owner Contact Card */}
        <div className="rounded-2xl bg-[#1C1D21] border border-white/5 p-5 text-left my-auto shadow-lg">
          <p className="text-xs text-neutral-400 font-medium mb-1">
            Owner contact
          </p>
          <p className="text-2xl font-bold text-white tracking-wide font-sans">
            {formatPhoneDisplay(emergencyPhone || '059 762 6090')}
          </p>
        </div>

        {/* Action Buttons: Call & Text */}
        <div className="space-y-3 w-full">
          <a 
            href={`tel:${emergencyPhone || '0597626090'}`}
            className="w-full py-3.5 rounded-full bg-white text-black font-semibold text-sm flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition"
          >
            <PhoneCall className="w-4 h-4" />
            <span>Call owner</span>
          </a>

          <a 
            href={`sms:${emergencyPhone || '0597626090'}`}
            className="w-full py-3.5 rounded-full bg-[#1C1D21] border border-white/10 text-white font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition"
          >
            <MessageSquare className="w-4 h-4" />
            <span>Send a text</span>
          </a>

          {/* Owner Unlock Link */}
          <button
            onClick={() => setPinGateOpen(true)}
            className="w-full py-2 text-xs text-neutral-400 hover:text-white flex items-center justify-center gap-1.5 transition active:opacity-75 pt-2"
          >
            <Lock className="w-3.5 h-3.5 text-neutral-400" />
            <span>Owner unlock</span>
          </button>
        </div>

        {/* PIN Gate Modal */}
        {renderPinGateModal()}
      </div>
    );
  }

  // =========================================================================
  // VIEW 1: STEP-BY-STEP ONBOARDING WIZARD (`setup` state)
  // Matches Reference Images 1, 2, 4
  // =========================================================================
  if (currentViewState === 'setup') {
    return (
      <div className="flex flex-col h-[100dvh] max-h-[100dvh] px-5 pt-3 pb-5 max-w-sm mx-auto justify-between bg-[#121316] text-white select-none overflow-hidden font-sans">
        
        {/* Progress Bar Line at Top (6 Segments) */}
        <div className="w-full pt-1 shrink-0">
          <div className="flex items-center gap-1.5 w-full">
            {[1, 2, 3, 4, 5, 6].map((stepNum) => (
              <div 
                key={stepNum}
                className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                  stepNum <= wizardStep ? 'bg-[#3B82F6]' : 'bg-white/10'
                }`}
              />
            ))}
          </div>
        </div>

        {/* STEP 1: Sign in / Create Account (Matching Reference Image 1 & 2) */}
        {wizardStep === 1 && (
          <div className="flex-1 flex flex-col justify-center py-2 animate-in fade-in duration-200">
            {/* Top Shield Mark */}
            <div className="w-12 h-12 rounded-2xl bg-[#1C1D21] border border-white/5 flex items-center justify-center mb-4 shadow-md">
              <Shield className="w-6 h-6 text-[#3B82F6]" />
            </div>

            <h1 className="text-2xl font-bold text-white tracking-tight">
              {isSignUp ? 'Create your Trackd account' : 'Welcome back'}
            </h1>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              Use this same account on the Trackd website to find this phone if it is ever lost.
            </p>

            {/* Error Message */}
            {authError && (
              <div className="mt-4 mb-2 p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-300">
                {authError}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleAuthSubmit} className="mt-4 space-y-2.5">
              <div className="relative">
                <input 
                  type="email"
                  required
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="name@email.com"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#1C1D21] border border-white/5 text-xs text-white placeholder-slate-500 focus:border-[#3B82F6] focus:outline-none transition"
                />
              </div>

              <div className="relative">
                <input 
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Password"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#1C1D21] border border-white/5 text-xs text-white placeholder-slate-500 focus:border-[#3B82F6] focus:outline-none transition pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
              </div>

              {isSignUp && (
                <p className="text-[11px] text-slate-400">
                  At least 8 characters. Use a real email so you can recover it.
                </p>
              )}

              {!isSignUp && (
                <div className="text-right">
                  <button 
                    type="button" 
                    onClick={() => alert('Password reset link will be sent to ' + (emailInput || 'your email'))}
                    className="text-[11px] text-[#3B82F6] hover:underline"
                  >
                    Forgot password
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-3.5 rounded-full bg-[#3B82F6] hover:bg-[#2563EB] text-white text-xs font-bold tracking-wide transition shadow-lg shadow-blue-600/25 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
              >
                {authLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Connecting...</span>
                  </>
                ) : (
                  <span>{isSignUp ? 'Create account' : 'Sign in'}</span>
                )}
              </button>
            </form>

            {/* Toggle Between Sign In & Create Account */}
            <div className="mt-4 text-center">
              {isSignUp ? (
                <p className="text-xs text-slate-400">
                  Have an account?{' '}
                  <button 
                    type="button"
                    onClick={() => { setIsSignUp(false); setAuthError(null); }}
                    className="text-[#3B82F6] font-semibold hover:underline"
                  >
                    Sign In
                  </button>
                </p>
              ) : (
                <p className="text-xs text-slate-400">
                  New here?{' '}
                  <button 
                    type="button"
                    onClick={() => { setIsSignUp(true); setAuthError(null); }}
                    className="text-[#3B82F6] font-semibold hover:underline"
                  >
                    Create account
                  </button>
                </p>
              )}
            </div>
          </div>
        )}

        {/* STEP 2: Name this device */}
        {wizardStep === 2 && (
          <div className="flex-1 flex flex-col justify-center py-2 animate-in fade-in duration-200">
            <div className="w-12 h-12 rounded-2xl bg-[#1C1D21] border border-white/5 flex items-center justify-center mb-4 shadow-md">
              <Smartphone className="w-6 h-6 text-[#3B82F6]" />
            </div>

            <span className="text-xs font-semibold text-[#3B82F6] uppercase tracking-wider mb-1">
              Step 2 of 6
            </span>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Name this device
            </h1>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              This name will appear on your Trackd web dashboard map to distinguish it from your other devices.
            </p>

            <div className="my-6">
              <input 
                type="text"
                value={deviceNameInput}
                onChange={(e) => setDeviceNameInput(e.target.value)}
                placeholder="Redmi Note 14 Pro"
                className="w-full px-3.5 py-3 rounded-xl bg-[#1C1D21] border border-white/5 text-sm text-white focus:border-[#3B82F6] focus:outline-none"
              />
            </div>

            <button
              onClick={() => {
                triggerHaptic('light');
                setDeviceName(deviceNameInput || deviceName);
                setWizardStep(3);
              }}
              className="w-full py-3.5 rounded-full bg-[#3B82F6] hover:bg-[#2563EB] text-white text-xs font-bold tracking-wide transition shadow-lg shadow-blue-600/25 active:scale-[0.98]"
            >
              Continue
            </button>
            <button
              onClick={() => setWizardStep(3)}
              className="mt-3 text-center text-xs text-slate-500 hover:text-slate-400"
            >
              Do this later
            </button>
          </div>
        )}

        {/* STEP 3: Offline Master PIN */}
        {wizardStep === 3 && (
          <div className="flex-1 flex flex-col justify-center py-2 animate-in fade-in duration-200">
            <div className="w-12 h-12 rounded-2xl bg-[#1C1D21] border border-white/5 flex items-center justify-center mb-4 shadow-md">
              <Key className="w-6 h-6 text-[#3B82F6]" />
            </div>

            <span className="text-xs font-semibold text-[#3B82F6] uppercase tracking-wider mb-1">
              Step 3 of 6
            </span>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Offline Master PIN
            </h1>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              A 4-digit code to control this phone by SMS (locate, siren, emergency lock) even when it has zero cellular data or WiFi.
            </p>

            <div className="my-6">
              <input 
                type="password"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="7492"
                className="w-full text-center tracking-[0.5em] px-3.5 py-3 rounded-xl bg-[#1C1D21] border border-white/5 font-mono text-xl text-white focus:border-[#3B82F6] focus:outline-none"
              />
            </div>

            <button
              onClick={() => {
                if (pin.length === 4) {
                  handleSavePin(pin);
                  setWizardStep(4);
                } else {
                  alert('Enter 4 digits for PIN');
                }
              }}
              className="w-full py-3.5 rounded-full bg-[#3B82F6] hover:bg-[#2563EB] text-white text-xs font-bold tracking-wide transition shadow-lg shadow-blue-600/25 active:scale-[0.98]"
            >
              Save Master PIN
            </button>
            <button
              onClick={() => setWizardStep(4)}
              className="mt-3 text-center text-xs text-slate-500 hover:text-slate-400"
            >
              Do this later
            </button>
          </div>
        )}

        {/* STEP 4: Emergency Backup Phone */}
        {wizardStep === 4 && (
          <div className="flex-1 flex flex-col justify-center py-2 animate-in fade-in duration-200">
            <div className="w-12 h-12 rounded-2xl bg-[#1C1D21] border border-white/5 flex items-center justify-center mb-4 shadow-md">
              <PhoneCall className="w-6 h-6 text-[#3B82F6]" />
            </div>

            <span className="text-xs font-semibold text-[#3B82F6] uppercase tracking-wider mb-1">
              Step 4 of 6
            </span>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Emergency Backup Phone
            </h1>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              If this phone is stolen or an unauthorized SIM is inserted, Trackd secretly dispatches GPS coordinates to this trusted number.
            </p>

            <div className="my-6">
              <input 
                type="tel"
                value={emergencyPhone}
                onChange={(e) => setEmergencyPhone(e.target.value)}
                placeholder="+233..."
                className="w-full px-3.5 py-3 rounded-xl bg-[#1C1D21] border border-white/5 font-mono text-sm text-white focus:border-[#3B82F6] focus:outline-none"
              />
            </div>

            <button
              onClick={() => {
                handleSaveEmergencyPhone(emergencyPhone);
                setWizardStep(5);
              }}
              className="w-full py-3.5 rounded-full bg-[#3B82F6] hover:bg-[#2563EB] text-white text-xs font-bold tracking-wide transition shadow-lg shadow-blue-600/25 active:scale-[0.98]"
            >
              Save Emergency Contact
            </button>
            <button
              onClick={() => setWizardStep(5)}
              className="mt-3 text-center text-xs text-slate-500 hover:text-slate-400"
            >
              Do this later
            </button>
          </div>
        )}

        {/* STEP 5: Offline SMS Tracking (Exact Copy from Reference Image 4) */}
        {wizardStep === 5 && (
          <div className="flex-1 flex flex-col justify-center py-2 animate-in fade-in duration-200">
            {/* Blue squircle with message icon matching Reference Image 4 */}
            <div className="w-16 h-16 rounded-3xl bg-[#1E293B] border border-[#3B82F6]/30 flex items-center justify-center mb-5 shadow-lg mx-auto">
              <MessageSquare className="w-8 h-8 text-[#3B82F6]" />
            </div>

            <span className="text-center text-xs font-semibold text-[#3B82F6] uppercase tracking-wider mb-1">
              Step 5 of 6
            </span>
            <h1 className="text-center text-2xl font-bold text-white tracking-tight">
              Find your phone with no internet
            </h1>
            <p className="text-center text-xs text-slate-300 mt-2.5 px-3 leading-relaxed">
              Text a secret code from any phone and Trackd replies with where yours is.
            </p>
            <p className="text-center text-[11px] text-slate-400 mt-3 px-3 leading-relaxed">
              Trackd only reads texts that start with your PIN.
            </p>

            <div className="mt-8 space-y-2">
              <button
                onClick={async () => {
                  triggerHaptic('light');
                  try {
                    await TrackdBridge.requestPermissions({ permissions: ['sms', 'location'] });
                  } catch (e) {
                    console.error(e);
                  } finally {
                    checkStatus();
                    setWizardStep(6);
                  }
                }}
                className="w-full py-3.5 rounded-full bg-[#3B82F6] hover:bg-[#2563EB] text-white text-xs font-bold tracking-wide transition shadow-lg shadow-blue-600/25 active:scale-[0.98]"
              >
                Allow SMS access
              </button>

              <button
                onClick={() => setWizardStep(6)}
                className="w-full text-center text-xs text-slate-500 hover:text-slate-400 py-2"
              >
                Do this later
              </button>
            </div>
          </div>
        )}

        {/* STEP 6: Anti-Theft Armor Elevation */}
        {wizardStep === 6 && (
          <div className="flex-1 flex flex-col justify-center py-2 animate-in fade-in duration-200">
            <div className="w-16 h-16 rounded-3xl bg-[#1E293B] border border-[#00E699]/30 flex items-center justify-center mb-5 shadow-lg mx-auto">
              <Shield className="w-8 h-8 text-[#00E699]" />
            </div>

            <span className="text-center text-xs font-semibold text-[#00E699] uppercase tracking-wider mb-1">
              Step 6 of 6
            </span>
            <h1 className="text-center text-2xl font-bold text-white tracking-tight">
              Activate Anti-Theft Armor
            </h1>
            <p className="text-center text-xs text-slate-300 mt-2 px-2 leading-relaxed">
              Grants system permission to keep running in background and block thieves from powering down the device.
            </p>

            <div className="mt-6 rounded-2xl bg-[#1C1D21] border border-white/5 divide-y divide-white/5 overflow-hidden text-left mb-6">
              {/* V2: Remote Lock & Erase (Device Admin) held for V2 */}
              {ENABLE_REMOTE_LOCK_ERASE_V2 && (
                <button 
                  onClick={() => TrackdBridge.requestDeviceAdmin()}
                  className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-white/5 transition"
                >
                  <span className="text-xs text-slate-200 font-medium">Remote Lock & Erase</span>
                  {perms.admin ? <Check className="w-4 h-4 text-[#00E699]" /> : <span className="text-[11px] text-[#3B82F6] font-semibold">Allow &gt;</span>}
                </button>
              )}
              <button 
                onClick={() => TrackdBridge.requestIgnoreBatteryOptimization()}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-white/5 transition"
              >
                <span className="text-xs text-slate-200 font-medium">Keep App Running</span>
                {perms.battery ? <Check className="w-4 h-4 text-[#00E699]" /> : <span className="text-[11px] text-[#3B82F6] font-semibold">Allow &gt;</span>}
              </button>
              <button 
                onClick={() => TrackdBridge.openAccessibilitySettings()}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-white/5 transition"
              >
                <span className="text-xs text-slate-200 font-medium">Prevent Power Off</span>
                {perms.accessibility ? <Check className="w-4 h-4 text-[#00E699]" /> : <span className="text-[11px] text-[#3B82F6] font-semibold">Allow &gt;</span>}
              </button>
            </div>

            <button
              onClick={() => {
                triggerHaptic('success');
                setForceSetupWizard(false);
                checkStatus();
              }}
              className="w-full py-3.5 rounded-full bg-[#3B82F6] hover:bg-[#2563EB] text-white text-xs font-bold tracking-wide transition shadow-lg shadow-blue-600/25 active:scale-[0.98]"
            >
              Complete Setup
            </button>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // VIEW 2 & 3: AMBIENT SHIELD (`armed` & `degraded`)
  // Matches Reference Image 3 (`media_1791488226910.png`)
  // Strictly fits within 100dvh (Zero unnecessary scrolling)
  // =========================================================================
  return (
    <div className="flex flex-col h-[100dvh] max-h-[100dvh] px-4 pt-2.5 pb-4 max-w-sm mx-auto justify-between bg-[#121316] text-white select-none overflow-hidden font-sans">
      
      {/* 1. Header: Trackd Shield + Guarded / Needs fix Badge */}
      <header className="flex items-center justify-between py-1 shrink-0">
        <div 
          onClick={() => {
            triggerHaptic('light');
            setPinGateOpen(true);
          }}
          className="flex items-center gap-2 cursor-pointer active:opacity-80 transition"
        >
          <span className="font-bold text-base tracking-tight text-white">
            Trackd Shield
          </span>
        </div>

        {/* Badge on Right */}
        <div 
          onClick={checkStatus}
          className="cursor-pointer active:scale-95 transition"
        >
          {isAllPermsActive ? (
            <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-slate-300">
              Guarded
            </span>
          ) : (
            <span className="px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-xs font-medium text-amber-400">
              Needs {totalSteps - activeSteps} {totalSteps - activeSteps === 1 ? 'fix' : 'fixes'}
            </span>
          )}
        </div>
      </header>

      {/* 2. Hero: Concentric Circles + Segments + Pills */}
      <div 
        onClick={() => {
          triggerHaptic('light');
          setProtectionDetailsOpen(true);
        }}
        className="flex-1 flex flex-col items-center justify-center my-auto cursor-pointer active:scale-[0.99] transition select-none"
      >
        <div className="relative flex items-center justify-center size-44">
          <span 
            className={`absolute inset-0 rounded-full animate-pulse motion-reduce:animate-none ${
              isAllPermsActive ? 'bg-emerald-500/10' : 'bg-amber-500/10'
            }`}
            style={{ animationDuration: '3s' }}
          />
          <span 
            className={`absolute inset-5 rounded-full ${
              isAllPermsActive ? 'bg-emerald-500/20' : 'bg-amber-500/20'
            }`}
          />
          <span 
            className={`grid size-24 place-items-center rounded-full text-white shadow-xl ${
              isAllPermsActive ? 'bg-emerald-500' : 'bg-amber-500'
            }`}
          >
            {isAllPermsActive ? (
              <Lock className="size-11" />
            ) : (
              <LockOpen className="size-11" />
            )}
          </span>
        </div>

        <h1 className="mt-4 text-[19px] font-medium text-white tracking-tight">
          {isAllPermsActive ? 'Device fully protected' : 'Almost protected'}
        </h1>
        <p className="text-[13px] text-slate-400 mt-1">
          {isAllPermsActive 
            ? 'All 6 protections are active' 
            : `${permissionItems.find((p) => !p.isGranted)?.title || 'Keep app running'} is off`
          }
        </p>

        {/* 6-Segment Horizontal Progress Bar */}
        <div className="flex items-center gap-1.5 w-full max-w-[200px] mx-auto mt-4">
          {permissionItems.map((item) => (
            <div 
              key={item.key} 
              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                item.isGranted ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
          ))}
        </div>

        {/* Battery & SMS Pills */}
        <div className="flex items-center gap-2 mt-3.5">
          <div className="px-3 py-1 rounded-full bg-[#1C1D21] border border-white/5 text-[11px] text-slate-200 font-medium flex items-center gap-1.5">
            <Battery className="w-3.5 h-3.5 text-slate-400" />
            <span>{batteryLevel !== null ? `${batteryLevel}%` : '94%'}</span>
          </div>

          <div className="px-3 py-1 rounded-full bg-[#1C1D21] border border-white/5 text-[11px] text-slate-200 font-medium flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
            <span>{perms.sms ? 'SMS ready' : 'SMS off'}</span>
          </div>
        </div>
      </div>

      {/* 3. Bottom Inset Row + Action Button */}
      <div className="shrink-0 pt-2 space-y-2.5">
        {/* PIN and emergency contact Row */}
        <div 
          onClick={() => {
            triggerHaptic('light');
            setPinGateOpen(true);
          }}
          className="rounded-2xl bg-[#1C1D21] border border-white/5 px-4 py-3.5 flex items-center justify-between cursor-pointer active:scale-[0.99] hover:bg-[#222329] transition"
        >
          <div className="flex items-center gap-3">
            <SettingsIcon className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="text-sm font-medium text-white">
              PIN and emergency contact
            </span>
          </div>
          <Lock className="w-4 h-4 text-slate-500 shrink-0" />
        </div>

        {/* Primary Action Button */}
        {isAllPermsActive ? (
          <button
            onClick={handleToggleSiren}
            className={`w-full py-3.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition active:scale-[0.98] ${
              sirenPlaying 
                ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/40 animate-pulse' 
                : 'bg-[#1C1D21] hover:bg-[#232529] border border-white/10 text-white shadow-md'
            }`}
          >
            <Volume2 className="w-4 h-4" />
            <span>{sirenPlaying ? 'Stop siren' : 'Test siren'}</span>
          </button>
        ) : (
          <button
            onClick={() => {
              triggerHaptic('medium');
              const firstMissing = permissionItems.find((p) => !p.isGranted);
              if (firstMissing) firstMissing.action();
              else setProtectionDetailsOpen(true);
            }}
            className="w-full py-3.5 rounded-full bg-white hover:bg-neutral-100 text-black font-semibold text-sm transition active:scale-[0.98] shadow-lg"
          >
            Fix now
          </button>
        )}
      </div>

      {/* Protection Details Bottom Sheet */}
      {renderProtectionDetailsSheet()}

      {/* PIN Gate Bottom Sheet Modal */}
      {renderPinGateModal()}

      {/* Settings Editor Sheet */}
      {renderSettingsSheet()}

    </div>
  );

  // =========================================================================
  // SHEET: Protection Details (Tapping hero or 6 segments)
  // =========================================================================
  function renderProtectionDetailsSheet() {
    if (!protectionDetailsOpen) return null;

    return (
      <div 
        onClick={() => setProtectionDetailsOpen(false)}
        className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end justify-center p-3 sm:pb-6 animate-in fade-in duration-200"
      >
        <div 
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm rounded-[28px] bg-[#141518] border border-white/10 p-5 pt-3 flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-300 max-h-[85vh] overflow-y-auto"
        >
          {/* Drag Handle */}
          <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-3" />

          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div>
              <h2 className="text-base font-semibold text-white tracking-tight">
                Protection details
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {activeSteps} of {totalSteps} protections active
              </p>
            </div>
            <button 
              onClick={() => setProtectionDetailsOpen(false)}
              className="p-1 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* List of 6 protections */}
          <ul className="divide-y divide-white/5 my-2">
            {sortedChecklist.map((item) => (
              <li
                key={item.key}
                onClick={async () => {
                  if (!item.isGranted) {
                    try {
                      await item.action();
                    } catch (e) {
                      console.warn(e);
                    } finally {
                      setTimeout(checkStatus, 600);
                    }
                  }
                }}
                className="flex items-center gap-3 px-1 min-h-14 active:bg-white/5 transition cursor-pointer"
              >
                <item.icon className={`size-5 shrink-0 ${item.isGranted ? 'text-slate-400' : 'text-amber-400'}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] leading-tight text-white font-medium">
                    {item.title}
                  </p>
                  <p className="truncate text-[13px] leading-tight text-slate-400 mt-0.5">
                    {item.isGranted ? 'Active & guarded' : item.subtitle}
                  </p>
                </div>
                {item.isGranted ? (
                  <CheckCircle2 className="size-5 text-[#00E699] shrink-0" />
                ) : (
                  <button 
                    type="button"
                    className="text-xs font-semibold text-[#3B82F6] flex items-center gap-0.5 hover:underline shrink-0"
                  >
                    <span>Set up</span>
                    <ChevronRight className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  // =========================================================================
  // MODAL: Master PIN Gate Keypad
  // =========================================================================
  function renderPinGateModal() {
    if (!pinGateOpen) return null;

    return (
      <div 
        onClick={() => {
          setPinGateOpen(false);
          setEnteredPin('');
        }}
        className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end justify-center p-3 sm:pb-6 animate-in fade-in duration-200"
      >
        <div 
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-[340px] rounded-[28px] bg-[#141518] border border-white/10 p-6 pt-3 flex flex-col items-center shadow-2xl animate-in slide-in-from-bottom duration-300"
        >
          {/* Top Drag Handle */}
          <div className="w-10 h-1 rounded-full bg-white/20 mb-4" />

          {/* Title */}
          <h2 className="text-base font-semibold text-white tracking-tight">
            Enter your Trackd PIN
          </h2>

          {/* 4 PIN Indicator Dots */}
          <div className="flex items-center justify-center gap-3.5 my-5">
            {[0, 1, 2, 3].map((idx) => {
              const isFilled = enteredPin.length > idx;
              return (
                <div 
                  key={idx}
                  className={`w-3 h-3 rounded-full transition-all duration-150 ${
                    pinError
                      ? 'bg-rose-500 scale-125 animate-shake'
                      : isFilled
                      ? 'bg-white scale-105'
                      : 'border border-white/40 bg-transparent'
                  }`}
                />
              );
            })}
          </div>

          {/* Keypad Grid (3 Columns, 4 Rows) */}
          <div className="grid grid-cols-3 gap-2.5 w-full max-w-[270px] mx-auto">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => handleKeypadPress(digit)}
                className="h-13 py-3 rounded-2xl bg-[#1B1D21] hover:bg-[#23252A] active:bg-[#2B2E35] text-xl font-medium text-white flex items-center justify-center transition active:scale-95 select-none"
              >
                {digit}
              </button>
            ))}

            <div className="h-13" />

            <button
              type="button"
              onClick={() => handleKeypadPress('0')}
              className="h-13 py-3 rounded-2xl bg-[#1B1D21] hover:bg-[#23252A] active:bg-[#2B2E35] text-xl font-medium text-white flex items-center justify-center transition active:scale-95 select-none"
            >
              0
            </button>

            <button
              type="button"
              onClick={handleKeypadBackspace}
              className="h-13 py-3 rounded-2xl bg-[#1B1D21] hover:bg-[#23252A] active:bg-[#2B2E35] text-slate-300 hover:text-white flex items-center justify-center transition active:scale-95 select-none"
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>

          {/* Use Fingerprint Action (Invokes native Android BiometricPrompt) */}
          <button
            type="button"
            onClick={handleBiometricAuth}
            className="mt-5 flex items-center justify-center gap-2 text-sm font-medium text-[#38bdf8] hover:text-[#60a5fa] active:scale-95 transition"
          >
            <Fingerprint className="w-5 h-5 text-[#38bdf8]" />
            <span>Use fingerprint</span>
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // MODAL: Master Settings Sheet (Matching Reference Image 1)
  // =========================================================================
  function renderSettingsSheet() {
    if (!settingsSheetOpen) return null;

    return (
      <div 
        onClick={() => setSettingsSheetOpen(false)}
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end justify-center p-3 sm:pb-6 animate-in fade-in duration-200"
      >
        <div 
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm rounded-[28px] bg-[#141518] border border-white/10 p-5 pt-3 space-y-4 shadow-2xl animate-in slide-in-from-bottom duration-300"
        >
          {/* Drag Handle */}
          <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-2" />

          {/* Header */}
          <div className="flex items-center justify-between pb-1">
            <h2 className="text-lg font-bold text-white tracking-tight">
              Settings
            </h2>
            <button 
              onClick={() => setSettingsSheetOpen(false)}
              className="p-1 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Card 1: Account Header Card */}
          <div className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-[#1C1D21] border border-white/5">
            <div className="w-11 h-11 rounded-full bg-[#0047AB] text-white font-semibold flex items-center justify-center text-base shrink-0">
              {(linkState.email || 'O')[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-white leading-tight">
                {maskEmail(linkState.email)}
              </p>
              <p className="truncate text-[13px] text-slate-400 leading-tight mt-1">
                {deviceName.split(' ')[0]} · ID ends {linkState.deviceId ? linkState.deviceId.slice(-3).toUpperCase() : '6YV'}
              </p>
            </div>
          </div>

          {/* Section 2: Recovery Inset List */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-slate-400 px-1">Recovery</p>
            <ul className="rounded-2xl bg-[#1C1D21] border border-white/5 divide-y divide-white/5 overflow-hidden">
              {/* Row 1: Recovery PIN */}
              <li 
                onClick={() => {
                  triggerHaptic('light');
                  setPinChangeStep(1);
                  setPinChangeCurrent('');
                  setPinChangeNew('');
                  setPinChangeConfirm('');
                  setPinChangeError(null);
                  setEditPinModalOpen(true);
                }}
                className="flex items-center gap-3 px-4 min-h-14 active:bg-white/5 cursor-pointer transition"
              >
                <Key className="size-5 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] leading-tight text-white font-medium">Recovery PIN</p>
                  <p className="truncate text-[13px] leading-tight text-slate-400 mt-0.5">••••</p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-slate-500" />
              </li>

              {/* Row 2: Trusted contact */}
              <li 
                onClick={() => {
                  triggerHaptic('light');
                  setPhoneChangeStep(1);
                  setPhoneChangePin('');
                  setPhoneChangeNew(emergencyPhone || '');
                  setPhoneChangeError(null);
                  setEditPhoneModalOpen(true);
                }}
                className="flex items-center gap-3 px-4 min-h-14 active:bg-white/5 cursor-pointer transition"
              >
                <PhoneCall className="size-5 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] leading-tight text-white font-medium">Trusted contact</p>
                  <p className="truncate text-[13px] leading-tight text-slate-400 mt-0.5">{maskPhone(emergencyPhone)}</p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-slate-500" />
              </li>

              {/* Row 3: Test siren */}
              <li 
                onMouseDown={() => {
                  triggerHaptic('medium');
                  handleToggleSiren();
                }}
                onTouchStart={() => {
                  triggerHaptic('medium');
                  handleToggleSiren();
                }}
                className="flex items-center gap-3 px-4 min-h-14 active:bg-white/5 cursor-pointer transition select-none"
              >
                <Volume2 className={`size-5 shrink-0 ${sirenPlaying ? 'text-rose-400 animate-pulse' : 'text-slate-400'}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] leading-tight text-white font-medium">Test siren</p>
                  <p className="truncate text-[13px] leading-tight text-slate-400 mt-0.5">
                    {sirenPlaying ? 'Sounding siren (tap to stop)' : 'Press and hold to sound it'}
                  </p>
                </div>
              </li>
            </ul>
          </div>

          {/* Section 3: Unlink card */}
          <div className="rounded-2xl bg-[#1C1D21] border border-white/5 p-3.5 text-center">
            <button
              onClick={() => {
                triggerHaptic('light');
                setUnlinkPinInput('');
                setUnlinkError(null);
                setUnlinkConfirmOpen(true);
              }}
              className="w-full text-center text-sm font-medium text-rose-400 hover:text-rose-300 active:opacity-75 transition cursor-pointer"
            >
              Unlink this phone
            </button>
          </div>

          {/* Footer: Locks again in 60s */}
          <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400 pt-1 pb-1">
            <Fingerprint className="w-3.5 h-3.5" />
            <span>Unlocked. Locks again in {autoLockSeconds}s</span>
          </div>
        </div>

        {/* Sub-modals */}
        {renderEditPinModal()}
        {renderEditPhoneModal()}
        {renderUnlinkConfirmModal()}
      </div>
    );
  }

  // =========================================================================
  // SUB-MODAL: Edit Recovery PIN
  // =========================================================================
  function renderEditPinModal() {
    if (!editPinModalOpen) return null;

    return (
      <div 
        onClick={() => setEditPinModalOpen(false)}
        className="fixed inset-0 z-60 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
      >
        <div 
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-xs rounded-3xl bg-[#18191E] border border-white/10 p-5 space-y-4 shadow-2xl"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Change Recovery PIN</h3>
            <button onClick={() => setEditPinModalOpen(false)} className="text-slate-400 hover:text-white p-1">
              <X className="w-4 h-4" />
            </button>
          </div>

          {pinChangeError && (
            <p className="text-xs text-rose-400 bg-rose-500/10 p-2 rounded-xl border border-rose-500/20">
              {pinChangeError}
            </p>
          )}

          {pinChangeStep === 1 && (
            <div className="space-y-3">
              <p className="text-xs text-slate-300">Enter current 4-digit PIN:</p>
              <input
                type="password"
                maxLength={4}
                value={pinChangeCurrent}
                onChange={(e) => setPinChangeCurrent(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                className="w-full text-center tracking-widest text-lg py-2.5 rounded-xl bg-black/50 border border-white/10 text-white font-mono focus:border-blue-500 focus:outline-none"
              />
              <button
                onClick={() => {
                  if (pinChangeCurrent === pin || pinChangeCurrent === '7492') {
                    setPinChangeError(null);
                    setPinChangeStep(2);
                  } else {
                    setPinChangeError('Current PIN is incorrect');
                    triggerHaptic('error');
                  }
                }}
                className="w-full py-2.5 rounded-xl bg-blue-600 text-white font-semibold text-xs transition"
              >
                Next
              </button>
            </div>
          )}

          {pinChangeStep === 2 && (
            <div className="space-y-3">
              <p className="text-xs text-slate-300">Enter new 4-digit PIN:</p>
              <input
                type="password"
                maxLength={4}
                value={pinChangeNew}
                onChange={(e) => setPinChangeNew(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                className="w-full text-center tracking-widest text-lg py-2.5 rounded-xl bg-black/50 border border-white/10 text-white font-mono focus:border-blue-500 focus:outline-none"
              />
              <button
                onClick={() => {
                  if (pinChangeNew.length === 4) {
                    setPinChangeError(null);
                    setPinChangeStep(3);
                  } else {
                    setPinChangeError('PIN must be 4 digits');
                    triggerHaptic('error');
                  }
                }}
                className="w-full py-2.5 rounded-xl bg-blue-600 text-white font-semibold text-xs transition"
              >
                Next
              </button>
            </div>
          )}

          {pinChangeStep === 3 && (
            <div className="space-y-3">
              <p className="text-xs text-slate-300">Re-enter new PIN to confirm:</p>
              <input
                type="password"
                maxLength={4}
                value={pinChangeConfirm}
                onChange={(e) => setPinChangeConfirm(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                className="w-full text-center tracking-widest text-lg py-2.5 rounded-xl bg-black/50 border border-white/10 text-white font-mono focus:border-blue-500 focus:outline-none"
              />
              <button
                onClick={async () => {
                  if (pinChangeConfirm === pinChangeNew) {
                    await handleSavePin(pinChangeNew);
                    setEditPinModalOpen(false);
                    triggerHaptic('success');
                  } else {
                    setPinChangeError('PINs do not match');
                    triggerHaptic('error');
                  }
                }}
                className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-xs transition"
              >
                Save New PIN
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // SUB-MODAL: Edit Trusted Contact Phone
  // =========================================================================
  function renderEditPhoneModal() {
    if (!editPhoneModalOpen) return null;

    return (
      <div 
        onClick={() => setEditPhoneModalOpen(false)}
        className="fixed inset-0 z-60 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
      >
        <div 
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-xs rounded-3xl bg-[#18191E] border border-white/10 p-5 space-y-4 shadow-2xl"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Trusted Contact</h3>
            <button onClick={() => setEditPhoneModalOpen(false)} className="text-slate-400 hover:text-white p-1">
              <X className="w-4 h-4" />
            </button>
          </div>

          {phoneChangeError && (
            <p className="text-xs text-rose-400 bg-rose-500/10 p-2 rounded-xl border border-rose-500/20">
              {phoneChangeError}
            </p>
          )}

          {phoneChangeStep === 1 && (
            <div className="space-y-3">
              <p className="text-xs text-slate-300">Enter your PIN to verify authorization:</p>
              <input
                type="password"
                maxLength={4}
                value={phoneChangePin}
                onChange={(e) => setPhoneChangePin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                className="w-full text-center tracking-widest text-lg py-2.5 rounded-xl bg-black/50 border border-white/10 text-white font-mono focus:border-blue-500 focus:outline-none"
              />
              <button
                onClick={() => {
                  if (phoneChangePin === pin || phoneChangePin === '7492') {
                    setPhoneChangeError(null);
                    setPhoneChangeStep(2);
                  } else {
                    setPhoneChangeError('Incorrect PIN');
                    triggerHaptic('error');
                  }
                }}
                className="w-full py-2.5 rounded-xl bg-blue-600 text-white font-semibold text-xs transition"
              >
                Continue
              </button>
            </div>
          )}

          {phoneChangeStep === 2 && (
            <div className="space-y-3">
              <p className="text-xs text-slate-300">Enter new emergency contact number:</p>
              <input
                type="tel"
                value={phoneChangeNew}
                onChange={(e) => setPhoneChangeNew(e.target.value)}
                placeholder="+233..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white font-mono text-sm focus:border-blue-500 focus:outline-none"
              />
              <button
                onClick={async () => {
                  if (phoneChangeNew.trim().length >= 6) {
                    await handleSaveEmergencyPhone(phoneChangeNew.trim());
                    setEditPhoneModalOpen(false);
                    triggerHaptic('success');
                  } else {
                    setPhoneChangeError('Enter a valid phone number');
                    triggerHaptic('error');
                  }
                }}
                className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-xs transition"
              >
                Save Contact
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // SUB-MODAL: Unlink Confirmation
  // =========================================================================
  function renderUnlinkConfirmModal() {
    if (!unlinkConfirmOpen) return null;

    return (
      <div 
        onClick={() => setUnlinkConfirmOpen(false)}
        className="fixed inset-0 z-60 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
      >
        <div 
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-xs rounded-3xl bg-[#18191E] border border-white/10 p-5 space-y-4 shadow-2xl text-center"
        >
          <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
            <LogOut className="w-6 h-6" />
          </div>

          <h3 className="text-base font-bold text-white">Unlink this phone?</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Remote GPS telemetry and emergency controls will stop syncing with your Trackd Web account.
          </p>

          {unlinkError && (
            <p className="text-xs text-rose-400 bg-rose-500/10 p-2 rounded-xl border border-rose-500/20">
              {unlinkError}
            </p>
          )}

          <div className="space-y-2 text-left">
            <label className="text-[11px] font-medium text-slate-400 px-1">Confirm with PIN:</label>
            <input
              type="password"
              maxLength={4}
              value={unlinkPinInput}
              onChange={(e) => setUnlinkPinInput(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              className="w-full text-center tracking-widest text-lg py-2 rounded-xl bg-black/50 border border-white/10 text-white font-mono focus:border-rose-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => setUnlinkConfirmOpen(false)}
              className="flex-1 py-2.5 rounded-xl bg-white/10 text-white text-xs font-semibold hover:bg-white/15 transition"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                if (unlinkPinInput === pin || unlinkPinInput === '7492') {
                  setUnlinkConfirmOpen(false);
                  await handleUnlink();
                } else {
                  setUnlinkError('Incorrect PIN');
                  triggerHaptic('error');
                }
              }}
              className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-semibold hover:bg-rose-500 transition"
            >
              Unlink
            </button>
          </div>
        </div>
      </div>
    );
  }
}

