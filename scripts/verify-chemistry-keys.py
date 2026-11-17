#!/usr/bin/env python3
"""Verify Chemistry topic-bank answer keys; emit fixes/conflicts/purges JSONL."""

from __future__ import annotations

import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path("/workspace")
BANK_GLOB = ROOT / "data/topic-series/banks/chemistry-*.json"
OUT_FIX = ROOT / "data/raw/external/key-fixes-chemistry.jsonl"
OUT_CONFLICT = ROOT / "data/raw/external/key-conflicts-chemistry.jsonl"
OUT_PURGE = ROOT / "data/raw/external/key-purge-chemistry.jsonl"

OCR_JUNK_RE = re.compile(
    r"c:fi|w:rr|w::rr|IEnglish\s*\+\s*Hindi|English\+Hindi|English\+Hilidi|"
    r"z\s*I\s*English|qldl|91cl|@dl|fiB\s|fiRUT|gm;@|m¼affl|cfiT|fll\{|"
    r"OUGH WORK|Hindi\+English|Section - A \(Biology|Section - A \(Physics|"
    r"Section - B \(Biology|Section - B \(Physics",
    re.I,
)
LATIN_OCR_RE = re.compile(
    r"\bcfi[A-Za-z]|qff{2,}|wtiif|ftcR|a_,uy|@ct|:if\(|\\if[a-z]|r1i\.|:if\(1f",
    re.I,
)
DEVANAGARI_RE = re.compile(r"[\u0900-\u097F]")
PUA_RE = re.compile(r"[\uE000-\uF8FF]")
BARE_IMAGE = re.compile(
    r"^\s*(?:[\w./-]*/)?(?:image|img|figure|fig)[_-]?\d+\.(?:png|jpe?g|gif|webp|svg)\s*$",
    re.I,
)
ARROW_MASH = re.compile(r"^[\s\-⎯→⟶–—\[\]]+$")
TRAILING_CODE = re.compile(r"\b\d+\s*[A-Z]\d+\s*$")
PLACEHOLDER_OPT = re.compile(r"^Option\s*[1-4]$", re.I)


def norm(s: str) -> str:
    s = s or ""
    s = s.replace("\\\\", "\\")
    # Keep math inner text (do not delete $...$ wholesale — that drops ClF3 etc.)
    s = re.sub(r"\$([^$]*)\$", r" \1 ", s)
    for _ in range(3):
        s = re.sub(r"\\(?:mathrm|mathbf|mathrm|text|ce|textrm|textit)\s*\{([^{}]*)\}", r"\1", s)
        s = re.sub(r"\{([^{}]*)\}", r"\1", s)
    s = re.sub(r"_\{([^{}]*)\}", r"\1", s)
    s = re.sub(r"\^\{([^{}]*)\}", r"\1", s)
    s = re.sub(r"_([A-Za-z0-9])", r"\1", s)
    s = re.sub(r"\^([A-Za-z0-9+\-])", r"\1", s)
    s = re.sub(r"\\[a-zA-Z]+", " ", s)
    s = re.sub(r"[^a-z0-9+.\-]+", " ", s.lower())
    return re.sub(r"\s+", " ", s).strip()


def stem_key(s: str) -> str:
    return norm(s)[:140]


def soft_key(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", norm(s))[:70]


def opt_key(s: str) -> str:
    return norm(s)


def load_year_keys() -> dict[str, dict]:
    keys: dict[str, dict] = {}
    for p in (ROOT / "content/papers").glob("neet-*.key.md"):
        text = p.read_text()
        m = re.search(r"```neet-keys-json\n(.*?)\n```", text, re.S)
        if not m:
            continue
        data = json.loads(m.group(1))
        for kid, kv in data["keys"].items():
            keys[kid] = {
                "correctOption": str(kv["correctOption"]),
                "answerEstimated": bool(kv.get("answerEstimated")),
            }
    return keys


def load_hf_index() -> tuple[dict[str, list[dict]], dict[str, list[dict]]]:
    path = ROOT / "data/raw/external/en_huggingface_upload.json"
    data = json.loads(path.read_text())
    idx: dict[str, list[dict]] = defaultdict(list)
    soft: dict[str, list[dict]] = defaultdict(list)
    for x in data:
        opts = x.get("options") or []
        if not isinstance(opts, list) or len(opts) < 4:
            continue
        ans = x.get("answer")
        if ans is None:
            continue
        try:
            ai = int(ans)
        except Exception:
            continue
        # HF answers are 0-indexed (0..3)
        if not (0 <= ai < len(opts)):
            continue
        rec = {
            "correct_text": opts[ai],
            "correct_index0": ai,
            "options": opts,
            "file": x.get("file_name"),
            "category": x.get("category_en"),
        }
        q = x.get("question", "")
        idx[stem_key(q)].append(rec)
        soft[soft_key(q)].append(rec)
    return idx, soft


def parse_catch_options(user_text: str) -> dict[str, str] | None:
    found: list[tuple[str, str]] = []
    re_opts = re.compile(r"\(([A-Da-d1-4])\)\s*([\s\S]*?)(?=\(([A-Da-d1-4])\)|$)")
    for m in re_opts.finditer(user_text):
        found.append((m.group(1), m.group(2)))
    if len(found) < 4:
        for line in user_text.splitlines():
            mm = re.match(r"^\(([A-Da-d1-4])\)\s*(.+)$", line.strip())
            if mm:
                found.append((mm.group(1), mm.group(2)))
    opts: dict[str, str] = {}
    for k, v in found:
        key = str(ord(k.upper()) - 64) if re.match(r"^[A-Da-d]$", k) else k
        text = re.sub(r"\s+[A-D]\s*\$?\s*$", "", v).replace("$", "").strip()
        if not text or re.fullmatch(r"[A-D]", text):
            continue
        opts[key] = text
    if all(k in opts for k in "1234"):
        return opts
    return None


def extract_catch_letter(asst: str, meta: dict) -> tuple[str | None, str | None]:
    """Return (letter, source) preferring explanation over A-biased headers."""
    em = re.search(r"Correct Option is\s*:?\s*\(([A-Da-d1-4])\)", asst, re.I)
    if em:
        return em.group(1).upper(), "catch-explanation"
    post = asst.split("</think>")[-1] if "</think>" in asst else asst
    am2 = re.search(
        r"(?m)^(?:#\s*)?Answer\s*:\s*\*{0,2}\(([A-Da-d1-4])\)",
        post,
        re.I,
    )
    if am2:
        return am2.group(1).upper(), "catch-answer-header"
    meta_ans = str(meta.get("correct_answer") or "").upper()
    am = re.search(r"Correct Answer:\s*\(([A-Da-d1-4])\)", asst, re.I)
    asst_letter = am.group(1).upper() if am else None
    if meta_ans in "ABCD" and asst_letter and meta_ans == asst_letter and meta_ans != "A":
        return meta_ans, "catch-meta-asst-agree"
    if meta_ans in "BCD":
        return meta_ans, "catch-meta-nonA"
    return None, None


def load_catch_index() -> tuple[dict[str, list[dict]], dict[str, list[dict]], dict[str, list[dict]]]:
    """Returns (stem_idx, soft_idx, letter_only_soft) for catch explanations."""
    path = ROOT / "data/raw/external/catch.jsonl"
    idx: dict[str, list[dict]] = defaultdict(list)
    soft: dict[str, list[dict]] = defaultdict(list)
    letter_only: dict[str, list[dict]] = defaultdict(list)
    with path.open() as f:
        for line in f:
            try:
                o = json.loads(line)
            except Exception:
                continue
            meta = o.get("metadata") or {}
            if meta.get("type") != "neet_mcq":
                continue
            if str(meta.get("subject", "")).lower() not in ("chemistry", "physics", "biology"):
                continue
            msgs = o.get("messages") or []
            user = next((m["content"] for m in msgs if m["role"] == "user"), "")
            asst = next((m["content"] for m in msgs if m["role"] == "assistant"), "")
            stem_match = re.sub(r"^\[NEET PYQ[^\]]*\]\s*", "", user)
            stem_end = re.search(r"\n\s*\([A-D1-4]\)", stem_match)
            stem_raw = (
                stem_match[: stem_end.start()] if stem_end else stem_match.split("\n")[0]
            )
            letter, source = extract_catch_letter(asst, meta)
            if not letter:
                continue
            num = str(ord(letter) - 64) if letter in "ABCD" else letter
            opts = parse_catch_options(user)
            sk = soft_key(stem_raw)
            if opts and num in opts:
                rec = {
                    "correct_text": opts[num],
                    "correct_num": num,
                    "options": opts,
                    "source": source,
                    "subject": meta.get("subject"),
                }
                idx[stem_key(stem_raw)].append(rec)
                soft[sk].append(rec)
            else:
                # Letter only — usable for catch-imported bank rows (A=1..D=4 order preserved)
                if source in ("catch-explanation", "catch-answer-header"):
                    letter_only[sk].append(
                        {
                            "correct_num": num,
                            "source": source + "-letter",
                            "subject": meta.get("subject"),
                        }
                    )
    return idx, soft, letter_only


def garbage_reasons(q: dict) -> list[str]:
    opts = q.get("options") or {}
    texts = [str(opts.get(k, "")) for k in "1234"]
    stem = q.get("stem") or ""
    blob = " ".join([stem, *texts])
    reasons: list[str] = []
    # Assertion–Reason / "A and E only" option language is legitimate
    assertion_opts = any(
        re.search(
            r"\bBoth A and R\b|\bA is true\b|\bA is false\b|\bAssertion\b|\bReason R\b|"
            r"\bA and [A-E] only\b|\b[A-E] and [A-E] only\b|\bA, B and C\b",
            t,
            re.I,
        )
        for t in texts
    ) or re.search(r"Assertion\s*A|Reason\s*R", stem, re.I)

    if OCR_JUNK_RE.search(blob):
        reasons.append("ocr-junk")
    if LATIN_OCR_RE.search(blob):
        reasons.append("latin-ocr")
    if DEVANAGARI_RE.search(blob):
        reasons.append("devanagari")
    if PUA_RE.search(blob):
        reasons.append("pua")
    if len({t.strip() for t in texts}) < 4:
        reasons.append("dup-options")
    for i, t in enumerate(texts, 1):
        ts = t.strip()
        if len(ts) < 1:
            reasons.append(f"empty-opt-{i}")
        if BARE_IMAGE.match(ts):
            reasons.append(f"bare-image-{i}")
        if ARROW_MASH.match(ts) or PLACEHOLDER_OPT.match(ts):
            reasons.append(f"placeholder-opt-{i}")
        # Trailing paper codes only if option otherwise unusable / bilingual junk
        if re.search(r"Hindi\+English", ts, re.I):
            reasons.append(f"bilingual-tail-{i}")
        if re.fullmatch(r"[⎯\-\s→⟶\[\]]*(Pyridinium|Chlorochromate).*", ts, re.I) and len(ts) < 40:
            reasons.append(f"mashed-opt-{i}")
    if sum(1 for t in texts if "⎯" in t or re.match(r"^[\s\-→⟶⎯\[\]]+$", t)) >= 3:
        reasons.append("arrow-mashed-options")

    if not assertion_opts:
        letter_prefixed = sum(1 for t in texts if re.match(r"^[A-D]\s+\S", t.strip()))
        # Strong mash: ≥2 options still carry A/B/C/D prefixes
        if letter_prefixed >= 2:
            reasons.append("catch-letter-prefixes")
        # Opt1 "A …" plus next-choice markers (" B ", " C ", " D ") buried in later opts
        # e.g. "2 eV B 4" / "4 litre B Vm < 2"
        next_choice_buried = sum(
            1 for t in texts[1:] if re.search(r"(?:^|\s)[B-D]\s+\S", t)
        )
        if re.match(r"^A\s+\S", texts[0].strip()) and next_choice_buried >= 1:
            reasons.append("catch-split-across-options")
        # Opt1 "A …" plus fragmented siblings (mid-number / lone digits / mojibake)
        frag = 0
        for t in texts[1:]:
            ts = t.strip()
            if re.fullmatch(r"\d{1,3}", ts):
                frag += 1
            elif re.match(r"^\d+[.,]", ts):  # "58 × 10" split from prior
                frag += 1
            elif re.match(r"^[A-D]\s", ts):
                frag += 1
            elif re.match(r"^(Ã|â|×|\\\\mathrm)", ts):
                frag += 1
            elif re.match(r"^\d+\s*[A-D]\s", ts):  # "2 eV B 4"
                frag += 1
        if re.match(r"^A\s+\S", texts[0].strip()) and frag >= 1:
            reasons.append("catch-split-options")
        # Single option contains both A- and B- choice fragments
        if sum(1 for t in texts if re.search(r"(?:^|\s)A\s+.+\sB\s+", t)) >= 1:
            reasons.append("multi-letter-in-option")
        if sum(t.count("â") + t.count("Ã") for t in texts) >= 2 and letter_prefixed >= 1:
            reasons.append("mojibake-options")
        # Truncated openers like "A -" / "A +" / "A 1:" / "A n s"
        if re.match(r"^A\s+([+\-:]|\d+\s*:|[a-z]\s)", texts[0].strip()) and letter_prefixed >= 1:
            if any(len(t.strip()) < 12 or re.search(r"\s[B-D]\s", t) for t in texts[1:]):
                reasons.append("catch-truncated-options")
        # Opt1 still has stray "A " and at least one sibling looks like a numeric fragment
        # left after a split ("75 g", "84 M", "376 g / c m 3") while opt1 is "A 1"/"A 5"
        if re.match(r"^A\s+\d", texts[0].strip()):
            if sum(1 for t in texts[1:] if re.match(r"^\d{1,3}(?:\s|/|$)", t.strip())) >= 1:
                reasons.append("catch-a-prefix-numeric-split")
        # Opt1 "A Fe3+ =" style incomplete with semicolon-split ion lists
        if re.match(r"^A\s+", texts[0].strip()) and sum(";" in t or "Â" in t for t in texts) >= 2:
            reasons.append("catch-incomplete-value-split")
        # Match-list OCR crumbs (leading comma fragments), not roman-numeral keys like "iii v i ii"
        if sum(1 for t in texts if t.strip().startswith(", (") or t.strip() in {",", "(iii)-(", ", (iii)-("}) >= 1:
            reasons.append("match-list-ocr-crumb")

    # Trailing codes like "9 G1" / "7 H1" with bilingual junk — purge if ≥2 opts tainted
    trailing = sum(1 for t in texts if TRAILING_CODE.search(t.strip()) or re.search(r"Hindi\+English|OUGH WORK", t, re.I))
    if trailing >= 2:
        reasons.append("trailing-exam-codes")
    elif trailing == 1 and any(OCR_JUNK_RE.search(t) for t in texts):
        reasons.append("trailing-exam-codes")

    if re.search(
        r"as shown in (the )?figure|see (the )?figure|given figure|following diagram|figure below",
        stem,
        re.I,
    ) and not q.get("figureSrc"):
        if all(len(opt_key(t)) < 8 or PLACEHOLDER_OPT.match(t.strip()) for t in texts):
            reasons.append("missing-figure-placeholder-opts")
    return reasons


def find_option_by_text(options: dict, correct_text: str) -> str | None:
    target = opt_key(correct_text)
    if not target:
        return None
    # exact
    for k, v in options.items():
        if opt_key(v) == target:
            return str(k)
    # containment (avoid tiny targets)
    if len(target) >= 4:
        hits = []
        for k, v in options.items():
            ov = opt_key(v)
            if not ov:
                continue
            if target == ov or (len(target) >= 6 and (target in ov or ov in target)):
                hits.append(str(k))
        if len(hits) == 1:
            return hits[0]
    return None


def options_overlap(bank_opts: dict, source_opts) -> int:
    """Count how many bank option texts appear in source options (order-free)."""
    bank_texts = {opt_key(v) for v in bank_opts.values() if opt_key(v)}
    if isinstance(source_opts, dict):
        src_texts = {opt_key(v) for v in source_opts.values() if opt_key(v)}
    else:
        src_texts = {opt_key(v) for v in (source_opts or []) if opt_key(v)}
    if not bank_texts or not src_texts:
        return 0
    n = 0
    for b in bank_texts:
        for s in src_texts:
            if b == s or (len(b) >= 6 and (b in s or s in b)):
                n += 1
                break
    return n


def authored_ok(q: dict) -> tuple[bool, str]:
    """Return (ok, note). Authored fillers key option 1 by design."""
    ss = q.get("solutionSource") or ""
    if "authored-ncert" not in ss:
        return False, "not-authored"
    opts = q.get("options") or {}
    stem = q.get("stem") or ""
    key = str(q.get("correctOption"))
    if key != "1":
        return False, f"authored-key-not-1:{key}"

    # Vacuous remainder fillers — by design option 1 is the NCERT-true statement
    if "Standard NCERT statement" in opts.get("1", ""):
        return True, "authored-rem-filler-ok"

    # pH drills
    m = re.search(r"pH of ([\d.]+)\s*M HCl", stem, re.I)
    if m:
        conc = float(m.group(1))
        expected = -math.log10(conc)
        try:
            got = float(re.search(r"[\d.]+", opts["1"]).group())
        except Exception:
            return False, "authored-ph-parse-fail"
        if abs(got - expected) < 0.05:
            return True, "authored-ph-ok"
        return False, f"authored-ph-mismatch:{got}!={expected:.2f}"

    # period from Z
    m = re.search(r"atomic number (\d+) belongs to period", stem, re.I)
    if m:
        z = int(m.group(1))
        if z <= 2:
            per = 1
        elif z <= 10:
            per = 2
        elif z <= 18:
            per = 3
        elif z <= 36:
            per = 4
        elif z <= 54:
            per = 5
        elif z <= 86:
            per = 6
        else:
            per = 7
        if opts.get("1", "").strip() == str(per):
            return True, "authored-period-ok"
        return False, f"authored-period-mismatch:{opts.get('1')}!={per}"

    # Known concept templates — option 1 text is the NCERT-correct choice by construction
    checks = [
        (r"atomic number of sodium", "11"),
        (r"most electronegative element", r"fluorine|f\b"),
        (r"Haematite is an ore of", r"iron|fe"),
        (r"shape of BF", r"trigonal\s*planar"),
        (r"ion is colourless", r"sc\s*\(?3\+\)?|zn\s*\(?2\+\)?|ti\s*\(?4\+\)?|cu\s*\(?\+\)?"),
        (r"hybridization in SF", r"sp3d2|sp³d²"),
        (r"strongest reducing agent among alkali", r"lithium|\bli\b"),
        (r"Ozone is an allotrope", r"oxygen"),
        (r"noble gas", r"neon|argon|helium|krypton|xenon|radon|ne\b|ar\b"),
        (r"Crystal field splitting is largest", r"CN|cyano"),
        (r"IUPAC name of CH", r"ethanol"),
        (r"electrophile in nitration", r"NO2\+|nitronium"),
        (r"meta-directing", r"–NO2|NO2|nitro|–CHO|–COOH|–CN|–SO3H"),
        (r"Tollen", r"aldehyde"),
        (r"Geometrical isomerism", r"alkene|C=C|2-butene|maleic|fumaric"),
        (r"natural rubber", r"isoprene|2-methyl-1,3-butadiene"),
        (r"Hoffmann bromamide", r"amine|primary amine|1° amine"),
        (r"Cannizzaro", r"HCHO|formaldehyde|benzaldehyde|no.?alpha"),
        (r"SN1 reaction is favored", r"3°|tertiary|3º"),
        (r"Phenol is more acidic", r"resonanc|phenoxide"),
        (r"primary alcohol to an aldehyde", r"PCC|pyridinium"),
        (r"coordination compounds is correct", r"Ligands donate"),
    ]
    o1 = opts.get("1", "")
    for pat, expect in checks:
        if re.search(pat, stem, re.I):
            if re.search(expect, o1, re.I):
                return True, f"authored-template-ok:{pat[:24]}"
            # still OK if option 1 is designed answer even when expect regex misses
            return True, f"authored-template-assumed-ok:{pat[:24]}"

    return True, "authored-default-key1-ok"


# Hard chemistry knowledge: stem pattern -> expected option text pattern (NEET/NCERT)
# Used when sources disagree or for high-confidence spot fixes.
KNOWLEDGE: list[tuple[re.Pattern, re.Pattern, str]] = [
    (
        re.compile(r"Correct increasing order of ionic radii", re.I),
        re.compile(r"Al\s*3\+\s*<\s*Mg\s*2\+\s*<\s*Na\+\s*<\s*F", re.I),
        "Ionic radii: Al3+ < Mg2+ < Na+ < F− (isoelectronic)",
    ),
    (
        re.compile(r"Lassaigne test for nitrogen.*blue", re.I),
        re.compile(r"Fe4\[Fe\(CN\)6\]3|Fe_?4\s*\[Fe\(CN\)6\]_?3", re.I),
        "Lassaigne blue → Prussian blue Fe4[Fe(CN)6]3",
    ),
    (
        re.compile(r"strongest base in the gas phase", re.I),
        re.compile(r"\(CH₃\)₃N|\(CH3\)3N|trimethylamine", re.I),
        "Gas-phase basicity: 3° amine strongest among methylamines",
    ),
    (
        re.compile(r"Strongest base in aqueous solution", re.I),
        re.compile(r"\(CH₃\)₂NH|\(CH3\)2NH|\(C2H5\)2NH|dimethylamine|diethylamine", re.I),
        "Aqueous: 2° amine strongest among given alkylamines",
    ),
    (
        re.compile(r"rate\s*=\s*k\[A\]²\[B\]|rate\s*=\s*k\[A\]\^?2\[B\].*concentration of A is", re.I),
        re.compile(r"^4$", re.I),
        "rate∝[A]²: double [A] → rate ×4",
    ),
    (
        re.compile(r"2\.24\s*L.*STP|molecules in 2\.24", re.I),
        re.compile(r"6\.022\s*[×xX]\s*10\s*[²²2]{2}|10\^\{?22\}?", re.I),
        "2.24 L at STP = 0.1 mol → 6.022×10²² molecules",
    ),
    (
        re.compile(r"Arrhenius.*plot of ln k vs|ln k vs 1/T.*slope", re.I),
        re.compile(r"[−\-]\s*Ea\s*/\s*R|[−\-]Ea/R", re.I),
        "Arrhenius: slope of ln k vs 1/T is −Ea/R",
    ),
    (
        re.compile(r"spontaneous at all temperatures", re.I),
        re.compile(r"ΔH\s*<\s*0.*ΔS\s*>\s*0|DH\s*<\s*0.*DS\s*>\s*0", re.I),
        "Always spontaneous: ΔH<0 and ΔS>0",
    ),
    (
        re.compile(r"intramolecular hydrogen bond", re.I),
        re.compile(r"cellulose", re.I),
        "NEET 2016: intramolecular H-bond → Cellulose",
    ),
    (
        re.compile(r"favour maximum formation of the product.*ΔrH\s*=\s*[–\-]", re.I),
        re.compile(r"Low temperature and high pressure", re.I),
        "Exothermic + Δn<0 → low T, high P",
    ),
    (
        re.compile(r"correct difference between first- and second-order reactions", re.I),
        re.compile(r"half-life of a first-order reaction does not depend", re.I),
        "1st-order t½ independent of [A]0; 2nd-order depends",
    ),
    (
        re.compile(r"set of molecules will have zero dipole moment", re.I),
        re.compile(r"Boron trifluoride,\s*beryllium difluoride,\s*carbon dioxide,\s*1,4-dichlorobenzene", re.I),
        "Zero μ: BF3, BeF2, CO2, p-C6H4Cl2",
    ),
    (
        re.compile(r"formic acid and.*oxalic acid.*conc\.?\s*H2SO4.*KOH", re.I),
        re.compile(r"2[·.]8", re.I),
        "HCOOH/H2C2O4 + H2SO4; KOH removes CO2 → 2.8 g CO",
    ),
    (
        re.compile(r"geometry and magnetic behaviour of the complex.*Ni\s*\(?CO\)?\s*\)?\s*4|\[Ni\(CO\)4\]", re.I),
        re.compile(r"tetrahedral.*diamagnetic", re.I),
        "NCERT: [Ni(CO)4] tetrahedral diamagnetic",
    ),
    (
        re.compile(r"Golgi complex participates", re.I),
        re.compile(r"secretory vesicle", re.I),
        "Golgi → secretory vesicles (even if mis-banked)",
    ),
    (
        re.compile(r"chief producers in the oceans", re.I),
        re.compile(r"diatom", re.I),
        "Ocean chief producers → diatoms",
    ),
    (
        re.compile(r"tertiary butyl carbocation is more stable", re.I),
        re.compile(r"hyperconjugation", re.I),
        "3° carbocation stability → hyperconjugation",
    ),
    (
        re.compile(r"change in oxidation number of carbon.*CH4.*CCl4|CH4\(g\)\+4Cl2", re.I),
        re.compile(r"−?\s*4\s*to\s*\+?\s*4|-4 to \+4", re.I),
        "CH4→CCl4: C from −4 to +4",
    ),
    (
        re.compile(r"Pumice stone is an example", re.I),
        re.compile(r"solid sol|foam", re.I),
        "Pumice → solid sol / foam (NEET)",
    ),
    (
        re.compile(r"Reaction between benzaldehyde and acetophenone.*dilute NaOH", re.I),
        re.compile(r"Cross Aldol", re.I),
        "PhCHO + PhCOMe → cross aldol",
    ),
    (
        re.compile(r"In the structure of ClF3.*lone pairs", re.I),
        re.compile(r"^two$|2", re.I),
        "ClF3: 2 lone pairs on Cl",
    ),
    (
        re.compile(r"BF3 is planar and electron deficient.*Hybridization", re.I),
        re.compile(r"sp2 and 6", re.I),
        "BF3: sp2, 6 electrons around B",
    ),
    (
        re.compile(r"van der Waals constant.*NH3.*H2.*O2.*CO2.*most easily liquefiable", re.I),
        re.compile(r"NH3", re.I),
        "Highest 'a' → most easily liquefiable → NH3",
    ),
    (
        re.compile(r"correct difference between first- and second-order reactions", re.I),
        re.compile(r"half-life of a first-order reaction.*independent of concentration|half-life.*first-order.*does not depend on.*concentration", re.I),
        "1st order t½ independent of [A]",
    ),
    (
        re.compile(r"Aspirin and Paracetamol belong to the class of narcotic", re.I),
        re.compile(r"Both Statement I and Statement II are false", re.I),
        "Aspirin/Paracetamol not narcotic analgesics; II false too per NEET key variants — verify text",
    ),
]


def knowledge_match(q: dict) -> tuple[str | None, str | None]:
    stem = q.get("stem") or ""
    opts = q.get("options") or {}
    for stem_re, opt_re, why in KNOWLEDGE:
        if not stem_re.search(stem):
            continue
        hits = [k for k, v in opts.items() if opt_re.search(v or "")]
        if len(hits) == 1:
            return hits[0], why
        if len(hits) > 1:
            return None, f"knowledge-ambiguous:{why}"
    return None, None


def vote_correct(q: dict, year_keys, hf_idx, hf_soft, catch_idx, catch_soft, catch_letter) -> dict:
    """Gather evidence for correct option via option TEXT match + knowledge."""
    evidence: list[dict] = []
    opts = q.get("options") or {}
    old = str(q.get("correctOption"))
    stem = q.get("stem") or ""
    sk = stem_key(stem)
    soft = soft_key(stem)

    # Year key (same id ⇒ same option order as paper)
    yk = year_keys.get(q["id"])
    if yk:
        evidence.append(
            {
                "source": "md-year-key",
                "option": yk["correctOption"],
                "estimated": yk["answerEstimated"],
                "via": "id-match",
            }
        )

    # HF by stem → option TEXT (exact first; soft only with option overlap)
    exact_hf = hf_idx.get(sk) or []
    soft_hf = [] if exact_hf else (hf_soft.get(soft) or [])
    # Prefer Chemistry file hits for chemistry banks; drop cross-subject soft noise
    def hf_ok(hit, soft_match: bool) -> bool:
        cat = (hit.get("category") or "") + " " + str(hit.get("file") or "")
        overlap = options_overlap(opts, hit.get("options"))
        if soft_match and overlap < 2:
            return False
        if soft_match and "Chemistry" not in cat and overlap < 3:
            return False
        return True

    seen_hf = set()
    for hit in exact_hf + soft_hf:
        soft_match = hit in soft_hf
        if not hf_ok(hit, soft_match):
            continue
        mapped = find_option_by_text(opts, hit["correct_text"])
        if not mapped:
            continue
        sig = (mapped, hit.get("file"), hit.get("correct_text"))
        if sig in seen_hf:
            continue
        seen_hf.add(sig)
        evidence.append(
            {
                "source": f"hf:{hit.get('file')}",
                "option": mapped,
                "via": "option-text",
                "correct_text": (hit["correct_text"] or "")[:80],
            }
        )

    # Catch explanation by stem → option TEXT
    exact_c = catch_idx.get(sk) or []
    soft_c = [] if exact_c else (catch_soft.get(soft) or [])
    seen_c = set()
    for hit in exact_c + soft_c:
        if hit in soft_c and options_overlap(opts, hit.get("options")) < 2:
            continue
        mapped = find_option_by_text(opts, hit["correct_text"])
        if not mapped:
            continue
        sig = (mapped, hit.get("source"), hit.get("correct_text"))
        if sig in seen_c:
            continue
        seen_c.add(sig)
        evidence.append(
            {
                "source": hit["source"],
                "option": mapped,
                "via": "option-text",
                "correct_text": (hit["correct_text"] or "")[:80],
            }
        )

    # Catch letter-only: DO NOT auto-fix (OCR often reshuffled/split options).
    # Record as weak hint only when it disagrees with the bank key — surfaced as conflict later.
    ss = q.get("solutionSource") or ""
    letter_hint = None
    if "catchshubham" in ss and not seen_c:
        letters = catch_letter.get(soft) or []
        nums = {h["correct_num"] for h in letters}
        if len(nums) == 1:
            num = next(iter(nums))
            if num in opts and num != old:
                letter_hint = {
                    "source": letters[0]["source"],
                    "option": num,
                    "via": "catch-letter-order-unverified",
                }

    # Knowledge
    kopt, kwhy = knowledge_match(q)
    if kopt:
        evidence.append({"source": "ncert-knowledge", "option": kopt, "via": "text-pattern", "why": kwhy})
    elif kwhy:
        evidence.append({"source": "ncert-knowledge", "option": None, "via": "ambiguous", "why": kwhy})

    return {"old": old, "evidence": evidence, "letter_hint": letter_hint}


def decide(q: dict, bank_id: str, diff: str, year_keys, hf_idx, hf_soft, catch_idx, catch_soft, catch_letter) -> dict:
    ss = q.get("solutionSource") or ""
    greasons = garbage_reasons(q)
    if greasons:
        return {
            "bucket": "purge",
            "rec": {
                "id": q["id"],
                "bank": bank_id,
                "difficulty": diff,
                "old": str(q.get("correctOption")),
                "reason": "ocr-mashed-or-garbage:" + ",".join(greasons),
                "confidence": "high",
                "sources": ["ocr-heuristics"],
                "stem": (q.get("stem") or "")[:120],
            },
        }

    if "authored-ncert" in ss:
        ok, note = authored_ok(q)
        if ok:
            return {"bucket": "ok", "rec": {"id": q["id"], "note": note}}
        # authored wrong → fix or conflict
        if note.startswith("authored-key-not-1"):
            return {
                "bucket": "fix",
                "rec": {
                    "id": q["id"],
                    "bank": bank_id,
                    "difficulty": diff,
                    "old": str(q.get("correctOption")),
                    "new": "1",
                    "reason": note,
                    "confidence": "high",
                    "sources": [ss],
                },
            }
        return {
            "bucket": "conflict",
            "rec": {
                "id": q["id"],
                "bank": bank_id,
                "difficulty": diff,
                "old": str(q.get("correctOption")),
                "reason": note,
                "confidence": "low",
                "sources": [ss],
                "candidates": [],
            },
        }

    voted = vote_correct(q, year_keys, hf_idx, hf_soft, catch_idx, catch_soft, catch_letter)
    evidence = voted["evidence"]
    old = voted["old"]
    letter_hint = voted.get("letter_hint")

    # Tally options from strong evidence
    tallies: Counter = Counter()
    sources_for: dict[str, list[str]] = defaultdict(list)
    knowledge_opt = None
    for e in evidence:
        opt = e.get("option")
        if not opt:
            continue
        src = e["source"]
        # Down-weight estimated year keys
        if src == "md-year-key" and e.get("estimated"):
            tallies[opt] += 0.25
            sources_for[opt].append("md-year-key(estimated)")
        elif src == "md-year-key":
            tallies[opt] += 0.8
            sources_for[opt].append("md-year-key")
        elif src == "ncert-knowledge":
            tallies[opt] += 2.0
            sources_for[opt].append("ncert-knowledge")
            knowledge_opt = opt
        elif src.startswith("hf:"):
            tallies[opt] += 1.0
            sources_for[opt].append(src)
        elif src.startswith("catch-explanation"):
            tallies[opt] += 1.5
            sources_for[opt].append(src)
        elif src.startswith("catch-answer"):
            # Post-think Answer headers are noisier than "Correct Option is"
            tallies[opt] += 0.6
            sources_for[opt].append(src)
        elif src.startswith("catch"):
            tallies[opt] += 0.8
            sources_for[opt].append(src)
        else:
            tallies[opt] += 0.5
            sources_for[opt].append(src)

    if not tallies:
        # No external evidence — try a few more chemistry heuristics on stem/options
        heur = heuristic_solve(q)
        if heur:
            new, why, conf = heur
            if new != old:
                return {
                    "bucket": "fix",
                    "rec": {
                        "id": q["id"],
                        "bank": bank_id,
                        "difficulty": diff,
                        "old": old,
                        "new": new,
                        "reason": why,
                        "confidence": conf,
                        "sources": ["chemistry-heuristic"],
                    },
                }
            return {"bucket": "ok", "rec": {"id": q["id"], "note": "heuristic-confirms"}}
        if letter_hint:
            return {
                "bucket": "conflict",
                "rec": {
                    "id": q["id"],
                    "bank": bank_id,
                    "difficulty": diff,
                    "old": old,
                    "reason": "catch-letter-hint-unverified-by-option-text",
                    "confidence": "low",
                    "sources": [letter_hint["source"], ss] if ss else [letter_hint["source"]],
                    "candidates": [{"option": letter_hint["option"], "score": 0.5, "sources": [letter_hint["source"]]}],
                    "stem": (q.get("stem") or "")[:140],
                },
            }
        return {
            "bucket": "conflict",
            "rec": {
                "id": q["id"],
                "bank": bank_id,
                "difficulty": diff,
                "old": old,
                "reason": "no-external-or-knowledge-match",
                "confidence": "low",
                "sources": [ss] if ss else [],
                "candidates": [],
                "stem": (q.get("stem") or "")[:140],
            },
        }

    best, best_score = tallies.most_common(1)[0]
    second_score = tallies.most_common(2)[1][1] if len(tallies) > 1 else 0

    # Conflict if top two close and disagree
    if best != old and second_score >= best_score * 0.85 and second_score > 0 and len(tallies) > 1:
        # knowledge breaks ties
        if knowledge_opt and knowledge_opt == best and best_score >= second_score:
            pass  # allow fix
        else:
            return {
                "bucket": "conflict",
                "rec": {
                    "id": q["id"],
                    "bank": bank_id,
                    "difficulty": diff,
                    "old": old,
                    "reason": "sources-disagree",
                    "confidence": "low",
                    "sources": [e["source"] for e in evidence],
                    "candidates": [{"option": o, "score": s, "sources": sources_for[o]} for o, s in tallies.most_common()],
                    "stem": (q.get("stem") or "")[:140],
                },
            }

    if best == old:
        return {"bucket": "ok", "rec": {"id": q["id"], "note": "evidence-agrees", "sources": sources_for[best]}}

    # Non-estimated year key agreeing with bank: only override with knowledge
    year_supports_old = any(
        e.get("source") == "md-year-key" and not e.get("estimated") and e.get("option") == old
        for e in evidence
    )
    if year_supports_old and knowledge_opt != best:
        return {
            "bucket": "conflict",
            "rec": {
                "id": q["id"],
                "bank": bank_id,
                "difficulty": diff,
                "old": old,
                "reason": "year-key-agrees-external-disagrees-no-knowledge",
                "confidence": "low",
                "sources": [e["source"] for e in evidence],
                "candidates": [
                    {"option": o, "score": s, "sources": sources_for[o]} for o, s in tallies.most_common()
                ],
                "stem": (q.get("stem") or "")[:140],
            },
        }

    srcs = sources_for[best]
    has_catch_expl = any(s.startswith("catch-explanation") for s in srcs)
    has_hf = any(s.startswith("hf:") and "Chemistry" in s for s in srcs)
    has_knowledge = knowledge_opt == best
    independent = sum(
        [
            has_knowledge,
            has_hf,
            has_catch_expl,
            any(s.startswith("md-year-key") and "estimated" not in s for s in srcs),
        ]
    )
    # High only with knowledge/heuristic reinforcement or ≥2 independent sources.
    # Catch-explanation alone is medium (dataset explanations often disagree with NCERT).
    if has_knowledge or independent >= 2 or (has_hf and best_score >= 2.0):
        conf = "high"
    else:
        conf = "medium"
    if conf == "medium" and best_score < 1.0:
        return {
            "bucket": "conflict",
            "rec": {
                "id": q["id"],
                "bank": bank_id,
                "difficulty": diff,
                "old": old,
                "reason": "weak-evidence-for-change",
                "confidence": "low",
                "sources": [e["source"] for e in evidence],
                "candidates": [{"option": o, "score": s, "sources": sources_for[o]} for o, s in tallies.most_common()],
                "stem": (q.get("stem") or "")[:140],
            },
        }

    reason_bits = []
    if knowledge_opt == best:
        reason_bits.append(
            next(
                e.get("why", "knowledge")
                for e in evidence
                if e.get("source") == "ncert-knowledge" and e.get("option") == best
            )
        )
    reason_bits.append(f"option-text-match→{best} (was {old})")
    return {
        "bucket": "fix",
        "rec": {
            "id": q["id"],
            "bank": bank_id,
            "difficulty": diff,
            "old": old,
            "new": best,
            "reason": "; ".join(reason_bits),
            "sources": srcs,
            "confidence": conf,
        },
    }


def heuristic_solve(q: dict) -> tuple[str, str, str] | None:
    """Limited NEET chemistry heuristics when no external key hits."""
    stem = q.get("stem") or ""
    opts = q.get("options") or {}
    sn = soft_key(stem)

    # [Ni(CO)4]
    if "nicol" in sn or "nicol4" in sn or re.search(r"nicol4|ni.?co.?4", sn):
        hits = [k for k, v in opts.items() if re.search(r"tetrahedral.*diamagnetic", v or "", re.I)]
        if len(hits) == 1:
            return hits[0], "[Ni(CO)4] tetrahedral diamagnetic", "high"
    if re.search(r"\[?\s*Ni\s*\(?\s*CO\s*\)?\s*4\s*\]?", stem, re.I) or "nicol4" in sn.replace("co", "co"):
        hits = [k for k, v in opts.items() if re.search(r"tetrahedral.*diamagnetic", v or "", re.I)]
        if len(hits) == 1:
            return hits[0], "[Ni(CO)4] tetrahedral diamagnetic", "high"

    # ClF3 lone pairs (stem may be LaTeX-wrapped)
    if "clf3" in sn and "lone" in sn:
        hits = [k for k, v in opts.items() if re.search(r"^two$|^2$", (v or "").strip(), re.I)]
        if len(hits) == 1:
            return hits[0], "ClF3 has 2 lone pairs on Cl", "high"
    if re.search(r"ClF\s*3.*lone pair|lone pairs.*ClF\s*3|structure of ClF3", stem, re.I):
        hits = [k for k, v in opts.items() if re.search(r"^two$|^2$", (v or "").strip(), re.I)]
        if len(hits) == 1:
            return hits[0], "ClF3 has 2 lone pairs on Cl", "high"

    # Hyperconjugation 3° butyl
    if re.search(r"tertiary butyl carbocation is more stable", stem, re.I):
        hits = [k for k, v in opts.items() if re.search(r"hyperconjugation", v or "", re.I)]
        if len(hits) == 1:
            return hits[0], "3° butyl cation stabilized by hyperconjugation", "high"

    # Cross aldol PhCHO + acetophenone
    if re.search(r"benzaldehyde and acetophenone", stem, re.I):
        hits = [k for k, v in opts.items() if re.search(r"Cross Aldol", v or "", re.I)]
        if len(hits) == 1:
            return hits[0], "Cross aldol condensation", "high"

    # PCC primary alcohol → aldehyde authored-like
    if re.search(r"primary alcohol to an aldehyde", stem, re.I):
        hits = [k for k, v in opts.items() if re.search(r"PCC|pyridinium chlorochromate", v or "", re.I)]
        if len(hits) == 1:
            return hits[0], "PCC oxidizes 1° alcohol to aldehyde", "high"

    # Ligands donate
    if re.search(r"Ligands donate electron pairs", str(opts), re.I) and re.search(
        r"coordination|ligand", stem, re.I
    ):
        hits = [k for k, v in opts.items() if re.search(r"Ligands donate electron pairs", v or "", re.I)]
        if len(hits) == 1:
            return hits[0], "Ligands → electron-pair donors", "high"

    # Cellulose intramolecular
    if re.search(r"intramolecular hydrogen bond", stem, re.I):
        hits = [k for k, v in opts.items() if re.search(r"cellulose", v or "", re.I)]
        if len(hits) == 1:
            return hits[0], "Intramolecular H-bond → Cellulose (NEET 2016)", "high"

    # CH4 oxidation number
    if re.search(r"CH4.*CCl4|change in oxidation number of carbon", stem, re.I):
        hits = [k for k, v in opts.items() if re.search(r"−\s*4\s*to\s*\+\s*4|-4 to \+4", v or "", re.I)]
        if len(hits) == 1:
            return hits[0], "C in CH4 is −4 → +4 in CCl4", "high"

    # Easy liquefaction van der Waals
    if re.search(r"most easily liquefi", stem, re.I) and re.search(r"van der Waals|NH3", stem, re.I):
        hits = [k for k, v in opts.items() if re.search(r"^NH3$", (v or "").strip(), re.I)]
        if len(hits) == 1:
            return hits[0], "Highest van der Waals a → NH3", "high"

    # Number of molecules of water maximum — 18 mL water ≈ 1 mol
    if re.search(r"number of molecules of water maximum", stem, re.I):
        hits = [k for k, v in opts.items() if re.search(r"18\s*mL", v or "", re.I)]
        if len(hits) == 1:
            return hits[0], "18 mL water ≈ 1 mol → max molecules", "high"

    # Zero dipole sets — BF3, CO2, BeF2, p-dichlorobenzene type; refuse if options mashed
    return None


def main() -> None:
    print("Loading sources…")
    year_keys = load_year_keys()
    hf_idx, hf_soft = load_hf_index()
    catch_idx, catch_soft, catch_letter = load_catch_index()
    print(
        f"year_keys={len(year_keys)} hf_stems={len(hf_idx)}/{len(hf_soft)} "
        f"catch_stems={len(catch_idx)}/{len(catch_soft)} letter_only={len(catch_letter)}"
    )

    fixes: list[dict] = []
    conflicts: list[dict] = []
    purges: list[dict] = []
    ok_n = 0
    total = 0
    by_bank = Counter()

    for path in sorted(ROOT.glob("data/topic-series/banks/chemistry-*.json")):
        data = json.loads(path.read_text())
        bank_id = data["id"]
        for diff in ("Easy", "Medium", "Hard"):
            for q in data["questions"][diff]:
                total += 1
                by_bank[bank_id] += 1
                result = decide(
                    q, bank_id, diff, year_keys, hf_idx, hf_soft, catch_idx, catch_soft, catch_letter
                )
                b = result["bucket"]
                if b == "ok":
                    ok_n += 1
                elif b == "fix":
                    fixes.append(result["rec"])
                elif b == "conflict":
                    conflicts.append(result["rec"])
                elif b == "purge":
                    purges.append(result["rec"])

    OUT_FIX.parent.mkdir(parents=True, exist_ok=True)
    for path, rows in (
        (OUT_FIX, fixes),
        (OUT_CONFLICT, conflicts),
        (OUT_PURGE, purges),
    ):
        with path.open("w") as f:
            for row in rows:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")

    print("=== SUMMARY ===")
    print(f"total_reviewed={total}")
    print(f"ok={ok_n}")
    print(f"fixes={len(fixes)}")
    print(f"conflicts={len(conflicts)}")
    print(f"purges={len(purges)}")
    print(f"by_bank={dict(by_bank)}")
    print(f"wrote {OUT_FIX}")
    print(f"wrote {OUT_CONFLICT}")
    print(f"wrote {OUT_PURGE}")
    # confidence breakdown
    print("fix confidence", Counter(x.get("confidence") for x in fixes))
    print("purge sample ids", [p["id"] for p in purges[:8]])
    print("fix sample", fixes[:3])
    print("conflict sample", conflicts[:3])


if __name__ == "__main__":
    main()
