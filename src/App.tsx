import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import { auth, isConfigured } from "./lib/firebase";
import { isDemoMode, setDemoMode } from "./lib/demo";
import AuthPage from "./pages/AuthPage";
import ConsolePage from "./pages/ConsolePage";
import { MonitorPlay, ShieldCheck, TriangleAlert } from "lucide-react";

function SetupNotice({ onDemo }: { onDemo: () => void }) {
  return (
    <div className="flex h-full items-center justify-center px-4 py-10">
      <div className="panel w-full max-w-lg border-warning/40 p-6">
        <div className="mb-3 flex items-center gap-3">
          <TriangleAlert className="h-6 w-6 text-warning" />
          <h1 className="text-lg font-semibold">Configuration required</h1>
        </div>
        <p className="mb-4 text-sm leading-relaxed text-muted">
          The app loaded, but <code className="font-mono text-warning">.env</code> still has
          placeholder values. Paste your credentials, then Vite restarts and the console appears.
        </p>
        <pre className="overflow-x-auto rounded-xl border border-line bg-raised p-3 font-mono text-xs">
{`VITE_FIREBASE_API_KEY=<web API key>
VITE_FIREBASE_AUTH_DOMAIN=<project>.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=<project>
VITE_FIREBASE_STORAGE_BUCKET=<project>.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=<sender id>
VITE_FIREBASE_APP_ID=<1:sender:web:app id>`}
        </pre>

        <button className="btn-solid mt-5 w-full" onClick={onDemo}>
          <MonitorPlay className="h-4 w-4" />
          Explore the console in demo mode (no backend)
        </button>
        <p className="mt-2 text-center text-[11px] text-muted">
          Demo uses a simulated device and map. Nothing is saved.
        </p>
      </div>
    </div>
  );
}

export default function App() {
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
      return <ConsolePage demo onExitDemo={() => setDemo(false)} />;
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
      <div className="flex h-full items-center justify-center">
        <ShieldCheck className="h-10 w-10 animate-pulse text-accent" />
      </div>
    );
  }

  return user ? <ConsolePage user={user} /> : <AuthPage backendSlow={slowBoot} />;
}
