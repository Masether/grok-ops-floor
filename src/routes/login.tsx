import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  GROK_PROVIDERS,
  authClient,
  authEnabled,
  signIn,
} from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/login")({ component: Login });

type Mode = "signin" | "signup" | "forgot" | "reset";

function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [name, setName] = useState("");
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    try {
      const token = new URLSearchParams(window.location.search).get("token");
      if (token) {
        setResetToken(token);
        setMode("reset");
      }
    } catch {
      /* ignore */
    }
  }, []);

  const goHome = () => void navigate({ to: "/" });

  const onEmailAuth = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNote(null);
    if (!authEnabled) return;
    setBusy(true);
    try {
      if (mode === "reset") {
        if (password !== confirm) {
          setError("Passwords do not match.");
          return;
        }
        if (password.length < 8) {
          setError("Use at least 8 characters.");
          return;
        }
        if (!resetToken) {
          setError("This reset link is missing a token. Request a new one.");
          return;
        }
        const { error: err } = await authClient.resetPassword({
          newPassword: password,
          token: resetToken,
        });
        if (err) {
          setError(err.message ?? "Could not reset the password.");
          return;
        }
        setNote("Password updated. Sign in with the new one.");
        setMode("signin");
        setPassword("");
        setConfirm("");
        return;
      }
      if (mode === "forgot") {
        try {
          const res = await fetch("/api/auth/forget-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: email.trim(),
              redirectTo: `${window.location.origin}/login`,
            }),
          });
          if (!res.ok) {
            setError(
              "Reset mail is not sent from this desk. Sign in with Google or X, or create a new account.",
            );
          } else {
            setNote("If that email is on file, a reset link is on the way.");
          }
        } catch {
          setError(
            "Reset mail is not sent from this desk. Sign in with Google or X, or create a new account.",
          );
        }
        return;
      }
      if (mode === "signup") {
        if (password !== confirm) {
          setError("Passwords do not match.");
          return;
        }
        if (password.length < 8) {
          setError("Use at least 8 characters.");
          return;
        }
        const { error: err } = await authClient.signUp.email({
          email: email.trim(),
          password,
          name: name.trim() || email.trim().split("@")[0] || "Trader",
        });
        if (err) {
          setError(err.message ?? "Could not create the account.");
          return;
        }
        goHome();
        return;
      }
      const { error: err } = await authClient.signIn.email({
        email: email.trim(),
        password,
      });
      if (err) {
        setError(err.message ?? "Email or password did not match.");
        return;
      }
      goHome();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  const onProvider = async (providerId: string) => {
    setError(null);
    setBusy(true);
    try {
      await signIn(providerId, { callbackURL: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
      setBusy(false);
    }
  };

  const sub =
    mode === "signup"
      ? "Create a desk profile. Connect Kraken Query + Orders keys to trade live."
      : mode === "forgot"
        ? "Reset uses the email on the account."
        : mode === "reset"
          ? "Choose a new password for this desk."
          : "Sign in, then attach Kraken keys. Live budget $200.";

  return (
    <main className="grid min-h-dvh place-items-center bg-bg p-3 text-fg sm:p-6">
      <div className="panel w-full max-w-md">
        <div className="panel-head">
          <div className="flex items-start gap-2.5">
            <img src="/favicon.svg" alt="" className="size-8 shrink-0 rounded-sm" />
            <div>
              <p className="panel-kicker">MaSether Ops Floor</p>
              <p className="panel-sub">{sub}</p>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-4 py-4">
          {authEnabled ? (
            <>
              {mode !== "reset" ? (
                <div className="flex gap-1.5">
                  {(
                    [
                      ["signin", "Sign in"],
                      ["signup", "Create account"],
                    ] as const
                  ).map(([id, label]) => (
                    <Button
                      key={id}
                      type="button"
                      size="sm"
                      variant={mode === id ? "default" : "outline"}
                      className="min-h-11 flex-1"
                      onClick={() => {
                        setMode(id);
                        setError(null);
                        setNote(null);
                      }}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              ) : null}

              <form className="space-y-3" onSubmit={(e) => void onEmailAuth(e)}>
                {mode === "signup" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="login-name">Username</Label>
                    <Input
                      id="login-name"
                      className="min-h-11"
                      autoComplete="username"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="How the desk should address you"
                    />
                  </div>
                ) : null}
                {mode !== "reset" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      className="min-h-11"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                    {mode === "signup" ? (
                      <p className="text-2xs text-subtle">
                        Email is the login id. Username is the name on the desk.
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {mode !== "forgot" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="login-pass">
                      {mode === "reset" ? "New password" : "Password"}
                    </Label>
                    <Input
                      id="login-pass"
                      className="min-h-11"
                      type="password"
                      required
                      minLength={8}
                      autoComplete={
                        mode === "signup" || mode === "reset"
                          ? "new-password"
                          : "current-password"
                      }
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                ) : null}
                {mode === "signup" || mode === "reset" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="login-confirm">Confirm password</Label>
                    <Input
                      id="login-confirm"
                      className="min-h-11"
                      type="password"
                      required
                      minLength={8}
                      autoComplete="new-password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                    />
                  </div>
                ) : null}

                {error ? <p className="text-2xs font-semibold text-danger">{error}</p> : null}
                {note ? <p className="text-2xs text-good">{note}</p> : null}

                <Button type="submit" className="min-h-11 w-full" disabled={busy}>
                  {busy
                    ? "Working…"
                    : mode === "signup"
                      ? "Create account"
                      : mode === "forgot"
                        ? "Send reset"
                        : mode === "reset"
                          ? "Update password"
                          : "Sign in"}
                </Button>
              </form>

              {mode === "signin" ? (
                <button
                  type="button"
                  className="text-2xs text-muted underline-offset-4 hover:text-fg hover:underline"
                  onClick={() => {
                    setMode("forgot");
                    setError(null);
                    setNote(null);
                  }}
                >
                  Forgot password
                </button>
              ) : mode === "forgot" || mode === "reset" ? (
                <button
                  type="button"
                  className="text-2xs text-muted underline-offset-4 hover:text-fg hover:underline"
                  onClick={() => {
                    setMode("signin");
                    setError(null);
                    setNote(null);
                  }}
                >
                  Back to sign in
                </button>
              ) : null}

              {mode !== "reset" ? (
                <>
                  <div className="relative py-1">
                    <div className="absolute inset-x-0 top-1/2 border-t border-border" />
                    <span className="relative mx-auto block w-fit bg-surface px-2 text-micro tracking-[0.14em] text-subtle uppercase">
                      or
                    </span>
                  </div>

                  <div className="grid gap-2">
                    {GROK_PROVIDERS.map((p) => (
                      <Button
                        key={p.providerId}
                        type="button"
                        variant="outline"
                        className="min-h-11 w-full"
                        disabled={busy}
                        onClick={() => void onProvider(p.providerId)}
                      >
                        Continue with {p.label}
                      </Button>
                    ))}
                  </div>
                </>
              ) : null}

              <p className={cn("text-2xs text-subtle")}>
                Google, X, or email and a password. Sessions use HttpOnly cookies. Passkeys and
                SMS codes are not on this desk.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">Sign-in is disabled.</p>
          )}

          <Link to="/" className="block text-2xs text-muted underline-offset-4 hover:text-fg hover:underline">
            Back to the floor
          </Link>
        </div>
      </div>
    </main>
  );
}
