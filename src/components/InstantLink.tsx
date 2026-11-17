"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, type ComponentProps, type MouseEvent } from "react";

type Props = ComponentProps<typeof Link> & {
  /** Show a tiny pending cue on the link itself */
  showPending?: boolean;
};

/**
 * Feels instant: marks navigation pending immediately, keeps UI responsive.
 * Use for dashboard / results / topic-series back-links.
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

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    const url = typeof href === "string" ? href : href.pathname || "";
    if (!url.startsWith("/")) return;
    e.preventDefault();
    startTransition(() => {
      router.push(url);
    });
  }

  return (
    <Link
      href={href}
      {...rest}
      onClick={handleClick}
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
