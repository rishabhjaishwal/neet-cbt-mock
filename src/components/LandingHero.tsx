"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";

const HEADLINES = [
  "Your NEET desk — mocks, topics, friends.",
  "Timed CBT. Real papers. Honest feedback.",
  "Practice the exam — not the panic.",
];

export function LandingHero() {
  const [hi, setHi] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setHi((n) => (n + 1) % HEADLINES.length);
    }, 4200);
    return () => window.clearInterval(id);
  }, []);

  return (
    <main className="landing-root">
      <div className="landing-paper" aria-hidden="true" />
      <div className="landing-margin-line" aria-hidden="true" />

      <div className="landing-sticky landing-sticky--pink" aria-hidden="true">
        <span>Physics</span>
        <span>Chemistry</span>
        <span>Biology</span>
      </div>
      <div className="landing-sticky landing-sticky--mint" aria-hidden="true">
        +4 / −1 / 0
        <em>NTA marking</em>
      </div>
      <div className="landing-sticky landing-sticky--butter" aria-hidden="true">
        Friends race
        <em>competitions</em>
      </div>

      <div className="absolute right-3 top-3 z-10 sm:right-5 sm:top-5">
        <ThemeToggle />
      </div>

      <section className="landing-hero">
        <p className="landing-brand ink-write">NEET CBT Mock</p>

        <div className="landing-headline-slot" aria-live="polite">
          {HEADLINES.map((line, i) => (
            <h1
              key={line}
              className={`landing-headline ink-stroke ${i === hi ? "is-active" : ""}`}
            >
              {line.split(" ").map((word, wi) => {
                const highlight =
                  /mocks|CBT|feedback|exam|friends/i.test(word) ||
                  (i === 0 && wi >= 1 && wi <= 3);
                return (
                  <span
                    key={`${line}-${wi}`}
                    className={highlight ? "hl-mark" : undefined}
                    style={{ animationDelay: `${0.08 + wi * 0.07}s` }}
                  >
                    {word}
                    {wi < line.split(" ").length - 1 ? "\u00a0" : ""}
                  </span>
                );
              })}
            </h1>
          ))}
        </div>

        <p className="landing-support fade-up">
          Built for students: full-year timed papers, 30-question topic drills,
          friend competitions, and a suggestions notebook so you shape what we
          build next. Instant marks on submit — no examiner gate.
        </p>

        <div className="landing-cta fade-up-late">
          <Link href="/signup" className="btn-pencil">
            <span className="btn-pencil__lead">Create student account</span>
            <span className="btn-pencil__tip" aria-hidden="true" />
          </Link>
          <Link href="/login" className="btn-ink-link">
            Already studying here? Login →
          </Link>
        </div>
      </section>
    </main>
  );
}
