"use client";

import { useEffect } from "react";
import { CONTENT_VERSION } from "@/lib/content-version";

const LS_VER = "neet-content-version";
const LS_PREFIX = "neet-paper-pack:";

/**
 * Background-warm paper packs in localStorage; wipe when CONTENT_VERSION bumps.
 */
export function PaperContentPrefetch({ years }: { years: number[] }) {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const verRes = await fetch("/api/content/version", { cache: "no-store" });
        const verJson = (await verRes.json()) as { contentVersion?: number };
        const remote = Number(verJson.contentVersion ?? CONTENT_VERSION);
        const local = Number(localStorage.getItem(LS_VER) || "0");
        if (local && local !== remote) {
          for (const k of Object.keys(localStorage)) {
            if (k.startsWith(LS_PREFIX)) localStorage.removeItem(k);
          }
        }
        localStorage.setItem(LS_VER, String(remote));

        for (const year of years.slice(0, 4)) {
          if (cancelled) return;
          const key = `${LS_PREFIX}${remote}:${year}`;
          if (localStorage.getItem(key)) continue;
          const res = await fetch(`/api/content/papers/${year}`, {
            headers: { Accept: "application/json" },
          });
          if (!res.ok) continue;
          const etag = res.headers.get("ETag") || "";
          const body = await res.text();
          try {
            localStorage.setItem(key, JSON.stringify({ etag, body }));
          } catch {
            /* quota */
          }
        }
      } catch {
        /* ignore prefetch errors */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [years]);

  return null;
}
