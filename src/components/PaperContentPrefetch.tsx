"use client";

import { useEffect } from "react";
import { CONTENT_VERSION } from "@/lib/content-version";

const LS_VER = "neet-content-version";
const LS_PREFIX = "neet-paper-etag:";

function idle(cb: () => void) {
  if (typeof globalThis === "undefined") return () => {};
  const g = globalThis as typeof globalThis & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (typeof g.requestIdleCallback === "function") {
    const id = g.requestIdleCallback(() => cb(), { timeout: 2500 });
    return () => g.cancelIdleCallback?.(id);
  }
  const t = setTimeout(cb, 200);
  return () => clearTimeout(t);
}

/**
 * Background-warm paper packs via HTTP cache + ETag.
 * Stores only ETags in localStorage (avoid quota from 200-Q JSON bodies).
 */
export function PaperContentPrefetch({ years }: { years: number[] }) {
  useEffect(() => {
    let cancelled = false;

    const cancelIdle = idle(() => {
      void (async () => {
        try {
          const verRes = await fetch("/api/content/version", { cache: "no-store" });
          const verJson = (await verRes.json()) as { contentVersion?: number };
          const remote = Number(verJson.contentVersion ?? CONTENT_VERSION);
          const local = Number(localStorage.getItem(LS_VER) || "0");
          if (local && local !== remote) {
            for (const k of Object.keys(localStorage)) {
              if (k.startsWith(LS_PREFIX) || k.startsWith("neet-paper-pack:")) {
                localStorage.removeItem(k);
              }
            }
          }
          localStorage.setItem(LS_VER, String(remote));

          // Limited concurrency — warm top years without saturating the network.
          const queue = years.slice(0, 6);
          const workers = 2;
          let cursor = 0;
          async function worker() {
            while (cursor < queue.length && !cancelled) {
              const year = queue[cursor++];
              const key = `${LS_PREFIX}${remote}:${year}`;
              const prevEtag = localStorage.getItem(key) || "";
              const headers: Record<string, string> = {
                Accept: "application/json",
              };
              if (prevEtag) headers["If-None-Match"] = prevEtag;
              const res = await fetch(`/api/content/papers/${year}`, {
                headers,
                // Prefer browser HTTP cache; ETag handles invalidation.
                cache: "force-cache",
              });
              if (cancelled) return;
              if (res.status === 304) continue;
              if (!res.ok) continue;
              const etag = res.headers.get("ETag") || "";
              // Drain body so the response can populate HTTP cache, but do not
              // persist the full pack in localStorage (quota / main-thread cost).
              await res.arrayBuffer();
              if (etag) {
                try {
                  localStorage.setItem(key, etag);
                } catch {
                  /* quota */
                }
              }
            }
          }
          await Promise.all(
            Array.from({ length: Math.min(workers, queue.length) }, () => worker()),
          );
        } catch {
          /* ignore prefetch errors */
        }
      })();
    });

    return () => {
      cancelled = true;
      cancelIdle?.();
    };
  }, [years]);

  return null;
}
