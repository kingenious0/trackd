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

const SHA256_HASH = '1818696be2ec53aac6410bb17f6319b1e988d14a95149678b926ecdcbbd82e1c';

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
          
          {/* Left Column: 2 Easy Steps */}
          <div className="md:col-span-7 space-y-6">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-[11px] font-medium text-blue-400 mb-3">
                <Smartphone className="w-3.5 h-3.5" />
                <span>Free Android App</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white leading-tight">
                Set up Trackd in 2 easy steps
              </h1>
              <p className="text-xs sm:text-sm text-neutral-400 mt-2 leading-relaxed">
                Takes about 2 minutes. You only need your email and an emergency contact phone number.
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
                    Install the app on your phone
                  </h3>
                  <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                    Download the app below, create your account, set your secret 6-digit PIN, and add someone you trust as your emergency contact.
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
                    Track from any computer or phone
                  </h3>
                  <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                    Come back to this website anytime, log in with your email, and your phone shows up on the map. You can also ring a loud alarm to find it.
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
                <p className="text-sm font-semibold text-white">
                  Scan with your phone camera
                </p>
                <p className="text-xs text-neutral-400">
                  Or tap below to download directly to this device
                </p>
              </div>

              {/* Download Action Button */}
              <a
                href="/downloads/trackd-latest.apk"
                download="trackd-v1.1.0.apk"
                className="mt-5 w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition shadow-lg shadow-blue-600/25 border border-blue-400/20"
              >
                <Download className="w-4 h-4 text-white" />
                <span>Download for Android</span>
              </a>

              {/* Version & Checksum Meta */}
              <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2 text-[11px] text-neutral-400">
                <span className="font-mono text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  v1.1.0 Latest
                </span>
                <span>•</span>
                <span>Updated Oct 2026</span>
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

              {/* What's New Pill in Card */}
              <div className="mt-4 w-full p-2.5 rounded-xl bg-white/[0.03] border border-white/5 text-left text-[11px] text-slate-300 space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-blue-400 font-bold block">What&apos;s New in v1.1.0</span>
                <ul className="text-neutral-400 text-[11px] leading-snug space-y-0.5 list-disc list-inside">
                  <li>Automatic SIM swap SMS alert with new phone number & live GPS.</li>
                  <li>Real-time SIM card removal and slot open telemetry dispatch.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* 4-Item How Trackd Protects Your Phone */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
              How Trackd protects your phone
            </h3>
            <span className="text-[11px] text-blue-400 font-medium">Simple & reliable</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* SMS */}
            <div className="rounded-2xl bg-[#121622]/80 border border-white/5 p-4 flex flex-col justify-between hover:border-white/10 transition">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <h4 className="text-sm font-semibold text-white">Works without internet (SMS)</h4>
              </div>
              <p className="text-xs text-neutral-400 mt-2.5 leading-relaxed">
                Find or lock your phone by sending a text message from any other phone, even if data and Wi-Fi are turned off.
              </p>
            </div>

            {/* Anti-Uninstall */}
            <div className="rounded-2xl bg-[#121622]/80 border border-white/5 p-4 flex flex-col justify-between hover:border-white/10 transition">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
                  <Lock className="w-4 h-4" />
                </div>
                <h4 className="text-sm font-semibold text-white">Stops thieves from deleting it</h4>
              </div>
              <p className="text-xs text-neutral-400 mt-2.5 leading-relaxed">
                Prevents unauthorized people from deleting the app or turning off protection without your secret PIN.
              </p>
            </div>

            {/* MoMo & Bank Protection */}
            <div className="rounded-2xl bg-[#121622]/80 border border-white/5 p-4 flex flex-col justify-between hover:border-white/10 transition">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <h4 className="text-sm font-semibold text-white">Protects your MoMo & bank apps</h4>
              </div>
              <p className="text-xs text-neutral-400 mt-2.5 leading-relaxed">
                Instantly shuts down and blocks access to your mobile money and banking apps if your phone is marked lost.
              </p>
            </div>

            {/* Live Location */}
            <div className="rounded-2xl bg-[#121622]/80 border border-white/5 p-4 flex flex-col justify-between hover:border-white/10 transition">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
                  <MapPin className="w-4 h-4" />
                </div>
                <h4 className="text-sm font-semibold text-white">Live location & battery</h4>
              </div>
              <p className="text-xs text-neutral-400 mt-2.5 leading-relaxed">
                Shows your phone&apos;s real-time position on the map along with its battery percentage so you always know where it is.
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
              Why does Android show a warning when installing?
            </h4>
            <p className="text-xs text-amber-200/80 leading-relaxed">
              Trackd needs permissions like SMS and phone lock so you can find and secure your phone if it&apos;s lost. Because you&apos;re downloading directly from our website instead of the Play Store, Android displays a standard warning. Just tap <strong>&ldquo;Install anyway&rdquo;</strong> to finish setup.
            </p>
          </div>
        </section>

      </main>

      {/* Clean Security Footer */}
      <footer className="w-full py-6 text-center text-[11px] text-neutral-500 border-t border-white/5 px-4 space-y-1">
        <p>Trackd helps you find and protect your phone.</p>
        <p className="text-[10px] text-neutral-600">Setup requires your phone and a 6-digit PIN only you know.</p>
      </footer>
    </div>
  );
}
