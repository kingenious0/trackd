import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { 
  MessageSquare, 
  Lock, 
  ShieldCheck, 
  MapPin, 
  AlertTriangle, 
  Copy,
  Download,
  Smartphone,
  CheckCircle2,
  Terminal,
  Volume2,
  Radio,
  ChevronRight
} from 'lucide-react';
import Navbar from './Navbar';

interface DownloadViewProps {
  onSwitchToLogin: () => void;
}

const SHA256_HASH = 'f8032a16571a2e79b2960af2e26299eecc14ed57e280ea81e824cdf948c872a7';

export default function DownloadView({ onSwitchToLogin }: DownloadViewProps) {
  const [copiedHash, setCopiedHash] = useState(false);
  const [activeCommand, setActiveCommand] = useState<string | null>(null);
  const [simulatedLogs, setSimulatedLogs] = useState<string[]>([
    'SYSTEM READY • DEVICE PROTECTION ACTIVE',
    'LISTENING FOR ENCRYPTED SMS HANDSHAKE OVER GSM (2G/3G/4G/5G)',
  ]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [byteCounter, setByteCounter] = useState(140);

  const downloadUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/downloads/trackd-latest.apk` 
    : '/downloads/trackd-latest.apk';

  const handleCopyHash = () => {
    navigator.clipboard.writeText(SHA256_HASH);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2500);
  };

  const runSimulatedCommand = (cmd: string) => {
    if (isSimulating) return;
    setActiveCommand(cmd);
    setIsSimulating(true);

    if (cmd === '#LOCATE#') {
      setByteCounter(138);
      setSimulatedLogs([
        '> DISPATCHING GSM SMS: #LOCATE# [PIN: ******]',
        'PDU transmitted over cellular voice/SMS channel (zero data used)',
      ]);

      setTimeout(() => {
        setSimulatedLogs(prev => [
          ...prev,
          'DEVICE WAKE-UP ACK RECEIVED • GSM CARRIER: MTN GH',
          'GPS HARDWARE POWERED ON • ACQUIRING SATELLITE FIX…',
        ]);
      }, 1800);

      setTimeout(() => {
        setSimulatedLogs(prev => [
          ...prev,
          'SATELLITE LOCK ACQUIRED (Accuracy: 4.2m • Latency: 5.6s)',
          'REVERSE GEOCODE: Near New Auditorium, AAMUSTED, Tanoso, Kumasi',
          'FOLLOW-UP SMS RETURNED: https://maps.google.com/?q=6.6974,-1.6741',
        ]);
        setIsSimulating(false);
      }, 4200);
    } else if (cmd === '#SIREN#') {
      setByteCounter(124);
      setSimulatedLogs([
        '> DISPATCHING GSM SMS: #SIREN# [PIN: ******]',
        'Bypassing system do-not-disturb & hardware silent switch…',
      ]);

      setTimeout(() => {
        setSimulatedLogs(prev => [
          ...prev,
          'STREAM_ALARM OVERRIDDEN AT MAX VOLUME (100%)',
          'MAX-INTENSITY PULSING PIEZO SIREN TRIGGERED (30 SECONDS)',
        ]);
        setIsSimulating(false);
      }, 1600);
    } else if (cmd === '#STOLEN#' || cmd === '#MOMO#') {
      setByteCounter(132);
      setSimulatedLogs([
        '> DISPATCHING GSM SMS: #STOLEN# [APP SHIELD ARMED]',
        'Accessibility guard armed for financial & wallet packages…',
      ]);

      setTimeout(() => {
        setSimulatedLogs(prev => [
          ...prev,
          'APP PROTECTION READY: MTN MoMo, Telecel Cash, Zeepay protected',
          'Any unauthorized launch is exited with system crash dialogue',
        ]);
        setIsSimulating(false);
      }, 1600);
    } else if (cmd === '#LOCK#') {
      setByteCounter(120);
      setSimulatedLogs([
        '> DISPATCHING GSM SMS: #LOCK# [PIN: ******]',
        'Device admin policy triggered: Instant keyguard lock',
      ]);

      setTimeout(() => {
        setSimulatedLogs(prev => [
          ...prev,
          'KEYGUARD PIN LOCKED • BIOMETRIC SENSORS TEMPORARILY DISABLED',
          'Power menu shutdown attempt will be redirected to home launcher',
        ]);
        setIsSimulating(false);
      }, 1500);
    }
  };

  return (
    <div className="min-h-screen bg-[#070B14] text-[#EDEDED] font-sans antialiased selection:bg-[#00F29D] selection:text-[#070B14] flex flex-col justify-between relative overflow-x-hidden">
      
      {/* Background Glow Elements */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[450px] bg-gradient-to-b from-[#00F29D]/10 via-[#00F29D]/3 to-transparent rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute top-96 right-0 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-[150px] pointer-events-none" />

      {/* Unified Top Navigation */}
      <Navbar 
        currentTab="download" 
        onSwitchTab={(tab) => {
          if (tab === "track") onSwitchToLogin();
        }} 
      />

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-8 md:py-14 space-y-16 relative z-10">
        
        {/* ================= HERO SECTION (Pyxils-Style) ================= */}
        <section className="space-y-8 text-center max-w-4xl mx-auto">
          {/* Top Eyebrow Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#0D1826] border border-[#00F29D]/30 shadow-lg shadow-[#00F29D]/10">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00F29D] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00F29D]"></span>
            </span>
            <span className="text-[11px] font-mono font-bold tracking-wider uppercase text-[#00F29D]">
              THE UNKILLABLE RECOVERY NETWORK
            </span>
          </div>

          {/* Main Headline */}
          <div className="space-y-4">
            <h1 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight text-white leading-[1.1] sm:leading-[1.12]">
              Like Google Find My Device.<br />
              <span className="bg-gradient-to-r from-[#00F29D] via-[#2BF7B5] to-[#4EFAFF] bg-clip-text text-transparent">
                Except it actually works offline.
              </span>
            </h1>
            <p className="max-w-2xl mx-auto text-sm sm:text-base text-slate-300 leading-relaxed font-normal">
              When a phone is stolen, thieves immediately pull the SIM, turn off Wi-Fi, or toggle Airplane Mode. 
              Trackd stays alive over plain 2G GSM SMS, protects Mobile Money wallets, and locks power-down menus without relying on Google Play Services.
            </p>
          </div>

          {/* Action Row */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <a
              href="/downloads/trackd-latest.apk"
              download="trackd-v1.2.4.apk"
              className="py-3 px-6 rounded-xl bg-gradient-to-r from-[#00F29D] to-[#00C888] hover:brightness-105 active:scale-[0.98] transition text-[#070B14] font-bold text-sm flex items-center gap-2.5 shadow-xl shadow-[#00F29D]/20 border border-[#00F29D]/40"
            >
              <Download className="w-4 h-4 text-[#070B14]" />
              <span>Download Trackd APK (v1.2.4)</span>
            </a>
            
            <button
              onClick={() => onSwitchToLogin()}
              className="py-3 px-5 rounded-xl bg-[#0D1322] hover:bg-[#121A2F] border border-white/10 hover:border-white/20 active:scale-[0.98] transition text-white font-semibold text-sm flex items-center gap-2"
            >
              <MapPin className="w-4 h-4 text-[#00F29D]" />
              <span>Open Web Console</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>

          {/* Meta Trust Strip */}
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-mono text-slate-400">
            <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" /> Production Signed
            </span>
            <span>•</span>
            <span>Android 8.0 to 15 (API 35)</span>
            <span>•</span>
            <button
              type="button"
              onClick={handleCopyHash}
              title="Copy SHA-256 fingerprint"
              className="hover:text-white flex items-center gap-1 transition"
            >
              <span>SHA-256: b0f478...bbd9</span>
              {copiedHash ? (
                <span className="text-[#00F29D] font-bold">✓ Copied</span>
              ) : (
                <Copy className="w-3 h-3 text-slate-400" />
              )}
            </button>
          </div>
        </section>

        {/* ================= INTERACTIVE VIEWPORT SIMULATOR ================= */}
        <section className="rounded-3xl bg-[#0A0F1D]/90 border border-white/10 shadow-2xl p-5 sm:p-7 relative overflow-hidden backdrop-blur-md ring-1 ring-white/5">
          <div className="absolute top-0 right-0 w-80 h-80 bg-[#00F29D]/10 rounded-full blur-3xl pointer-events-none" />

          {/* Widget Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-4 mb-5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#00F29D]/15 border border-[#00F29D]/30 flex items-center justify-center text-[#00F29D]">
                <Radio className="w-4 h-4 animate-pulse" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Interactive Telemetry & SMS Test Bench</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-400/10 text-amber-300 border border-amber-400/25">
                    DEMO SIMULATOR
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  Tap any emergency command below to simulate how Trackd executes offline recovery over 2G GSM SMS.
                </p>
              </div>
            </div>

            {/* Live Monospace Counter */}
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="text-slate-400">PAYLOAD SIZE:</span>
              <span className="px-2 py-0.5 rounded bg-black/40 border border-white/10 text-[#00F29D] font-bold">
                {byteCounter} BYTES (1 PDU)
              </span>
            </div>
          </div>

          {/* Command Buttons Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
            <button
              onClick={() => runSimulatedCommand('#LOCATE#')}
              disabled={isSimulating}
              className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                activeCommand === '#LOCATE#'
                  ? 'bg-[#00F29D]/15 border-[#00F29D] text-white shadow-lg shadow-[#00F29D]/10'
                  : 'bg-[#0D1424] border-white/10 text-slate-300 hover:border-[#00F29D]/40 hover:text-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-[#00F29D]">#LOCATE#</span>
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <span className="text-[11px] text-slate-400 mt-1">Satellite GPS Fix</span>
            </button>

            <button
              onClick={() => runSimulatedCommand('#SIREN#')}
              disabled={isSimulating}
              className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                activeCommand === '#SIREN#'
                  ? 'bg-amber-500/15 border-amber-400 text-white shadow-lg shadow-amber-500/10'
                  : 'bg-[#0D1424] border-white/10 text-slate-300 hover:border-amber-400/40 hover:text-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-amber-400">#SIREN#</span>
                <Volume2 className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <span className="text-[11px] text-slate-400 mt-1">Bypass Silent Mode</span>
            </button>

            <button
              onClick={() => runSimulatedCommand('#STOLEN#')}
              disabled={isSimulating}
              className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                activeCommand === '#STOLEN#'
                  ? 'bg-purple-500/15 border-purple-400 text-white shadow-lg shadow-purple-500/10'
                  : 'bg-[#0D1424] border-white/10 text-slate-300 hover:border-purple-400/40 hover:text-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-purple-400">#STOLEN#</span>
                <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <span className="text-[11px] text-slate-400 mt-1">Financial App Shield</span>
            </button>

            <button
              onClick={() => runSimulatedCommand('#LOCK#')}
              disabled={isSimulating}
              className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                activeCommand === '#LOCK#'
                  ? 'bg-sky-500/15 border-sky-400 text-white shadow-lg shadow-sky-500/10'
                  : 'bg-[#0D1424] border-white/10 text-slate-300 hover:border-sky-400/40 hover:text-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-sky-400">#LOCK#</span>
                <Lock className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <span className="text-[11px] text-slate-400 mt-1">Block Power-Off</span>
            </button>
          </div>

          {/* Monospace Console Stream */}
          <div className="rounded-2xl bg-black/70 border border-white/10 p-4 font-mono text-xs space-y-1.5 shadow-inner">
            <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-white/5 pb-2 mb-2">
              <span className="flex items-center gap-1.5 text-slate-300 font-semibold">
                <Terminal className="w-3.5 h-3.5 text-[#00F29D]" />
                TELEMETRY CONSOLE FEED
              </span>
              <span className="text-emerald-400">
                {isSimulating ? 'TRANSMITTING & LOCKING…' : 'IDLE / READY'}
              </span>
            </div>

            {simulatedLogs.map((log, idx) => (
              <div 
                key={idx} 
                className={`flex items-start gap-2 ${
                  log.startsWith('>') 
                    ? 'text-white font-bold' 
                    : log.includes('SATELLITE LOCK') || log.includes('REVERSE GEOCODE') 
                    ? 'text-[#00F29D]' 
                    : log.includes('OVERRIDDEN') || log.includes('DECOY')
                    ? 'text-amber-300'
                    : 'text-slate-400'
                }`}
              >
                <span className="text-slate-400 shrink-0 select-none">[{idx + 1}]</span>
                <span>{log}</span>
              </div>
            ))}

            {isSimulating && (
              <div className="flex items-center gap-2 text-slate-400 animate-pulse pt-1">
                <span>…</span>
                <span>Waiting for carrier signal acknowledgement…</span>
              </div>
            )}
          </div>
        </section>

        {/* ================= 2-COLUMN INSTALL & QR SECTION ================= */}
        <section className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          {/* Left Column: 2 Easy Steps */}
          <div className="md:col-span-7 space-y-6">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#00F29D]/10 border border-[#00F29D]/30 text-[11px] font-semibold text-[#00F29D] mb-3">
                <Smartphone className="w-3.5 h-3.5" />
                <span>Trackd • Mobile Device Protection</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
                Arm your phone in 2 easy steps
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-2 leading-relaxed">
                Autonomous anti-theft defense. Works over secure cloud telemetry and SMS fallback even when offline, in airplane mode, or SIM-swapped.
              </p>
            </div>

            <div className="space-y-4 pt-1">
              {/* Step 1 */}
              <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-[#0D1322]/80 border border-white/5 backdrop-blur-sm hover:border-[#00F29D]/20 transition">
                <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-[#00F29D] to-[#00C888] text-[#070B14] font-black text-xs flex items-center justify-center shrink-0 mt-0.5 shadow-md shadow-[#00F29D]/30">
                  1
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Install Trackd on your device
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Download the app, log in with your account, configure your secret 6-digit emergency PIN, and pair your trusted emergency contact number.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-[#0D1322]/80 border border-white/5 backdrop-blur-sm hover:border-[#00F29D]/20 transition">
                <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-[#00F29D] to-[#00C888] text-[#070B14] font-black text-xs flex items-center justify-center shrink-0 mt-0.5 shadow-md shadow-[#00F29D]/30">
                  2
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Track & command from any browser or SMS
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Access your live GPS radar map, dispatch sirens, lock mobile money apps, or trigger instant SMS recovery codes with a single tap.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Download & QR Card */}
          <div className="md:col-span-5">
            <div className="rounded-3xl bg-[#0D1322] border border-white/10 p-6 flex flex-col items-center text-center shadow-2xl relative overflow-hidden ring-1 ring-white/5">
              <div className="absolute top-0 right-0 w-36 h-36 bg-[#00F29D]/10 rounded-full blur-3xl pointer-events-none" />
              
              {/* QR Code Container */}
              <div className="w-48 h-48 rounded-2xl bg-[#070B14] p-3.5 flex items-center justify-center border border-[#00F29D]/20 shadow-inner">
                <div className="p-2 bg-white rounded-xl shadow-md">
                  <QRCodeSVG 
                    value={downloadUrl} 
                    size={160}
                    level="M"
                    includeMargin={false}
                  />
                </div>
              </div>

              <div className="mt-4 space-y-1">
                <p className="text-sm font-semibold text-white">
                  Scan with your phone camera
                </p>
                <p className="text-xs text-slate-400">
                  Or tap below to download directly to this device
                </p>
              </div>

              {/* Download Action Button */}
              <a
                href="/downloads/trackd-latest.apk"
                download="trackd-v1.2.4.apk"
                className="mt-5 w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#00F29D] to-[#00C888] hover:brightness-105 text-[#070B14] font-bold text-xs sm:text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition shadow-lg shadow-[#00F29D]/25 border border-[#00F29D]/40"
              >
                <Download className="w-4 h-4 text-[#070B14]" />
                <span>Download Trackd APK</span>
              </a>

              {/* Version & Checksum Meta */}
              <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-400">
                <span className="font-mono text-[#00F29D] font-bold bg-[#00F29D]/10 px-2 py-0.5 rounded-full border border-[#00F29D]/25">
                  v1.2.4 Latest
                </span>
                <span>•</span>
                <span>Production Key</span>
                <span>•</span>
                <button
                  type="button"
                  onClick={handleCopyHash}
                  title="Click to copy full SHA-256 checksum"
                  className="hover:text-white flex items-center gap-1 transition"
                >
                  <span className="font-mono">SHA-256</span>
                  {copiedHash ? (
                    <span className="text-[#00F29D] font-medium flex items-center gap-0.5">
                      <CheckCircle2 className="w-3 h-3" /> Copied
                    </span>
                  ) : (
                    <Copy className="w-3 h-3 text-slate-400" />
                  )}
                </button>
              </div>

              {/* What's New Pill in Card */}
              <div className="mt-4 w-full p-2.5 rounded-xl bg-white/[0.03] border border-white/5 text-left text-[11px] text-slate-300 space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-[#00F29D] font-bold block">What&apos;s New in v1.2.4</span>
                <ul className="text-slate-400 text-[11px] leading-snug space-y-0.5 list-disc list-inside">
                  <li>OEM Autostart &amp; Task Killer Protection (Transsion Tecno/Infinix, Xiaomi/HyperOS, Oppo, Vivo).</li>
                  <li>Full Web &amp; SMS Remote Commands (Siren, Silence, Locate, Stolen, Safe, Wipe).</li>
                  <li>Instant Stolen lockdown: blocks Ghana mobile money (*170#, *110#), fintech apps, and power off menu.</li>
                  <li>Asynchronous goAsync SMS GPS telemetry with 15s failsafe and flexible command syntax.</li>
                  <li>One-tap &ldquo;Verify protection&rdquo; live handset self-test.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ================= HONEST COMPARISON MATRIX ================= */}
        <section className="space-y-6">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <h2 className="text-xl sm:text-2xl font-extrabold text-white">
              How Trackd Compares to Google Find Hub
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">
              An honest, technical breakdown of where each service excels and why direct GSM fallback matters.
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#0A0F1D]/80 backdrop-blur-sm shadow-xl">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="border-b border-white/10 bg-white/[0.02] text-slate-400 uppercase tracking-wider text-[11px] font-mono">
                <tr>
                  <th className="py-3.5 px-4 sm:px-6">Security Feature / Capability</th>
                  <th className="py-3.5 px-4 sm:px-6 text-slate-300">Google Find Hub</th>
                  <th className="py-3.5 px-4 sm:px-6 text-[#00F29D] font-bold bg-[#00F29D]/5">Trackd Protection</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-300">
                <tr>
                  <td className="py-3 px-4 sm:px-6 font-medium text-white">
                    Data & Wi-Fi Cut (Offline)
                  </td>
                  <td className="py-3 px-4 sm:px-6 text-slate-400">
                    Relies on nearby Android Bluetooth mesh
                  </td>
                  <td className="py-3 px-4 sm:px-6 text-[#00F29D] font-medium bg-[#00F29D]/5">
                    Direct GSM 2G SMS works with 0 internet
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 sm:px-6 font-medium text-white">
                    Google Play Services Dependency
                  </td>
                  <td className="py-3 px-4 sm:px-6 text-slate-400">
                    Required (fails on non-GMS devices)
                  </td>
                  <td className="py-3 px-4 sm:px-6 text-[#00F29D] font-medium bg-[#00F29D]/5">
                    Autonomous standalone native daemon
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 sm:px-6 font-medium text-white">
                    SIM Card Swap Detection
                  </td>
                  <td className="py-3 px-4 sm:px-6 text-slate-400">
                    No alert sent to backup number
                  </td>
                  <td className="py-3 px-4 sm:px-6 text-[#00F29D] font-medium bg-[#00F29D]/5">
                    Instant SMS to emergency contact with thief&apos;s new number & GPS
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 sm:px-6 font-medium text-white">
                    Mobile Money / Banking Protection
                  </td>
                  <td className="py-3 px-4 sm:px-6 text-slate-400">
                    No application-level defense
                  </td>
                  <td className="py-3 px-4 sm:px-6 text-[#00F29D] font-medium bg-[#00F29D]/5">
                    Instant app shield blocks unauthorized MoMo access
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 sm:px-6 font-medium text-white">
                    Power Menu Interception
                  </td>
                  <td className="py-3 px-4 sm:px-6 text-slate-400">
                    Thief can power down device
                  </td>
                  <td className="py-3 px-4 sm:px-6 text-[#00F29D] font-medium bg-[#00F29D]/5">
                    Blocks power menu without PIN
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 sm:px-6 font-medium text-white">
                    Crowdsourced Bluetooth Mesh
                  </td>
                  <td className="py-3 px-4 sm:px-6 text-emerald-400 font-medium">
                    Worldwide network of Android phones
                  </td>
                  <td className="py-3 px-4 sm:px-6 text-slate-400 bg-[#00F29D]/5">
                    No mesh — direct device-to-owner connection
                  </td>
                </tr>
                <tr>
                  <td className="py-3 px-4 sm:px-6 font-medium text-white">
                    Battery Dead / Fastboot Wipe
                  </td>
                  <td className="py-3 px-4 sm:px-6 text-slate-500">
                    Offline (Hardware limit)
                  </td>
                  <td className="py-3 px-4 sm:px-6 text-slate-500 bg-[#00F29D]/5">
                    Offline (Hardware limit)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* ================= DEFENSE CAPABILITIES CARDS ================= */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Autonomous Defense Capabilities
            </h3>
            <span className="text-[11px] text-[#00F29D] font-medium">Native Android App</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* SMS */}
            <div className="rounded-2xl bg-[#0D1322]/80 border border-white/5 p-5 flex flex-col justify-between hover:border-[#00F29D]/20 transition">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#00F29D]/10 border border-[#00F29D]/20 text-[#00F29D] flex items-center justify-center shrink-0">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <h4 className="text-sm font-semibold text-white">Zero Data / Offline SMS Radar</h4>
              </div>
              <p className="text-xs text-slate-400 mt-2.5 leading-relaxed">
                Send remote siren, lock, or GPS locate codes from any phone via SMS, even if mobile data, Wi-Fi, and location toggles are disabled.
              </p>
            </div>

            {/* Anti-Uninstall */}
            <div className="rounded-2xl bg-[#0D1322]/80 border border-white/5 p-5 flex flex-col justify-between hover:border-purple-500/20 transition">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
                  <Lock className="w-4 h-4" />
                </div>
                <h4 className="text-sm font-semibold text-white">Tamper-Proof Device Admin</h4>
              </div>
              <p className="text-xs text-slate-400 mt-2.5 leading-relaxed">
                Prevents thieves or unauthorized persons from uninstalling Trackd, revoking permissions, or shutting down the device without your PIN.
              </p>
            </div>

            {/* MoMo & Bank Protection */}
            <div className="rounded-2xl bg-[#0D1322]/80 border border-white/5 p-5 flex flex-col justify-between hover:border-[#00F29D]/20 transition">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#00F29D]/10 border border-[#00F29D]/20 text-[#00F29D] flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <h4 className="text-sm font-semibold text-white">Financial App Shield (MoMo)</h4>
              </div>
              <p className="text-xs text-slate-400 mt-2.5 leading-relaxed">
                Instantly shuts down and blocks access to your mobile money wallets and banking applications the second suspicious movement is detected.
              </p>
            </div>

            {/* Live Location */}
            <div className="rounded-2xl bg-[#0D1322]/80 border border-white/5 p-5 flex flex-col justify-between hover:border-sky-500/20 transition">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
                  <MapPin className="w-4 h-4" />
                </div>
                <h4 className="text-sm font-semibold text-white">Landmark-First Geolocation</h4>
              </div>
              <p className="text-xs text-slate-400 mt-2.5 leading-relaxed">
                Returns high-precision human-readable landmarks (e.g. &ldquo;Near New Auditorium, AAMUSTED&rdquo;) alongside turn-by-turn Google Maps navigation.
              </p>
            </div>
          </div>
        </section>

        {/* ================= PACKAGE CONFLICT CALLOUT ================= */}
        <section className="rounded-2xl bg-[#0D1322] border border-[#00F29D]/20 p-4 sm:p-5 flex items-start gap-3.5 shadow-lg">
          <div className="w-5 h-5 text-[#00F29D] shrink-0 mt-0.5">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="space-y-1.5">
            <h4 className="text-sm font-semibold text-white flex items-center gap-2">
              <span>Upgrading from an older version?</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#00F29D]/15 text-[#00F29D] border border-[#00F29D]/30">IMPORTANT</span>
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              If Android displays <em>&ldquo;App not installed as package conflicts with an existing package&rdquo;</em>, this happens because our latest release upgraded to our permanent high-security production signing key. Simply <strong>uninstall the older version once</strong>, then tap Download to install this release. All future updates will install seamlessly.
            </p>
          </div>
        </section>

      </main>

      {/* Clean Security Footer */}
      <footer className="w-full py-8 text-center text-xs text-slate-400 border-t border-white/5 px-4 space-y-1.5">
        <p className="text-slate-300 font-medium">Trackd • Autonomous Offline Device Protection for Android</p>
        <p className="text-[11px] text-slate-400">Setup requires physical access to your phone and a 6-digit emergency PIN only you control.</p>
      </footer>
    </div>
  );
}
