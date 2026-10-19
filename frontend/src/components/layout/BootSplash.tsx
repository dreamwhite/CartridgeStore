"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

const SPLASH_SESSION_KEY = "prg32-boot-splash-seen";

export function BootSplash() {
  const [visible, setVisible] = useState(true);
  const [exiting, setExiting] = useState(false);

  const dismiss = useCallback(() => {
    setExiting(true);
    window.setTimeout(() => setVisible(false), 260);
  }, []);

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(SPLASH_SESSION_KEY)) {
        const timer = window.setTimeout(() => setVisible(false), 0);
        return () => window.clearTimeout(timer);
      }
      window.sessionStorage.setItem(SPLASH_SESSION_KEY, "1");
    } catch {
      // Session storage may be unavailable; the splash can still be dismissed.
    }

    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timer = window.setTimeout(dismiss, reducedMotion ? 400 : 2500);

    return () => window.clearTimeout(timer);
  }, [dismiss]);

  if (!visible) return null;

  return (
    <div
      className={`boot-splash${exiting ? " boot-splash--exiting" : ""}`}
      role="status"
      aria-live="polite"
      aria-label="Starting PRG32 Cartridge Store"
    >
      <div className="boot-splash__art">
        <Image
          src="/prg32-boot-splash.png"
          alt="PRG32 retro gaming and coding"
          fill
          priority
          sizes="(max-width: 640px) 78vw, 38rem"
          className="boot-splash__image"
        />
        <span className="boot-splash__bar-mask" aria-hidden="true" />
      </div>
    </div>
  );
}
