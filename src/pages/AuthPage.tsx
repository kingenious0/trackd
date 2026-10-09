import { FormEvent, useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile
} from "firebase/auth";
import { auth } from "../lib/firebase";
import { saveProfile, apiUrl } from "../lib/api";
import { sha256Hex, toUnsignedE164 } from "../lib/crypto";
import {
  CheckCircle2,
  Crosshair,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  MessageSquareText,
  Phone,
  ShieldCheck,
  User
} from "lucide-react";
import ThemeToggle, { type Theme } from "../components/ThemeToggle";

type Mode = "signin" | "signup";

async function postApi<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch {
    throw new Error("We couldn't reach the verification service. Please try again later.");
  }
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed (${response.status})`);
  }
  return payload;
}

export default function AuthPage({ backendSlow = false }: { backendSlow?: boolean }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light"
  );

  // signin
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // signup wizard
  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [suPassword, setSuPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [pin, setPin] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSignin(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth(), email.trim(), password);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSendCode(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (!fullName.trim() || suPassword.length < 8) {
      setError("Name and a password of at least 8 characters are required.");
      return;
    }
    const e164 = toUnsignedE164(phone);
    if (!/^\+\d{7,15}$/.test(e164)) {
      setError("Enter a valid phone number (e.g. 024 000 0000).");
      return;
    }
    setBusy(true);
    try {
      const result = await postApi<{ success: boolean; messageId: string }>("/api/auth/send-otp", {
        phoneNumber: e164
      });
      if (!result.success) throw new Error("We couldn't start verification. Please try again.");
      setNotice(`Code sent to ${e164}. It expires in 5 minutes.`);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send code");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyCode(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code.");
      return;
    }
    setBusy(true);
    try {
      const result = await postApi<{ verified: boolean; verificationToken?: string }>(
        "/api/auth/verify-otp",
        { phoneNumber: toUnsignedE164(phone), code }
      );
      if (!result.verified || !result.verificationToken) {
        throw new Error("Verification failed.");
      }
      setVerificationToken(result.verificationToken);
      setNotice("Number verified. Finish protecting your account.");
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateAccount(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (!verificationToken) {
      setError("Verify your phone number first.");
      setStep(2);
      return;
    }
    if (!emergencyPhone.trim() || !/^\d{4}$/.test(pin)) {
      setError("Emergency contact and a 4-digit Master Recovery PIN are required.");
      return;
    }
    setBusy(true);
    try {
      const credential = await createUserWithEmailAndPassword(
        auth(),
        suEmail.trim(),
        suPassword
      );
      if (fullName.trim()) await updateProfile(credential.user, { displayName: fullName.trim() });
      await saveProfile(credential.user.uid, {
        fullName: fullName.trim(),
        email: suEmail.trim(),
        phoneNumber: toUnsignedE164(phone),
        emergencyContactPhone: toUnsignedE164(emergencyPhone),
        masterPinHash: await sha256Hex(pin),
        createdAt: new Date().toISOString()
      });
      setNotice("Account created — you are signed in.");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-secure/10 blur-3xl" />

      <div className="absolute right-4 top-4">
        <ThemeToggle value={theme} onChange={setTheme} />
      </div>

      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-white shadow-float">
            <Crosshair className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Trackd</h1>
          <p className="mt-1 text-sm text-muted">
            Find your device. Protect your money. Even offline.
          </p>
        </div>

        <div className="panel space-y-4 p-6">
          {backendSlow && (
            <p className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs leading-relaxed text-warning">
              Still connecting — check your internet. You can keep waiting; this page will
              update automatically.
            </p>
          )}
          <div className="grid grid-cols-2 gap-1 rounded-full bg-raised p-1">
            {(["signin", "signup"] as Mode[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setMode(item);
                  setError(null);
                  setNotice(null);
                }}
                className={
                  "rounded-full py-2 text-sm font-medium transition " +
                  (mode === item ? "bg-panel text-ink shadow-soft" : "text-muted hover:text-ink")
                }
              >
                {item === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          {mode === "signin" ? (
            <form onSubmit={handleSignin} className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
                  Email
                </span>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-muted" />
                  <input
                    className="input pl-10"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </div>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
                  Password
                </span>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-muted" />
                  <input
                    className="input pl-10"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                </div>
              </label>
              {error && <AuthAlert kind="err" text={error} />}
              <button className="btn-solid w-full !py-3" type="submit" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Sign in to console
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <SignupSteps step={step} />

              {step === 1 && (
                <form onSubmit={handleSendCode} className="space-y-4">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
                      Full name
                    </span>
                    <div className="relative">
                      <User className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-muted" />
                      <input
                        className="input pl-10"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Kwame Mensah"
                        autoComplete="name"
                      />
                    </div>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
                      Email
                    </span>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-muted" />
                      <input
                        className="input pl-10"
                        type="email"
                        required
                        value={suEmail}
                        onChange={(e) => setSuEmail(e.target.value)}
                        placeholder="you@example.com"
                        autoComplete="email"
                      />
                    </div>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
                      Password (min 8 characters)
                    </span>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-muted" />
                      <input
                        className="input pl-10"
                        type="password"
                        required
                        minLength={8}
                        value={suPassword}
                        onChange={(e) => setSuPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="new-password"
                      />
                    </div>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
                      Phone number (receives the SMS code)
                    </span>
                    <div className="relative">
                      <Phone className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-muted" />
                      <input
                        className="input pl-10"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="024 000 0000"
                        autoComplete="tel"
                      />
                    </div>
                  </label>
                  {error && <AuthAlert kind="err" text={error} />}
                  {notice && <AuthAlert kind="ok" text={notice} />}
                  <button className="btn-solid w-full !py-3" type="submit" disabled={busy}>
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <MessageSquareText className="h-4 w-4" />
                    )}
                    Send verification code
                  </button>
                </form>
              )}

              {step === 2 && (
                <form onSubmit={handleVerifyCode} className="space-y-4">
                  <p className="text-sm leading-relaxed text-muted">
                    Enter the 6-digit code texted to{" "}
                    <strong className="text-ink">{toUnsignedE164(phone)}</strong> from sender{" "}
                    <strong className="font-mono text-ink">Trackd</strong>.
                  </p>
                  <input
                    className="input text-center font-mono text-2xl tracking-[0.5em]"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="••••••"
                    autoComplete="one-time-code"
                    autoFocus
                  />
                  {error && <AuthAlert kind="err" text={error} />}
                  {notice && <AuthAlert kind="ok" text={notice} />}
                  <button className="btn-solid w-full !py-3" type="submit" disabled={busy}>
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    Verify code
                  </button>
                  <div className="flex items-center justify-between text-xs">
                    <button
                      type="button"
                      className="text-muted hover:text-ink"
                      onClick={() => setStep(1)}
                    >
                      ← Wrong number?
                    </button>
                    <button
                      type="button"
                      className="text-accent hover:underline"
                      disabled={busy}
                      onClick={(e) =>
                        handleSendCode(e as unknown as FormEvent).catch(() => undefined)
                      }
                    >
                      Resend code
                    </button>
                  </div>
                </form>
              )}

              {step === 3 && (
                <form onSubmit={handleCreateAccount} className="space-y-4">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
                      Emergency contact
                    </span>
                    <input
                      className="input"
                      value={emergencyPhone}
                      onChange={(e) => setEmergencyPhone(e.target.value)}
                      placeholder="+233 24 000 0000"
                      autoComplete="tel"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
                      Master Recovery PIN (4 digits)
                    </span>
                    <div className="relative">
                      <KeyRound className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-muted" />
                      <input
                        className="input pl-10 text-center font-mono text-xl tracking-[0.4em]"
                        inputMode="numeric"
                        maxLength={4}
                        value={pin}
                        onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                        placeholder="••••"
                      />
                    </div>
                  </label>
                  {error && <AuthAlert kind="err" text={error} />}
                  {notice && <AuthAlert kind="ok" text={notice} />}
                  <button className="btn-solid w-full !py-3" type="submit" disabled={busy}>
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="h-4 w-4" />
                    )}
                    Create protected account
                  </button>
                  <p className="text-center text-[11px] leading-relaxed text-muted">
                    Keep your PIN safe — you'll need it for SMS commands like{" "}
                    <span className="font-mono">#CMD#[PIN]</span>. It's never displayed again.
                  </p>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SignupSteps({ step }: { step: number }) {
  const labels = ["Account", "Verify", "Protect"];
  return (
    <ol className="flex items-center gap-1.5">
      {labels.map((label, index) => {
        const current = index + 1;
        const done = current < step;
        const active = current === step;
        return (
          <li
            key={label}
            className={
              "flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-[11px] font-medium " +
              (done
                ? "bg-secure/15 text-secure"
                : active
                  ? "bg-accent/15 text-accent"
                  : "bg-raised text-muted")
            }
          >
            <span
              className={
                "flex h-4 w-4 items-center justify-center rounded-full text-[10px] " +
                (done || active ? "bg-current/20" : "")
              }
            >
              {current}
            </span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}

function AuthAlert({ kind, text }: { kind: "ok" | "err"; text: string }) {
  return (
    <p
      className={
        "rounded-xl border px-3 py-2 text-sm " +
        (kind === "ok"
          ? "border-secure/30 bg-secure/10 text-secure"
          : "border-danger/30 bg-danger/10 text-danger")
      }
    >
      {text}
    </p>
  );
}

function friendlyError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Incorrect email or password.";
    case "auth/email-already-in-use":
      return "An account with this email already exists.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/invalid-email":
      return "That email address looks invalid.";
    case "auth/network-request-failed":
      return "Network error — check your connection.";
    default:
      console.error(err);
      return "Something went wrong. Please try again.";
  }
}
