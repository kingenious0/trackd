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
  CheckCircle2
} from 'lucide-react';
import Navbar from './Navbar';

interface DownloadViewProps {
  onSwitchToLogin: () => void;
}

const SHA256_HASH = 'effa511084bc3ae46de822926d37b16174a026d1c6ebad34ccda0a98a9a69257';

export default function DownloadView({ onSwitchToLogin }: DownloadViewProps) {
  const [copiedHash, setCopiedHash] = useState(false);
  const downloadUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/downloads/trackd-latest.apk` 
    : '/downloads/trackd-latest.apk';

  const handleCopyHash = () => {
    navigator.clipboard.writeText(SHA256_HASH);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2500);
  };

  return (
    <div className="min-h-screen bg-[#0B0F19] text-[#EDEDED] font-sans antialiased selection:bg-blue-600 selection:text-white flex flex-col justify-between">
      {/* Unified Top Navigation */}
      <Navbar 
        currentTab="download" 
        onSwitchTab={(tab) => {
          if (tab === "track") onSwitchToLogin();
        }} 
      />

      {/* Main Content Area */}
      <main className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-8 md:py-12 space-y-10">
        
        {/* 2-Column Hero Grid */}
        <section className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: 2 Steps Guidance */}
          <div className="md:col-span-7 space-y-6">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-[11px] font-mono text-blue-400 mb-3">
                <Smartphone className="w-3.5 h-3.5" />
                <span>OFFICIAL ANDROID SENTINEL</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
                Set up Trackd in 2 steps
              </h1>
              <p className="text-xs sm:text-sm text-neutral-400 mt-2 leading-relaxed">
                Setup takes under 3 minutes. All you need is your email and your emergency contact&apos;s phone number.
              </p>
            </div>

            <div className="space-y-4 pt-1">
              {/* Step 1 */}
              <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-[#121622]/60 border border-white/5 backdrop-blur-sm">
                <div className="w-7 h-7 rounded-xl bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 shadow-md shadow-blue-600/30">
                  1
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Install & configure on your phone
                  </h3>
                  <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                    Download the sentinel APK, create your account, set your private 6-digit Master PIN, and assign your trusted recovery contact.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-[#121622]/60 border border-white/5 backdrop-blur-sm">
                <div className="w-7 h-7 rounded-xl bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 shadow-md shadow-blue-600/30">
                  2
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Track & protect from any browser
                  </h3>
                  <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                    Come back to this web console anytime, sign in with the same email, and monitor live coordinates or issue emergency lockdowns.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Download & QR Card */}
          <div className="md:col-span-5">
            <div className="rounded-3xl bg-[#121622] border border-white/10 p-6 flex flex-col items-center text-center shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
              
              {/* QR Code Container */}
              <div className="w-48 h-48 rounded-2xl bg-[#090C14] p-3.5 flex items-center justify-center border border-white/10 shadow-inner">
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
                <p className="text-sm font-semibold text-white flex items-center justify-center gap-1.5">
                  <span>Scan with phone camera</span>
                </p>
                <p className="text-xs text-neutral-400">
                  Or tap below to download directly to this device
                </p>
              </div>

              {/* Download Action Button */}
              <a
                href="/downloads/trackd-latest.apk"
                download="trackd-v1.0.0.apk"
                className="mt-5 w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition shadow-lg shadow-blue-600/25 border border-blue-400/20"
              >
                <Download className="w-4 h-4 text-white" />
                <span>Download Android APK</span>
              </a>

              {/* Version & Checksum Meta */}
              <div className="mt-3.5 flex items-center justify-center gap-2 text-[11px] text-neutral-400">
                <span className="font-mono text-white/80">v1.0.0</span>
                <span>•</span>
                <span>8.1 MB</span>
                <span>•</span>
                <button
                  type="button"
                  onClick={handleCopyHash}
                  title="Click to copy full SHA-256 checksum"
                  className="hover:text-neutral-200 flex items-center gap-1 transition"
                >
                  <span className="font-mono">SHA-256</span>
                  {copiedHash ? (
                    <span className="text-emerald-400 font-medium flex items-center gap-0.5">
                      <CheckCircle2 className="w-3 h-3" /> Copied
                    </span>
                  ) : (
                    <Copy className="w-3 h-3 text-neutral-400" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* 4-Item Security Capabilities Grid */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-mono uppercase tracking-wider text-neutral-400">
              Core Anti-Theft Capabilities
            </h3>
            <span className="text-[11px] text-blue-400 font-mono">Zero-Trust Sentinel</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* SMS Radar */}
            <div className="rounded-2xl bg-[#121622]/80 border border-white/5 p-4 flex flex-col justify-between hover:border-white/10 transition">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <h4 className="text-sm font-semibold text-white">Offline SMS Fallback</h4>
              </div>
              <p className="text-xs text-neutral-400 mt-2.5 leading-relaxed">
                Locate or lock your handset via direct encrypted SMS directives when mobile data or Wi-Fi is severed.
              </p>
            </div>

            {/* Device Admin */}
            <div className="rounded-2xl bg-[#121622]/80 border border-white/5 p-4 flex flex-col justify-between hover:border-white/10 transition">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
                  <Lock className="w-4 h-4" />
                </div>
                <h4 className="text-sm font-semibold text-white">Hardware Anti-Tamper</h4>
              </div>
              <p className="text-xs text-neutral-400 mt-2.5 leading-relaxed">
                Prevents unauthorized power-offs and uninstallation through Android Device Administrator privileges.
              </p>
            </div>

            {/* Accessibility Decoy */}
            <div className="rounded-2xl bg-[#121622]/80 border border-white/5 p-4 flex flex-col justify-between hover:border-white/10 transition">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <h4 className="text-sm font-semibold text-white">Fintech Decoy Defense</h4>
              </div>
              <p className="text-xs text-neutral-400 mt-2.5 leading-relaxed">
                Intercepts and closes mobile money and banking applications immediately whenever theft mode is engaged.
              </p>
            </div>

            {/* Location */}
            <div className="rounded-2xl bg-[#121622]/80 border border-white/5 p-4 flex flex-col justify-between hover:border-white/10 transition">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
                  <MapPin className="w-4 h-4" />
                </div>
                <h4 className="text-sm font-semibold text-white">High-Precision Telemetry</h4>
              </div>
              <p className="text-xs text-neutral-400 mt-2.5 leading-relaxed">
                Broadcasts live GPS coordinates, battery levels, and cell tower signatures directly to your web console.
              </p>
            </div>
          </div>
        </section>

        {/* Why Android Shows a Warning Callout */}
        <section className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-4 sm:p-5 flex items-start gap-3.5">
          <div className="w-5 h-5 text-amber-400 shrink-0 mt-0.5">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-amber-300">
              Why Android prompts during installation
            </h4>
            <p className="text-xs text-amber-200/80 leading-relaxed">
              Trackd requires high-level system permissions (SMS, Device Admin, and Accessibility) to lock down stolen handsets. Because it is installed directly without Google Play telemetry, Android displays an unknown source alert. Tap <strong>&ldquo;Install anyway&rdquo;</strong> to continue setup.
            </p>
          </div>
        </section>

      </main>

      {/* Clean Security Footer */}
      <footer className="w-full py-6 text-center text-[11px] text-neutral-500 border-t border-white/5 px-4 space-y-1">
        <p>Trackd Security Systems • Device Protection & Asset Recovery</p>
        <p className="text-[10px] text-neutral-600">Setup requires physical access to your handset and a private 6-digit Master PIN.</p>
      </footer>
    </div>
  );
}
