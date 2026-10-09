import { useState, useEffect, useMemo } from 'react';
import type { User } from 'firebase/auth';
import { 
  Crosshair, Volume2, ShieldCheck, Lock, Trash2, 
  Battery, Copy, Check, ChevronUp, ChevronDown, 
  LogOut, MapPin, Signal, Clock, Compass, Layers, 
  Plus, Minus, ExternalLink, MonitorPlay, Loader2
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  subscribeDevices, subscribeTelemetry, updateDevice, 
  wakeDevice, type Device, type TelemetryLog 
} from '../lib/api';
import { auth } from '../lib/firebase';
import { DEMO_USER_ID, demoAppendTelemetry, demoDelay, demoReset } from '../lib/demo';
import { formatLastSeen } from '../lib/format';
import { getAreaName } from '../lib/geo';
import WipeDialog from './WipeDialog';

interface Props {
  user?: User | null;
  demo?: boolean;
  onExitDemo?: () => void;
  onSignOut?: () => void;
}

// Apple Maps inspired precision marker
const createApplePin = (isStolen: boolean) =>
  L.divIcon({
    className: 'apple-radar-pin',
    html: `
      <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 48px; height: 48px;">
        <div style="position: absolute; width: 48px; height: 48px; border-radius: 9999px; background: ${
          isStolen ? 'rgba(239, 68, 68, 0.25)' : 'rgba(37, 99, 235, 0.22)'
        }; animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
        <div style="position: relative; width: 26px; height: 26px; border-radius: 9999px; background: ${
          isStolen ? '#DC2626' : '#2563EB'
        }; border: 3.5px solid #FFFFFF; box-shadow: 0 4px 14px rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center;">
          <div style="width: 8px; height: 8px; border-radius: 9999px; background: white;"></div>
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
    <div className="absolute top-6 right-6 z-[500] flex flex-col items-end gap-3 pointer-events-none">
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

export default function WebDashboard({ user, demo = false, onExitDemo, onSignOut }: Props) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [showWipeDialog, setShowWipeDialog] = useState(false);
  const ENABLE_REMOTE_WIPE_V2 = false; // Remote Factory Wipe held for V2 (code preserved)
  const [dispatching, setDispatching] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [darkMapMode, setDarkMapMode] = useState(false);
  const [areaName, setAreaName] = useState<string>('Resolving location…');
  const [showSmsDirectives, setShowSmsDirectives] = useState(false);

  const userId = demo ? DEMO_USER_ID : user?.uid ?? 'demo-user';
  const email = demo ? 'demo@trackd.local' : user?.email ?? 'Operator';

  // Subscribe to device fleet
  useEffect(() => {
    setLoading(true);
    const unsub = subscribeDevices(
      userId,
      (incoming) => {
        setDevices(incoming);
        setSelectedDevice((prev) => {
          if (!prev) return incoming[0] ?? null;
          const match = incoming.find((d) => d.id === prev.id);
          return match ?? incoming[0] ?? null;
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

  const copySms = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
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

  const googleMapsUrl = `https://www.google.com/maps?q=${currentCoords[0]},${currentCoords[1]}`;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-950 font-sans select-none">
      
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
      <div className="absolute top-6 right-20 z-[400] hidden lg:flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border border-black/5 dark:border-white/10 shadow-[0_8px_30px_rgb(0,0,0,0.12)] text-xs text-slate-800 dark:text-slate-200">
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
        absolute z-[1000] transition-all duration-500 ease-out
        md:top-6 md:left-6 md:w-[390px] md:max-h-[calc(100vh-3rem)]
        bottom-0 left-0 right-0 w-full
        ${mobileDrawerOpen ? 'h-[85vh]' : 'h-24 md:h-auto'}
      `}>
        <div className="h-full flex flex-col rounded-t-[32px] md:rounded-[28px] bg-slate-900/85 backdrop-blur-2xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.55)] overflow-hidden">
          
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
          <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-4 md:space-y-5">
            
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

            {/* Fleet Asset Selector Pills if multiple devices exist */}
            {loading ? (
              <div className="flex items-center gap-2 p-3 rounded-2xl bg-white/[0.02] border border-white/5 text-xs text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                <span>Contacting fleet telemetry…</span>
              </div>
            ) : devices.length > 1 ? (
              <div className="space-y-1.5">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
                  Select Fleet Asset ({devices.length})
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {devices.map((device) => (
                    <button
                      key={device.id}
                      onClick={() => setSelectedDevice(device)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                        device.id === selectedDevice?.id
                          ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/30'
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
                  <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
                ) : (
                  <Crosshair className="w-4 h-4 text-slate-300" />
                )}
                Locate Live
              </button>

              <button 
                onClick={() => handleAction('SIREN')}
                disabled={dispatching !== null}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-white/5 hover:bg-white/10 active:scale-[0.98] text-slate-200 hover:text-white font-medium text-xs border border-white/10 transition disabled:opacity-50"
              >
                {dispatching === 'SIREN' ? (
                  <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
                ) : (
                  <Volume2 className="w-4 h-4 text-slate-300" />
                )}
                Play Sound
              </button>
            </div>

            {/* Tactical Status Cards with Real Reverse Geocoding */}
            <div className="rounded-2xl bg-white/[0.03] border border-white/5 p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-slate-400">
                  <MapPin className="w-4 h-4 text-blue-400 shrink-0" />
                  <span>Area Location</span>
                </div>
                <span className="font-medium text-emerald-400 max-w-[190px] text-right truncate" title={areaName}>
                  {areaName}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-slate-400">
                  <Compass className="w-4 h-4 text-blue-400 shrink-0" />
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
                    className="text-blue-400 hover:text-blue-300"
                    title="Open in Maps"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-slate-400">
                  <Signal className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Status</span>
                </div>
                <span className="font-medium text-emerald-400 flex items-center gap-1.5 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Online
                </span>
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
              <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs flex items-start gap-2">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
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
              <button
                type="button"
                onClick={() => setShowSmsDirectives(!showSmsDirectives)}
                className="w-full flex items-center justify-between py-2 text-left text-slate-400 hover:text-slate-200 transition group"
              >
                <span className="text-xs font-medium text-slate-300 group-hover:text-white transition">
                  No internet? Use SMS commands instead
                </span>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${showSmsDirectives ? 'rotate-180' : ''}`} />
              </button>

              {showSmsDirectives && (
                <div className="space-y-2 pt-2">
                  <span className="text-[10px] text-slate-500 font-mono block">Zero internet required · Send directly to handset</span>
                  {[
                    { label: 'Force Location Fix', code: '#LOCATE#[PIN]' },
                    { label: 'Trigger Sound Siren', code: '#SIREN#[PIN]' },
                    { label: 'Engage Theft Lock', code: '#STOLEN#[PIN]' },
                    { label: 'Disarm Theft Lock', code: '#SAFE#[PIN]' }
                  ].map((sms, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5 text-xs font-mono">
                      <div>
                        <span className="text-slate-400 text-[10px] block">{sms.label}</span>
                        <span className="text-blue-400 font-bold">{sms.code}</span>
                      </div>
                      <button 
                        onClick={() => copySms(sms.code)}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition"
                        title="Copy SMS command"
                      >
                        {copiedCode === sms.code ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

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
