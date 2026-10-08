import { PLATFORM_RULES, isPlatformId, type PlatformId } from "@/lib/platforms";
import {
  Facebook,
  Instagram,
  Linkedin,
  MapPin,
  Music2,
  Youtube,
  Twitter,
  type LucideIcon,
} from "lucide-react";

export const PLATFORM_ICONS: Record<PlatformId, LucideIcon> = {
  facebook: Facebook,
  instagram: Instagram,
  linkedin: Linkedin,
  gbp: MapPin,
  tiktok: Music2,
  youtube: Youtube,
  twitter: Twitter,
};

export function PlatformBadge({
  platform,
  size = "md",
}: {
  platform: string;
  size?: "sm" | "md";
}) {
  if (!isPlatformId(platform)) return null;
  const Icon = PLATFORM_ICONS[platform as PlatformId];
  const rules = PLATFORM_RULES[platform as PlatformId];
  const px = size === "sm" ? "h-5 w-5" : "h-7 w-7";
  const icon = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";
  const dark = platform === "twitter" || platform === "tiktok";
  return (
    <span
      title={rules.name}
      className={`inline-flex items-center justify-center rounded-full text-white ${px}`}
      style={{ backgroundColor: rules.accentHex }}
    >
      <Icon className={icon} strokeWidth={2.2} />
    </span>
  );
}

export function PlatformChip({ platform }: { platform: string }) {
  if (!isPlatformId(platform)) return null;
  const rules = PLATFORM_RULES[platform as PlatformId];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: rules.accentHex }} />
      {rules.name}
    </span>
  );
}