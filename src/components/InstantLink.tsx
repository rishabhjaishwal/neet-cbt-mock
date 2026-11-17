"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useTransition,
  type ComponentProps,
  type MouseEvent,
} from "react";

type Props = ComponentProps<typeof Link> & {
  /** Show a tiny pending cue on the link itself */
  showPending?: boolean;
};

/**
 * Feels instant: prefetch + pending cue + startTransition navigation.
 * Use for dashboard / results / topic-series open/back links.
 */
export function InstantLink({
  href,
  children,
  className = "",
  showPending = true,
  onClick,
  ...rest
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const url = typeof href === "string" ? href : href.pathname || "";

  useEffect(() => {
    if (url.startsWith("/")) router.prefetch(url);
  }, [router, url]);

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if (!url.startsWith("/")) return;
    e.preventDefault();
    startTransition(() => {
      router.push(url);
    });
  }

  return (
    <Link
      href={href}
      prefetch
      {...rest}
      onClick={handleClick}
      onMouseEnter={() => {
        if (url.startsWith("/")) router.prefetch(url);
      }}
      className={`${className} ${pending ? "opacity-70" : ""}`.trim()}
      aria-busy={pending || undefined}
    >
      {children}
      {showPending && pending ? (
        <span className="ml-1 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent align-[-1px]" />
      ) : null}
    </Link>
  );
}
