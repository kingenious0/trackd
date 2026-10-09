import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { 
  MessageSquare, 
  Lock, 
  Shield, 
  MapPin, 
  AlertTriangle, 
  Copy,
  Download
} from 'lucide-react';

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
    <div className="min-h-screen bg-[#111215] text-[#EDEDED] font-sans antialiased selection:bg-blue-600 selection:text-white flex flex-col justify-between">
      {/* Top Navigation */}
      <header className="w-full border-b border-white/5 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold tracking-tight text-white">Trackd</span>
            <span className="text-xs text-neutral-400 font-normal">by Kingenious</span>
          </div>

          <nav className="flex items-center gap-2">
            <button
              onClick={onSwitchToLogin}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-neutral-400 hover:text-white transition"
            >
              Track my phone
            </button>
            <button
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-[#1C1D21] text-white border border-white/10 shadow-sm"
            >
              Download app
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-4xl mx-auto w-full px-5 py-8 md:py-12 space-y-10">
        
        {/* 2-Column Hero Grid */}
        <section className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: 2 Steps */}
          <div className="md:col-span-7 space-y-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
                Set up Trackd in 2 steps
              </h1>
              <p className="text-xs md:text-sm text-neutral-400 mt-2 leading-relaxed">
                About 3 minutes. You&apos;ll need your email and a phone number for your emergency contact.
              </p>
            </div>

            <div className="space-y-6 pt-2">
              {/* Step 1 */}
              <div className="flex items-start gap-3.5">
                <div className="w-6 h-6 rounded-full bg-[#1D4ED8] text-white font-semibold text-xs flex items-center justify-center shrink-0 mt-0.5">
                  1
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Install and set up on your phone
                  </h3>
                  <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                    Download the app below, create your account, set a Master PIN, and choose an emergency contact.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex items-start gap-3.5">
                <div className="w-6 h-6 rounded-full bg-[#1D4ED8] text-white font-semibold text-xs flex items-center justify-center shrink-0 mt-0.5">
                  2
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Track from any browser
                  </h3>
                  <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                    Come back here anytime, log in with the same email and password, and your phone shows up on the map.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Download Card */}
          <div className="md:col-span-5">
            <div className="rounded-2xl bg-[#17181C] border border-white/5 p-6 flex flex-col items-center text-center shadow-xl">
              
              {/* QR Code Container */}
              <div className="w-48 h-48 rounded-xl bg-[#0D0E11] p-3.5 flex items-center justify-center border border-white/5 shadow-inner">
                <div className="p-2 bg-white rounded-lg">
                  <QRCodeSVG 
                    value={downloadUrl} 
                    size={160}
                    level="M"
                    includeMargin={false}
                  />
                </div>
              </div>

              <div className="mt-4 space-y-1">
                <p className="text-sm font-semibold text-white">Scan with your phone</p>
                <p className="text-xs text-neutral-400">
                  Or tap below if you&apos;re already on your phone
                </p>
              </div>

              {/* Download Action Button */}
              <a
                href="/downloads/trackd-latest.apk"
                download="trackd-v1.0.0.apk"
                className="mt-5 w-full py-3 px-4 rounded-xl bg-white text-black font-semibold text-xs md:text-sm flex items-center justify-center gap-2 hover:bg-neutral-200 active:scale-[0.98] transition shadow-md"
              >
                <Download className="w-4 h-4 text-black" />
                <span>Download for Android</span>
              </a>

              {/* Version & Checksum Meta */}
              <div className="mt-3.5 flex items-center justify-center gap-2 text-[11px] text-neutral-400">
                <span>v1.0.0</span>
                <span>•</span>
                <span>8.1 MB</span>
                <span>•</span>
                <button
                  onClick={handleCopyHash}
                  title="Click to copy full SHA-256 checksum"
                  className="hover:text-neutral-200 flex items-center gap-1 transition"
                >
                  <span>SHA-256</span>
                  {copiedHash ? (
                    <span className="text-emerald-400 font-medium">Copied!</span>
                  ) : (
                    <Copy className="w-3 h-3 text-neutral-400" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* 4-Item Permission Benefits Grid */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
          {/* SMS */}
          <div className="rounded-2xl bg-[#17181C] border border-white/5 p-4 flex flex-col justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#1E293B] text-[#38BDF8] flex items-center justify-center shrink-0">
                <MessageSquare className="w-4 h-4" />
              </div>
              <h4 className="text-sm font-semibold text-white">SMS</h4>
            </div>
            <p className="text-xs text-neutral-400 mt-3 leading-relaxed">
              Lets you locate or lock your phone by text message when it has no internet connection.
            </p>
          </div>

          {/* Device Admin */}
          <div className="rounded-2xl bg-[#17181C] border border-white/5 p-4 flex flex-col justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#1E293B] text-[#38BDF8] flex items-center justify-center shrink-0">
                <Lock className="w-4 h-4" />
              </div>
              <h4 className="text-sm font-semibold text-white">Device admin</h4>
            </div>
            <p className="text-xs text-neutral-400 mt-3 leading-relaxed">
              Lets you lock the screen or erase the phone remotely if it&apos;s lost or stolen.
            </p>
          </div>

          {/* Accessibility */}
          <div className="rounded-2xl bg-[#17181C] border border-white/5 p-4 flex flex-col justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#1E293B] text-[#38BDF8] flex items-center justify-center shrink-0">
                <Shield className="w-4 h-4" />
              </div>
              <h4 className="text-sm font-semibold text-white">Accessibility</h4>
            </div>
            <p className="text-xs text-neutral-400 mt-3 leading-relaxed">
              Blocks access to banking and mobile money apps while the phone is marked stolen.
            </p>
          </div>

          {/* Location */}
          <div className="rounded-2xl bg-[#17181C] border border-white/5 p-4 flex flex-col justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#1E293B] text-[#38BDF8] flex items-center justify-center shrink-0">
                <MapPin className="w-4 h-4" />
              </div>
              <h4 className="text-sm font-semibold text-white">Location</h4>
            </div>
            <p className="text-xs text-neutral-400 mt-3 leading-relaxed">
              Shows where your phone is on the map, even if the app isn&apos;t open.
            </p>
          </div>
        </section>

        {/* Why Android Shows a Warning Callout */}
        <section className="rounded-2xl bg-[#1D160A] border border-[#B45309]/30 p-4 md:p-5 flex items-start gap-3.5">
          <div className="w-5 h-5 text-amber-500 shrink-0 mt-0.5">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-amber-400">
              Why Android shows a warning during install
            </h4>
            <p className="text-xs text-amber-200/80 leading-relaxed">
              Trackd isn&apos;t on the Play Store, and it asks for strong permissions like SMS and device admin to protect your phone and money. Android flags apps like this by default. Tap &ldquo;Install anyway&rdquo; to continue.
            </p>
          </div>
        </section>

      </main>

      {/* Responsible Use Footer */}
      <footer className="w-full py-6 text-center text-[11px] text-neutral-400 border-t border-white/5 px-4">
        Trackd is for protecting a device you own. Setup requires physical access to the phone and a PIN you create.
      </footer>
    </div>
  );
}
