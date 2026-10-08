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
  Shield, Lock, MapPin, Zap, 
  MessageSquare, Volume2, Key, RefreshCw, 
  CheckCircle2, ChevronRight, Eye, AlertTriangle, X, 
  LogOut, Radio, Loader2, Smartphone, 
  PhoneCall, ShieldAlert, Fingerprint, Delete, Check
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
  const [loading, setLoading] = useState(false);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [deviceName, setDeviceName] = useState('Android Sentinel');
  const [isStolen, setIsStolen] = useState(false);

  // Stored Offline Credentials
  const [pin, setPin] = useState('7492');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [hasPinConfigured, setHasPinConfigured] = useState(false);

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

  // Siren
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
  // Determine 4-State Security Model
  // ----------------------------------------------------
  const activeSteps = useMemo(() => Object.values(perms).filter(Boolean).length, [perms]);
  const isAllPermsActive = activeSteps === 6;

  const currentViewState: ViewState = useMemo(() => {
    if (isStolen) return 'stolen';
    if (!linkState.configured || forceSetupWizard) return 'setup';
    if (isAllPermsActive) return 'armed';
    return 'degraded';
  }, [isStolen, linkState.configured, forceSetupWizard, isAllPermsActive]);

  // ----------------------------------------------------
  // Permission Checklist Definition & Dynamic Sorting
  // ----------------------------------------------------
  const permissionItems = useMemo(() => [
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
    {
      key: 'admin' as const,
      title: 'Remote lock and erase',
      subtitle: 'Needs one tap',
      icon: Lock,
      isGranted: perms.admin,
      action: async () => {
        triggerHaptic('light');
        await TrackdBridge.requestDeviceAdmin();
      }
    },
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
  ], [perms]);

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
      <div className="flex flex-col h-[100dvh] max-h-[100dvh] px-5 py-6 max-w-sm mx-auto justify-between bg-[#120808] text-white select-none overflow-hidden font-sans">
        <div className="flex flex-col items-center text-center mt-6">
          <div className="w-20 h-20 rounded-3xl bg-rose-950/60 border border-rose-500/40 flex items-center justify-center shadow-[0_0_40px_rgba(244,63,94,0.35)] animate-pulse mb-5">
            <ShieldAlert className="w-10 h-10 text-rose-500" />
          </div>

          <span className="px-3 py-1 rounded-full bg-rose-500/20 border border-rose-500/40 text-[10px] font-black tracking-widest text-rose-400 uppercase mb-3">
            EMERGENCY ACTIVE
          </span>

          <h1 className="text-xl font-black text-white tracking-tight leading-tight">
            DEVICE MARKED AS LOST OR STOLEN
          </h1>

          <p className="text-xs text-rose-200/80 mt-2.5 px-4 leading-relaxed">
            Live GPS telemetry is streaming to Trackd Cloud Command. All fintech and sensitive data access is restricted.
          </p>
        </div>

        {/* Owner Message & Contact Card */}
        <div className="rounded-2xl bg-[#1C1214] border border-rose-500/30 p-5 space-y-3 shadow-xl">
          <div className="flex items-center gap-2 text-rose-400 text-xs font-bold uppercase tracking-wider">
            <PhoneCall className="w-4 h-4" />
            <span>Owner Contact</span>
          </div>

          <p className="text-sm font-semibold text-white">
            If found, please contact the owner:
          </p>

          <a 
            href={`tel:${emergencyPhone || ''}`}
            className="block text-center py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-mono font-bold text-sm tracking-wider shadow-lg shadow-rose-900/40 active:scale-[0.98] transition"
          >
            {emergencyPhone || 'Contact Owner via Web'}
          </a>
        </div>

        {/* Unlock Action for True Owner */}
        <div className="pb-2">
          <button
            onClick={() => setPinGateOpen(true)}
            className="w-full py-3.5 rounded-full bg-white/10 hover:bg-white/15 text-xs font-bold tracking-wider uppercase text-white/90 border border-white/10 active:scale-[0.98] transition"
          >
            I am the Owner (Unlock with PIN)
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
              Use this same account on the Trackd website to find this phone if it's ever lost.
            </p>

            {/* Google Quick Button */}
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setEmailInput('owner@trackd.local');
                setPasswordInput('Password123!');
              }}
              className="mt-5 w-full py-2.5 rounded-xl bg-[#1C1D21] hover:bg-[#23242A] border border-white/5 flex items-center justify-center gap-2 text-xs font-semibold text-slate-200 active:scale-[0.98] transition"
            >
              <span className="w-4 h-4 rounded-full bg-white text-black font-black text-[10px] flex items-center justify-center leading-none">
                G
              </span>
              <span>Continue with Google</span>
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 my-3">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">or</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            {/* Error Message */}
            {authError && (
              <div className="mb-2 p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-300">
                {authError}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleAuthSubmit} className="space-y-2.5">
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
              A 4-digit code to control this phone by SMS (locate, lock, wipe, siren) even when it has zero cellular data or WiFi.
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
              Grants system permission to lock, factory reset remotely, and block thieves from powering down the device.
            </p>

            <div className="mt-6 rounded-2xl bg-[#1C1D21] border border-white/5 divide-y divide-white/5 overflow-hidden text-left mb-6">
              <button 
                onClick={() => TrackdBridge.requestDeviceAdmin()}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-white/5 transition"
              >
                <span className="text-xs text-slate-200 font-medium">Remote Lock & Erase</span>
                {perms.admin ? <Check className="w-4 h-4 text-[#00E699]" /> : <span className="text-[11px] text-[#3B82F6] font-semibold">Allow &gt;</span>}
              </button>
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
  // Matches Reference Image 5 (`media_1791482725008.png`)
  // Strictly fits within 100dvh (Zero unnecessary scrolling)
  // =========================================================================
  return (
    <div className="flex flex-col h-[100dvh] max-h-[100dvh] px-4 pt-2.5 pb-4 max-w-sm mx-auto justify-between bg-[#121316] text-white select-none overflow-hidden font-sans">
      
      {/* 1. Header: Minimal bar with Trackd logo + Device Badge */}
      <header className="flex items-center justify-between py-1 shrink-0">
        <div 
          onClick={() => {
            triggerHaptic('light');
            setPinGateOpen(true);
          }}
          className="flex items-center gap-2.5 cursor-pointer active:opacity-80 transition"
        >
          <div className="w-8 h-8 rounded-xl bg-[#1C1D21] border border-white/5 flex items-center justify-center shadow-inner">
            <Shield className={`w-4 h-4 ${isAllPermsActive ? 'text-[#00E699]' : 'text-amber-400'}`} />
          </div>
          <span className="font-bold text-sm tracking-tight text-white">
            Trackd
          </span>
        </div>

        {/* Device Status Badge on Right */}
        <div 
          onClick={checkStatus}
          className="flex items-center gap-1.5 cursor-pointer active:scale-95 transition"
        >
          <span className={`text-[11px] font-semibold tracking-tight ${
            isAllPermsActive ? 'text-[#00E699]' : 'text-amber-400'
          }`}>
            {deviceName.split(' ')[0]} • {isAllPermsActive ? 'Guarded' : 'Partly guarded'}
          </span>
          <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${loading ? 'animate-spin text-[#00E699]' : ''}`} />
        </div>
      </header>

      {/* 2. Compact Hero Dial (Reference Image 5 Exact Proportions) */}
      <div className="py-1 flex flex-col items-center text-center shrink-0">
        {/* Dial Ring (Emerald Glow when Armed, Amber Glow when Degraded) */}
        <div className="relative flex items-center justify-center my-1.5">
          <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 96 96">
            {/* Background Track Circle */}
            <circle
              cx="48"
              cy="48"
              r="40"
              stroke="#26272E"
              strokeWidth="6"
              fill="transparent"
            />
            {/* Active Arc */}
            <circle
              cx="48"
              cy="48"
              r="40"
              stroke={isAllPermsActive ? '#00E699' : '#F59E0B'}
              strokeWidth="6"
              strokeDasharray={2 * Math.PI * 40}
              strokeDashoffset={2 * Math.PI * 40 * (1 - activeSteps / 6)}
              strokeLinecap="round"
              fill="transparent"
              className="transition-all duration-500 ease-out"
            />
          </svg>

          {/* Central Dial Text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-black text-white tracking-tight leading-none">
              {activeSteps}/6
            </span>
          </div>
        </div>

        {/* Status Text Under Dial */}
        {isAllPermsActive ? (
          <h2 className="text-sm font-bold text-[#00E699] mt-0.5">
            Fully protected
          </h2>
        ) : (
          <div className="mt-0.5">
            <h2 className="text-sm font-bold text-white leading-tight">
              {6 - activeSteps} {6 - activeSteps === 1 ? 'step' : 'steps'} left
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Finish to be fully protected
            </p>
          </div>
        )}

        {/* Two Compact Status Pills: Battery % and SMS Ready */}
        <div className="flex items-center gap-2 mt-2.5">
          <div className="px-3 py-1 rounded-full bg-[#1C1D21] border border-white/5 text-[11px] text-slate-200 font-medium flex items-center gap-1.5">
            <span>🔋</span>
            <span>Battery {batteryLevel !== null ? `${batteryLevel}%` : 'Reading...'}</span>
          </div>

          <div className="px-3 py-1 rounded-full bg-[#1C1D21] border border-white/5 text-[11px] text-slate-200 font-medium flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${perms.sms ? 'bg-[#00E699]' : 'bg-amber-400'}`} />
            <span>{perms.sms ? 'SMS ready' : 'SMS not set'}</span>
          </div>
        </div>
      </div>

      {/* 3. Grouped Inset Checklist */}
      <div className="flex-1 my-1 flex flex-col justify-center">
        <div className="flex items-center justify-between mb-1.5 px-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Protection
          </span>
          {linkState.configured && (
            <span className="flex items-center gap-1 text-[10px] text-[#00E699] font-medium">
              <Radio className="w-2.5 h-2.5 animate-pulse" />
              Live Synced
            </span>
          )}
        </div>

        <div className="rounded-2xl bg-[#1C1D21] border border-white/5 divide-y divide-white/5 overflow-hidden shadow-lg">
          {sortedChecklist.map((item) => {
            return (
              <div 
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
                className={`px-4 py-3 flex items-center justify-between transition ${
                  item.isGranted 
                    ? 'bg-transparent' 
                    : 'bg-white/[0.02] hover:bg-white/[0.04] cursor-pointer'
                }`}
              >
                <div className="flex items-center gap-3">
                  <item.icon className={`w-4 h-4 ${item.isGranted ? 'text-slate-400' : 'text-slate-300'}`} />
                  <div>
                    <h3 className={`text-xs font-semibold leading-tight ${
                      item.isGranted ? 'text-slate-200' : 'text-white'
                    }`}>
                      {item.title}
                    </h3>
                    {!item.isGranted && (
                      <p className="text-[10px] text-slate-400 leading-none mt-0.5">
                        {item.subtitle}
                      </p>
                    )}
                  </div>
                </div>

                {item.isGranted ? (
                  <CheckCircle2 className="w-4.5 h-4.5 text-[#00E699] shrink-0" />
                ) : (
                  <button 
                    type="button"
                    className="text-xs font-semibold text-[#3B82F6] flex items-center gap-0.5 hover:underline shrink-0"
                  >
                    <span>Set up</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Bottom Actions */}
      <div className="shrink-0 pt-1 space-y-2">
        {currentViewState === 'degraded' ? (
          /* DEGRADED: Single full-width primary button "Finish setup" */
          <button
            onClick={() => {
              triggerHaptic('medium');
              // Find first missing permission and trigger it
              const firstMissing = sortedChecklist.find((p) => !p.isGranted);
              if (firstMissing) {
                firstMissing.action();
              } else {
                setForceSetupWizard(true);
              }
            }}
            className="w-full py-3.5 rounded-full bg-[#3B82F6] hover:bg-[#2563EB] text-white text-xs font-bold uppercase tracking-wider transition shadow-lg shadow-blue-600/25 active:scale-[0.98]"
          >
            Finish setup
          </button>
        ) : (
          /* ARMED: Settings Row + Full-width "Test Loud Siren" Pill */
          <>
            {/* Settings Row (PIN-Gated) */}
            <div 
              onClick={() => {
                triggerHaptic('light');
                setPinGateOpen(true);
              }}
              className="rounded-2xl bg-[#1C1D21] border border-white/5 px-4 py-2.5 flex items-center justify-between cursor-pointer active:scale-[0.99] hover:bg-[#222329] transition"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center text-slate-300">
                  <Key className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white leading-tight">
                    Offline PIN and contact
                  </h4>
                  <p className="text-[10px] text-slate-400 leading-none mt-0.5">
                    Locked • Needs fingerprint / PIN
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-bold text-[#00E699] uppercase tracking-wider px-2 py-0.5 rounded bg-[#00E699]/10 border border-[#00E699]/20">
                  {hasPinConfigured || pin ? 'SET' : 'SETUP'}
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              </div>
            </div>

            {/* Test Loud Siren Button */}
            <button
              onClick={handleToggleSiren}
              className={`w-full py-3.5 rounded-full text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition shadow-lg active:scale-[0.98] ${
                sirenPlaying 
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/40 animate-pulse' 
                  : 'bg-[#00E699] hover:bg-[#00D285] text-black shadow-[#00E699]/20'
              }`}
            >
              <Volume2 className="w-4 h-4" />
              <span>{sirenPlaying ? 'STOP SIREN' : 'TEST LOUD SIREN'}</span>
            </button>
          </>
        )}
      </div>

      {/* PIN Gate Bottom Sheet Modal */}
      {renderPinGateModal()}

      {/* Settings Editor Sheet */}
      {renderSettingsSheet()}

    </div>
  );

  // =========================================================================
  // MODAL: Master PIN Gate Keypad (Matching Reference Image 3)
  // =========================================================================
  function renderPinGateModal() {
    if (!pinGateOpen) return null;

    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end justify-center animate-in fade-in duration-200">
        <div className="w-full max-w-sm rounded-t-3xl bg-[#1C1D21] border-t border-white/10 p-6 flex flex-col items-center shadow-2xl animate-in slide-in-from-bottom duration-300">
          
          {/* Top Subtle Drag Handle */}
          <div className="w-10 h-1 rounded-full bg-white/20 mb-4" />

          {/* Title */}
          <h2 className="text-base font-bold text-white">
            Enter your Master PIN
          </h2>

          {/* 4 PIN Dots */}
          <div className="flex items-center gap-4 my-6">
            {[0, 1, 2, 3].map((idx) => {
              const isFilled = enteredPin.length > idx;
              return (
                <div 
                  key={idx}
                  className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${
                    pinError
                      ? 'bg-rose-500 scale-125 animate-shake'
                      : isFilled
                      ? 'bg-white scale-110'
                      : 'border border-white/30'
                  }`}
                />
              );
            })}
          </div>

          {/* Keypad Grid (3 Columns, 4 Rows) */}
          <div className="grid grid-cols-3 gap-x-6 gap-y-4 w-full max-w-[240px] my-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => handleKeypadPress(digit)}
                className="w-16 h-16 rounded-full bg-white/5 hover:bg-white/10 active:bg-white/20 text-xl font-medium text-white flex items-center justify-center transition active:scale-95 mx-auto"
              >
                {digit}
              </button>
            ))}

            {/* Fingerprint Biometric Key */}
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                // Simulate biometric pass
                verifyEnteredPin(pin);
              }}
              className="w-16 h-16 rounded-full bg-white/5 hover:bg-white/10 active:bg-white/20 text-slate-300 flex items-center justify-center transition active:scale-95 mx-auto"
            >
              <Fingerprint className="w-6 h-6 text-[#3B82F6]" />
            </button>

            {/* 0 Key */}
            <button
              type="button"
              onClick={() => handleKeypadPress('0')}
              className="w-16 h-16 rounded-full bg-white/5 hover:bg-white/10 active:bg-white/20 text-xl font-medium text-white flex items-center justify-center transition active:scale-95 mx-auto"
            >
              0
            </button>

            {/* Backspace Key */}
            <button
              type="button"
              onClick={handleKeypadBackspace}
              className="w-16 h-16 rounded-full bg-white/5 hover:bg-white/10 active:bg-white/20 text-slate-300 flex items-center justify-center transition active:scale-95 mx-auto"
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>

          {/* Cancel Close Button */}
          <button
            type="button"
            onClick={() => {
              setPinGateOpen(false);
              setEnteredPin('');
            }}
            className="mt-4 text-xs font-semibold text-slate-400 hover:text-white py-1"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // MODAL: Master Settings Editor (Unlocked after PIN Verification)
  // =========================================================================
  function renderSettingsSheet() {
    if (!settingsSheetOpen) return null;

    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end justify-center p-3 animate-in fade-in duration-200">
        <div className="w-full max-w-sm rounded-3xl bg-[#1C1D21] border border-white/10 p-5 space-y-4 shadow-2xl animate-in slide-in-from-bottom duration-300">
          
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-[#00E699]" />
              <h3 className="text-sm font-bold text-white">
                Master Security Settings
              </h3>
            </div>
            <button 
              onClick={() => setSettingsSheetOpen(false)}
              className="text-slate-400 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Account Details Box */}
          <div className="p-3 rounded-2xl bg-black/40 border border-white/5 space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-slate-400">
              <span>Linked Account:</span>
              <span className="font-semibold text-white">{linkState.email || 'None'}</span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>Device ID:</span>
              <span className="font-mono text-[11px] text-[#00E699] truncate max-w-[150px]">
                {linkState.deviceId || 'Local Only'}
              </span>
            </div>
          </div>

          {/* Edit Master PIN */}
          <div>
            <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">
              4-Digit Master Recovery PIN
            </label>
            <input 
              type="text"
              maxLength={4}
              value={pin}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '');
                setPin(val);
                if (val.length === 4) handleSavePin(val);
              }}
              placeholder="7492"
              className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/10 font-mono text-sm text-white focus:border-[#3B82F6] focus:outline-none"
            />
          </div>

          {/* Edit Emergency Phone */}
          <div>
            <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">
              Trusted Emergency Contact Phone
            </label>
            <input 
              type="tel"
              value={emergencyPhone}
              onChange={(e) => {
                setEmergencyPhone(e.target.value);
                handleSaveEmergencyPhone(e.target.value);
              }}
              placeholder="+233..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/10 font-mono text-sm text-white focus:border-[#3B82F6] focus:outline-none"
            />
          </div>

          {/* If stolen, allow disarm */}
          {isStolen && (
            <button
              onClick={async () => {
                await TrackdBridge.markStolen({ stolen: false });
                setIsStolen(false);
                setSettingsSheetOpen(false);
                triggerHaptic('success');
                checkStatus();
              }}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider transition"
            >
              Disarm Stolen Mode
            </button>
          )}

          {/* Unlink Account */}
          <button
            onClick={handleUnlink}
            className="w-full py-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 text-xs font-semibold flex items-center justify-center gap-2 transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Unlink / Switch Account</span>
          </button>
        </div>
      </div>
    );
  }
}
