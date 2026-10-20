"use client";

import { useEffect } from "react";

import {
  MANAGED_ASSET_UPDATED_EVENT,
  managedAssetUrl,
  type ManagedAssetKind,
} from "../../lib/runtime-assets";

type ManagedAssetEvent = CustomEvent<{ kind?: ManagedAssetKind }>;

export function RuntimeFavicon() {
  useEffect(() => {
    const fallback = "/static/icon-192.svg";
    const link =
      document.querySelector<HTMLLinkElement>("link[data-prg32-favicon]") ??
      document.createElement("link");

    link.rel = "icon";
    link.dataset.prg32Favicon = "true";
    const onError = () => {
      link.href = fallback;
      link.type = "image/svg+xml";
    };
    link.addEventListener("error", onError);
    if (!link.parentElement) document.head.appendChild(link);
    link.href = managedAssetUrl("favicon");
    link.removeAttribute("type");

    const onAssetUpdated = (event: Event) => {
      const { kind } = (event as ManagedAssetEvent).detail;
      if (kind !== "favicon") return;
      link.href = managedAssetUrl("favicon");
      link.removeAttribute("type");
    };
    window.addEventListener(MANAGED_ASSET_UPDATED_EVENT, onAssetUpdated);
    return () => {
      link.removeEventListener("error", onError);
      window.removeEventListener(MANAGED_ASSET_UPDATED_EVENT, onAssetUpdated);
    };
  }, []);

  return null;
}
