"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  RiDashboardLine,
  RiCalendarCheckLine,
  RiImageLine,
  RiSettings4Line,
  RiBuilding2Line,
  RiAddLine,
  RiLogoutBoxRLine,
  RiGlobalLine,
  RiMenuLine,
  RiCloseLine,
  RiUserSmileLine,
} from "react-icons/ri";
import { apiGet, apiSend } from "@/lib/apiClient";
import { LogoMark } from "@/components/logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface ClientSummary {
  id: string;
  name: string;
}

function ShellData({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<{
    loading: boolean;
    email?: string;
    demoMode?: boolean;
    clients?: ClientSummary[];
  }>({ loading: true });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const auth = await apiGet<{
          authenticated: boolean;
          email?: string;
          demoMode?: boolean;
          needsOnboarding?: boolean;
        }>("/api/auth");
        if (!auth.authenticated) {
          router.replace("/login");
          return;
        }
        if (auth.needsOnboarding) {
          router.replace("/onboarding");
          return;
        }
        const { clients } = await apiGet<{ clients: ClientSummary[] }>("/api/clients");
        if (!cancelled) setState({ loading: false, email: auth.email, demoMode: auth.demoMode, clients });
      } catch {
        router.replace("/login");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, pathname]);

  useEffect(() => setMobileNavOpen(false), [pathname]);

  const signOut = async () => {
    await apiSend("/api/auth", "POST", { action: "logout" });
    router.push("/login");
    router.refresh();
  };

  if (state.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-primary border-t-transparent" />
      </div>
    );
  }

  const clients = state.clients || [];
  const requested = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : ""
  ).get("client");
  const current = clients.find((c) => c.id === requested) || clients[0] || null;
  const currentClientId = current?.id ?? null;

  const overviewActive = pathname === "/dashboard";
  const calendarActive = pathname.startsWith("/dashboard/calendar");
  const mediaActive = pathname.startsWith("/dashboard/media");
  const settingsActive = pathname.startsWith("/dashboard/settings");

  const navItems = [
    { href: `/dashboard?client=${currentClientId ?? ""}`, label: "Overview", icon: RiDashboardLine, active: overviewActive },
    { href: `/dashboard/calendar?client=${currentClientId ?? ""}`, label: "Calendar", icon: RiCalendarCheckLine, active: calendarActive },
    { href: `/dashboard/media?client=${currentClientId ?? ""}`, label: "Media library", icon: RiImageLine, active: mediaActive },
    { href: `/dashboard/settings?client=${currentClientId ?? ""}`, label: "Client settings", icon: RiSettings4Line, active: settingsActive },
  ];

  const sidebar = (
    <div className="flex h-full flex-col bg-[hsl(var(--sidebar-background))] text-[hsl(var(--sidebar-foreground))]">
      <div className="flex h-16 items-center gap-2.5 border-b border-[hsl(var(--sidebar-border))] px-5">
        <LogoMark size={32} />
        <div>
          <div className="text-[15px] font-extrabold tracking-tight text-white">
            Post<span className="text-indigo-300">Pilot</span>
          </div>
          <div className="text-[10px] font-medium uppercase tracking-wider text-indigo-300/80">
            Agency workspace
          </div>
        </div>
      </div>

      {/* Client switcher */}
      <div className="border-b border-[hsl(var(--sidebar-border))] px-3 py-3">
        <div className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-indigo-300/70">
          Clients
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              data-testid="client-switcher"
              className="flex w-full items-center gap-2 rounded-lg bg-[hsl(var(--sidebar-accent))] px-3 py-2.5 text-left text-sm font-semibold text-white transition hover:bg-white/10"
            >
              <RiUserSmileLine className="h-4 w-4 shrink-0 text-indigo-300" />
              <span className="truncate">{current?.name || "No client selected"}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Your clients</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {clients.map((c) => (
              <DropdownMenuItem key={c.id} asChild>
                <Link href={`/dashboard?client=${c.id}`}>{c.name}</Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/clients/new" data-testid="sidebar-new-client">
                <RiAddLine className="h-4 w-4" /> Add client
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {currentClientId ? (
          navItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                item.active
                  ? "bg-[hsl(var(--sidebar-primary))] text-white shadow-sm"
                  : "text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))]"
              )}
            >
              <item.icon className="h-[18px] w-[18px]" />
              {item.label}
            </Link>
          ))
        ) : (
          <div className="px-3 py-2 text-xs text-indigo-200/70">Add a client to unlock the dashboard.</div>
        )}

        <div className="my-3 border-t border-[hsl(var(--sidebar-border))]" />
        <Link
          href="/clients"
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
            pathname.startsWith("/clients") && pathname !== "/clients/new"
              ? "bg-[hsl(var(--sidebar-primary))] text-white"
              : "text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))]"
          )}
        >
          <RiBuilding2Line className="h-[18px] w-[18px]" /> All clients
        </Link>
        <Link
          href="/settings/agency"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-[hsl(var(--sidebar-foreground))] transition hover:bg-[hsl(var(--sidebar-accent))]"
        >
          <RiGlobalLine className="h-[18px] w-[18px]" /> Agency settings
        </Link>
      </nav>

      {/* Footer */}
      <div className="space-y-2 border-t border-[hsl(var(--sidebar-border))] px-3 py-3">
        {state.demoMode && (
          <div className="mx-1 mb-1 rounded-lg bg-amber-400/10 px-3 py-2 text-[11px] font-medium text-amber-200">
            Demo Mode — simulated GHL &amp; AI
          </div>
        )}
        <div className="flex items-center justify-between gap-2 px-2">
          <span className="truncate text-xs text-indigo-200/80">{state.email}</span>
          <button
            onClick={signOut}
            title="Sign out"
            className="rounded-md p-2 text-indigo-200/80 transition hover:bg-white/10 hover:text-white"
          >
            <RiLogoutBoxRLine className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  const activeOrDefault = current?.name || "No client selected";

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 lg:block">{sidebar}</aside>

      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b bg-[hsl(var(--sidebar-background))] px-4 lg:hidden">
        <button
          onClick={() => setMobileNavOpen((v) => !v)}
          className="rounded-md p-2 text-white transition hover:bg-white/10"
          aria-label="Toggle navigation"
        >
          {mobileNavOpen ? <RiCloseLine className="h-5 w-5" /> : <RiMenuLine className="h-5 w-5" />}
        </button>
        <div className="flex items-center gap-2">
          <LogoMark size={26} />
          <span className="text-sm font-extrabold text-white">PostPilot</span>
        </div>
        <div className="w-9" />
      </div>

      {mobileNavOpen && (
        <div className="fixed inset-x-0 top-14 z-30 max-h-[calc(100vh-3.5rem)] overflow-y-auto border-b lg:hidden">
          {sidebar}
        </div>
      )}

      <main className="min-w-0 flex-1 pt-14 pb-16 lg:pt-0">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">{children}</div>
      </main>
    </div>
  );
}

export function DashboardShellLoader({ children }: { children: React.ReactNode }) {
  return <ShellData>{children}</ShellData>;
}