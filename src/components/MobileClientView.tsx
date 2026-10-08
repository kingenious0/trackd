import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut 
} from 'firebase/auth';
import { 
  Shield, Lock, MapPin, Zap, 
  MessageSquare, Volume2, Key, RefreshCw, 
  CheckCircle2, ChevronRight, Eye, AlertTriangle, X, 
  Link2, LogOut, Radio, Loader2
} from 'lucide-react';
import { TrackdBridge, type LinkState } from '../plugins/trackd';
import { auth, isConfigured, projectId } from '../lib/firebase';
import { createDevice } from '../lib/api';

interface Props {
  user?: User | null;
}

export default function MobileClientView({ user: _user }: Props = {}) {
  const [loading, setLoading] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  
  // Real hardware & credentials state
  const [pin, setPin] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [saved, setSaved] = useState(false);
  const [sirenPlaying, setSirenPlaying] = useState(false);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [deviceName, setDeviceName] = useState('Android Sentinel');
  const [hasPinConfigured, setHasPinConfigured] = useState(false);

  // Web sync & account link state
  const [linkState, setLinkState] = useState<LinkState>({
    configured: false,
    deviceId: null,
    uid: null,
    email: null,
  });
  const [isSignUp, setIsSignUp] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [deviceNameInput, setDeviceNameInput] = useState('');
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkSuccessMsg, setLinkSuccessMsg] = useState<string | null>(null);

  const [perms, setPerms] = useState({
    location: false,
    sms: false,
    admin: false,
    battery: false,
    overlay: false,
    accessibility: false,
  });

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
        overlay: isOverlayActive,
        accessibility: isAccessActive,
      });

      if (deviceStatus) {
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

    // Auto-refresh instantly whenever user switches back from Android Settings
    const handleResume = () => {
      checkStatus();
    };

    window.addEventListener('focus', handleResume);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkStatus();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Periodic check every 4 seconds for live battery and sync changes
    const pollTimer = setInterval(checkStatus, 4000);

    // Query real browser battery as fallback if running in dev preview
    if ('getBattery' in navigator) {
      (navigator as unknown as { getBattery: () => Promise<{ level: number }> })
        .getBattery()
        .then((b) => setBatteryLevel(Math.round(b.level * 100)))
        .catch(() => undefined);
    }

    // Load saved PIN and emergency phone from local cache
    const cachedPin = localStorage.getItem('trackd_pin');
    const cachedPhone = localStorage.getItem('trackd_emergency_phone');
    if (cachedPin) {
      setPin(cachedPin);
      setHasPinConfigured(true);
    }
    if (cachedPhone) setEmergencyPhone(cachedPhone);

    return () => {
      window.removeEventListener('focus', handleResume);
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(pollTimer);
    };
  }, []);

  const totalSteps = 6;
  const activeSteps = Object.values(perms).filter(Boolean).length;
  const isArmed = activeSteps === totalSteps;

  const handleSavePin = async () => {
    if (pin.length < 4) {
      alert('Enter at least 4 digits for Master PIN');
      return;
    }
    try {
      await TrackdBridge.saveEmergencyContact({
        phone: emergencyPhone,
        pin: pin,
      });
      localStorage.setItem('trackd_pin', pin);
      localStorage.setItem('trackd_emergency_phone', emergencyPhone);
      setHasPinConfigured(true);
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        setPinModalOpen(false);
        checkStatus();
      }, 1000);
    } catch (e) {
      alert('Save failed: ' + e);
    }
  };

  const handleToggleSiren = async () => {
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
        await TrackdBridge.testHardwareSiren({ durationMs: 4000 });
      } catch (e) {
        console.error('Play siren error', e);
      } finally {
        setTimeout(() => setSirenPlaying(false), 4000);
      }
    }
  };

  const handleLinkAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim() || !passwordInput.trim()) {
      setLinkError('Email and password are required.');
      return;
    }
    setLinkLoading(true);
    setLinkError(null);
    setLinkSuccessMsg(null);

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
        uid = 'demo_uid_' + Date.now();
      }

      // Create or register device document in Firestore
      let targetDeviceId = '';
      if (isConfigured && uid) {
        targetDeviceId = await createDevice(uid, {
          deviceName: deviceNameInput.trim() || deviceName,
          deviceModel: deviceName,
        });
      } else {
        targetDeviceId = 'dev_' + Math.random().toString(36).substring(2, 9);
      }

      // Hand off credentials to Android native bridge
      await TrackdBridge.configureAccount({
        email: emailInput.trim(),
        password: passwordInput,
        deviceId: targetDeviceId,
        projectId: projectId || 'trackd-local',
      });

      // Save emergency contact and PIN if provided
      if (emergencyPhone || pin) {
        await TrackdBridge.saveEmergencyContact({
          phone: emergencyPhone,
          pin: pin || '7492',
        });
      }

      // Refresh link state
      const nextState = await TrackdBridge.getLinkState();
      setLinkState(nextState);
      setLinkSuccessMsg('Phone linked! Streaming live to Web Console.');
      setTimeout(() => {
        setAccountModalOpen(false);
        setLinkSuccessMsg(null);
        checkStatus();
      }, 1400);
    } catch (err: unknown) {
      console.error('Account link failed:', err);
      const errorObj = err as { message?: string; code?: string };
      let msg = errorObj?.message || 'Link failed';
      if (msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password')) {
        msg = 'Invalid credentials. Check the email & password you use on the web portal.';
      } else if (msg.includes('auth/user-not-found')) {
        msg = 'No account found. Switch to "Create Account" below.';
      } else if (msg.includes('auth/email-already-in-use')) {
        msg = 'Account exists! Switch to "Sign In" with your password.';
      }
      setLinkError(msg);
    } finally {
      setLinkLoading(false);
    }
  };

  const handleUnlink = async () => {
    if (!window.confirm('Unlink this phone from the Web Console? Remote commands and GPS streaming will stop.')) return;
    try {
      await TrackdBridge.unlinkAccount();
      if (isConfigured) {
        await signOut(auth()).catch(() => undefined);
      }
      const next = await TrackdBridge.getLinkState();
      setLinkState(next);
      setAccountModalOpen(false);
      checkStatus();
    } catch (e: unknown) {
      const errorObj = e as { message?: string };
      alert('Unlink failed: ' + errorObj?.message);
    }
  };

  return (
    <div className="flex flex-col h-screen max-h-screen px-4 pt-3 pb-4 max-w-sm mx-auto justify-between bg-[#080B11] text-slate-100 select-none overflow-hidden font-sans">
      
      {/* 1. Top Header Bar */}
      <header className="flex items-center justify-between py-1 shrink-0">
        <div 
          onClick={() => setAccountModalOpen(true)}
          className="flex items-center gap-3 cursor-pointer group active:opacity-80 transition"
        >
          {/* Shield Icon Box with Green Dot */}
          <div className="relative">
            <div className="h-10 w-10 rounded-2xl bg-[#0D1420] border border-[#162A26] flex items-center justify-center shadow-inner">
              <Shield className="w-5 h-5 text-[#00E699]" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#00E699] ring-2 ring-[#080B11]" />
          </div>

          <div>
            <h1 className="font-extrabold text-sm text-white tracking-wider leading-none">
              TRACKD SHIELD
            </h1>
            <div className="flex items-center gap-1.5 mt-1 font-mono text-[11px] text-slate-400">
              <span className="truncate max-w-[130px]">{deviceName}</span>
              <span className="text-slate-600">•</span>
              <span className={`font-bold tracking-wide ${
                isArmed ? 'text-[#00E699]' : 'text-amber-400'
              }`}>
                {isArmed ? 'ARMED' : 'ACTION'}
              </span>
            </div>
          </div>
        </div>

        {/* Circular Refresh Button */}
        <button 
          onClick={checkStatus} 
          aria-label="Refresh status"
          className="w-10 h-10 rounded-full bg-[#111724] border border-white/5 flex items-center justify-center text-slate-400 hover:text-white active:scale-95 transition shadow-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#00E699]' : ''}`} />
        </button>
      </header>

      {/* 2. Center Dial & Telemetry Status (Properly Sized, Zero Overlap) */}
      <div className="py-2 flex flex-col items-center text-center shrink-0">
        {/* Glowing Dial Ring */}
        <div className="relative flex items-center justify-center my-2">
          <div 
            style={{ width: '114px', height: '114px' }}
            className={`rounded-full border-[3.5px] flex flex-col items-center justify-center transition-all duration-300 ${
              isArmed 
                ? 'border-[#00E699] bg-[#07241C]/50 shadow-[0_0_26px_rgba(0,230,153,0.35)]' 
                : 'border-amber-500 bg-amber-500/10 shadow-[0_0_24px_rgba(245,158,11,0.25)]'
            }`}
          >
            <span className="text-3xl font-black text-white leading-none tracking-tight">
              {activeSteps}/{totalSteps}
            </span>
            <span className={`text-[10px] font-black uppercase tracking-widest mt-1.5 ${
              isArmed ? 'text-[#00E699]' : 'text-amber-400'
            }`}>
              {isArmed ? 'ARMED' : 'ACTION'}
            </span>
          </div>
        </div>

        {/* Status Heading */}
        <h2 className="text-sm font-bold text-white mt-1">
          {isArmed ? 'Device is Protected' : 'Setup Incomplete'}
        </h2>
        
        {/* Telemetry Chips */}
        <div className="flex items-center gap-2 mt-2">
          {/* Real Hardware Battery */}
          <span className="px-3 py-1 rounded-full bg-[#111724] border border-[#1A2335] text-[11px] text-white font-medium flex items-center gap-1.5">
            <span>🔋</span>
            <span>{batteryLevel !== null ? `${batteryLevel}%` : 'Reading...'}</span>
          </span>

          {/* Real SMS System State */}
          <button
            onClick={async () => {
              if (!perms.sms) {
                try {
                  const res = await TrackdBridge.requestPermissions({ permissions: ['sms'] }).catch(() => null);
                  const isGranted = (res as unknown as Record<string, string>)?.['sms'] === 'granted';
                  if (!isGranted) {
                    await TrackdBridge.openAppSettings().catch(() => null);
                  }
                } catch (e) {
                  console.error(e);
                } finally {
                  setTimeout(checkStatus, 600);
                }
              }
            }}
            className={`px-3 py-1 rounded-full bg-[#111724] border text-[11px] font-medium flex items-center gap-1.5 transition active:scale-95 ${
              perms.sms 
                ? 'border-[#1A2335] text-[#00E699]' 
                : 'border-amber-500/30 text-amber-400 hover:bg-amber-500/10 cursor-pointer'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${perms.sms ? 'bg-[#00E699]' : 'bg-amber-400 animate-ping'}`} />
            <span>{perms.sms ? 'SMS Ready' : 'Enable SMS'}</span>
          </button>

          {linkState.configured ? (
            <button
              onClick={() => setAccountModalOpen(true)}
              className="px-3 py-1 rounded-full bg-[#07241C] border border-[#10563E] text-[11px] text-[#00E699] font-medium flex items-center gap-1.5 hover:bg-[#0A3328] active:scale-95 transition"
            >
              <Radio className="w-2.5 h-2.5 text-[#00E699] animate-pulse" />
              <span>Web Synced</span>
            </button>
          ) : (
            <button
              onClick={() => setAccountModalOpen(true)}
              className="px-3 py-1 rounded-full bg-transparent border border-amber-500/30 text-[11px] text-amber-300 font-medium flex items-center gap-1 hover:bg-amber-500/10 active:scale-95 transition"
            >
              <Link2 className="w-2.5 h-2.5 text-amber-400" />
              <span>Link Web</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. Grouped Checklist (Matching Reference Image) */}
      <div className="flex-1 my-1 flex flex-col justify-center">
        <div className="rounded-2xl bg-[#0C121E] border border-[#172235] divide-y divide-[#151F31] overflow-hidden shadow-lg">
          {[
            { 
              key: 'location', 
              label: 'Always-On Location', 
              icon: MapPin, 
              act: async () => {
                const res = await TrackdBridge.requestPermissions({ permissions: ['location'] }).catch(() => null);
                const isGranted = (res as unknown as Record<string, string>)?.['location'] === 'granted';
                if (!isGranted) {
                  await TrackdBridge.openAppSettings().catch(() => null);
                }
              }
            },
            { 
              key: 'sms', 
              label: 'Offline SMS Tracking', 
              icon: MessageSquare, 
              act: async () => {
                const res = await TrackdBridge.requestPermissions({ permissions: ['sms'] }).catch(() => null);
                const isGranted = (res as unknown as Record<string, string>)?.['sms'] === 'granted';
                if (!isGranted) {
                  await TrackdBridge.openAppSettings().catch(() => null);
                }
              }
            },
            { 
              key: 'admin', 
              label: 'Remote Lock & Wipe', 
              icon: Lock, 
              act: () => TrackdBridge.requestDeviceAdmin() 
            },
            { 
              key: 'battery', 
              label: 'Background Battery Pass', 
              icon: Zap, 
              act: () => TrackdBridge.requestIgnoreBatteryOptimization() 
            },
            { 
              key: 'overlay', 
              label: 'Lockscreen Message Alert', 
              icon: Eye, 
              act: () => TrackdBridge.requestOverlayPermission() 
            },
            { 
              key: 'accessibility', 
              label: 'Anti-Power-Off Decoy', 
              icon: AlertTriangle, 
              act: () => TrackdBridge.openAccessibilitySettings() 
            },
          ].map((item) => {
            const isDone = Boolean(perms[item.key as keyof typeof perms]);
            return (
              <div 
                key={item.key}
                onClick={async () => {
                  if (!isDone) {
                    try {
                      await item.act();
                    } catch (e) {
                      console.warn('Action failed:', e);
                    } finally {
                      setTimeout(checkStatus, 600);
                      setTimeout(checkStatus, 1500);
                    }
                  }
                }}
                className={`px-4 py-3.5 flex items-center justify-between transition ${
                  isDone 
                    ? 'bg-transparent' 
                    : 'bg-amber-500/[0.04] hover:bg-amber-500/[0.08] cursor-pointer'
                }`}
              >
                <div className="flex items-center gap-3">
                  <item.icon className="w-4 h-4 text-slate-300" />
                  <span className="text-xs font-semibold text-slate-200">
                    {item.label}
                  </span>
                </div>

                {isDone ? (
                  <CheckCircle2 className="w-4.5 h-4.5 text-[#00E699]" />
                ) : (
                  <span className="text-[9px] font-extrabold text-amber-400 uppercase tracking-wide px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 cursor-pointer">
                    Enable
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Bottom Section: Offline PIN Card & Vibrant Alarm Button */}
      <div className="space-y-2 pt-1 shrink-0">
        {/* Offline PIN & Trusted Phone Card */}
        <div 
          onClick={() => setPinModalOpen(true)}
          className="rounded-2xl bg-[#0C121E] border border-[#172235] px-4 py-3 flex items-center justify-between cursor-pointer active:scale-[0.99] hover:bg-[#0F1626] transition shadow-md"
        >
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-[#271F0F] border border-[#443314] flex items-center justify-center text-amber-400">
              <Key className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-semibold text-white">
              Offline PIN & Trusted Phone
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider ${
              hasPinConfigured || pin 
                ? 'bg-[#092B20] border border-[#10563E] text-[#00E699]' 
                : 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
            }`}>
              {hasPinConfigured || pin ? 'SET' : 'SETUP'}
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
          </div>
        </div>

        {/* Vibrant Neon Teal/Green Test Loud Alarm Button */}
        <button 
          onClick={handleToggleSiren}
          className={`w-full py-3.5 rounded-full text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition shadow-lg active:scale-[0.98] ${
            sirenPlaying 
              ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/40 animate-pulse' 
              : 'bg-[#00D285] hover:bg-[#00BF78] text-black shadow-[#00D285]/20'
          }`}
        >
          <Volume2 className="w-4 h-4" />
          <span>{sirenPlaying ? 'STOP LOUD ALARM' : 'TEST LOUD ALARM'}</span>
        </button>
      </div>

      {/* 5. Account Link Modal (Slide-up Sheet) */}
      {accountModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 animate-in fade-in duration-200">
          <div className="w-full max-w-xs bg-[#0C121E] border border-[#172235] rounded-2xl p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <div className="flex items-center gap-2">
                <Link2 className="w-4 h-4 text-[#00E699]" />
                <span className="text-xs font-bold text-white">
                  {linkState.configured ? 'Device Account Details' : 'Connect to Web Portal'}
                </span>
              </div>
              <button 
                onClick={() => setAccountModalOpen(false)} 
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {linkState.configured ? (
              /* Already Linked View */
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-[#07241C] border border-[#10563E] text-xs space-y-1.5">
                  <div className="flex items-center justify-between text-[#00E699] font-medium">
                    <span>Sync Status</span>
                    <span className="flex items-center gap-1 font-mono text-[10px]">
                      <span className="w-2 h-2 rounded-full bg-[#00E699] animate-pulse" />
                      Streaming Live
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    <span className="text-slate-500">Account:</span> {linkState.email}
                  </p>
                  <p className="text-[10px] text-slate-400 font-mono truncate">
                    <span className="text-slate-500">Device ID:</span> {linkState.deviceId}
                  </p>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed">
                  This phone streams live GPS telemetry and listens for remote alarm and wipe commands from your Web Console.
                </p>

                <button
                  onClick={handleUnlink}
                  className="w-full py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 active:scale-[0.98] text-xs font-semibold flex items-center justify-center gap-2 transition"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Unlink / Switch Account
                </button>
              </div>
            ) : (
              /* Not Linked Form */
              <form onSubmit={handleLinkAccount} className="space-y-2.5">
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Enter the credentials you use on the Trackd Web Console to sync live GPS and remote security commands.
                </p>

                {/* Tab: Sign In vs Sign Up */}
                <div className="flex rounded-lg bg-black/40 p-0.5 border border-white/5">
                  <button
                    type="button"
                    onClick={() => { setIsSignUp(false); setLinkError(null); }}
                    className={`flex-1 py-1 rounded-md text-[11px] font-semibold transition ${
                      !isSignUp ? 'bg-[#00D285] text-black shadow' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsSignUp(true); setLinkError(null); }}
                    className={`flex-1 py-1 rounded-md text-[11px] font-semibold transition ${
                      isSignUp ? 'bg-[#00D285] text-black shadow' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Create Account
                  </button>
                </div>

                {linkError && (
                  <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-300">
                    {linkError}
                  </div>
                )}

                {linkSuccessMsg && (
                  <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-[#00E699]">
                    {linkSuccessMsg}
                  </div>
                )}

                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Email Address</label>
                  <input 
                    type="email"
                    required
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="user@example.com"
                    className="w-full px-3 py-2 rounded-lg bg-black/50 border border-white/10 text-xs text-white focus:border-[#00D285] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Password</label>
                  <input 
                    type="password"
                    required
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 rounded-lg bg-black/50 border border-white/10 text-xs text-white focus:border-[#00D285] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Device Name</label>
                  <input 
                    type="text"
                    value={deviceNameInput}
                    onChange={(e) => setDeviceNameInput(e.target.value)}
                    placeholder="Redmi Note 14 Pro"
                    className="w-full px-3 py-2 rounded-lg bg-black/50 border border-white/10 text-xs text-white focus:border-[#00D285] focus:outline-none"
                  />
                </div>

                <button 
                  type="submit"
                  disabled={linkLoading}
                  className="w-full py-2.5 rounded-full bg-[#00D285] hover:bg-[#00BF78] active:scale-[0.98] text-xs font-black uppercase text-black transition mt-1 flex items-center justify-center gap-2 shadow-lg shadow-[#00D285]/20 disabled:opacity-50"
                >
                  {linkLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    isSignUp ? 'Create & Link Device' : 'Link Phone to Console'
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* 6. Clean Slide-up Modal for Emergency Credentials */}
      {pinModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 animate-in fade-in duration-200">
          <div className="w-full max-w-xs bg-[#0C121E] border border-[#172235] rounded-2xl p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <span className="text-xs font-bold text-white">Offline Emergency Setup</span>
              <button 
                onClick={() => setPinModalOpen(false)} 
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-[10px] text-slate-400 block mb-1">4-Digit Master Recovery PIN</label>
              <input 
                type="password"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="7492"
                className="w-full px-3 py-2 rounded-lg bg-black/50 border border-white/10 text-xs text-white font-mono focus:border-[#00D285] focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Trusted Emergency Phone Number</label>
              <input 
                type="tel"
                value={emergencyPhone}
                onChange={(e) => setEmergencyPhone(e.target.value)}
                placeholder="+233..."
                className="w-full px-3 py-2 rounded-lg bg-black/50 border border-white/10 text-xs text-white font-mono focus:border-[#00D285] focus:outline-none"
              />
            </div>

            <button 
              onClick={handleSavePin}
              className="w-full py-2.5 rounded-full bg-[#00D285] hover:bg-[#00BF78] active:scale-[0.98] text-xs font-black uppercase text-black transition mt-2"
            >
              {saved ? 'Saved!' : 'Save Credentials'}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
