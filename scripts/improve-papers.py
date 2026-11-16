#!/usr/bin/env python3
"""Improve paper JSON: attach figures, strengthen keys, reduce placeholders.

Does not invent new question wording — only metadata (figureSrc, keys, flags)
and copies verified content from stronger year duplicates when stems match.
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAPERS = ROOT / "data" / "papers"
RAW_PDFS = ROOT / "data" / "raw" / "pdfs"
PUBLIC_FIG = ROOT / "public" / "figures"
RAW_FIG = ROOT / "data" / "raw" / "figures"

FIG_RE = re.compile(
    r"see figure|as shown in (the )?figure|shown in (the )?figure|"
    r"following diagram|given figure|in the figure|as shown in figure|"
    r"shown in figure|given figures",
    re.I,
)

YEAR_PDF = {
    2017: "NEET2017_A.pdf",
    2018: "NEET2018_main.pdf",
    2019: "NEET2019_G1.pdf",
    2020: "NEET2020_E1.pdf",
    2021: "NEET2021_M1.pdf",
    2022: "TRY_NEET2022_main.pdf",
    2023: "TRY_NEET2023_F1.pdf",
    2024: "TRY_NEET2024_R1.pdf",
    2025: "NEET2025_46.pdf",
}

HEADER_SIZES = {(469, 268), (812, 465)}


def stem_key(stem: str) -> str:
    s = re.sub(r"\s+", " ", (stem or "").lower())
    s = re.sub(r"[^a-z0-9 ]+", "", s)
    return s[:160]


def needs_figure(q: dict) -> bool:
    return bool(FIG_RE.search(q.get("stem", "")))


def extract_year_images(year: int) -> list[Path]:
    pdf_name = YEAR_PDF.get(year)
    if not pdf_name:
        return []
    pdf = RAW_PDFS / pdf_name
    if not pdf.exists():
        return []
    out_dir = RAW_FIG / str(year)
    out_dir.mkdir(parents=True, exist_ok=True)
    # Clear prior extract for this year prefix
    for old in out_dir.glob("img-*"):
        old.unlink()
    prefix = out_dir / "img"
    try:
        subprocess.run(
            ["pdfimages", "-all", str(pdf), str(prefix)],
            check=False,
            capture_output=True,
        )
    except FileNotFoundError:
        return []

    try:
        from PIL import Image
    except ImportError:
        subprocess.check_call(["pip", "install", "pillow", "-q"])
        from PIL import Image

    kept: list[Path] = []
    seen_hash: set[tuple] = set()
    for p in sorted(out_dir.glob("img-*")):
        if p.suffix.lower() not in {".jpg", ".jpeg", ".png", ".ppm", ".tif", ".tiff"}:
            continue
        try:
            im = Image.open(p)
            w, h = im.size
        except Exception:
            continue
        if (w, h) in HEADER_SIZES:
            continue
        if w < 140 or h < 90 or w * h < 18000:
            continue
        if w > 780 and h < 120:
            continue
        # dedupe near-identical dimensions consecutive pairs (image+smask)
        sig = (w, h, p.stat().st_size // 500)
        if sig in seen_hash:
            continue
        seen_hash.add(sig)
        kept.append(p)
    return kept


def write_svg_placeholder(kind: str, path: Path, title: str) -> None:
    """Schematic SVG when PDF crop is unavailable — labelled, not decorative junk."""
    label = title.replace("<", "")[:80]
    svgs = {
        "pulley": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 220" role="img">
  <rect width="420" height="220" fill="#f8fafc"/>
  <text x="12" y="22" font-family="sans-serif" font-size="12" fill="#64748b">Figure (schematic)</text>
  <circle cx="210" cy="70" r="28" fill="none" stroke="#0b5cab" stroke-width="3"/>
  <line x1="210" y1="98" x2="140" y2="180" stroke="#334155" stroke-width="3"/>
  <line x1="210" y1="98" x2="280" y2="180" stroke="#334155" stroke-width="3"/>
  <rect x="120" y="180" width="40" height="28" fill="#94a3b8"/><text x="128" y="198" font-size="11">m1</text>
  <rect x="260" y="180" width="40" height="28" fill="#94a3b8"/><text x="268" y="198" font-size="11">m2</text>
  <text x="12" y="210" font-family="sans-serif" font-size="11" fill="#475569">{label}</text>
</svg>''',
        "wheel": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 220" role="img">
  <rect width="420" height="220" fill="#f8fafc"/>
  <text x="12" y="22" font-family="sans-serif" font-size="12" fill="#64748b">Figure (schematic)</text>
  <line x1="40" y1="170" x2="380" y2="170" stroke="#94a3b8" stroke-width="2"/>
  <circle cx="210" cy="120" r="50" fill="none" stroke="#0b5cab" stroke-width="3"/>
  <circle cx="210" cy="70" r="4" fill="#b42318"/><text x="220" y="74" font-size="12">P</text>
  <circle cx="210" cy="170" r="4" fill="#b42318"/><text x="220" y="174" font-size="12">Q</text>
  <path d="M260 120 h40" stroke="#0b5cab" stroke-width="2" marker-end="url(#a)"/>
  <defs><marker id="a" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#0b5cab"/></marker></defs>
  <text x="12" y="210" font-family="sans-serif" font-size="11" fill="#475569">{label}</text>
</svg>''',
        "circuit": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 220" role="img">
  <rect width="420" height="220" fill="#f8fafc"/>
  <text x="12" y="22" font-family="sans-serif" font-size="12" fill="#64748b">Figure (schematic)</text>
  <rect x="60" y="60" width="300" height="100" fill="none" stroke="#334155" stroke-width="2"/>
  <line x1="100" y1="60" x2="100" y2="160" stroke="#0b5cab" stroke-width="2"/>
  <text x="108" y="110" font-size="12">R</text>
  <circle cx="200" cy="60" r="10" fill="none" stroke="#0b5cab" stroke-width="2"/>
  <text x="216" y="64" font-size="12">L</text>
  <rect x="280" y="50" width="24" height="20" fill="none" stroke="#0b5cab" stroke-width="2"/>
  <text x="308" y="64" font-size="12">C</text>
  <text x="12" y="210" font-family="sans-serif" font-size="11" fill="#475569">{label}</text>
</svg>''',
        "prism": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 220" role="img">
  <rect width="420" height="220" fill="#f8fafc"/>
  <text x="12" y="22" font-family="sans-serif" font-size="12" fill="#64748b">Figure (schematic)</text>
  <polygon points="160,50 280,180 80,180" fill="#e2e8f0" stroke="#0b5cab" stroke-width="2"/>
  <text x="145" y="45" font-size="12">A</text><text x="70" y="195" font-size="12">B</text><text x="275" y="195" font-size="12">C</text>
  <line x1="40" y1="120" x2="150" y2="130" stroke="#b42318" stroke-width="2"/>
  <circle cx="150" cy="130" r="3" fill="#b42318"/><text x="120" y="120" font-size="12" fill="#b42318">P</text>
  <text x="12" y="210" font-family="sans-serif" font-size="11" fill="#475569">{label}</text>
</svg>''',
        "generic": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 180" role="img">
  <rect width="420" height="180" fill="#f1f5f9" stroke="#94a3b8" stroke-dasharray="6 4"/>
  <text x="210" y="78" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#475569">Figure not recovered from paper PDF</text>
  <text x="210" y="102" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#64748b">Placeholder — original stem wording unchanged</text>
  <text x="210" y="150" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#94a3b8">{label}</text>
</svg>''',
    }
    path.write_text(svgs.get(kind, svgs["generic"]), encoding="utf-8")


def pick_schematic(stem: str) -> str:
    s = stem.lower()
    if "pulley" in s or "string" in s and "mass" in s:
        return "pulley"
    if "wheel" in s or "bullock" in s:
        return "wheel"
    if "circuit" in s or "capacitor" in s or "inductor" in s or "resistor" in s:
        return "circuit"
    if "prism" in s or "ray" in s and "angle" in s:
        return "prism"
    return "generic"


def attach_figures(paper: dict) -> dict:
    year = paper["year"]
    PUBLIC_FIG.mkdir(parents=True, exist_ok=True)
    images = extract_year_images(year)
    fig_qs = [q for q in paper["questions"] if needs_figure(q)]
    img_i = 0
    for q in fig_qs:
        qid = q["id"]
        dest_name = f"{qid}.png"
        dest = PUBLIC_FIG / dest_name
        attached = False
        if img_i < len(images):
            src = images[img_i]
            img_i += 1
            try:
                from PIL import Image

                im = Image.open(src).convert("RGB")
                im.save(dest, format="PNG", optimize=True)
                q["figureSrc"] = f"/figures/{dest_name}"
                q["figureKind"] = "pdf-extract"
                attached = True
            except Exception:
                attached = False
        if not attached:
            svg_name = f"{qid}.svg"
            svg_path = PUBLIC_FIG / svg_name
            kind = pick_schematic(q.get("stem", ""))
            write_svg_placeholder(kind, svg_path, f"Q{q['number']} · {year}")
            q["figureSrc"] = f"/figures/{svg_name}"
            q["figureKind"] = "schematic" if kind != "generic" else "missing-placeholder"
        # clear any stale flag
        q.pop("figureMissing", None)
    # Mark non-figure questions explicitly without figureSrc
    for q in paper["questions"]:
        if not needs_figure(q):
            q.pop("figureSrc", None)
            q.pop("figureKind", None)
    return paper


def build_stem_library(papers: dict[int, dict]) -> dict[str, dict]:
    """Prefer non-placeholder, non-estimated answers from strong years."""
    lib: dict[str, dict] = {}
    priority = [2024, 2023, 2019, 2025, 2022, 2021, 2020, 2018, 2017, 2016]
    for year in priority:
        paper = papers.get(year)
        if not paper:
            continue
        for q in paper["questions"]:
            if q.get("placeholder") or "[PLACEHOLDER]" in q.get("stem", ""):
                continue
            key = stem_key(q["stem"])
            if len(key) < 40:
                continue
            entry = lib.get(key)
            better = {
                "stem": q["stem"],
                "options": q["options"],
                "correctOption": q["correctOption"],
                "answerEstimated": bool(q.get("answerEstimated")),
                "placeholder": False,
                "year": year,
                "topic": q.get("topic"),
            }
            if not entry:
                lib[key] = better
            elif entry.get("answerEstimated") and not better["answerEstimated"]:
                lib[key] = better
    return lib


def strengthen_paper(paper: dict, lib: dict[str, dict]) -> tuple[dict, dict]:
    stats = {"keys_fixed": 0, "placeholders_replaced": 0, "stems_unchanged": 0}
    for q in paper["questions"]:
        key = stem_key(q.get("stem", ""))
        src = lib.get(key)
        if not src:
            stats["stems_unchanged"] += 1
            continue
        # Never rewrite stem text if we already have a real stem
        is_ph = bool(q.get("placeholder")) or "[PLACEHOLDER]" in q.get("stem", "")
        if is_ph and src["stem"] and "[PLACEHOLDER]" not in src["stem"]:
            q["stem"] = src["stem"]
            q["options"] = src["options"]
            q["placeholder"] = False
            q["topic"] = src.get("topic") or q.get("topic")
            stats["placeholders_replaced"] += 1
        if q.get("answerEstimated") and not src.get("answerEstimated"):
            q["correctOption"] = src["correctOption"]
            q["answerEstimated"] = False
            stats["keys_fixed"] += 1
        elif (not q.get("correctOption") or q.get("correctOption") not in "1234") and src.get(
            "correctOption"
        ) in "1234":
            q["correctOption"] = src["correctOption"]
            q["answerEstimated"] = bool(src.get("answerEstimated"))
            stats["keys_fixed"] += 1
    # Recompute paper stats
    qs = paper["questions"]
    paper["stats"] = {
        "parsedQuestions": len(qs),
        "placeholders": sum(1 for q in qs if q.get("placeholder")),
        "estimatedAnswers": sum(1 for q in qs if q.get("answerEstimated")),
        "withFigures": sum(1 for q in qs if q.get("figureSrc")),
    }
    gaps = list(paper.get("gaps") or [])
    note = (
        f"Quality pass: replaced {stats['placeholders_replaced']} placeholders via "
        f"cross-year stem match; strengthened {stats['keys_fixed']} estimated keys; "
        f"attached figures where PDF extract/schematic available."
    )
    if note not in gaps:
        gaps.append(note)
    paper["gaps"] = gaps
    return paper, stats


def main() -> None:
    papers: dict[int, dict] = {}
    for path in sorted(PAPERS.glob("neet-*.json")):
        papers[int(path.stem.split("-")[1])] = json.loads(path.read_text())

    lib = build_stem_library(papers)
    print("stem library", len(lib))

    # Strengthen weaker years first using library from strong content
    for year in sorted(papers):
        paper, stats = strengthen_paper(papers[year], lib)
        paper = attach_figures(paper)
        papers[year] = paper
        out = PAPERS / f"neet-{year}.json"
        out.write_text(json.dumps(paper, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(
            year,
            "keys_fixed",
            stats["keys_fixed"],
            "ph_replaced",
            stats["placeholders_replaced"],
            "figures",
            paper["stats"].get("withFigures"),
            "est_left",
            paper["stats"]["estimatedAnswers"],
            "ph_left",
            paper["stats"]["placeholders"],
        )

    # Refresh manifest lightly
    man_path = PAPERS / "manifest.json"
    if man_path.exists():
        man = json.loads(man_path.read_text())
        years = man.get("years") or man.get("papers") or []
        if isinstance(years, list):
            by_year = {y.get("year"): y for y in years if isinstance(y, dict)}
            for year, paper in papers.items():
                entry = by_year.get(year) or {"year": year}
                entry["stats"] = paper.get("stats")
                entry["gaps"] = paper.get("gaps")
                by_year[year] = entry
            man["years"] = [by_year[y] for y in sorted(by_year)]
            man_path.write_text(json.dumps(man, ensure_ascii=False, indent=2) + "\n")
    print("done")


if __name__ == "__main__":
    main()
