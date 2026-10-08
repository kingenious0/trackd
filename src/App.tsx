import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { Capacitor } from "@capacitor/core";
import { auth, isConfigured } from "./lib/firebase";
import { isDemoMode, setDemoMode } from "./lib/demo";
import AuthPage from "./pages/AuthPage";
import WebDashboard from "./components/WebDashboard";
import MobileClientView from "./components/MobileClientView";
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
          The Tactical Radar web console needs your Firebase credentials in <code className="font-mono text-amber-300">.env</code> to stream live fleet telemetry.
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
          Launch Radar in Demo Mode (Simulated Asset)
        </button>
        <p className="mt-2.5 text-center text-[11px] text-slate-500">
          Simulates live GPS telemetry and emergency commands locally.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const isNative = Capacitor.isNativePlatform();

  // If running compiled as native APK on the phone, strictly show Sentinel Shield View
  if (isNative) {
    return (
      <div className="min-h-screen w-full bg-[#0B0F19] text-slate-100 font-sans antialiased selection:bg-emerald-500/20 selection:text-emerald-400">
        <MobileClientView />
      </div>
    );
  }

  // --- WEB RADAR CONTROLLER ROUTING ---
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

  if (!isConfigured) {
    if (demo) {
      return (
        <WebDashboard
          demo
          user={null}
          onExitDemo={() => setDemo(false)}
        />
      );
    }
    return (
      <SetupNotice
        onDemo={() => {
          setDemoMode(true);
          setDemo(true);
        }}
      />
    );
  }

  if (booting) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#0B0F19]">
        <div className="flex flex-col items-center gap-3">
          <ShieldCheck className="h-10 w-10 animate-pulse text-emerald-400" />
          <span className="text-xs font-mono text-slate-400">INITIALIZING SECURE LINK…</span>
        </div>
      </div>
    );
  }

  if (demo) {
    return (
      <WebDashboard
        demo
        user={null}
        onExitDemo={() => setDemo(false)}
      />
    );
  }

  return user ? (
    <WebDashboard
      user={user}
      onSignOut={() => signOut(auth())}
    />
  ) : (
    <AuthPage backendSlow={slowBoot} />
  );
}
