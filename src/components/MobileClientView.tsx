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
  
  // Offline credentials state
  const [pin, setPin] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [saved, setSaved] = useState(false);
  const [sirenPlaying, setSirenPlaying] = useState(false);
  const [batteryLevel, setBatteryLevel] = useState(94);

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
  const [deviceNameInput, setDeviceNameInput] = useState('Redmi Note 14 Pro');
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkSuccessMsg, setLinkSuccessMsg] = useState<string | null>(null);

  const [perms, setPerms] = useState({
    location: true,
    sms: true,
    admin: true,
    battery: true,
    overlay: true,
    accessibility: true,
  });

  const checkStatus = async () => {
    setLoading(true);
    try {
      const [adminRes, permRes, accessRes, battRes, linkRes] = await Promise.all([
        TrackdBridge.isDeviceAdminActive().catch(() => ({ active: false })),
        TrackdBridge.checkPermissions({ permissions: ['location', 'sms'] }).catch(() => null),
        TrackdBridge.checkAccessibilityPermission().catch(() => ({ enabled: false })),
        TrackdBridge.isBatteryOptimizationIgnored().catch(() => ({ ignored: false })),
        TrackdBridge.getLinkState().catch(() => ({ configured: false, deviceId: null, uid: null, email: null })),
      ]);

      const pMap = (permRes?.permissions ?? {}) as Record<string, string>;

      setPerms({
        location: pMap['location'] === 'granted',
        sms: pMap['sms'] === 'granted',
        admin: Boolean(adminRes?.active),
        battery: Boolean(battRes?.ignored),
        overlay: true,
        accessibility: Boolean(accessRes?.enabled),
      });

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

    // Query real battery if supported
    if ('getBattery' in navigator) {
      (navigator as unknown as { getBattery: () => Promise<{ level: number }> })
        .getBattery()
        .then((b) => setBatteryLevel(Math.round(b.level * 100)))
        .catch(() => undefined);
    }

    // Load saved PIN and emergency phone if cached
    const cachedPin = localStorage.getItem('trackd_pin');
    const cachedPhone = localStorage.getItem('trackd_emergency_phone');
    if (cachedPin) setPin(cachedPin);
    if (cachedPhone) setEmergencyPhone(cachedPhone);
  }, []);

  const totalSteps = 6;
  const activeSteps = Object.values(perms).filter(Boolean).length;
  const isArmed = activeSteps === totalSteps;

  const handleSavePin = async () => {
    if (pin.length < 4) {
      alert('Enter at least 4 digits for recovery PIN');
      return;
    }
    try {
      await TrackdBridge.saveEmergencyContact({
        phone: emergencyPhone,
        pin: pin,
      });
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        setPinModalOpen(false);
      }, 1000);
    } catch (e) {
      alert('Save failed: ' + e);
    }
  };

  const handleToggleSiren = async () => {
    if (sirenPlaying) {
      await TrackdBridge.stopHardwareSiren();
      setSirenPlaying(false);
    } else {
      setSirenPlaying(true);
      await TrackdBridge.testHardwareSiren({ durationMs: 4000 });
      setTimeout(() => setSirenPlaying(false), 4000);
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
          deviceName: deviceNameInput.trim() || 'Redmi Note 14 Pro',
          deviceModel: 'Xiaomi 24090RA29G',
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
    <div className="flex flex-col h-screen max-h-screen px-4.5 pt-3.5 pb-4 max-w-sm mx-auto justify-between bg-[#080B11] text-slate-100 select-none overflow-hidden font-sans">
      
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
              <span>Redmi Note 14 Pro</span>
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

      {/* 2. Center Dial & Telemetry Status */}
      <div className="py-1 flex flex-col items-center text-center shrink-0">
        {/* Glowing Dial Ring */}
        <div className="relative flex items-center justify-center my-1">
          <div className="w-26 h-26 rounded-full border-[3.5px] border-[#00E699] bg-[#07241C]/40 flex flex-col items-center justify-center shadow-[0_0_24px_rgba(0,230,153,0.3)] transition-all duration-300">
            <span className="text-2xl font-black text-white leading-none tracking-tight">
              {activeSteps}/{totalSteps}
            </span>
            <span className="text-[9px] font-black uppercase tracking-widest text-[#00E699] mt-0.5">
              {isArmed ? 'ARMED' : 'ACTION'}
            </span>
          </div>
        </div>

        {/* Status Heading */}
        <h2 className="text-sm font-bold text-white mt-1">
          {isArmed ? 'Device is Protected' : 'Setup Incomplete'}
        </h2>
        
        {/* Telemetry Chips */}
        <div className="flex items-center gap-2 mt-1.5">
          <span className="px-3 py-1 rounded-full bg-[#111724] border border-[#1A2335] text-[11px] text-white font-medium flex items-center gap-1.5">
            <span>🔋</span>
            <span>{batteryLevel}%</span>
          </span>

          <span className="px-3 py-1 rounded-full bg-[#111724] border border-[#1A2335] text-[11px] text-[#00E699] font-medium flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00E699]" />
            <span>SMS Ready</span>
          </span>

          {linkState.configured ? (
            <button
              onClick={() => setAccountModalOpen(true)}
              className="px-2.5 py-1 rounded-full bg-[#07241C] border border-[#10563E] text-[11px] text-[#00E699] font-medium flex items-center gap-1.5 hover:bg-[#0A3328] active:scale-95 transition"
            >
              <Radio className="w-2.5 h-2.5 text-[#00E699] animate-pulse" />
              <span>Web Synced</span>
            </button>
          ) : (
            <button
              onClick={() => setAccountModalOpen(true)}
              className="px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300 font-medium flex items-center gap-1 hover:bg-amber-500/20 active:scale-95 transition animate-pulse"
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
              act: () => TrackdBridge.requestPermissions({ permissions: ['location'] }) 
            },
            { 
              key: 'sms', 
              label: 'Offline SMS Tracking', 
              icon: MessageSquare, 
              act: () => TrackdBridge.requestPermissions({ permissions: ['sms'] }) 
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
                onClick={() => !isDone && item.act()}
                className={`px-4 py-3 flex items-center justify-between transition ${
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
                  <span className="text-[9px] font-extrabold text-amber-400 uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 cursor-pointer">
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
          className="rounded-2xl bg-[#0C121E] border border-[#172235] px-3.5 py-2.5 flex items-center justify-between cursor-pointer active:scale-[0.99] hover:bg-[#0F1626] transition shadow-md"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#271F0F] border border-[#443314] flex items-center justify-center text-amber-400">
              <Key className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-semibold text-white">
              Offline PIN & Trusted Phone
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="px-2 py-0.5 rounded bg-[#092B20] border border-[#10563E] text-[10px] font-extrabold uppercase tracking-wider text-[#00E699]">
              {pin ? 'SET' : 'SETUP'}
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
              <label className="text-[10px] text-slate-400 block mb-1">4-Digit Master PIN</label>
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
              <label className="text-[10px] text-slate-400 block mb-1">Trusted Recovery Number</label>
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
