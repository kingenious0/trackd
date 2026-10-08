import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { 
  ShieldCheck, Lock, MapPin, Zap, 
  MessageSquare, Volume2, Key, RefreshCw, 
  Check, ChevronRight, Eye, AlertTriangle, X 
} from 'lucide-react';
import { TrackdBridge } from '../plugins/trackd';

interface Props {
  user?: User | null;
}

export default function MobileClientView({ user: _user }: Props = {}) {
  const [loading, setLoading] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [saved, setSaved] = useState(false);
  const [sirenPlaying, setSirenPlaying] = useState(false);
  const [batteryLevel, setBatteryLevel] = useState(94);

  const [perms, setPerms] = useState({
    admin: false,
    location: false,
    sms: false,
    battery: false,
    overlay: true,
    accessibility: false,
  });

  const checkStatus = async () => {
    setLoading(true);
    try {
      const [adminRes, permRes, accessRes, battRes] = await Promise.all([
        TrackdBridge.isDeviceAdminActive().catch(() => ({ active: false })),
        TrackdBridge.checkPermissions({ permissions: ['location', 'sms'] }).catch(() => null),
        TrackdBridge.checkAccessibilityPermission().catch(() => ({ enabled: false })),
        TrackdBridge.isBatteryOptimizationIgnored().catch(() => ({ ignored: false })),
      ]);

      const pMap = (permRes?.permissions ?? {}) as Record<string, string>;

      setPerms({
        admin: Boolean(adminRes?.active),
        location: pMap['location'] === 'granted',
        sms: pMap['sms'] === 'granted',
        accessibility: Boolean(accessRes?.enabled),
        battery: Boolean(battRes?.ignored),
        overlay: true,
      });
    } catch (e) {
      console.error('Permission check failed:', e);
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
  const isFullyProtected = activeSteps === totalSteps;

  const handleSavePin = async () => {
    if (pin.length < 4) {
      alert('Enter at least 4 digits');
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

  return (
    <div className="flex flex-col h-screen max-h-screen px-4 pt-3.5 pb-5 max-w-sm mx-auto justify-between bg-[#0B0F19] text-slate-100 select-none overflow-hidden font-sans">
      
      {/* 1. Header Bar */}
      <header className="flex items-center justify-between py-1 shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h1 className="font-bold text-xs text-white leading-none">TRACKD SHIELD</h1>
            <span className="text-[10px] text-slate-400 font-mono">Redmi Note 14 Pro</span>
          </div>
        </div>

        <button 
          onClick={checkStatus} 
          aria-label="Refresh status"
          className="p-2 rounded-full bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 text-slate-400 hover:text-white transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
        </button>
      </header>

      {/* 2. Compact Status Dial */}
      <div className="py-2 flex flex-col items-center text-center shrink-0">
        <div className="relative w-22 h-22 flex items-center justify-center">
          <div className={`w-18 h-18 rounded-full border-4 flex flex-col items-center justify-center transition-all duration-300 p-2 ${
            isFullyProtected 
              ? 'border-emerald-500 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.25)]' 
              : 'border-amber-500 bg-amber-500/10 shadow-[0_0_20px_rgba(245,158,11,0.25)]'
          }`}>
            <span className="text-xl font-extrabold text-white leading-none">{activeSteps}/{totalSteps}</span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">
              {isFullyProtected ? 'Armed' : 'Action'}
            </span>
          </div>
        </div>

        <h2 className="text-sm font-semibold text-white mt-1.5">
          {isFullyProtected ? 'Device is Protected' : 'Setup Incomplete'}
        </h2>
        
        {/* Telemetry Chips */}
        <div className="flex items-center gap-2 mt-1.5">
          <span className="px-2.5 py-0.5 rounded-full bg-white/[0.04] border border-white/5 text-[10px] text-slate-300 font-mono">
            🔋 {batteryLevel}%
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-white/[0.04] border border-white/5 text-[10px] text-emerald-400 font-mono">
            ● SMS Ready
          </span>
        </div>
      </div>

      {/* 3. Grouped Checklist (Tight Inset Rows, Zero Scrolling) */}
      <div className="flex-1 my-1 flex flex-col justify-center">
        <div className="rounded-2xl bg-slate-900/60 border border-white/5 divide-y divide-white/5 overflow-hidden">
          {[
            { key: 'location', label: 'Always-On Location', icon: MapPin, act: () => TrackdBridge.requestPermissions({ permissions: ['location'] }) },
            { key: 'sms', label: 'Offline SMS Tracking', icon: MessageSquare, act: () => TrackdBridge.requestPermissions({ permissions: ['sms'] }) },
            { key: 'admin', label: 'Remote Lock & Wipe', icon: Lock, act: () => TrackdBridge.requestDeviceAdmin() },
            { key: 'battery', label: 'Keep Running (Battery)', icon: Zap, act: () => TrackdBridge.requestIgnoreBatteryOptimization() },
            { key: 'overlay', label: 'Lockscreen Message Alert', icon: Eye, act: () => TrackdBridge.requestOverlayPermission() },
            { key: 'accessibility', label: 'Anti-Power-Off Decoy', icon: AlertTriangle, act: () => TrackdBridge.openAccessibilitySettings() },
          ].map((item) => {
            const isDone = Boolean(perms[item.key as keyof typeof perms]);
            return (
              <div 
                key={item.key}
                onClick={() => !isDone && item.act()}
                className={`px-3.5 py-2.5 flex items-center justify-between cursor-pointer transition ${
                  isDone ? 'bg-transparent' : 'bg-amber-500/[0.04] hover:bg-amber-500/[0.08]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <item.icon className={`w-3.5 h-3.5 ${isDone ? 'text-emerald-400' : 'text-slate-400'}`} />
                  <span className="text-xs font-medium text-slate-200">{item.label}</span>
                </div>

                {isDone ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                    Fix
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. PIN Trigger & Siren Button (Bottom Viewport) */}
      <div className="space-y-2 pt-1 shrink-0">
        <button 
          onClick={() => setPinModalOpen(true)}
          className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/5 text-xs text-slate-300 hover:bg-white/[0.06] active:scale-[0.99] transition"
        >
          <span className="flex items-center gap-2">
            <Key className="w-3.5 h-3.5 text-blue-400" />
            Offline PIN & Trusted Phone
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
        </button>

        <button 
          onClick={handleToggleSiren}
          className={`w-full py-2.5 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-2 transition shadow-lg active:scale-[0.98] ${
            sirenPlaying 
              ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-900/30 animate-pulse' 
              : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/30'
          }`}
        >
          <Volume2 className="w-4 h-4" />
          {sirenPlaying ? 'Stop Siren Signal' : 'Test Loud Alarm (100%)'}
        </button>
      </div>

      {/* 5. Clean Slide-up Modal for Credentials */}
      {pinModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 animate-in fade-in duration-200">
          <div className="w-full max-w-xs bg-slate-900 border border-white/10 rounded-2xl p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <span className="text-xs font-bold text-white">Emergency Setup</span>
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
                className="w-full px-3 py-2 rounded-lg bg-black/50 border border-white/10 text-xs text-white font-mono focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Trusted Recovery Number</label>
              <input 
                type="tel"
                value={emergencyPhone}
                onChange={(e) => setEmergencyPhone(e.target.value)}
                placeholder="+233..."
                className="w-full px-3 py-2 rounded-lg bg-black/50 border border-white/10 text-xs text-white font-mono focus:border-blue-500 focus:outline-none"
              />
            </div>

            <button 
              onClick={handleSavePin}
              className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-xs font-bold text-white transition mt-2"
            >
              {saved ? 'Saved!' : 'Save Credentials'}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
