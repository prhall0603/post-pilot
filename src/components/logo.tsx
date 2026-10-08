"use client";

import { cn } from "@/lib/utils";

export function Logo({
  className,
  mark = true,
  wordmark = true,
}: {
  className?: string;
  mark?: boolean;
  wordmark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {mark && (
        <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary shadow-[0_6px_16px_-6px_rgba(79,70,229,0.7)]">
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-primary-foreground" fill="none">
            <path
              d="M4 12.5 19.5 5l-6 6.5 5.5 7.5-2.9-5.6L4 12.5Z"
              fill="currentColor"
              opacity="0.95"
            />
            <path d="M13.5 11.5 19.5 5l-3.4 9.2" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" opacity="0.5" />
          </svg>
        </span>
      )}
      {wordmark && (
        <span className="font-display text-lg font-semibold tracking-tight">
          Post<span className="text-primary">Pilot</span>
        </span>
      )}
    </span>
  );
}