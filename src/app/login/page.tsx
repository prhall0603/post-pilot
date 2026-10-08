"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiGet, apiSend } from "@/lib/apiClient";
import { LogoLockup } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { RiShieldKeyholeLine, RiSparkling2Line, RiTimerFlashLine } from "react-icons/ri";

function LoginCard() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"register" | "login" | "loading">("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const auth = await apiGet<{
        authenticated: boolean;
        registrationOpen: boolean;
      }>("/api/auth");
      if (auth.authenticated) {
        router.replace("/dashboard");
        return;
      }
      setMode(auth.registrationOpen ? "register" : "login");
    })().catch(() => setMode("login"));
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "loading") return;
    setBusy(true);
    try {
      await apiSend("/api/auth", "POST", { action: mode, email, password });
      if (mode === "register") toast.success("Workspace created — Demo Mode is on");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-md animate-in-up">
      <div className="mb-8 flex flex-col items-center text-center">
        <LogoLockup size={44} />
        <h1 className="mt-6 text-2xl font-extrabold tracking-tight">
          {mode === "register" ? "Create your agency workspace" : "Sign in to PostPilot"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === "register"
            ? "One account runs every client. First-run setup starts in Demo Mode."
            : "Your agency workspace, one login."}
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-3xl border bg-white p-6 shadow-soft">
        <div className="space-y-2">
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@agency.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            required
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            placeholder={mode === "register" ? "At least 8 characters" : "••••••••"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button
          type="submit"
          data-testid="login-submit"
          disabled={busy || mode === "loading"}
          className="w-full rounded-full shadow-lift"
        >
          {busy ? "…" : mode === "register" ? "Create workspace" : "Sign in"}
        </Button>
        {mode === "register" && (
          <p className="flex items-start gap-2 rounded-xl bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
            <RiSparkling2Line className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            New workspaces start in Demo Mode with a worked example client — simulated GHL and AI included, no
            credentials needed.
          </p>
        )}
      </form>

      <div className="mt-6 flex justify-center gap-6 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <RiTimerFlashLine className="h-3.5 w-3.5" /> 12-month plans
        </span>
        <span className="flex items-center gap-1.5">
          <RiShieldKeyholeLine className="h-3.5 w-3.5" /> Encrypted tokens
        </span>
      </div>
      <div className="mt-4 text-center">
        <Link href="/" className="text-xs text-muted-foreground transition hover:text-foreground">
          ← Back to postpilot landing
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-background to-teal-50 px-4 py-10">
      <Suspense fallback={null}>
        <LoginCard />
      </Suspense>
    </div>
  );
}