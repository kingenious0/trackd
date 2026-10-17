import { useState, useEffect, useMemo, useCallback } from 'react';
import type { User } from 'firebase/auth';
import { 
  Crosshair, Volume2, ShieldCheck, Lock, Trash2, 
  Battery, Check, ChevronUp, ChevronDown, 
  LogOut, MapPin, Signal, Clock, Compass, Layers, 
  Plus, Minus, ExternalLink, MonitorPlay, Loader2,
  MessageSquare, Copy, Settings2, KeyRound, Phone, X
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  subscribeDevices, subscribeTelemetry, updateDevice, 
  wakeDevice, fetchProfile, saveProfile, type Device, type TelemetryLog 
} from '../lib/api';
import { auth, trackEvent } from '../lib/firebase';
import { DEMO_USER_ID, demoAppendTelemetry, demoDelay, demoReset } from '../lib/demo';
import { formatLastSeen } from '../lib/format';
import { getAreaName } from '../lib/geo';
import { decryptPin, encryptPin, sha256Hex, toUnsignedE164 } from '../lib/crypto';
import { Capacitor } from '@capacitor/core';
import WipeDialog from './WipeDialog';
import Navbar from './Navbar';

interface Props {
  user?: User | null;
  demo?: boolean;
  onExitDemo?: () => void;
  onSignOut?: () => void;
  onSwitchToDownload?: () => void;
}

// Apple Maps inspired precision marker
const createApplePin = (isStolen: boolean) =>
  L.divIcon({
    className: 'apple-radar-pin',
    html: `
      <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 48px; height: 48px;">
        <div style="position: absolute; width: 48px; height: 48px; border-radius: 9999px; background: ${
          isStolen ? 'rgba(239, 68, 68, 0.35)' : 'rgba(0, 242, 157, 0.35)'
        }; animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
        <div style="position: relative; width: 26px; height: 26px; border-radius: 9999px; background: ${
          isStolen ? '#EF4444' : '#00F29D'
        }; border: 3.5px solid #FFFFFF; box-shadow: 0 4px 16px rgba(0, 242, 157, 0.4); display: flex; align-items: center; justify-content: center;">
          <div style="width: 8px; height: 8px; border-radius: 9999px; background: ${isStolen ? '#FFFFFF' : '#070B14'};"></div>
        </div>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });

function MapRecenter({ coords }: { coords: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    if (coords[0] !== 0 && coords[1] !== 0) {
      map.flyTo(coords, map.getZoom() > 14 ? map.getZoom() : 14, { animate: true, duration: 1.2 });
    }
  }, [coords, map]);
  return null;
}

function MapController({ coords }: { coords: [number, number] }) {
  const map = useMap();
  return (
    <div className="absolute top-4 right-4 sm:right-6 z-[500] flex flex-col items-end gap-3 pointer-events-none">
      {/* Zoom and Recenter Pill */}
      <div className="flex flex-col rounded-2xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-black/10 dark:border-white/10 shadow-[0_8px_30px_rgb(0,0,0,0.12)] overflow-hidden pointer-events-auto">
        <button
          onClick={() => map.zoomIn()}
          aria-label="Zoom in"
          className="p-3 text-slate-700 dark:text-slate-200 hover:bg-black/5 dark:hover:bg-white/10 transition border-b border-black/5 dark:border-white/5 active:scale-95"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          onClick={() => map.zoomOut()}
          aria-label="Zoom out"
          className="p-3 text-slate-700 dark:text-slate-200 hover:bg-black/5 dark:hover:bg-white/10 transition border-b border-black/5 dark:border-white/5 active:scale-95"
        >
          <Minus className="w-4 h-4" />
        </button>
        <button
          onClick={() => map.flyTo(coords, 14, { animate: true, duration: 1 })}
          aria-label="Recenter on target"
          title="Recenter on Target"
          className="p-3 text-blue-600 dark:text-blue-400 hover:bg-black/5 dark:hover:bg-white/10 transition active:scale-95"
        >
          <Compass className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function WebDashboard({ user, demo = false, onExitDemo, onSignOut, onSwitchToDownload }: Props) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [showWipeDialog, setShowWipeDialog] = useState(false);
  const ENABLE_REMOTE_WIPE_V2 = false; // Remote Factory Wipe held for V2 (code preserved)
  const [dispatching, setDispatching] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [darkMapMode, setDarkMapMode] = useState(false);
  const [areaName, setAreaName] = useState<string>('Resolving location…');
  const [showSmsDirectives, setShowSmsDirectives] = useState(false);
  const [smsStates, setSmsStates] = useState<Record<string, 'idle'|'busy'|'sent'|'copied'|'error'>>({});
  const [smsError, setSmsError] = useState<string | null>(null);
  const [profilePhone, setProfilePhone] = useState<string>('');
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [setupPhone, setSetupPhone] = useState('');
  const [setupPin, setSetupPin] = useState('');
  const [setupSaving, setSetupSaving] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  // Load profile phone number on start
  useEffect(() => {
    if (!user) return;
    fetchProfile(user.uid).then((p) => {
      if (p?.phoneNumber) {
        setProfilePhone(p.phoneNumber);
        setSetupPhone(p.phoneNumber);
      }
    }).catch(() => {});
  }, [user]);

  const canOpenSmsLink = useCallback(() => {
    if (Capacitor.isNativePlatform()) return true;
    return /android|iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
  }, []);

  const handleSaveSmsCredentials = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!user) return;
    if (!setupPhone.trim()) { setSetupError('Phone number is required'); return; }
    if (!/^\d{4}$/.test(setupPin)) { setSetupError('A 4-digit Master Recovery PIN is required'); return; }
    setSetupSaving(true);
    setSetupError(null);
    try {
      const [pinHash, pinBlob] = await Promise.all([
        sha256Hex(setupPin),
        encryptPin(setupPin, user.uid)
      ]);
      const formattedPhone = toUnsignedE164(setupPhone);
      await saveProfile(user.uid, {
        phoneNumber: formattedPhone,
        masterPinHash: pinHash,
        encryptedPin: pinBlob
      });
      setProfilePhone(formattedPhone);
      setShowSetupModal(false);
      setSmsError(null);
      setSetupPin('');
      setActionNotice(`SIM phone (${formattedPhone}) and PIN securely configured.`);
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSetupSaving(false);
    }
  };

  const handleSmsSend = useCallback(async (template: string) => {
    if (demo) { setSmsError('SMS send unavailable in demo mode.'); return; }
    if (!user) { setSmsError('Sign in to use one-tap SMS.'); return; }
    setSmsStates(p => ({ ...p, [template]: 'busy' }));
    setSmsError(null);
    try {
      const profile = await fetchProfile(user.uid);
      const isMobile = canOpenSmsLink();

      let pin = '';
      if (profile?.encryptedPin) {
        pin = (await decryptPin(profile.encryptedPin, user.uid)) ?? '';
      }

      if (isMobile) {
        // Mobile requires phone number to open SMS composer
        if (!profile?.phoneNumber) {
          setShowSetupModal(true);
          setSmsError('Please set your device phone number and PIN first.');
          setSmsStates(p => ({ ...p, [template]: 'error' }));
          return;
        }
        if (!pin) {
          setShowSetupModal(true);
          setSmsError('Please save your 4-digit PIN below to enable 1-tap SMS.');
          setSmsStates(p => ({ ...p, [template]: 'error' }));
          return;
        }
        const smsBody = `${template}${pin}`;
        const phone = profile.phoneNumber;
        const sep = Capacitor.getPlatform() === 'android' ? '?' : '&';
        window.open(`sms:${phone}${sep}body=${encodeURIComponent(smsBody)}`, '_self');
        setSmsStates(p => ({ ...p, [template]: 'sent' }));
      } else {
        // Desktop: copy command to clipboard
        if (pin) {
          const smsBody = `${template}${pin}`;
          await navigator.clipboard.writeText(smsBody);
          setSmsStates(p => ({ ...p, [template]: 'copied' }));
          if (profile?.phoneNumber) {
            setActionNotice(`Copied with PIN: ${template}**** (Send via SMS to ${profile.phoneNumber})`);
          } else {
            setActionNotice(`Copied with PIN: ${template}****`);
          }
        } else {
          // If PIN is not stored yet, copy template and invite user to save PIN
          await navigator.clipboard.writeText(template);
          setSmsStates(p => ({ ...p, [template]: 'copied' }));
          setShowSetupModal(true);
          setSmsError('Command copied. Save your 4-digit PIN below to automatically embed it next time!');
        }
      }
    } catch (e) {
      setSmsError(e instanceof Error ? e.message : 'Error sending SMS.');
      setSmsStates(p => ({ ...p, [template]: 'error' }));
    }
    setTimeout(() => setSmsStates(p => ({ ...p, [template]: 'idle' })), 2500);
  }, [user, demo, canOpenSmsLink]);

  const userId = demo ? DEMO_USER_ID : user?.uid ?? 'demo-user';
  const email = demo ? 'demo@trackd.local' : user?.email ?? 'Operator';

  // Subscribe to device fleet
  useEffect(() => {
    setLoading(true);
    const unsub = subscribeDevices(
      userId,
      (incoming) => {
        // Deduplicate devices by hardware deviceId or unique deviceName to eliminate phantom duplicates
        const seen = new Set<string>();
        const deduped: Device[] = [];
        for (const d of incoming) {
          const key = d.id || d.deviceName;
          if (!seen.has(key)) {
            seen.add(key);
            deduped.push(d);
          }
        }

        setDevices(deduped);
        setSelectedDevice((prev) => {
          if (!prev) return deduped[0] ?? null;
          const match = deduped.find((d) => d.id === prev.id);
          return match ?? deduped[0] ?? null;
        });
        setLoading(false);
      },
      (err) => {
        console.error('Devices subscription error:', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [userId]);

  // Subscribe to telemetry history for selected device
  useEffect(() => {
    if (!selectedDevice?.id) {
      setTelemetry([]);
      return;
    }
    const unsub = subscribeTelemetry(
      selectedDevice.id,
      userId,
      (logs) => {
        setTelemetry(logs);
      },
      (err) => console.error('Telemetry subscription error:', err)
    );
    return () => unsub();
  }, [selectedDevice?.id, userId]);

  const latestLog = telemetry[0] ?? null;
  const currentCoords: [number, number] = useMemo(() => {
    if (selectedDevice?.lastTelemetry?.lat && selectedDevice?.lastTelemetry?.lng) {
      return [selectedDevice.lastTelemetry.lat, selectedDevice.lastTelemetry.lng];
    }
    if (latestLog?.lat && latestLog?.lng) {
      return [latestLog.lat, latestLog.lng];
    }
    // Default fallback to Kumasi/Accra center
    return [6.7019, -1.6805];
  }, [selectedDevice, latestLog]);

  const accuracyMeters = selectedDevice?.lastTelemetry?.accuracy ?? latestLog?.accuracy ?? 15;
  const isStolen = Boolean(selectedDevice?.isStolen);
  const batteryLevel = selectedDevice?.lastTelemetry?.battery ?? selectedDevice?.battery ?? 94;

  // Reverse geocoding lookup
  useEffect(() => {
    let active = true;
    if (currentCoords[0] !== 0 && currentCoords[1] !== 0) {
      getAreaName(currentCoords[0], currentCoords[1]).then((name) => {
        if (active) setAreaName(name);
      });
    }
    return () => {
      active = false;
    };
  }, [currentCoords]);

  const handleAction = async (action: 'LOCATE' | 'SIREN' | 'STOLEN' | 'SAFE' | 'WIPE') => {
    if (!selectedDevice) return;
    setDispatching(action);
    setActionNotice(null);
    trackEvent("web_command_sent", { command: action.toLowerCase() });

    try {
      if (action === 'LOCATE') {
        await updateDevice(selectedDevice.id, { requestLocate: true });
        if (demo) {
          await demoDelay(900);
          demoAppendTelemetry('LOCATE_REQUEST');
          await updateDevice(selectedDevice.id, { requestLocate: false });
        }
        await wakeDevice(selectedDevice.id, 'LOCATE');
        setActionNotice('Live GPS coordinates requested from handset.');
      } else if (action === 'SIREN') {
        await updateDevice(selectedDevice.id, { requestSiren: true, stopSiren: false });
        await wakeDevice(selectedDevice.id, 'SIREN');
        setActionNotice('Max-volume emergency hardware siren triggered on handset.');
      } else if (action === 'STOLEN') {
        await updateDevice(selectedDevice.id, { isStolen: true });
        await wakeDevice(selectedDevice.id, 'STOLEN');
        setActionNotice('Theft Mode ARMED. Anti-theft screen overlay engaged.');
      } else if (action === 'SAFE') {
        await updateDevice(selectedDevice.id, { isStolen: false, stopSiren: true, requestSiren: false });
        await wakeDevice(selectedDevice.id, 'SAFE');
        setActionNotice('Device marked SAFE. Theft protection mode disarmed.');
      } else if (action === 'WIPE') {
        await updateDevice(selectedDevice.id, { requestWipe: true, isStolen: false });
        await wakeDevice(selectedDevice.id, 'WIPE');
        if (demo) {
          await demoDelay(800);
          demoReset();
        }
        setActionNotice('Remote factory wipe instruction sent to handset.');
      }
    } catch (e) {
      const errMessage = e instanceof Error ? e.message : String(e);
      setActionNotice('Action dispatch error: ' + errMessage);
    } finally {
      setDispatching(null);
    }
  };

  const handleSignOut = () => {
    if (demo && onExitDemo) {
      onExitDemo();
      return;
    }
    if (onSignOut) {
      onSignOut();
      return;
    }
    auth()?.signOut();
  };

  // Heartbeat offline rule: if last seen > 10 minutes ago, mark offline
  const lastSeenMs = selectedDevice?.lastSeenAt ? new Date(selectedDevice.lastSeenAt).getTime() : 0;
  const isOffline = !demo && (lastSeenMs > 0 ? (Date.now() - lastSeenMs) > (10 * 60 * 1000) : false);

  // Google Maps turn-by-turn directions deep link
  const googleDirectionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${currentCoords[0]},${currentCoords[1]}`;
  const googleMapsUrl = `https://www.google.com/maps?q=${currentCoords[0]},${currentCoords[1]}`;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-950 font-sans select-none flex flex-col">
      {/* Unified Top Navigation */}
      <Navbar
        currentTab="track"
        onSwitchTab={(tab) => {
          if (tab === "download" && onSwitchToDownload) {
            onSwitchToDownload();
          }
        }}
        user={user}
        onSignOut={handleSignOut}
      />

      {/* Map and Overlays Container */}
      <div className="relative flex-1 w-full overflow-hidden">
        {/* 1. Full Bleed Map Layer (Crisp, zero-API-key OpenStreetMap) */}
        <div className={`absolute inset-0 z-0 ${darkMapMode ? 'dark-osm-tiles' : ''}`}>
          <MapContainer 
            center={currentCoords} 
            zoom={14} 
            zoomControl={false}
            scrollWheelZoom={true} 
            className="h-full w-full"
          >
            {/* Crisp, Unwatermarked OpenStreetMap Vector Raster */}
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={19}
            />
            <MapRecenter coords={currentCoords} />
            <MapController coords={currentCoords} />

            {/* Accuracy radius ring */}
            <Circle
              center={currentCoords}
              radius={accuracyMeters}
              pathOptions={{
                color: isStolen ? '#EF4444' : '#2563EB',
                fillColor: isStolen ? '#EF4444' : '#2563EB',
                fillOpacity: 0.12,
                weight: 1.5,
                dashArray: '4, 6'
              }}
            />

            {/* Precision Apple Radar Pin Marker */}
            <Marker position={currentCoords} icon={createApplePin(isStolen)}>
              <Popup className="apple-popup">
                <div className="p-1 font-sans">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`inline-block w-2 h-2 rounded-full ${isStolen ? 'bg-rose-500 animate-ping' : 'bg-blue-600'}`} />
                    <span className="text-[10px] uppercase font-bold tracking-wider text-blue-600">
                      {isStolen ? 'Theft Mode Active' : 'Live Position'}
                    </span>
                  </div>
                  <p className="font-bold text-sm text-slate-900">
                    {selectedDevice?.deviceName ?? 'Target Device'}
                  </p>
                  <p className="text-xs font-medium text-slate-700 mt-0.5">
                    {areaName}
                  </p>
                  <p className="text-[11px] font-mono text-slate-500 mt-1">
                    {currentCoords[0].toFixed(5)}°, {currentCoords[1].toFixed(5)}°
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Accuracy: ±{Math.round(accuracyMeters)}m
                  </p>
                </div>
              </Popup>
            </Marker>
          </MapContainer>
        </div>

        {/* Top Floating Utility HUD Badge on Desktop */}
        <div className="absolute top-4 right-20 z-[400] hidden lg:flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border border-black/5 dark:border-white/10 shadow-[0_8px_30px_rgb(0,0,0,0.12)] text-xs text-slate-800 dark:text-slate-200">
          <span className="flex h-2 w-2 relative">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isStolen ? 'bg-rose-400' : 'bg-blue-400'}`} />
            <span className={`relative inline-flex rounded-full h-2 w-2 ${isStolen ? 'bg-rose-500' : 'bg-blue-500'}`} />
          </span>
          <span className="font-semibold text-xs tracking-tight">{areaName}</span>
          <span className="text-slate-400">|</span>
          <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
            {currentCoords[0].toFixed(4)}°, {currentCoords[1].toFixed(4)}°
          </span>
          <button
            onClick={() => setDarkMapMode(!darkMapMode)}
            className={`ml-1 px-2 py-1 rounded-lg text-[10px] font-medium border transition flex items-center gap-1 ${
              darkMapMode 
                ? 'bg-blue-600/10 text-blue-500 border-blue-500/20' 
                : 'bg-black/5 dark:bg-white/5 text-slate-600 dark:text-slate-300 border-black/5 dark:border-white/5 hover:bg-black/10'
            }`}
            title="Toggle Dark Map Theme"
          >
            <Layers className="w-3 h-3" />
            {darkMapMode ? 'Dark Map' : 'Standard'}
          </button>
        </div>

        {/* 2. Apple Maps Floating Command Card (Desktop: Left Float / Mobile: Bottom Sheet) */}
        <div className={`
          absolute z-[1100] transition-all duration-500 ease-out
          md:top-4 md:left-6 md:bottom-auto md:right-auto md:w-[390px] md:max-h-[calc(100%-2rem)] md:flex md:flex-col
          bottom-0 left-0 right-0 w-full
          ${mobileDrawerOpen ? 'h-[85vh]' : 'h-24 md:h-auto'}
        `}>
        <div className="h-full min-h-0 flex-1 flex flex-col rounded-t-[32px] md:rounded-[28px] bg-slate-900/85 backdrop-blur-2xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.55)] overflow-hidden">
          
          {/* Mobile Drag Indicator */}
          <div 
            onClick={() => setMobileDrawerOpen(!mobileDrawerOpen)}
            className="md:hidden pt-3 pb-2 flex flex-col items-center cursor-pointer border-b border-white/5"
          >
            <div className="w-12 h-1.5 rounded-full bg-white/20 mb-2" />
            <div className="flex items-center justify-between w-full px-6">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${isStolen ? 'bg-rose-500 animate-ping' : 'bg-blue-500'}`} />
                <span className="font-semibold text-sm text-white truncate max-w-[180px]">
                  {selectedDevice?.deviceName ?? 'Target Device'}
                </span>
              </div>
              <div className="flex items-center gap-1 text-xs font-semibold text-blue-400">
                {mobileDrawerOpen ? <>Done <ChevronDown className="w-4 h-4" /></> : <>Controls <ChevronUp className="w-4 h-4" /></>}
              </div>
            </div>
          </div>

          {/* Scrollable Command Workspace */}
          <div className="flex-1 min-h-0 overflow-y-auto p-5 md:p-6 space-y-4 md:space-y-5">
            
            {/* Header / Identity Pill */}
            <div className="hidden md:flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-400 tracking-tight">
                    Trackd Console
                  </span>
                  {demo && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      SIMULATION
                    </span>
                  )}
                </div>
                <h1 className="text-xl font-bold tracking-tight text-white mt-0.5 flex items-center gap-2">
                  {selectedDevice?.deviceName ?? 'Redmi Note 14 Pro'}
                  <span className={`h-2 w-2 rounded-full ${isStolen ? 'bg-rose-500 animate-ping' : 'bg-blue-500'}`} />
                </h1>
                <span className="text-[11px] text-slate-400 block truncate max-w-[200px]">
                  {email}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-mono text-emerald-400">
                  <Battery className="w-3.5 h-3.5" />
                  {batteryLevel}%
                </div>
                <button 
                  onClick={handleSignOut}
                  title={demo ? 'Exit Demo' : 'Sign Out'}
                  className="p-2 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 text-slate-400 hover:text-white transition"
                >
                  {demo ? <MonitorPlay className="w-3.5 h-3.5 text-amber-400" /> : <LogOut className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Device Selector Pills if multiple devices exist */}
            {loading ? (
              <div className="flex items-center gap-2 p-3 rounded-2xl bg-white/[0.02] border border-white/5 text-xs text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin text-[#00F29D]" />
                <span>Connecting to phone…</span>
              </div>
            ) : devices.length > 1 ? (
              <div className="space-y-1.5">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
                  Your Devices ({devices.length})
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {devices.map((device) => (
                    <button
                      key={device.id}
                      onClick={() => setSelectedDevice(device)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                        device.id === selectedDevice?.id
                          ? 'bg-gradient-to-r from-[#00F29D] to-[#00C888] text-[#070B14] font-bold shadow-md shadow-[#00F29D]/20'
                          : 'bg-white/[0.04] text-slate-400 hover:text-white border border-white/5'
                      }`}
                    >
                      {device.deviceName}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Apple Maps Style Primary Directive Actions */}
            <div className="grid grid-cols-2 gap-2.5">
              <button 
                onClick={() => handleAction('LOCATE')}
                disabled={dispatching !== null}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-white/5 hover:bg-white/10 active:scale-[0.98] text-slate-200 hover:text-white font-medium text-xs border border-white/10 transition disabled:opacity-50"
              >
                {dispatching === 'LOCATE' ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[#00F29D]" />
                ) : (
                  <Crosshair className="w-4 h-4 text-[#00F29D]" />
                )}
                Locate Live
              </button>

              <button 
                onClick={() => handleAction('SIREN')}
                disabled={dispatching !== null}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-white/5 hover:bg-white/10 active:scale-[0.98] text-slate-200 hover:text-white font-medium text-xs border border-white/10 transition disabled:opacity-50"
              >
                {dispatching === 'SIREN' ? (
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                ) : (
                  <Volume2 className="w-4 h-4 text-amber-400" />
                )}
                Play Sound
              </button>
            </div>

            {/* Directions in Google Maps Action Button */}
            <a
              href={googleDirectionsUrl}
              target="_blank"
              rel="noreferrer"
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#00F29D]/15 to-[#00C888]/15 hover:from-[#00F29D]/25 hover:to-[#00C888]/25 border border-[#00F29D]/30 text-[#00F29D] font-semibold text-xs flex items-center justify-center gap-2 transition active:scale-[0.98]"
            >
              <Compass className="w-4 h-4 text-[#00F29D]" />
              <span>Get Directions in Google Maps</span>
              <ExternalLink className="w-3 h-3 opacity-60" />
            </a>

            {/* Offline Detection Banner - Bridges Web directly to SMS */}
            {isOffline && (
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-2">
                <div className="flex items-center gap-2 font-semibold text-amber-400">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping shrink-0" />
                  <span>Data connection lost (Offline)</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  The thief may have switched off Wi-Fi or Mobile Data. Send an offline SMS command from any borrowed phone to force a background satellite GPS reply:
                </p>
                <button
                  type="button"
                  onClick={() => handleSmsSend('#LOCATE#')}
                  className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 text-[#070B14] font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 active:scale-95 transition"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>{canOpenSmsLink() ? 'Send #LOCATE# via SMS' : 'Copy #LOCATE# Command'}</span>
                </button>
              </div>
            )}

            {/* Device Status Cards with Real Reverse Geocoding */}
            <div className="rounded-2xl bg-[#0D1322] border border-white/10 p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-slate-400">
                  <MapPin className="w-4 h-4 text-[#00F29D] shrink-0" />
                  <span>Area Location</span>
                </div>
                <span className="font-medium text-[#00F29D] max-w-[210px] text-right truncate" title={areaName}>
                  {areaName}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-slate-400">
                  <Compass className="w-4 h-4 text-[#00F29D] shrink-0" />
                  <span>Fix Coordinates</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-white font-medium">
                    {currentCoords[0].toFixed(4)}°, {currentCoords[1].toFixed(4)}°
                  </span>
                  <a 
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#00F29D] hover:text-[#00DCA0]"
                    title="Open in Maps"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-slate-400">
                  <Signal className={`w-4 h-4 shrink-0 ${isOffline ? 'text-amber-400' : 'text-emerald-400'}`} />
                  <span>Status</span>
                </div>
                {isOffline ? (
                  <span className="font-medium text-amber-400 flex items-center gap-1.5 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    Offline (Heartbeat Stale)
                  </span>
                ) : (
                  <span className="font-medium text-emerald-400 flex items-center gap-1.5 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Online (Live Socket)
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-slate-400">
                  <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>Last Reported</span>
                </div>
                <span className="font-mono text-slate-300">
                  {selectedDevice?.lastSeenAt ? formatLastSeen(selectedDevice.lastSeenAt) : 'Just now'}
                </span>
              </div>
            </div>

            {/* Action Feedback Banner */}
            {actionNotice && (
              <div className="p-3 rounded-2xl bg-[#00F29D]/10 border border-[#00F29D]/30 text-[#00F29D] text-xs flex items-start gap-2">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#00F29D] mt-1.5 shrink-0" />
                <span>{actionNotice}</span>
              </div>
            )}

            {/* Emergency Armed Toggle & Wipe Actions */}
            <div className="space-y-2">
              {isStolen ? (
                <button 
                  onClick={() => handleAction('SAFE')}
                  disabled={dispatching !== null}
                  className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 font-semibold text-xs flex items-center justify-center gap-2 transition active:scale-[0.98] disabled:opacity-50"
                >
                  {dispatching === 'SAFE' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-4 h-4" />
                  )}
                  Device Recovered (Mark Safe)
                </button>
              ) : (
                <button 
                  onClick={() => handleAction('STOLEN')}
                  disabled={dispatching !== null}
                  className="w-full py-3.5 px-4 rounded-2xl bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-rose-600/30 transition disabled:opacity-50"
                >
                  {dispatching === 'STOLEN' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Lock className="w-4 h-4" />
                  )}
                  Mark as Stolen
                </button>
              )}

              {/* V2: Remote Factory Wipe held for V2 (Code preserved) */}
              {ENABLE_REMOTE_WIPE_V2 && (
                <button 
                  onClick={() => setShowWipeDialog(true)}
                  disabled={dispatching !== null}
                  className="w-full py-3 px-4 rounded-2xl bg-transparent hover:bg-rose-950/20 text-slate-500 hover:text-rose-400 text-xs font-semibold flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remote Factory Wipe
                </button>
              )}
            </div>

            {/* Offline SMS Fail-Safe Collapsible Accordion */}
            <div className="pt-2 border-t border-white/5">
              <div className="flex items-center justify-between py-1">
                <button
                  type="button"
                  onClick={() => setShowSmsDirectives(!showSmsDirectives)}
                  className="flex items-center gap-2 text-left text-slate-400 hover:text-slate-200 transition group flex-1"
                >
                  <span className="text-xs font-medium text-slate-300 group-hover:text-white transition">
                    No internet? Use SMS commands instead
                  </span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${showSmsDirectives ? 'rotate-180' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowSetupModal(true)}
                  className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] text-slate-400 hover:text-[#00F29D] border border-white/5 flex items-center gap-1 transition"
                  title="Configure SIM phone number and PIN"
                >
                  <Settings2 className="w-3 h-3" />
                  <span>{profilePhone ? profilePhone : 'Set SIM & PIN'}</span>
                </button>
              </div>

              {showSmsDirectives && (
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 font-mono block">Zero internet required · Send directly to handset</span>
                    {!profilePhone && (
                      <button
                        onClick={() => setShowSetupModal(true)}
                        className="text-[10px] text-[#00F29D] hover:underline font-semibold"
                      >
                        + Add SIM number
                      </button>
                    )}
                  </div>
                  {smsError && (
                    <div className="px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[11px] flex items-center justify-between">
                      <span>{smsError}</span>
                      <button 
                        onClick={() => setShowSetupModal(true)}
                        className="underline font-semibold ml-2 text-rose-300 hover:text-white text-[10px]"
                      >
                        Set PIN
                      </button>
                    </div>
                  )}
                  {[
                    { label: 'Force Location Fix',  template: '#LOCATE#' },
                    { label: 'Trigger Sound Siren', template: '#SIREN#' },
                    { label: 'Silence Siren',        template: '#SILENCE#' },
                    { label: 'Engage Theft Lock',   template: '#STOLEN#' },
                    { label: 'Disarm Theft Lock',   template: '#SAFE#' }
                  ].map((sms) => {
                    const st = smsStates[sms.template] ?? 'idle';
                    const busy = st === 'busy';
                    const isMobile = canOpenSmsLink();
                    return (
                      <div key={sms.template} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5 text-xs font-mono">
                        <div>
                          <span className="text-slate-400 text-[10px] block">{sms.label}</span>
                          <div className="flex items-baseline gap-1 mt-0.5">
                            <span className="text-[#00F29D] font-bold">{sms.template}</span>
                            {/* PIN always masked */}
                            <span className="text-amber-400 font-bold tracking-widest">****</span>
                          </div>
                          {st === 'sent'   && <span className="text-emerald-400 text-[10px] font-sans">SMS composer opened ✓</span>}
                          {st === 'copied' && <span className="text-emerald-400 text-[10px] font-sans">Copied with PIN ✓</span>}
                        </div>
                        <button
                          onClick={() => handleSmsSend(sms.template)}
                          disabled={busy}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition text-[11px] font-sans border ${
                            busy
                              ? 'opacity-50 cursor-wait bg-white/[0.04] text-slate-400 border-white/5'
                              : isMobile
                                ? 'bg-[#00F29D]/15 text-[#00F29D] hover:bg-[#00F29D]/25 border-[#00F29D]/30 font-semibold'
                                : 'bg-white/[0.04] text-slate-300 hover:text-white hover:bg-white/10 border-white/5'
                          }`}
                          title={isMobile ? 'Send via SMS' : 'Copy command with PIN'}
                        >
                          {isMobile ? (
                            <><MessageSquare className="w-3.5 h-3.5" />{busy ? '…' : st === 'sent' ? 'Sent' : 'Send'}</>
                          ) : (
                            <><Copy className="w-3.5 h-3.5" />{busy ? '…' : st === 'copied' ? <><Check className="w-3 h-3 text-emerald-400" />Copied</> : 'Copy'}</>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
      </div>

      {/* Configure Device SIM & PIN Modal */}
      {showSetupModal && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-3xl bg-[#0D1322] border border-white/10 p-5 shadow-2xl space-y-4 ring-1 ring-white/5">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-[#00F29D]/15 text-[#00F29D]">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Device SIM & PIN</h3>
                  <p className="text-[11px] text-slate-400">Stored securely for 1-tap SMS commands</p>
                </div>
              </div>
              <button 
                onClick={() => { setShowSetupModal(false); setSetupError(null); }}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSmsCredentials} className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Device Phone Number (SIM in tracked device)
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                  <input
                    type="tel"
                    value={setupPhone}
                    onChange={(e) => setSetupPhone(e.target.value)}
                    placeholder="+233 24 000 0000"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#070B14] border border-white/10 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-[#00F29D] focus:ring-1 focus:ring-[#00F29D]/30"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Master Recovery PIN (4 digits)
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                  <input
                    type="password"
                    maxLength={4}
                    value={setupPin}
                    onChange={(e) => setSetupPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="4 digits (e.g. 1234)"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#070B14] border border-white/10 text-white text-xs font-mono tracking-widest placeholder:text-slate-600 focus:outline-none focus:border-[#00F29D] focus:ring-1 focus:ring-[#00F29D]/30"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Encrypted client-side with AES-256 before saving to your profile.
                </p>
              </div>

              {setupError && (
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                  {setupError}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowSetupModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 text-xs font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={setupSaving}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#00F29D] to-[#00C888] text-[#070B14] font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-[0.98] disabled:opacity-50 shadow-md shadow-[#00F29D]/20"
                >
                  {setupSaving && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#070B14]" />}
                  Save Credentials
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Factory Wipe Confirmation Modal */}
      {showWipeDialog && (
        <WipeDialog 
          open={showWipeDialog} 
          deviceName={selectedDevice?.deviceName ?? 'Target Device'}
          onClose={() => setShowWipeDialog(false)} 
          onConfirm={async () => {
            setShowWipeDialog(false);
            await handleAction('WIPE');
          }} 
        />
      )}

    </div>
  );
}
