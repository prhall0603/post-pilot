"use client";

import { cn } from "@/lib/utils";
import { PLATFORM_RULES, isPlatformId } from "@/lib/platforms";
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

const ICONS: Record<string, LucideIcon> = {
  facebook: Facebook,
  instagram: Instagram,
  linkedin: Linkedin,
  gbp: MapPin,
  tiktok: Music2,
  youtube: Youtube,
  twitter: Twitter,
};

export function PlatformIcon({
  platform,
  className,
}: {
  platform: string;
  className?: string;
}) {
  const Icon = ICONS[platform] || MapPin;
  return <Icon className={className} />;
}

export function PlatformDot({ platform, className }: { platform: string; className?: string }) {
  const hex = isPlatformId(platform) ? PLATFORM_RULES[platform].accentHex : "#64748b";
  return (
    <span
      className={cn("inline-block h-2.5 w-2.5 rounded-full", className)}
      style={{ backgroundColor: hex }}
      data-testid={`platform-dot-${platform}`}
    />
  );
}

export function platformHex(platform: string): string {
  return isPlatformId(platform) ? PLATFORM_RULES[platform].accentHex : "#64748b";
}