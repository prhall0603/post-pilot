import Link from "next/link";

export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logo.svg" alt="PostPilot" width={size} height={size} className="rounded-xl" />
  );
}

export function LogoLockup({ size = 36, dark = false }: { size?: number; dark?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className={`text-lg font-extrabold tracking-tight ${dark ? "text-white" : "text-foreground"}`}>
        Post<span className="text-primary">Pilot</span>
      </span>
    </Link>
  );
}