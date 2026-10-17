import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { Capacitor } from "@capacitor/core";
import { auth, isConfigured } from "./lib/firebase";
import { isDemoMode, setDemoMode } from "./lib/demo";
import AuthPage from "./pages/AuthPage";
import WebDashboard from "./components/WebDashboard";
import MobileClientView from "./components/MobileClientView";
import DownloadView from "./components/DownloadView";
import { MonitorPlay, ShieldCheck, TriangleAlert } from "lucide-react";

function SetupNotice({ onDemo }: { onDemo: () => void }) {
  return (
    <div className="flex h-screen items-center justify-center px-4 py-10 bg-[#0B0F19] text-slate-100">
      <div className="w-full max-w-lg rounded-2xl border border-amber-500/30 bg-[#0F172A]/80 backdrop-blur p-6 shadow-2xl">
        <div className="mb-3 flex items-center gap-3">
          <TriangleAlert className="h-6 w-6 text-amber-400" />
          <h1 className="text-lg font-semibold text-white">Firebase Configuration Required</h1>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-slate-400">
          The Trackd web console needs your Firebase credentials in <code className="font-mono text-amber-300">.env</code> to connect to your phone.
        </p>
        <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-3 font-mono text-[11px] text-slate-300">
{`VITE_FIREBASE_API_KEY=<web API key>
VITE_FIREBASE_AUTH_DOMAIN=<project>.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=<project>
VITE_FIREBASE_STORAGE_BUCKET=<project>.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=<sender id>
VITE_FIREBASE_APP_ID=<1:sender:web:app id>`}
        </pre>

        <button
          className="mt-5 w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-[0.98] font-semibold text-xs text-white transition flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
          onClick={onDemo}
        >
          <MonitorPlay className="h-4 w-4" />
          Try Trackd in Demo Mode (Simulated Phone)
        </button>
        <p className="mt-2.5 text-center text-[11px] text-slate-500">
          Simulates live GPS location and anti-theft controls on this screen.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const isNative = Capacitor.isNativePlatform();
  const isDev = import.meta.env.DEV;

  // Check URL query parameters for local development: e.g. http://localhost:5173/?view=apk
  const searchParams = new URLSearchParams(window.location.search);
  const initialView = searchParams.get("view");
  const [viewOverride, setViewOverride] = useState<string | null>(initialView);

  const forceApkView = isDev && viewOverride === "apk";
  const forceWebView = isDev && viewOverride === "web";
  const showApk = forceApkView || (isNative && !forceWebView);

  const [webTab, setWebTab] = useState<"track" | "download">(() => {
    return searchParams.get("tab") === "download" ? "download" : "track";
  });

  const handleSwitchTab = (tab: "track" | "download") => {
    setWebTab(tab);
    const url = new URL(window.location.href);
    if (tab === "download") {
      url.searchParams.set("tab", "download");
    } else {
      url.searchParams.delete("tab");
    }
    window.history.pushState({}, "", url.toString());
  };

  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [slowBoot, setSlowBoot] = useState(false);
  const [demo, setDemo] = useState(() => {
    const shouldDemo =
      new URLSearchParams(window.location.search).get("demo") === "1" ||
      (!isConfigured && isDemoMode());
    if (shouldDemo) setDemoMode(true);
    return shouldDemo;
  });

  useEffect(() => {
    if (demo) setDemoMode(true);
  }, [demo]);

  useEffect(() => {
    if (!isConfigured) {
      setBooting(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setSlowBoot(true);
      setBooting(false);
    }, 12000);
    return onAuthStateChanged(
      auth(),
      (next) => {
        window.clearTimeout(timer);
        setSlowBoot(false);
        setUser(next);
        setBooting(false);
      },
      () => {
        window.clearTimeout(timer);
        setSlowBoot(false);
        setBooting(false);
      }
    );
  }, []);

  const switchView = (target: "web" | "apk") => {
    setViewOverride(target);
    const url = new URL(window.location.href);
    url.searchParams.set("view", target);
    window.history.pushState({}, "", url.toString());
  };

  // If in APK Sentinel mode, render MobileClientView with dev switch pill
  if (showApk) {
    return (
      <main className="min-h-screen w-full bg-[#0B0F19] text-slate-100 font-sans antialiased relative">
        {isDev && !isNative && (
          <div className="fixed bottom-4 right-4 z-[9999] flex items-center gap-1.5 p-1 rounded-xl bg-slate-900/90 border border-white/10 backdrop-blur-md shadow-2xl">
            <button
              onClick={() => switchView("web")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition ${
                !showApk ? "bg-blue-600 text-white font-bold shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              Web Controller
            </button>
            <button
              onClick={() => switchView("apk")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition ${
                showApk ? "bg-emerald-600 text-white font-bold shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              Mobile App
            </button>
          </div>
        )}
        <MobileClientView user={user} />
      </main>
    );
  }

  // --- WEB RADAR CONTROLLER ROUTING ---
  let content = null;

  if (booting) {
    content = (
      <div className="flex h-screen w-full items-center justify-center bg-[#0B0F19]">
        <div className="flex flex-col items-center gap-3">
          <ShieldCheck className="h-10 w-10 animate-pulse text-emerald-400" />
          <span className="text-xs font-mono text-slate-400">CONNECTING…</span>
        </div>
      </div>
    );
  } else if (!isConfigured) {
    if (demo) {
      content = (
        <WebDashboard
          demo
          user={null}
          onExitDemo={() => setDemo(false)}
          onSwitchToDownload={() => handleSwitchTab("download")}
        />
      );
    } else {
      content = (
        <SetupNotice
          onDemo={() => {
            setDemoMode(true);
            setDemo(true);
          }}
        />
      );
    }
  } else if (demo) {
    content = (
      <WebDashboard
        demo
        user={null}
        onExitDemo={() => setDemo(false)}
        onSwitchToDownload={() => handleSwitchTab("download")}
      />
    );
  } else if (webTab === "download") {
    content = <DownloadView onSwitchToLogin={() => handleSwitchTab("track")} />;
  } else if (user) {
    content = (
      <WebDashboard
        user={user}
        onSignOut={() => signOut(auth())}
        onSwitchToDownload={() => handleSwitchTab("download")}
      />
    );
  } else {
    content = (
      <AuthPage 
        backendSlow={slowBoot} 
        onSwitchToDownload={() => handleSwitchTab("download")} 
      />
    );
  }

  return (
    <main className="min-h-screen w-full bg-[#0B0F19] text-slate-100 font-sans antialiased relative">
      {isDev && !isNative && (
        <div className="fixed bottom-4 right-4 z-[9999] flex items-center gap-1.5 p-1 rounded-xl bg-slate-900/90 border border-white/10 backdrop-blur-md shadow-2xl">
          <button
            onClick={() => switchView("web")}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition ${
              !showApk ? "bg-blue-600 text-white font-bold shadow-sm" : "text-slate-400 hover:text-white"
            }`}
          >
            Web Controller
          </button>
          <button
            onClick={() => switchView("apk")}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition ${
              showApk ? "bg-emerald-600 text-white font-bold shadow-sm" : "text-slate-400 hover:text-white"
            }`}
          >
            Mobile App
          </button>
        </div>
      )}
      {content}
    </main>
  );
}
