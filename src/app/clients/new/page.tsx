"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiGet, apiSend, apiUpload } from "@/lib/apiClient";
import { PLATFORMS, PLATFORM_RULES, type PlatformId } from "@/lib/platforms";
import { PlatformBadge } from "@/components/platform-atom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  RiAddLine,
  RiBuilding2Line,
  RiCheckLine,
  RiCloseLine,
  RiDeleteBinLine,
  RiGlobalLine,
  RiImageLine,
  RiMicLine,
  RiPieChartLine,
  RiUserSearchLine,
} from "react-icons/ri";
import { ChevronDown } from "lucide-react";

interface WizardState {
  name: string;
  industry: string;
  website: string;
  locationId: string;
  brandVoice: string;
  brandVoiceNotes: string;
  targetAudience: string;
  serviceArea: string;
  logoUrl: string;
  products: Array<{ name: string; description: string }>;
  platforms: Record<string, boolean>;
  cadence: Record<string, number>;
  blackouts: Array<{ date: string; reason: string }>;
}

const STEPS = [
  { title: "Company", icon: RiBuilding2Line },
  { title: "Brand voice", icon: RiMicLine },
  { title: "Services", icon: RiPieChartLine },
  { title: "Platforms", icon: RiGlobalLine },
  { title: "Blackout dates", icon: RiUserSearchLine },
];

const VOICES = [
  { id: "friendly", label: "Friendly", desc: "Warm and conversational" },
  { id: "professional", label: "Professional", desc: "Polished and confident" },
  { id: "bold", label: "Bold", desc: "Direct and punchy" },
  { id: "educational", label: "Educational", desc: "Clear, teaching-first" },
];

export default function NewClientPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [locations, setLocations] = useState<Array<{ id: string; name: string; address?: string }>>([]);
  const [locationQuery, setLocationQuery] = useState("");
  const [locOpen, setLocOpen] = useState(false);

  const [w, setW] = useState<WizardState>({
    name: "",
    industry: "",
    website: "",
    locationId: "",
    brandVoice: "friendly",
    brandVoiceNotes: "",
    targetAudience: "",
    serviceArea: "",
    logoUrl: "",
    products: [{ name: "", description: "" }],
    platforms: Object.fromEntries(PLATFORMS.map((p) => [p, p === "facebook" || p === "instagram"])),
    cadence: Object.fromEntries(PLATFORMS.map((p) => [p, 3])),
    blackouts: [],
  });

  useEffect(() => {
    apiGet<{ locations: Array<{ id: string; name: string; address?: string }> }>("/api/ghl/locations")
      .then((d) => setLocations(d.locations))
      .catch(() => setLocations([]));
  }, []);

  const set = <K extends keyof WizardState>(key: K, value: WizardState[K]) =>
    setW((prev) => ({ ...prev, [key]: value }));

  const selectedLocation = locations.find((l) => l.id === w.locationId);
  const enabledPlatforms = PLATFORMS.filter((p) => w.platforms[p]);

  const filteredLocations = useMemo(() => {
    const q = locationQuery.trim().toLowerCase();
    return locations.filter((l) => !q || l.name.toLowerCase().includes(q) || l.id.toLowerCase().includes(q));
  }, [locations, locationQuery]);

  const canNext = () => {
    if (step === 0) return w.name.trim().length > 0 && w.industry.trim().length > 0;
    if (step === 3) return enabledPlatforms.length > 0;
    return true;
  };

  const submit = async () => {
    if (!w.name.trim() || !w.industry.trim()) {
      setStep(0);
      toast.error("Company name and industry are required");
      return;
    }
    if (!enabledPlatforms.length) {
      setStep(3);
      toast.error("Select at least one platform");
      return;
    }
    setBusy(true);
    try {
      const res = await apiSend<{ client: { id: string } }>("/api/clients", "POST", {
        name: w.name,
        industry: w.industry,
        website: w.website,
        locationId: w.locationId,
        brandVoice: w.brandVoice,
        brandVoiceNotes: w.brandVoiceNotes,
        targetAudience: w.targetAudience,
        serviceArea: w.serviceArea,
        logoUrl: w.logoUrl,
        products: w.products.filter((p) => p.name.trim()),
        platforms: enabledPlatforms.map((p) => ({ platform: p, cadenceWeekly: w.cadence[p] })),
        blackoutDates: w.blackouts.filter((b) => b.date),
      });
      toast.success("Client onboarded — now generate the 12-month plan");
      router.push(`/dashboard?client=${res.client.id}&generate=1`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create client");
      setBusy(false);
    }
  };

  const uploadLogo = async (file: File) => {
    try {
      const d = await apiUpload<{ ok: boolean; asset?: { url?: string } }>(
        `/api/upload/logo?clientId=preview`,
        file
      );
      if (d.asset?.url) set("logoUrl", d.asset.url);
      toast.success("Logo staged — saved with the client");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
      <div>
        <Link href="/clients" className="text-xs text-muted-foreground transition hover:text-foreground">
          ← All clients
        </Link>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight">Onboard a client</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This brief powers a full year of on-brand posts. You can revisit every field later in client settings.
        </p>
      </div>

      {/* Stepper */}
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-xs font-semibold">
        {STEPS.map((s, i) => (
          <li key={i} className="flex items-center gap-2">
            <button
              onClick={() => i <= step && setStep(i)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 transition ${
                i === step
                  ? "bg-primary text-white shadow-lift"
                  : i < step
                    ? "bg-primary/10 text-primary"
                    : "bg-secondary text-muted-foreground"
              }`}
            >
              {i < step ? <RiCheckLine className="h-3.5 w-3.5" /> : <s.icon className="h-3.5 w-3.5" />}
              {s.title}
            </button>
            {i < STEPS.length - 1 && <span className="text-muted-foreground">→</span>}
          </li>
        ))}
      </ol>

      <div className="rounded-3xl border bg-white p-6 shadow-soft sm:p-8">
        {step === 0 && (
          <div className="space-y-5 animate-in-up">
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name" data-testid="company-name-label">Company name *</Label>
                <Input
                  data-testid="company-name"
                  id="name"
                  placeholder="Sunrise Solar Co."
                  value={w.name}
                  onChange={(e) => set("name", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="industry">Industry *</Label>
                <Input
                  id="industry"
                  placeholder="Residential solar installation"
                  value={w.industry}
                  onChange={(e) => set("industry", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  type="url"
                  placeholder="https://…"
                  value={w.website}
                  onChange={(e) => set("website", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Logo</Label>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed p-4 transition hover:border-primary/50 hover:bg-primary/5">
                <RiImageLine className="h-5 w-5 text-primary" />
                <div className="flex-1 text-sm">
                  {w.logoUrl ? (
                    <span className="font-medium">Logo uploaded ✓</span>
                  ) : (
                    <span className="text-muted-foreground">Upload a logo (PNG/SVG, max 2MB)</span>
                  )}
                </div>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])}
                />
              </label>
            </div>

            <div className="space-y-2">
              <Label>GHL sub-account</Label>
              <p className="text-xs text-muted-foreground">
                Each client links to exactly one location. Search by company name or location ID.
              </p>
              <Popover open={locOpen} onOpenChange={setLocOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-between font-normal"
                    data-testid="location-select"
                  >
                    {selectedLocation ? (
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate">{selectedLocation.name}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">{selectedLocation.id}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Select a sub-account…</span>
                    )}
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Search name or location ID…"
                      value={locationQuery}
                      onValueChange={setLocationQuery}
                    />
                    <CommandList data-testid="location-options">
                      <CommandEmpty>No sub-accounts found.</CommandEmpty>
                      <CommandGroup>
                        {filteredLocations.map((l) => (
                          <CommandItem
                            key={l.id}
                            value={l.id}
                            onSelect={() => {
                              set("locationId", l.id);
                              setLocOpen(false);
                            }}
                          >
                            <div className="min-w-0">
                              <div className="truncate font-medium">{l.name}</div>
                              <div className="font-mono text-[10px] text-muted-foreground">{l.id}</div>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5 animate-in-up">
            <div className="space-y-2">
              <Label>Tone</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {VOICES.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => set("brandVoice", v.id)}
                    className={`rounded-xl border p-3 text-left transition ${
                      w.brandVoice === v.id
                        ? "border-primary bg-primary/5 shadow-lift"
                        : "hover:border-primary/40"
                    }`}
                  >
                    <div className="text-sm font-bold">{v.label}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{v.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="voice-notes">Style notes</Label>
              <Textarea
                id="voice-notes"
                rows={3}
                placeholder="e.g. Avoid industry jargon. Emphasize warranties and local crews. Never use exclamation marks."
                value={w.brandVoiceNotes}
                onChange={(e) => set("brandVoiceNotes", e.target.value)}
              />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="audience">Target audience</Label>
                <Input
                  id="audience"
                  placeholder="Homeowners aged 30-60 considering solar"
                  value={w.targetAudience}
                  onChange={(e) => set("targetAudience", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="area">Geographic service area</Label>
                <Input
                  id="area"
                  placeholder="Phoenix metro, AZ"
                  value={w.serviceArea}
                  onChange={(e) => set("serviceArea", e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 animate-in-up">
            <div className="flex items-center justify-between">
              <div>
                <Label>Products &amp; services</Label>
                <p className="text-xs text-muted-foreground">Up to 20, one line each — these seed the content mix.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                disabled={w.products.length >= 20}
                onClick={() => set("products", [...w.products, { name: "", description: "" }])}
              >
                <RiAddLine className="mr-1 h-3.5 w-3.5" /> Add
              </Button>
            </div>
            <div className="space-y-2.5">
              {w.products.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    className="flex-1"
                    placeholder={`Service ${i + 1} name`}
                    value={p.name}
                    onChange={(e) => {
                      const next = [...w.products];
                      next[i] = { ...next[i], name: e.target.value };
                      set("products", next);
                    }}
                  />
                  <Input
                    className="flex-[2]"
                    placeholder="One-line description"
                    value={p.description}
                    onChange={(e) => {
                      const next = [...w.products];
                      next[i] = { ...next[i], description: e.target.value };
                      set("products", next);
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 shrink-0 text-muted-foreground"
                    onClick={() => set("products", w.products.filter((_, j) => j !== i))}
                  >
                    <RiCloseLine className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3 animate-in-up">
            <div>
              <Label>Platforms</Label>
              <p className="text-xs text-muted-foreground">
                The AI plan generates only for the platforms you enable. Media requirements are enforced per
                platform at scheduling time.
              </p>
            </div>
            {PLATFORMS.map((p) => {
              const rules = PLATFORM_RULES[p as PlatformId];
              return (
                <div
                  key={p}
                  className="flex flex-wrap items-center gap-3 rounded-xl border p-4"
                  data-testid={`platform-row-${p}`}
                >
                  <Switch
                    checked={w.platforms[p]}
                    onCheckedChange={(v) => set("platforms", { ...w.platforms, [p]: v })}
                  />
                  <PlatformBadge platform={p} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold">{rules.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      Max {rules.maxLen.toLocaleString()} chars
                      {rules.mediaRequired ? " · image or video required" : ""}
                      {rules.videoRequired ? " · video required" : ""}
                      {p === "gbp" ? " · local post types, no hashtags" : ""}
                      {p === "twitter" ? " · threads when over 280" : ""}
                    </div>
                  </div>
                  {w.platforms[p] && (
                    <div className="flex items-center gap-2">
                      <Slider
                        className="w-28"
                        min={1}
                        max={7}
                        step={1}
                        value={[w.cadence[p]]}
                        onValueChange={(val) => set("cadence", { ...w.cadence, [p]: val[0] })}
                      />
                      <Badge variant="secondary" data-testid={`cadence-${p}`}>
                        {w.cadence[p]}/week
                      </Badge>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4 animate-in-up">
            <div>
              <Label>Blackout dates</Label>
              <p className="text-xs text-muted-foreground">
                Local holidays, events, or company closures — no posts are planned on these days.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => set("blackouts", [...w.blackouts, { date: "", reason: "" }])}
            >
              <RiAddLine className="mr-1 h-3.5 w-3.5" /> Add date
            </Button>
            <div className="space-y-2.5">
              {w.blackouts.map((b, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    type="date"
                    className="w-44"
                    value={b.date}
                    onChange={(e) => {
                      const next = [...w.blackouts];
                      next[i] = { ...next[i], date: e.target.value };
                      set("blackouts", next);
                    }}
                  />
                  <Input
                    className="flex-1"
                    placeholder="Reason — e.g. Company closure"
                    value={b.reason}
                    onChange={(e) => {
                      const next = [...w.blackouts];
                      next[i] = { ...next[i], reason: e.target.value };
                      set("blackouts", next);
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 shrink-0 text-muted-foreground"
                    onClick={() => set("blackouts", w.blackouts.filter((_, j) => j !== i))}
                  >
                    <RiDeleteBinLine className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {!w.blackouts.length && (
                <p className="text-xs text-muted-foreground">No blackout dates — posts may land any day.</p>
              )}
            </div>
          </div>
        )}

        {/* Wizard controls */}
        <div className="mt-8 flex items-center justify-between border-t pt-5">
          <Button
            variant="ghost"
            className="rounded-full"
            disabled={step === 0 || busy}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            Back
          </Button>
          {step < 4 ? (
            <Button
              className="rounded-full shadow-lift"
              disabled={!canNext()}
              onClick={() => setStep((s) => Math.min(4, s + 1))}
            >
              Continue
            </Button>
          ) : (
            <Button
              className="rounded-full shadow-lift"
              data-testid="create-client"
              disabled={busy || !canNext()}
              onClick={submit}
            >
              {busy ? "Creating…" : "Create client & open dashboard"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}