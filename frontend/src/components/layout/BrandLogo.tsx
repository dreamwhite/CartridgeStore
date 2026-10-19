import Image from "next/image";

/** Renders the canonical PRG32 Cartridge Store brand lockup. */
export function BrandLogo() {
  return (
    <span className="isolate inline-flex min-w-0 items-center gap-3">
      <span className="relative z-0 flex h-12 w-[5.5rem] shrink-0 items-center justify-center overflow-hidden">
        <Image
          src="/prg32_logo_transparent.png"
          alt="PRG32"
          width={84}
          height={56}
          priority
          className="block h-14 w-[5.25rem] max-w-none object-contain"
        />
      </span>
      <span className="relative z-10 min-w-0 whitespace-nowrap bg-[var(--color-surface)] pl-1 text-[1.55rem] leading-none tracking-[-0.04em]">
        <span className="font-extrabold text-[var(--color-text)]">PRG32</span>
        <span className="font-medium text-[var(--color-text-muted)]">
          {" Cartridge Store"}
        </span>
      </span>
    </span>
  );
}
