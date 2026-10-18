import { FormEvent, useState } from "react";
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  updateProfile
} from "firebase/auth";
import { auth, trackEvent } from "../lib/firebase";
import { saveProfile, apiUrl } from "../lib/api";
import { sha256Hex, toUnsignedE164, encryptPin } from "../lib/crypto";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  MessageSquareText,
  Phone,
  ShieldCheck,
  User
} from "lucide-react";
import Navbar from "../components/Navbar";

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

export default function AuthPage({ 
  backendSlow = false,
  onSwitchToDownload
}: { 
  backendSlow?: boolean;
  onSwitchToDownload?: () => void;
}) {
  const [mode, setMode] = useState<Mode>("signin");

  // signin
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

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

  // Forgot password modal state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotNotice, setForgotNotice] = useState<string | null>(null);
  const [forgotError, setForgotError] = useState<string | null>(null);

  async function handleResetPassword(e: FormEvent) {
    e.preventDefault();
    setForgotError(null);
    setForgotNotice(null);
    const targetEmail = forgotEmail.trim();
    if (!targetEmail) {
      setForgotError("Please enter your account email address.");
      return;
    }
    setForgotBusy(true);
    try {
      await sendPasswordResetEmail(auth(), targetEmail);
      trackEvent("password_reset_sent", { method: "email" });
      setForgotNotice(`Password reset link sent to ${targetEmail}. Check your inbox and spam folder.`);
    } catch (err) {
      setForgotError(friendlyError(err));
    } finally {
      setForgotBusy(false);
    }
  }

  async function handleSignin(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth(), email.trim(), password);
      trackEvent("web_login_success", { method: "password" });
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
      const [pinHash, pinBlob] = await Promise.all([
        sha256Hex(pin),
        encryptPin(pin, credential.user.uid)
      ]);
      await saveProfile(credential.user.uid, {
        fullName: fullName.trim(),
        email: suEmail.trim(),
        phoneNumber: toUnsignedE164(phone),
        emergencyContactPhone: toUnsignedE164(emergencyPhone),
        masterPinHash: pinHash,
        encryptedPin: pinBlob,
        createdAt: new Date().toISOString()
      });
      trackEvent("web_signup_success", { method: "password_otp" });
      setNotice("Account created — you are signed in.");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col justify-between overflow-hidden bg-[#070B14] text-[#EDEDED] font-sans antialiased selection:bg-[#00F29D] selection:text-[#070B14]">
      {/* Top Navigation */}
      <Navbar
        currentTab="track"
        onSwitchTab={(tab) => {
          if (tab === "download" && onSwitchToDownload) {
            onSwitchToDownload();
          }
        }}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 max-w-md mx-auto w-full">
        {/* Emergency Alert Banner */}
        <div className="w-full mb-5">
          <div className="rounded-2xl bg-[#1D160A] border border-[#B45309]/30 p-3.5 flex items-start gap-3 text-xs text-amber-200 shadow-sm">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong className="text-amber-400 font-semibold">Lost your phone right now?</strong> Log in below to see its location and lock it down.
            </p>
          </div>
        </div>

        <div className="w-full rounded-3xl bg-[#0D1322] border border-white/10 p-6 space-y-4 shadow-2xl relative overflow-hidden ring-1 ring-white/5">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#00F29D]/10 rounded-full blur-3xl pointer-events-none" />

          <div className="text-center mb-1">
            <h1 className="text-2xl font-extrabold tracking-tight text-white">
              {mode === "signin" ? (
                <>Log in to Track<span className="text-[#00F29D]">d</span></>
              ) : (
                <>Arm your device with Track<span className="text-[#00F29D]">d</span></>
              )}
            </h1>
            <p className="mt-1 text-xs text-slate-400">
              {mode === "signin" 
                ? "See your phone's location, battery and status from any browser."
                : "Create an account to activate real-time anti-theft defense."}
            </p>
          </div>

          {backendSlow && (
            <p className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs leading-relaxed text-warning">
              Still connecting — check your internet. You can keep waiting; this page will
              update automatically.
            </p>
          )}

          <div className="grid grid-cols-2 gap-1 rounded-xl bg-[#070B14] p-1 border border-white/10">
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
                  "rounded-lg py-2 text-xs font-semibold transition " +
                  (mode === item 
                    ? "bg-gradient-to-r from-[#00F29D] to-[#00DCA0] text-[#070B14] shadow-md shadow-[#00F29D]/20 font-bold" 
                    : "text-slate-400 hover:text-white")
                }
              >
                {item === "signin" ? "Log in" : "Sign up"}
              </button>
            ))}
          </div>

          {mode === "signin" ? (
            <form onSubmit={handleSignin} className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-slate-300">
                  Email
                </span>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-slate-500" />
                  <input
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#070B14] border border-white/10 text-xs text-white placeholder:text-slate-500 focus:border-[#00F29D] focus:ring-1 focus:ring-[#00F29D]/30 focus:outline-none transition"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </div>
              </label>

              <div className="block">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-slate-300">
                    Password
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotEmail(email);
                      setForgotError(null);
                      setForgotNotice(null);
                      setShowForgotModal(true);
                    }}
                    className="text-[11px] font-medium text-[#00F29D] hover:underline focus:outline-none"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-slate-500" />
                  <input
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-[#070B14] border border-white/10 text-xs text-white placeholder:text-slate-500 focus:border-[#00F29D] focus:ring-1 focus:ring-[#00F29D]/30 focus:outline-none transition"
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && <AuthAlert kind="err" text={error} />}

              <button className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#00F29D] to-[#00C888] text-[#070B14] font-bold text-xs md:text-sm flex items-center justify-center gap-2 hover:brightness-105 active:scale-[0.98] transition shadow-lg shadow-[#00F29D]/25 border border-[#00F29D]/40" type="submit" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin text-[#070B14]" /> : <ShieldCheck className="h-4 w-4 text-[#070B14]" />}
                <span>Log in to track phone</span>
              </button>

              {/* First time prompt */}
              <div className="pt-3 border-t border-white/5 text-center space-y-1">
                <p className="text-xs text-slate-400">
                  First time here? You&apos;ll need the Trackd Android app on your phone before you can track it.
                </p>
                <button
                  type="button"
                  onClick={onSwitchToDownload}
                  className="text-xs font-semibold text-[#00F29D] hover:underline inline-flex items-center gap-1"
                >
                  <span>Download Trackd App</span>
                  <span>&rarr;</span>
                </button>
              </div>
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
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
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
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
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
      </main>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-[#0D1322] border border-white/10 p-6 space-y-4 shadow-2xl relative overflow-hidden ring-1 ring-white/10">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-[#00F29D]/10 border border-[#00F29D]/20 text-[#00F29D]">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Reset Password</h3>
                  <p className="text-[11px] text-slate-400">Receive a recovery link via email</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Enter the email address registered with your Trackd account. We'll send an official Firebase password reset link straight to your inbox.
            </p>

            <form onSubmit={handleResetPassword} className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-300">
                  Account Email
                </span>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
                  <input
                    className="w-full pl-10 pr-4 py-2 rounded-xl bg-[#070B14] border border-white/10 text-xs text-white placeholder:text-slate-500 focus:border-[#00F29D] focus:ring-1 focus:ring-[#00F29D]/30 focus:outline-none transition"
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </div>
              </label>

              {forgotError && <AuthAlert kind="err" text={forgotError} />}
              {forgotNotice && <AuthAlert kind="ok" text={forgotNotice} />}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowForgotModal(false)}
                  className="flex-1 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-semibold text-xs transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={forgotBusy}
                  className="flex-1 py-2 rounded-xl bg-gradient-to-r from-[#00F29D] to-[#00DCA0] text-[#070B14] font-bold text-xs flex items-center justify-center gap-1.5 hover:brightness-105 active:scale-[0.98] transition shadow-md shadow-[#00F29D]/20 disabled:opacity-50"
                >
                  {forgotBusy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Mail className="w-3.5 h-3.5" />
                  )}
                  <span>Send Reset Link</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Responsible Use Footer */}
      <footer className="w-full py-6 text-center text-[11px] text-neutral-400 border-t border-white/5 px-4">
        Trackd is for protecting a device you own. Setup requires physical access to the phone and a PIN you create.
      </footer>
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
