"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const HEADLINES = [
  "Write your NEET mock like class notes.",
  "Timed CBT. Real papers. Honest rank.",
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
        2016 → 2025
        <em>year packs</em>
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
                  /mock|CBT|rank|exam/i.test(word) ||
                  (i === 0 && wi >= 2 && wi <= 4);
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
          Full-screen timed papers with palette, figures, examiner review, and
          post-approval percentile against real candidate counts.
        </p>

        <div className="landing-cta fade-up-late">
          <Link href="/signup" className="btn-pencil">
            <span className="btn-pencil__lead">Start as student</span>
            <span className="btn-pencil__tip" aria-hidden="true" />
          </Link>
          <Link href="/login" className="btn-ink-link">
            Already have a roll? Login →
          </Link>
        </div>
      </section>

      <footer className="landing-foot">
        <span className="landing-foot__note">Demo · examiner@neet.local</span>
        <span className="landing-foot__sep">·</span>
        <span className="landing-foot__note">student@neet.local</span>
      </footer>
    </main>
  );
}
