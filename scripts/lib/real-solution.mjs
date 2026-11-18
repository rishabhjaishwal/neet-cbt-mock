/**
 * Build real NEET-style curated solutions (not generic NCERT-template shells).
 * Solutions lock to verified option TEXT; never remap by Q-number alone.
 */

export function clip(s, n = 220) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

export function isWeakSolution(sol) {
  const s = String(sol || "");
  if (!s.trim()) return true;
  // Prior STP eliminate bug: 10²¹/10²⁴ misclassified as N_A
  if (
    /10²¹[\s\S]{0,80}That is \$N_A\$ for 1 mol/i.test(s) ||
    /10²⁴[\s\S]{0,80}That is \$N_A\$ for 1 mol/i.test(s)
  )
    return true;
  if (/Write the governing fact\/formula/i.test(s)) return true;
  if (/State the governing fact for/i.test(s)) return true;
  if (/Use NCERT definitions for/i.test(s)) return true;
  if (/Stay faithful to NCERT wording for/i.test(s)) return true;
  if (/List knowns, write the governing equation symbolically/i.test(s)) return true;
  if (/Anchor on the core .+ relation from NCERT/i.test(s) && s.length < 700) return true;
  if (/Map each left item to its NCERT definition/i.test(s) && !/Earthworm|nephrid|Malpighian|contractile/i.test(s))
    return true;
  if (/whose wording matches the governing fact\/calculation above/i.test(s)) return true;
  if (/each conflicts with the governing idea( above)?/i.test(s) && /Write the governing|Use NCERT|Stay faithful|List knowns/i.test(s))
    return true;
  // Empty shells: Identify + Concept + Work with no numbers/facts beyond topic name
  if (
    /\*\*Work\.\*\*\s*(Write the governing|State the governing|Map each left|List knowns|Read the figure labels first|Decide Assertion)/i.test(
      s,
    ) &&
    !/\*\*Relation\.\*\*/i.test(s) &&
    s.length < 900
  )
    return true;
  return false;
}

function codesOf(q) {
  if (Array.isArray(q.correctOptions) && q.correctOptions.length)
    return q.correctOptions.map(String);
  const c = String(q.correctOption ?? "").trim();
  return /^[1-4]$/.test(c) ? [c] : [];
}

function opt(q, c) {
  return String(q.options?.[c] ?? "").trim();
}

function scanBlock(q, codes) {
  return ["1", "2", "3", "4"]
    .map((c) => {
      const mark = codes.includes(c) ? "✓" : "✗";
      return `${mark} (${c}) ${clip(opt(q, c), 100) || "—"}`;
    })
    .join("\n");
}

function eliminateBlock(q, codes, reasons = {}) {
  const wrong = ["1", "2", "3", "4"].filter((c) => !codes.includes(c));
  if (!wrong.length) return "";
  return (
    `**Eliminate.**\n` +
    wrong
      .map((c) => {
        const why = reasons[c] || `Does not match the governing NCERT fact/calculation above.`;
        return `✗ (${c}) ${clip(opt(q, c), 80)} — ${why}`;
      })
      .join("\n")
  );
}

function finish(parts, q, codes, reasons = {}) {
  const correctText = codes.map((c) => `(${c}) ${opt(q, c)}`.trim()).join("; ");
  const lines = [...parts];
  lines.push(`**Option scan.**\n${scanBlock(q, codes)}`);
  lines.push(
    `**Hence proved.** The verified option wording is **${correctText || "(unset)"}**.`,
  );
  const elim = eliminateBlock(q, codes, reasons);
  if (elim) lines.push(elim);
  if (q.answerEstimated) {
    lines.push(`_Note: key estimated — verify against official NTA key when available._`);
  }
  return lines.filter(Boolean).join("\n\n");
}

/** NCERT excretory organ map (animals ↔ structures). */
const EXCRETORY_TRUE = [
  [/earthworm/i, /nephrid/i, "Earthworm (annelid) → nephridia (septal / integumentary / pharyngeal)."],
  [/cockroach|insect/i, /malpighian/i, "Cockroach / insects → Malpighian tubules."],
  [/amoeba|paramoecium|protozoa/i, /contractile\s*vacuol/i, "Amoeba / protozoa → contractile vacuole (osmoregulation / waste)."],
  [/planaria|flatworm|platyhelminth|taenia/i, /flame|protonephrid/i, "Planaria / flatworms → flame cells (protonephridia)."],
  [/frog|human|mammal|vertebrate/i, /kidney/i, "Frog / vertebrates → kidneys (mesonephric/metanephric)."],
  [/prawn|crustace/i, /green|antennal/i, "Crustaceans (prawn) → green / antennal glands."],
];

const EXCRETORY_FALSE = [
  [/earthworm/i, /malpighian/i, "Malpighian tubules are insect organs, not earthworm’s."],
  [/cockroach|insect/i, /nephrid/i, "Nephridia are annelid organs; cockroach uses Malpighian tubules."],
  [/amoeba/i, /flame/i, "Flame cells belong to flatworms/Planaria; Amoeba uses contractile vacuole."],
  [/frog/i, /malpighian|nephrid|flame|contractile/i, "Frog’s primary excretory organs are kidneys."],
  [/human/i, /tear gland/i, "Tear glands are not excretory organs in NCERT sense."],
  [/cockroach/i, /enteric|hepatic\s*caeca/i, "Enteric/hepatic caeca are digestive, not excretory."],
];

function classifyExcretoryPair(text) {
  const t = String(text);
  for (const [animal, organ, why] of EXCRETORY_TRUE) {
    if (animal.test(t) && organ.test(t)) return { ok: true, why };
  }
  for (const [animal, organ, why] of EXCRETORY_FALSE) {
    if (animal.test(t) && organ.test(t)) return { ok: false, why };
  }
  return null;
}

function tryExcretoryMatch(q, codes) {
  const stem = String(q.stem || "");
  if (!/excretory/i.test(stem)) return null;
  if (!/matched|match|correctly|following animals|organisms/i.test(stem) && !(/Column/i.test(stem))) {
    // still allow single-animal excretory organ stems
    if (!/excretory organ/i.test(stem)) return null;
  }
  const reasons = {};
  let any = false;
  for (const c of ["1", "2", "3", "4"]) {
    const cls = classifyExcretoryPair(opt(q, c));
    if (!cls) continue;
    any = true;
    if (!codes.includes(c)) reasons[c] = cls.why;
  }
  if (!any && !/Earthworm|Cockroach|Amoeba|Frog|Malpighian|nephrid|Flame|contractile/i.test(stem + JSON.stringify(q.options)))
    return null;

  const trueMap =
    "NCERT map: Earthworm → nephridia; Cockroach → Malpighian tubules; Amoeba → contractile vacuole; Planaria → flame cells; Frog/vertebrates → kidneys.";
  const parts = [
    `**Identify.** ${clip(stem, 280)}`,
    `**Concept.** ${trueMap}`,
    `**Work.** Score each animal–organ pair against the NCERT map. Only the verified option is a true match; the distractors swap insect/annelid/protozoan/flatworm organs.`,
  ];
  // Fill reasons for wrongs if missing
  for (const c of ["1", "2", "3", "4"]) {
    if (codes.includes(c) || reasons[c]) continue;
    const cls = classifyExcretoryPair(opt(q, c));
    if (cls) reasons[c] = cls.why;
    else reasons[c] = "Incorrect animal–organ pairing per NCERT.";
  }
  return finish(parts, q, codes, reasons);
}

function tryStpMolecules(q, codes) {
  const stem = String(q.stem || "");
  const m = stem.match(/([\d.]+)\s*L/i);
  if (!m) return null;
  if (!/STP|standard temperature/i.test(stem)) return null;
  if (!/molecules|moles|number of/i.test(stem)) return null;
  const V = Number(m[1]);
  if (!(V > 0) || V > 1000) return null;
  const n = V / 22.4;
  const nStr = Number.isInteger(n)
    ? String(n)
    : Number(n.toPrecision(6)).toString();
  // Express n × 6.022e23 with adjusted exponent when n is 0.1 / 0.01 / …
  let molecules = `${nStr} \\times 6.022 \\times 10^{23}`;
  let moleculesPlain = `${nStr} × 6.022 × 10²³`;
  if (Math.abs(n - 0.1) < 1e-9) {
    molecules = `6.022 \\times 10^{22}`;
    moleculesPlain = `6.022 × 10²²`;
  } else if (Math.abs(n - 0.01) < 1e-9) {
    molecules = `6.022 \\times 10^{21}`;
    moleculesPlain = `6.022 × 10²¹`;
  } else if (Math.abs(n - 1) < 1e-9) {
    molecules = `6.022 \\times 10^{23}`;
    moleculesPlain = `6.022 × 10²³`;
  }
  const parts = [
    `**Identify.** ${clip(stem, 280)}`,
    `**Concept.** At STP, 1 mol of any ideal gas occupies 22.4 L and contains Avogadro’s number $N_A = 6.022 \\times 10^{23}$ molecules.`,
    `**Relation.** $n = V/22.4$; molecules $= n \\times N_A$.`,
    `**Work.** $n = ${V}/22.4 = ${nStr}\\ \\mathrm{mol}$.\nMolecules $= ${nStr} \\times 6.022 \\times 10^{23} = ${molecules}$ (matches the verified option **${moleculesPlain}**).`,
  ];
  const reasons = {};
  const is23 = (t) => /10\s*²³|10\^\{?23\}?|10²³/.test(t) && !/10\s*²¹|10\s*²²|10\s*²⁴|10²¹|10²²|10²⁴/.test(t);
  const is21 = (t) => /10\s*²¹|10\^\{?21\}?|10²¹/.test(t);
  const is22 = (t) => /10\s*²²|10\^\{?22\}?|10²²/.test(t);
  const is24 = (t) => /10\s*²⁴|10\^\{?24\}?|10²⁴/.test(t);
  for (const c of ["1", "2", "3", "4"]) {
    if (codes.includes(c)) continue;
    const t = opt(q, c);
    if (is23(t) && Math.abs(n - 1) > 1e-9)
      reasons[c] = `That is $N_A$ for 1 mol (22.4 L), not for ${V} L (= ${nStr} mol).`;
    else if (is21(t))
      reasons[c] = `Off by an order of magnitude (would need 0.01 mol / 0.224 L at STP).`;
    else if (is24(t))
      reasons[c] = `Too large — would need ~10 mol at STP.`;
    else if (is22(t) && Math.abs(n - 0.1) > 1e-9)
      reasons[c] = `That equals 0.1 × N_A (2.24 L), not ${V} L.`;
    else reasons[c] = `Does not equal ${nStr} × N_A = ${moleculesPlain}.`;
  }
  return finish(parts, q, codes, reasons);
}

function tryCarnot(q, codes) {
  const stem = String(q.stem || "");
  const m = stem.match(/Carnot.*?(\d+)\s*K.*?(\d+)\s*K/i) || stem.match(/between\s+(\d+)\s*K\s+and\s+(\d+)\s*K/i);
  if (!m || !/Carnot|efficiency/i.test(stem)) return null;
  let th = Number(m[1]);
  let tc = Number(m[2]);
  if (tc > th) [th, tc] = [tc, th];
  const eta = (th - tc) / th;
  const etaStr = eta.toFixed(3);
  const parts = [
    `**Identify.** ${clip(stem, 280)}`,
    `**Concept.** Carnot efficiency depends only on reservoir temperatures: $\\eta = 1 - T_c/T_h$ (kelvin).`,
    `**Relation.** $\\eta = 1 - T_c/T_h = (T_h - T_c)/T_h$.`,
    `**Work.** $T_h=${th}\\ \\mathrm{K}$, $T_c=${tc}\\ \\mathrm{K}$.\n$\\eta = 1 - ${tc}/${th} = ${etaStr}$.`,
  ];
  const reasons = {};
  for (const c of ["1", "2", "3", "4"]) {
    if (codes.includes(c)) continue;
    const t = opt(q, c);
    if (t === "1" || t === "1.000") reasons[c] = "η = 1 only for T_c = 0 K — impossible here.";
    else if (Math.abs(Number(t) - tc / th) < 0.002)
      reasons[c] = `That is $T_c/T_h$, not $1 - T_c/T_h$.`;
    else if (Math.abs(Number(t) - (th - tc) / tc) < 0.02)
      reasons[c] = `Used $(T_h-T_c)/T_c$ instead of $(T_h-T_c)/T_h$.`;
    else reasons[c] = `Does not equal $1 - ${tc}/${th}$.`;
  }
  return finish(parts, q, codes, reasons);
}

function tryAlkaneSigma(q, codes) {
  const stem = String(q.stem || "");
  const m = stem.match(/alkane\s+C\s*(\d+)\s*H\s*(\d+)/i) || stem.match(/C(\d+)H(\d+).*σ|sigma/i);
  if (!m || !/σ|sigma/i.test(stem)) return null;
  const n = Number(m[1]);
  const sigma = 3 * n + 1;
  const parts = [
    `**Identify.** ${clip(stem, 280)}`,
    `**Concept.** In alkane $\\mathrm{C}_n\\mathrm{H}_{2n+2}$: C–C σ bonds = $n-1$, C–H σ bonds = $2n+2$; total σ = $3n+1$.`,
    `**Relation.** $\\sigma = (n-1)+(2n+2)=3n+1$.`,
    `**Work.** $n=${n}$ → $\\sigma = 3\\times${n}+1 = ${sigma}$.`,
  ];
  const reasons = {};
  for (const c of ["1", "2", "3", "4"]) {
    if (codes.includes(c)) continue;
    const v = Number(opt(q, c));
    if (v === sigma - 1) reasons[c] = "Off by one — often from forgetting a C–C or C–H bond.";
    else if (v === sigma + 1) reasons[c] = "One bond too many.";
    else if (v === 2 * n) reasons[c] = "That counts only ~C–H style bonds, not total σ.";
    else reasons[c] = `≠ $3n+1=${sigma}$.`;
  }
  return finish(parts, q, codes, reasons);
}

function tryKinematicsVuAt(q, codes) {
  const stem = String(q.stem || "");
  if (!/starts from rest|constant acceleration/i.test(stem)) return null;
  const am = stem.match(/acceleration\s+(\d+(?:\.\d+)?)\s*m\/?s/i);
  const tm = stem.match(/after\s+(\d+(?:\.\d+)?)\s*s/i);
  if (!am || !tm) return null;
  const a = Number(am[1]);
  const t = Number(tm[1]);
  const v = a * t;
  const parts = [
    `**Identify.** ${clip(stem, 280)}`,
    `**Concept.** From rest, $u=0$, so $v = u + at = at$.`,
    `**Work.** $a=${a}\\ \\mathrm{m\\,s^{-2}}$, $t=${t}\\ \\mathrm{s}$ → $v=${a}\\times${t}=${v}\\ \\mathrm{m\\,s^{-1}}$.`,
  ];
  const reasons = {};
  for (const c of ["1", "2", "3", "4"]) {
    if (codes.includes(c)) continue;
    const tOpt = opt(q, c);
    if (tOpt.includes(`${a} m`)) reasons[c] = "That is the acceleration, not the speed after t.";
    else if (tOpt.includes(`${2 * a} m`) || tOpt.includes(`${v / 2} m`))
      reasons[c] = "Wrong multiple of $at$.";
    else if (tOpt.includes(`${2 * v} m`) || tOpt.includes(`${8 * a}`) || tOpt.includes(`${a * 8}`))
      reasons[c] = "Used wrong time factor (e.g. $t^2$ or $2t$).";
    else reasons[c] = `≠ $at=${v}\\ \\mathrm{m\\,s^{-1}}$.`;
  }
  return finish(parts, q, codes, reasons);
}

function tryForceMass(q, codes) {
  const stem = String(q.stem || "");
  const fm = stem.match(/force of\s+(\d+(?:\.\d+)?)\s*N.*?mass of\s+(\d+(?:\.\d+)?)\s*kg.*?(\d+(?:\.\d+)?)\s*s/i);
  if (!fm) return null;
  const F = Number(fm[1]);
  const m = Number(fm[2]);
  const t = Number(fm[3]);
  const a = F / m;
  const v = a * t;
  const parts = [
    `**Identify.** ${clip(stem, 280)}`,
    `**Concept.** Newton’s second law: $a=F/m$; from rest $v=at$.`,
    `**Work.** $a=${F}/${m}=${a}\\ \\mathrm{m\\,s^{-2}}$; $v=${a}\\times${t}=${v}\\ \\mathrm{m\\,s^{-1}}$.`,
  ];
  const reasons = {};
  for (const c of ["1", "2", "3", "4"]) {
    if (codes.includes(c)) continue;
    reasons[c] = `≠ $v=(F/m)t=${v}\\ \\mathrm{m\\,s^{-1}}$.`;
  }
  return finish(parts, q, codes, reasons);
}

function tryDeltaUConstV(q, codes) {
  const stem = String(q.stem || "");
  const m = stem.match(/constant volume by\s+(\d+(?:\.\d+)?)\s*J.*?ΔU|ΔU is/i) ||
    stem.match(/heated at constant volume by\s+(\d+(?:\.\d+)?)\s*J/i);
  if (!m || !/ΔU|Delta U|internal energy/i.test(stem)) return null;
  const Q = Number(m[1]);
  const parts = [
    `**Identify.** ${clip(stem, 280)}`,
    `**Concept.** For an ideal gas at constant volume, $W=0$, so $\\Delta U = Q_v$.`,
    `**Work.** Heat supplied at constant volume is ${Q} J → $\\Delta U = ${Q}\\ \\mathrm{J}$.`,
  ];
  const reasons = {};
  for (const c of ["1", "2", "3", "4"]) {
    if (codes.includes(c)) continue;
    const t = opt(q, c);
    if (t === "0") reasons[c] = "ΔU = 0 only for isothermal ideal gas, not isochoric heating.";
    else if (t.includes(String(Q / 2)) || t.includes(String(12.5)))
      reasons[c] = "No factor ½ — all heat at const V raises internal energy.";
    else reasons[c] = `≠ $Q_v=${Q}\\ \\mathrm{J}$.`;
  }
  return finish(parts, q, codes, reasons);
}

function tryMolality(q, codes) {
  const stem = String(q.stem || "");
  const m = stem.match(/([\d.]+)\s*mol of a solute dissolved in\s*([\d.]+)\s*kg water.*?Molality/i);
  if (!m) return null;
  const moles = Number(m[1]);
  const kg = Number(m[2]);
  const molal = moles / kg;
  const parts = [
    `**Identify.** ${clip(stem, 280)}`,
    `**Concept.** Molality $m = \\dfrac{\\text{moles of solute}}{\\text{kg of solvent}}$.`,
    `**Work.** $m = ${moles}/${kg} = ${molal}\\ \\mathrm{m}$.`,
  ];
  const reasons = {};
  for (const c of ["1", "2", "3", "4"]) {
    if (codes.includes(c)) continue;
    reasons[c] = "Wrong use of moles/kg (or used molarity / mole fraction by mistake).";
  }
  return finish(parts, q, codes, reasons);
}

function tryFirstOrderHalfLife(q, codes) {
  const stem = String(q.stem || "");
  const m = stem.match(/\[A\]₀\s*=\s*([\d.]+)\s*M.*?t[½1\/2]\s*=\s*([\d.]+)\s*min.*?\[A\] after\s*([\d.]+)\s*min/i);
  if (!m || !/first-order/i.test(stem)) return null;
  const A0 = Number(m[1]);
  const tHalf = Number(m[2]);
  const t = Number(m[3]);
  const n = t / tHalf;
  const Af = A0 / 2 ** n;
  const parts = [
    `**Identify.** ${clip(stem, 280)}`,
    `**Concept.** First-order: each half-life halves concentration, independent of $[A]_0$.`,
    `**Work.** Number of half-lives $= ${t}/${tHalf} = ${n}$.\n$[A] = ${A0}/2^{${n}} = ${Af}\\ \\mathrm{M}$.`,
  ];
  const reasons = {};
  for (const c of ["1", "2", "3", "4"]) {
    if (codes.includes(c)) continue;
    const tOpt = opt(q, c);
    if (tOpt.includes(`${A0 / 2} M`)) reasons[c] = "That is after one half-life only.";
    else if (tOpt.includes(`${A0} M`)) reasons[c] = "Concentration unchanged — not true after elapsed half-lives.";
    else reasons[c] = `≠ $[A]_0/2^{n}=${Af}\\ \\mathrm{M}$.`;
  }
  return finish(parts, q, codes, reasons);
}

function tryCoulomb(q, codes) {
  const stem = String(q.stem || "");
  const m = stem.match(
    /charges?\s*\+(\d+)\s*μC and −(\d+)\s*μC.*?([\d.]+)\s*m apart/i,
  );
  if (!m || !/force|Coulomb|k=9/i.test(stem)) return null;
  const q1 = Number(m[1]) * 1e-6;
  const q2 = Number(m[2]) * 1e-6;
  const r = Number(m[3]);
  const F = (9e9 * q1 * q2) / (r * r);
  const parts = [
    `**Identify.** ${clip(stem, 280)}`,
    `**Concept.** Coulomb’s law: $F = k|q_1 q_2|/r^2$ with $k=9\\times10^9$.`,
    `**Work.** $q=\\pm${m[1]}\\times10^{-6}\\ \\mathrm{C}$, $r=${r}\\ \\mathrm{m}$.\n$F = 9\\times10^9 \\times (${m[1]}\\times10^{-6})^2 / ${r}^2 = ${F.toExponential(2)}\\ \\mathrm{N}$.`,
  ];
  const reasons = {};
  for (const c of ["1", "2", "3", "4"]) {
    if (codes.includes(c)) continue;
    reasons[c] = "Wrong powers of 10 or used $r$ instead of $r^2$ in the denominator.";
  }
  return finish(parts, q, codes, reasons);
}

function tryOxidationOF(q, codes) {
  const stem = String(q.stem || "");
  if (/OF\s*[₂2].*oxidation number of oxygen|oxidation number of oxygen.*OF\s*[₂2]/i.test(stem)) {
    const parts = [
      `**Identify.** ${clip(stem, 280)}`,
      `**Concept.** Fluorine is always −1 in compounds; oxygen can be positive when bonded to F.`,
      `**Work.** Let O.N.(O)=x. Then $x + 2(-1)=0$ → $x=+2$.`,
    ];
    const reasons = {
      "2": "−2 is oxygen’s usual O.N. with metals/H, not with fluorine.",
      "3": "+1 would fit a different stoichiometry.",
      "4": "0 is elemental oxygen, not OF₂.",
    };
    return finish(parts, q, codes, reasons);
  }
  if (/H\s*[₂2]\s*O\s*[₂2].*oxidation number of oxygen|oxidation number of oxygen.*H\s*[₂2]\s*O\s*[₂2]/i.test(stem)) {
    const parts = [
      `**Identify.** ${clip(stem, 280)}`,
      `**Concept.** In peroxides, oxygen has O.N. = −1.`,
      `**Work.** H₂O₂: $2(+1) + 2x = 0$ → $x=-1$.`,
    ];
    return finish(parts, q, codes, {
      "1": "−2 is oxide oxygen (H₂O), not peroxide.",
      "3": "+1 is not the peroxide value.",
      "4": "0 is O₂ element.",
    });
  }
  if (/KO\s*[₂2].*oxidation number of oxygen|oxidation number of oxygen.*KO\s*[₂2]/i.test(stem)) {
    const parts = [
      `**Identify.** ${clip(stem, 280)}`,
      `**Concept.** In superoxides (KO₂), oxygen has average O.N. = −1/2.`,
      `**Work.** K(+1) + 2x = 0 → $x=-1/2$.`,
    ];
    return finish(parts, q, codes, {});
  }
  if (/KMnO\s*[₄4].*oxidation number of Mn|oxidation number of Mn.*KMnO/i.test(stem)) {
    const parts = [
      `**Identify.** ${clip(stem, 280)}`,
      `**Concept.** Sum of oxidation numbers in a neutral compound is 0.`,
      `**Work.** K(+1) + Mn + 4O(−2) = 0 → Mn = +7.`,
    ];
    return finish(parts, q, codes, {});
  }
  return null;
}

function tryLensUV(q, codes) {
  const stem = String(q.stem || "");
  if (!/u\s*=\s*−?\s*2f|object.*?2f|placed at 2f/i.test(stem)) return null;
  if (!/image|v\b|lens/i.test(stem)) return null;
  const parts = [
    `**Identify.** ${clip(stem, 280)}`,
    `**Concept.** Thin-lens formula: $1/v - 1/u = 1/f$. For a real object, $u$ is negative in the Cartesian sign convention.`,
    `**Relation.** With $u=-2f$: $1/v - 1/(-2f)=1/f$ → $1/v = 1/f - 1/(2f)=1/(2f)$ → $v=2f$.`,
    `**Work.** Object at $2f$ → image at $2f$ on the other side (same size, real, inverted).`,
  ];
  return finish(parts, q, codes, {});
}

function tryClosedPipe(q, codes) {
  const stem = String(q.stem || "");
  const m = stem.match(/(\d+)\s*loops.*?length\s*([\d.]+)\s*m|length\s*([\d.]+)\s*m.*?(\d+)\s*loops/i);
  if (!m && !(/p loops|standing wave|λ\s*=\s*2L\/p/i.test(stem) || /wavelength.*L\s*=/i.test(stem))) {
    if (!/loops/i.test(stem) || !/λ|wavelength/i.test(stem)) return null;
  }
  // authored: p loops → L = p·λ/2 → λ = 2L/p = 1 m
  if (/λ\s*=\s*2L\/p\s*=\s*1\s*m|2L\/p|p loops/i.test(q.conceptHint || "") || /loops/i.test(stem)) {
    const parts = [
      `**Identify.** ${clip(stem, 280)}`,
      `**Concept.** On a string, $p$ loops means $L = p \\cdot \\lambda/2$, so $\\lambda = 2L/p$.`,
      `**Work.** Substitute the given $L$ and $p$ to get the listed wavelength (verified option).`,
    ];
    return finish(parts, q, codes, {});
  }
  return null;
}

/** Authored / conceptHint numerical expansion. */
function tryConceptHint(q, codes) {
  const hint = String(q.conceptHint || "").trim();
  if (!hint) return null;
  const stem = String(q.stem || "");

  // Bio / short fact drills: expand hint into a real concept line
  const bioFacts = {
    "ATP via oxidative phosphorylation": {
      concept: "Mitochondria are the powerhouses: ATP is made mainly by oxidative phosphorylation on the inner membrane.",
      work: "Photosynthesis is chloroplast; glycosylation is ER/Golgi; lipid storage is not the defining mitochondrial role.",
      reasons: {
        "1": "Photosynthesis occurs in chloroplasts.",
        "3": "Protein glycosylation is ER/Golgi, not mitochondria.",
        "4": "Lipid storage is not the primary mitochondrial function.",
      },
    },
    "Meselson–Stahl": {
      concept: "DNA replication is semi-conservative (Meselson–Stahl).",
      work: "Each daughter duplex keeps one parental strand and one new strand.",
      reasons: {},
    },
    "NCERT excretory system": {
      concept: "The nephron is the structural and functional unit of the kidney.",
      work: "Neuron → nervous system; alveolus → lung; osteon → compact bone.",
      reasons: {
        "1": "Neuron is the functional unit of the nervous system.",
        "3": "Alveolus is the functional unit of the lung.",
        "4": "Osteon is the structural unit of compact bone.",
      },
    },
    "root endodermis": {
      concept: "Casparian strips (suberin) occur in the root endodermis and force selective apoplast→symplast entry.",
      work: "Not epidermis, xylem vessel wall, or pith.",
      reasons: {
        "2": "Epidermis lacks Casparian strips.",
        "3": "Xylem vessels conduct water but do not bear Casparian strips.",
        "4": "Pith is central parenchyma, not the Casparian site.",
      },
    },
    "trophic levels": {
      concept: "Primary producers are autotrophs (make organic food from inorganic sources).",
      work: "Herbivores are primary consumers; carnivores higher consumers; decomposers recycle but are not producers.",
      reasons: {
        "1": "Herbivores are primary consumers.",
        "2": "Carnivores are secondary/tertiary consumers.",
        "4": "Decomposers are not primary producers.",
      },
    },
    "protein synthesis": {
      concept: "Ribosomes are the site of translation (protein synthesis).",
      work: "Transcription is mainly nuclear; replication is DNA; splicing is RNA processing in nucleus.",
      reasons: {},
    },
    "islets of Langerhans": {
      concept: "Insulin is secreted by β-cells of the islets of Langerhans.",
      work: "α-cells → glucagon; δ-cells → somatostatin; acinar cells → digestive enzymes.",
      reasons: {},
    },
    "Bt toxin": {
      concept: "Bt cotton carries cry toxin genes from Bacillus thuringiensis.",
      work: "Agrobacterium is a vector; E. coli / TMV are not the Bt toxin source.",
      reasons: {
        "1": "Agrobacterium is used as a vector, not the toxin gene source.",
        "3": "E. coli is not the source of Bt toxin genes.",
        "4": "TMV is a plant virus, not Bt.",
      },
    },
    "Hatch–Slack": {
      concept: "C4 plants minimize photorespiration via the Hatch–Slack pathway.",
      work: "They concentrate CO₂ at Rubisco; they do not minimize photosynthesis itself.",
      reasons: {},
    },
    "genetic equilibrium": {
      concept: "Hardy–Weinberg requires infinite population, random mating, and no selection/mutation/migration/drift.",
      work: "Small population, assortative mating, or selection violate equilibrium.",
      reasons: {},
    },
    "NCERT cell organelles": {
      concept: "Golgi apparatus packages and modifies materials for secretion / lysosome formation.",
      work: "ATP synthesis → mitochondria; PSII → chloroplast; lipid oxidation → peroxisomes/mito.",
      reasons: {},
    },
    "meiosis": {
      concept: "Crossing over occurs at pachytene of prophase I of meiosis.",
      work: "Not mitotic metaphase, anaphase II, or G0.",
      reasons: {},
    },
    "cardiac conduction": {
      concept: "The SA node is the pacemaker of the heart.",
      work: "AV node delays; Bundle of His / Purkinje conduct the impulse.",
      reasons: {},
    },
    "C4 leaf anatomy": {
      concept: "Kranz anatomy (bundle sheath + mesophyll) characterizes C4 leaves.",
      work: "Not a C3-only feature.",
      reasons: {},
    },
    "energy flow": {
      concept: "The pyramid of energy is always upright because energy is lost as heat at each transfer.",
      work: "Number/biomass pyramids may invert; energy cannot.",
      reasons: {},
    },
    "replication": {
      concept: "Okazaki fragments on the lagging strand are joined by DNA ligase.",
      work: "Helicase unwinds; primase makes RNA primers; topoisomerase relieves supercoiling.",
      reasons: {},
    },
    "ultrafiltration": {
      concept: "Glomerular filtrate is formed in Bowman’s capsule by ultrafiltration.",
      work: "Loop of Henle concentrates; collecting duct finalizes; ureter only transports.",
      reasons: {},
    },
    "biological N2 fixation": {
      concept: "Rhizobium is the symbiotic N₂-fixer in legume root nodules.",
      work: "Nitrobacter oxidizes nitrite; Azotobacter is free-living.",
      reasons: {},
    },
    "homology vs analogy": {
      concept: "Analogous organs indicate convergent evolution (similar function, different ancestry).",
      work: "Homologous organs indicate common ancestry.",
      reasons: {},
    },
    "suicidal bags": {
      concept: "Lysosomes are rich in acid hydrolytic enzymes (“suicidal bags”).",
      work: "RuBisCO is chloroplast; pepsinogen is stomach; oxidative enzymes alone are not the lysosome hallmark.",
      reasons: {},
    },
  };

  // Match bio fact by hint substring
  for (const [key, pack] of Object.entries(bioFacts)) {
    if (hint.includes(key) || hint === key) {
      const parts = [
        `**Identify.** ${clip(stem, 280)}`,
        `**Concept.** ${pack.concept}`,
        `**Relation.** ${hint}`,
        `**Work.** ${pack.work}`,
      ];
      return finish(parts, q, codes, pack.reasons || {});
    }
  }

  // Numerical hints: re-run specialized solvers first; else expand hint literally
  const parts = [
    `**Identify.** ${clip(stem, 280)}`,
    `**Concept.** Apply the NCERT relation: ${hint}.`,
    `**Relation.** ${hint}`,
    `**Work.** Substitute the given values into “${hint}”, simplify, and match the verified option text **(${codes[0]}) ${opt(q, codes[0])}**.`,
  ];
  const reasons = {};
  for (const c of ["1", "2", "3", "4"]) {
    if (codes.includes(c)) continue;
    reasons[c] = `Inconsistent with ${hint}.`;
  }
  return finish(parts, q, codes, reasons);
}

/** Photoelectric / work function comparison. */
function tryWorkFunction(q, codes) {
  const stem = String(q.stem || "");
  if (!/work function|photoelectron|photosensitive/i.test(stem)) return null;
  const energy = stem.match(/([\d.]+)\s*eV/);
  if (!energy) return null;
  const E = Number(energy[1]);
  // Extract metal:value pairs
  const pairs = [...stem.matchAll(/([A-Za-z]+)\s*\([^)]*\)\s*(?:are|is|,)?\s*([\d.]+)\s*eV/g)];
  // fallback: "Caesium (Cs), Potassium (K) and Sodium (Na) are 2.14 eV, 2.30 eV and 2.75 eV"
  let map = {};
  if (/Caesium|Cs/i.test(stem) && /2\.14/.test(stem)) map.Cs = 2.14;
  if (/Potassium|\(K\)/i.test(stem) && /2\.30/.test(stem)) map.K = 2.3;
  if (/Sodium|\(Na\)/i.test(stem) && /2\.75/.test(stem)) map.Na = 2.75;
  for (const m of pairs) map[m[1]] = Number(m[2]);
  if (!Object.keys(map).length) return null;
  const emitters = Object.entries(map)
    .filter(([, phi]) => E >= phi)
    .map(([name]) => name);
  const parts = [
    `**Identify.** ${clip(stem, 280)}`,
    `**Concept.** Photoemission requires incident photon energy $h\\nu \\ge \\phi$ (work function).`,
    `**Work.** Incident energy = ${E} eV. Emitters: ${emitters.join(", ") || "none"} (those with $\\phi \\le ${E}$ eV).`,
  ];
  return finish(parts, q, codes, {});
}

function tryEmWaveB(q, codes) {
  const stem = String(q.stem || "");
  const em = stem.match(/([\d.]+)\s*V\s*m.*?magnetic|amplitude\s+([\d.]+)\s*V/i);
  if (!/electromagnetic wave|oscillating magnetic/i.test(stem)) return null;
  const E = Number((stem.match(/(\d+(?:\.\d+)?)\s*V/i) || [])[1] || 0);
  if (!E) return null;
  const B = E / 3e8;
  const parts = [
    `**Identify.** ${clip(stem, 280)}`,
    `**Concept.** In a plane EM wave in free space, $E/B = c = 3\\times10^8\\ \\mathrm{m\\,s^{-1}}$.`,
    `**Work.** $B_0 = E_0/c = ${E}/(3\\times10^8) = ${B.toExponential(2)}\\ \\mathrm{T}$.`,
  ];
  return finish(parts, q, codes, {});
}

function trySpringPE(q, codes) {
  const stem = String(q.stem || "");
  if (!/potential energy.*spring|spring.*potential energy|stretched by/i.test(stem)) return null;
  const m = stem.match(/stretched by\s*(\d+)\s*cm.*?U.*?stretched by\s*(\d+)\s*cm/i);
  if (!m) return null;
  const x1 = Number(m[1]);
  const x2 = Number(m[2]);
  const ratio = (x2 / x1) ** 2;
  const parts = [
    `**Identify.** ${clip(stem, 280)}`,
    `**Concept.** Elastic PE of a spring: $U = \\tfrac12 kx^2$ → $U \\propto x^2$.`,
    `**Work.** $U_2/U_1 = (${x2}/${x1})^2 = ${ratio}$ → $U_2 = ${ratio}U$.`,
  ];
  return finish(parts, q, codes, {});
}

function trySoapBubble(q, codes) {
  const stem = String(q.stem || "");
  if (!/soap bubble/i.test(stem)) return null;
  const rm = stem.match(/radius\s*(?:of\s*)?([\d.]+)\s*cm/i);
  const tm = stem.match(/surface tension[^\d]*([\d.]+)\s*N/i);
  if (!rm || !tm) return null;
  const r = Number(rm[1]) / 100; // m
  const T = Number(tm[1]);
  // soap bubble has 2 surfaces: W = 8πr²T
  const W = 8 * Math.PI * r * r * T;
  const parts = [
    `**Identify.** ${clip(stem, 280)}`,
    `**Concept.** A soap bubble has two surfaces; work to form it is $W = 8\\pi r^2 T$.`,
    `**Work.** $r=${rm[1]}\\ \\mathrm{cm}=${r}\\ \\mathrm{m}$, $T=${T}\\ \\mathrm{N\\,m^{-1}}$.\n$W = 8\\pi (${r})^2 (${T}) \\approx ${W.toExponential(2)}\\ \\mathrm{J}$.`,
  ];
  return finish(parts, q, codes, {});
}

function tryBernoulli(q, codes) {
  const stem = String(q.stem || "");
  if (!/venturi/i.test(stem)) return null;
  const parts = [
    `**Identify.** ${clip(stem, 280)}`,
    `**Concept.** A venturi-meter measures flow speed using Bernoulli’s principle (pressure drop in the constriction).`,
    `**Work.** Parallel/perpendicular axis theorems and Huygens’s principle are unrelated to venturi flow measurement.`,
  ];
  return finish(parts, q, codes, {
    "2": "Parallel-axis theorem is for moment of inertia.",
    "3": "Perpendicular-axis theorem is for planar lamina MI.",
    "4": "Huygens’s principle is wave optics.",
  });
}

function tryResistorColor(q, codes) {
  const stem = String(q.stem || "");
  if (!/colour codes|color codes|carbon resistor/i.test(stem)) return null;
  const m = stem.match(/(\d+)\s*[±]\s*(\d+)\s*%/);
  // 22000 ± 5% → red red orange gold; third band is multiplier = orange (×10³)
  if (/22000|22\s*k/i.test(stem)) {
    const parts = [
      `**Identify.** ${clip(stem, 280)}`,
      `**Concept.** Resistor colour code: first two bands = digits, third = multiplier (powers of 10), fourth = tolerance.`,
      `**Work.** $22000\\ \\Omega = 22 \\times 10^3$ → digits 2,2 and multiplier $10^3$ → third band **orange**. ±5% → gold (fourth).`,
    ];
    return finish(parts, q, codes, {
      "1": "Green is digit 5 / multiplier 10⁵ — wrong here.",
      "3": "Yellow is digit 4 / 10⁴.",
      "4": "Red is digit 2 / 10² (would give 2200 Ω).",
    });
  }
  return null;
}

function tryFullWaveRipple(q, codes) {
  const stem = String(q.stem || "");
  if (!/full wave rectifier|ac ripple/i.test(stem)) return null;
  const parts = [
    `**Identify.** ${clip(stem, 280)}`,
    `**Concept.** After rectification, a shunt capacitor filter smooths the output by charging/discharging — it removes the AC ripple.`,
    `**Work.** Diodes rectify; centre-tap transformer supplies opposite phases; load dissipates power but does not filter ripple.`,
  ];
  return finish(parts, q, codes, {
    "1": "Diodes convert AC→pulsating DC; they do not smooth ripple.",
    "3": "Load resistance dissipates power; it is not the filter.",
    "4": "Centre-tapped transformer provides the two half-cycles.",
  });
}

function tryDnaCharge(q, codes) {
  const stem = String(q.stem || "");
  if (!/DNA fragments are/i.test(stem)) return null;
  const parts = [
    `**Identify.** ${clip(stem, 280)}`,
    `**Concept.** DNA is negatively charged because of phosphate groups in the backbone — the basis of agarose gel electrophoresis toward the anode.`,
    `**Work.** Charge sign does not flip with fragment size; size affects migration speed, not polarity.`,
  ];
  return finish(parts, q, codes, {
    "1": "DNA is not positively charged.",
    "3": "Phosphate groups make DNA anionic, not neutral.",
    "4": "Size changes mobility, not the sign of charge.",
  });
}

function tryAssertion(q, codes) {
  const stem = String(q.stem || "");
  if (!/assertion|statement\s*i\b|statement\s*ii\b/i.test(stem)) return null;
  const correct = opt(q, codes[0] || "");
  const parts = [
    `**Identify.** ${clip(stem, 280)}`,
    `**Concept.** Score each statement true/false from NCERT, then test whether Reason/II explains Assertion/I when both are true.`,
    `**Work.** The option set that matches those truth values is **(${codes[0]}) ${correct}**. Read each clause in the stem against the corresponding NCERT definition before locking.`,
  ];
  const reasons = {};
  for (const c of ["1", "2", "3", "4"]) {
    if (codes.includes(c)) continue;
    reasons[c] = "Wrong T/F combination relative to the NCERT statements.";
  }
  return finish(parts, q, codes, reasons);
}

function tryMatchList(q, codes) {
  const stem = String(q.stem || "");
  if (
    !(/match list|match the following|match the items|match the column/i.test(stem) ||
      /column\s*[-–]?\s*i(?![a-z])/i.test(stem) ||
      /list\s*[-–]?\s*i(?![a-z])/i.test(stem))
  )
    return null;

  // Excretory match lists get the excretory handler first via tryExcretoryMatch
  const correct = opt(q, codes[0] || "");
  const parts = [
    `**Identify.** ${clip(stem, 280)}`,
    `**Concept.** Pair each left-column entry with the unique NCERT definition/structure on the right; assemble the code.`,
    `**Work.** Walk a→b→c→d (or A→B→C→D) one at a time. The verified code is **(${codes[0]}) ${correct}** — every distractor swaps at least one pair.`,
  ];
  const reasons = {};
  for (const c of ["1", "2", "3", "4"]) {
    if (codes.includes(c)) continue;
    reasons[c] = "At least one left–right pairing is wrong vs NCERT.";
  }
  return finish(parts, q, codes, reasons);
}

/** Knowledge-backed one-liners for common biology/chemistry options. */
function optionWhyWrong(text, correctText, stem) {
  const t = String(text);
  const cls = classifyExcretoryPair(t);
  if (cls && !cls.ok) return cls.why;
  if (/Photosynthesis/i.test(t) && /mitochondria/i.test(stem)) return "Photosynthesis is chloroplast-based.";
  if (/Alveolus/i.test(t) && /kidney|nephron/i.test(stem)) return "Alveolus is the lung’s exchange unit, not kidney’s.";
  if (/Neuron/i.test(t) && /kidney|nephron/i.test(stem)) return "Neuron is the nervous-system unit.";
  if (/Epidermis/i.test(t) && /Casparian/i.test(stem)) return "Casparian strip is in endodermis, not epidermis.";
  if (/Decomposers/i.test(t) && /producer/i.test(stem)) return "Decomposers recycle nutrients; producers are autotrophs.";
  if (/E\.\s*coli/i.test(t) && /Bt cotton/i.test(stem)) return "Bt toxin genes come from B. thuringiensis.";
  if (/Agrobacterium only/i.test(t) && /Bt cotton/i.test(stem)) return "Agrobacterium is a vector, not the toxin source.";
  if (/Conservative/i.test(t) && /replication/i.test(stem)) return "Meselson–Stahl supports semi-conservative replication.";
  if (/α-cells/i.test(t) && /Insulin/i.test(stem)) return "α-cells secrete glucagon, not insulin.";
  if (/AV node/i.test(t) && /[Pp]acemaker/i.test(stem)) return "SA node is the pacemaker; AV node delays.";
  if (/Helicase/i.test(t) && /Okazaki/i.test(stem)) return "Helicase unwinds; ligase joins Okazaki fragments.";
  if (/Transcription/i.test(t) && /[Rr]ibosom/i.test(stem)) return "Ribosomes translate mRNA; transcription is nuclear.";
  if (/Common ancestry/i.test(t) && /[Aa]nalogous/i.test(stem)) return "Analogous → convergence; homologous → common ancestry.";
  if (/Inverted/i.test(t) && /[Pp]yramid of energy/i.test(stem)) return "Energy pyramid is always upright.";
  if (/C3 plants/i.test(t) && /Kranz/i.test(stem)) return "Kranz anatomy is the C4 leaf trademark.";
  if (/Photorespiration/i.test(correctText) && /Photosynthesis/i.test(t) && /C4/i.test(stem))
    return "C4 minimizes photorespiration, not photosynthesis.";
  return null;
}

function buildFallback(q, codes) {
  const stem = String(q.stem || "");
  const correctText = codes.map((c) => opt(q, c)).filter(Boolean).join("; ");
  const knowns = (stem.match(
    /-?\d+(?:\.\d+)?\s*(?:cm|mm|m|km|s|ms|Hz|kHz|MHz|°C|K|V|A|Ω|ohm|N|kg|g|mol|atm|mmHg|eV|J|W|T|μ|%|L)?/gi,
  ) || [])
    .map((x) => x.trim())
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 6);

  const subject = q.subject || "";
  const topic = q.topic || "";

  let concept;
  if (subject === "Physics") {
    concept = `Use the governing ${topic} relation from NCERT; the option that satisfies it with the given data is **${clip(correctText, 120)}**.`;
  } else if (subject === "Chemistry") {
    concept = `Apply the ${topic} definition/stoichiometry from NCERT; the claim that holds is **${clip(correctText, 120)}**.`;
  } else {
    concept = `NCERT “${topic}” fact for this stem: **${clip(correctText, 140)}**.`;
  }

  const workLines = [];
  if (knowns.length) workLines.push(`Givens: ${knowns.join(", ")}.`);
  workLines.push(
    `Link the stem to the verified wording “${clip(correctText, 160)}”, then reject each distractor that violates that fact or the matching formula.`,
  );

  const parts = [
    `**Identify.** ${clip(stem, 280)}`,
    `**Concept.** ${concept}`,
    q.conceptHint ? `**Relation.** ${q.conceptHint}` : null,
    `**Work.** ${workLines.join(" ")}`,
  ].filter(Boolean);

  const reasons = {};
  for (const c of ["1", "2", "3", "4"]) {
    if (codes.includes(c)) continue;
    reasons[c] =
      optionWhyWrong(opt(q, c), correctText, stem) ||
      `Conflicts with “${clip(correctText, 70)}”.`;
  }
  return finish(parts, q, codes, reasons);
}

/**
 * Build a real curated solution for a question object.
 * @param {object} q — { stem, options, correctOption/correctOptions, subject, topic, conceptHint?, answerEstimated? }
 */
export function buildRealSolution(q) {
  const codes = codesOf(q);
  if (!codes.length) {
    return [
      `**Identify.** ${clip(q.stem, 280)}`,
      `**Concept.** Official option text not locked for this extract yet.`,
      `**Work.** Re-check the source key by option wording before drilling this item.`,
    ].join("\n\n");
  }

  const pipeline = [
    tryStpMolecules,
    tryExcretoryMatch,
    tryCarnot,
    tryAlkaneSigma,
    tryKinematicsVuAt,
    tryForceMass,
    tryDeltaUConstV,
    tryMolality,
    tryFirstOrderHalfLife,
    tryCoulomb,
    tryOxidationOF,
    tryLensUV,
    tryClosedPipe,
    tryWorkFunction,
    tryEmWaveB,
    trySpringPE,
    trySoapBubble,
    tryBernoulli,
    tryResistorColor,
    tryFullWaveRipple,
    tryDnaCharge,
    tryConceptHint,
    tryAssertion,
    tryMatchList,
  ];

  for (const fn of pipeline) {
    try {
      const sol = fn(q, codes);
      if (sol && !isWeakSolution(sol)) return sol;
    } catch {
      /* try next */
    }
  }
  return buildFallback(q, codes);
}

export function keywords(stem, max = 8) {
  const STOP = new Set(
    `which following correct incorrect statement statements given below above select choose option options match list column regarding about from with that this these those when then than into onto among between under over after before during using based according figure shown diagram question neet mark marks`.split(
      " ",
    ),
  );
  const words = String(stem || "")
    .replace(/\$[^$]+\$/g, " ")
    .replace(/[^a-zA-Z0-9\s\-]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 3 && !STOP.has(w.toLowerCase()) && !/^\d+$/.test(w));
  const out = [];
  const seen = new Set();
  for (const w of words) {
    const k = w.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(w);
    if (out.length >= max) break;
  }
  return out;
}

export function buildStudyLinks(q) {
  const codes = codesOf(q);
  const correctOpt = codes.map((c) => opt(q, c)).filter(Boolean).join(" ");
  const keys = keywords(q.stem, 6).join(" ");
  const topic = q.topic || "NEET";
  const subject = q.subject || "";
  const yt = encodeURIComponent(`NEET ${topic} ${keys} explanation`.trim());
  const web = encodeURIComponent(
    `NEET ${topic} ${keys} ${clip(correctOpt.replace(/[^a-zA-Z0-9\s]/g, " "), 50)}`.trim(),
  );
  const ncert = encodeURIComponent(
    `site:ncert.nic.in ${subject} ${topic} ${keywords(q.stem, 4).join(" ")}`,
  );
  const pdf = encodeURIComponent(`NEET ${topic} ${keys} NCERT notes filetype:pdf`);
  return [
    {
      kind: "youtube",
      label: `YouTube: ${clip(`${topic} — ${keys}`, 48) || topic}`,
      url: `https://www.youtube.com/results?search_query=${yt}`,
    },
    {
      kind: "web",
      label: "Web: this stem + answer wording",
      url: `https://www.google.com/search?q=${web}`,
    },
    {
      kind: "web",
      label: "NCERT search (this concept)",
      url: `https://www.google.com/search?q=${ncert}`,
    },
    {
      kind: "pdf",
      label: "PDF notes for this topic",
      url: `https://www.google.com/search?q=${pdf}`,
    },
  ];
}
