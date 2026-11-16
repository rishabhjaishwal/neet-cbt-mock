#!/usr/bin/env python3
"""Extract NEET UG papers from downloaded public PDFs into structured JSON."""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PDF_DIR = ROOT / "data" / "raw" / "pdfs"
OUT_DIR = ROOT / "data" / "papers"
META_PATH = OUT_DIR / "manifest.json"

# Published NEET UG appearance / registered figures (approx. from NTA public notices)
CANDIDATE_COUNTS = {
    2016: 731223,
    2017: 1138890,
    2018: 1326466,
    2019: 1519375,
    2020: 1597435,
    2021: 1614777,
    2022: 1872343,
    2023: 2087462,
    2024: 2406079,
    2025: 2209238,
}

TOPIC_HINTS = {
    "Physics": [
        (r"resist|circuit|current|ohm|capacitor|induct", "Current Electricity"),
        (r"magnet|flux|solenoid|ampere", "Magnetism"),
        (r"optics|lens|mirror|diffraction|interference|young", "Optics"),
        (r"photoelectric|de-?broglie|photon|quantum", "Modern Physics"),
        (r"radioactiv|half-?life|nuclear|alpha", "Nuclear Physics"),
        (r"motion|velocity|acceleration|projectile|newton", "Laws of Motion"),
        (r"work|energy|power|kinetic|potential", "Work Energy Power"),
        (r"thermodynam|heat|entropy|carnot|gas law", "Thermodynamics"),
        (r"wave|sound|frequency|siren|string", "Waves"),
        (r"gravitation|orbit|kepler|satellite", "Gravitation"),
        (r"semiconductor|diode|transistor|logic", "Semiconductor Electronics"),
        (r"rotat|torque|angular|gyration|moment of inertia", "Rotational Motion"),
    ],
    "Chemistry": [
        (r"organic|alkene|alcohol|phenol|amine|ester", "Organic Chemistry"),
        (r"periodic|ionization|electroneg", "Periodic Properties"),
        (r"equilibrium|ka |kb |buffer|ph\b", "Chemical Equilibrium"),
        (r"electrochem|cell|nernst|faraday", "Electrochemistry"),
        (r"thermo|enthalpy|entropy|gibbs", "Chemical Thermodynamics"),
        (r"kinetics|rate|order of reaction", "Chemical Kinetics"),
        (r"coordination|ligand|werner|crystal field", "Coordination Compounds"),
        (r"solution|molality|mole fraction|colligative", "Solutions"),
        (r"solid|lattice|unit cell|bragg", "Solid State"),
        (r"p-?block|halogen|noble|nitrogen family", "p-Block Elements"),
        (r"d-?block|transition|lanthan", "d- and f-Block"),
        (r"biomolecule|carbohydrate|protein|vitamin", "Biomolecules"),
    ],
    "Biology": [
        (r"photosynth|chloroplast|calvin|light reaction", "Photosynthesis"),
        (r"respirat|glycolysis|krebs|etc\b|mitochond", "Respiration"),
        (r"genetics|mendel|allele|linkage|dna|rna|gene", "Genetics"),
        (r"ecology|population|ecosystem|biodiversity", "Ecology"),
        (r"human.?reproduct|menstrual|follicle|ovary|sperm", "Human Reproduction"),
        (r"plant.?reproduct|flower|pollinat|seed", "Plant Reproduction"),
        (r"evolution|darwin|adaptive|speciation", "Evolution"),
        (r"cell|organelle|membrane|mitosis|meiosis", "Cell Biology"),
        (r"plant.?physiol|transpiration|hormone|auxin", "Plant Physiology"),
        (r"human.?physiol|heart|blood|neuron|digestion|excret", "Human Physiology"),
        (r"biotechnolog|pcr|restriction|plasmid|dna fingerprint", "Biotechnology"),
        (r"disease|pathogen|immunity|vaccine|malaria", "Human Health & Disease"),
        (r"diversity|taxonomy|kingdom|fungi|protista", "Diversity of Living Organisms"),
    ],
}


def run_pdftotext(pdf: Path, *, x: int | None = None, y: int | None = None, w: int | None = None, h: int | None = None) -> str:
    cmd = ["pdftotext", "-layout"]
    if x is not None:
        cmd += ["-x", str(x), "-y", str(y or 0), "-W", str(w or 400), "-H", str(h or 1200)]
    cmd += [str(pdf), "-"]
    return subprocess.check_output(cmd, text=True, errors="ignore")


def strip_noise(text: str) -> str:
    text = re.sub(r"(?m)^.*(?:www\.|PAGE|Page\s*-?\s*\d+|Corporate Office|Vedantu|Aakash|Resonance|Pre-Medical).*$", "", text)
    text = re.sub(r"(?m)^.*Sol\..*$", "", text)
    text = re.sub(r"[\u0900-\u097F]+", " ", text)  # Devanagari
    return text


def infer_topic(subject: str, stem: str) -> str:
    for pattern, topic in TOPIC_HINTS.get(subject, []):
        if re.search(pattern, stem, re.I):
            return topic
    return f"{subject} General"


def subject_for_year(year: int, number: int) -> tuple[str, str]:
    """Return (subject, section) matching that year's NEET structure."""
    if year <= 2020:
        # 45 Physics, 45 Chemistry, 90 Biology
        if number <= 45:
            return "Physics", "A"
        if number <= 90:
            return "Chemistry", "A"
        return "Biology", "A"
    # 2021–2024 style: 50 per subject with A/B (Physics 1-50, Chem 51-100, Bio 101-200)
    if number <= 50:
        return "Physics", "A" if number <= 35 else "B"
    if number <= 100:
        return "Chemistry", "A" if number <= 85 else "B"
    if number <= 150:
        return "Biology", "A" if number <= 135 else "B"
    return "Biology", "A" if number <= 185 else "B"


def parse_blocks(text: str) -> list[dict]:
    text = strip_noise(text)
    # Normalize Answer variants
    text = re.sub(r"Answer\s*\(\s*([1-4])\s*\*?\)", r"Ans (\1)", text, flags=re.I)
    text = re.sub(r"Ans\s*\.?\s*\(?\s*([1-4])\s*\)?", r"Ans (\1)", text, flags=re.I)

    parts = re.split(r"(?m)(?=^\s*\d{1,3}\.\s+)", text)
    questions: dict[int, dict] = {}
    for part in parts:
        m = re.match(r"\s*(\d{1,3})\.\s+(.*)", part, re.S)
        if not m:
            continue
        num = int(m.group(1))
        if num < 1 or num > 200:
            continue
        body = m.group(2)
        ans_m = re.search(r"Ans\s*\(\s*([1-4])\s*\)", body, re.I)
        answer = ans_m.group(1) if ans_m else None
        qpart = re.split(r"Ans\s*\(", body, maxsplit=1, flags=re.I)[0]

        option_matches = list(re.finditer(r"\(([1-4])\)\s*", qpart))
        options: dict[str, str] = {}
        stem = qpart.strip()
        if len(option_matches) >= 4:
            # Prefer the last contiguous quartet 1..4
            best = None
            for i in range(len(option_matches) - 3):
                chunk = option_matches[i : i + 4]
                labels = [c.group(1) for c in chunk]
                if labels == ["1", "2", "3", "4"]:
                    best = chunk
            markers = best or option_matches[-4:]
            for i, mm in enumerate(markers):
                start = mm.end()
                end = markers[i + 1].start() if i + 1 < len(markers) else len(qpart)
                opt = re.sub(r"\s+", " ", qpart[start:end]).strip(" \n\t-–—")
                opt = re.sub(r"^\d+\.\s+.*", "", opt).strip()
                if len(opt) > 400:
                    opt = opt[:400].rsplit(" ", 1)[0]
                options[mm.group(1)] = opt or f"Option {mm.group(1)}"
            stem = re.sub(r"\s+", " ", qpart[: markers[0].start()]).strip()
        else:
            stem = re.sub(r"\s+", " ", stem).strip()

        if len(stem) < 12:
            continue
        # Drop instruction-like stems
        if re.search(r"test booklet|important instructions|answer sheet", stem, re.I):
            continue

        # Ensure 4 options
        for k in ["1", "2", "3", "4"]:
            options.setdefault(k, f"[Option {k} incomplete in source PDF]")

        prev = questions.get(num)
        cand = {"number": num, "stem": stem, "options": options, "answer": answer}
        if not prev or (answer and not prev.get("answer")) or len(stem) > len(prev["stem"]):
            questions[num] = cand
    return [questions[k] for k in sorted(questions)]


def year_config(year: int) -> dict:
    if year <= 2020:
        return {
            "durationMinutes": 180,
            "totalQuestions": 180,
            "attemptLimit": 180,
            "structure": "classic-180",
            "sections": [
                {"subject": "Physics", "start": 1, "end": 45, "compulsory": True},
                {"subject": "Chemistry", "start": 46, "end": 90, "compulsory": True},
                {"subject": "Biology", "start": 91, "end": 180, "compulsory": True},
            ],
        }
    return {
        "durationMinutes": 200,
        "totalQuestions": 200,
        "attemptLimit": 180,
        "structure": "section-ab-200",
        "sections": [
            {"subject": "Physics", "section": "A", "start": 1, "end": 35, "compulsory": True},
            {"subject": "Physics", "section": "B", "start": 36, "end": 50, "attemptAny": 10},
            {"subject": "Chemistry", "section": "A", "start": 51, "end": 85, "compulsory": True},
            {"subject": "Chemistry", "section": "B", "start": 86, "end": 100, "attemptAny": 10},
            {"subject": "Biology", "section": "A", "start": 101, "end": 135, "compulsory": True},
            {"subject": "Biology", "section": "B", "start": 136, "end": 150, "attemptAny": 10},
            {"subject": "Biology", "section": "A", "start": 151, "end": 185, "compulsory": True},
            {"subject": "Biology", "section": "B", "start": 186, "end": 200, "attemptAny": 10},
        ],
    }


def finalize(year: int, code: str, source: str, raw_qs: list[dict], gaps: list[str]) -> dict:
    cfg = year_config(year)
    target = cfg["totalQuestions"]
    by_num = {q["number"]: q for q in raw_qs}
    questions = []
    missing_ans = 0
    missing_opts = 0
    for n in range(1, target + 1):
        subject, section = subject_for_year(year, n)
        q = by_num.get(n)
        if not q:
            gaps.append(f"Q{n} missing from parse; placeholder inserted")
            q = {
                "number": n,
                "stem": f"[PLACEHOLDER] NEET {year} Question {n} could not be recovered from the public PDF text extract. Replace after manual transcription.",
                "options": {
                    "1": "Placeholder option 1",
                    "2": "Placeholder option 2",
                    "3": "Placeholder option 3",
                    "4": "Placeholder option 4",
                },
                "answer": "1",
                "placeholder": True,
            }
        opts_ok = all(not str(v).startswith("[Option") for v in q["options"].values())
        if not opts_ok:
            missing_opts += 1
        if not q.get("answer"):
            missing_ans += 1
            # deterministic fallback so scoring works; flagged in gaps
            q["answer"] = str(((n - 1) % 4) + 1)
            q["answerEstimated"] = True
        questions.append(
            {
                "id": f"{year}-{code}-Q{n}",
                "number": n,
                "subject": subject,
                "section": section,
                "topic": infer_topic(subject, q["stem"]),
                "stem": q["stem"],
                "options": q["options"],
                "correctOption": q["answer"],
                "placeholder": bool(q.get("placeholder")),
                "answerEstimated": bool(q.get("answerEstimated")),
            }
        )
    if missing_ans:
        gaps.append(f"{missing_ans} answers estimated (no Ans/Answer marker in source extract)")
    if missing_opts:
        gaps.append(f"{missing_opts} questions had incomplete options in PDF extract")
    placeholders = sum(1 for q in questions if q["placeholder"])
    return {
        "year": year,
        "code": code,
        "title": f"NEET UG {year} ({code})",
        "source": source,
        "candidateCount": CANDIDATE_COUNTS.get(year, 2000000),
        "marking": {"correct": 4, "wrong": -1, "unattempted": 0},
        **cfg,
        "gaps": gaps,
        "stats": {
            "parsedQuestions": len(raw_qs),
            "placeholders": placeholders,
            "estimatedAnswers": sum(1 for q in questions if q.get("answerEstimated")),
        },
        "questions": questions,
    }


SOURCES = [
    {
        "year": 2016,
        "code": "Phase1",
        "pdf": "NEET2016_Phase1.pdf",
        "mode": "full",
        "note": "Public mirror PDF (Shabber10/ALL-PYQ-Papers Phase1)",
    },
    {
        "year": 2017,
        "code": "A",
        "pdf": "NEET2017_A.pdf",
        "mode": "full",
        "note": "Vedantu-style solved public PDF (code A)",
    },
    {
        "year": 2018,
        "code": "AA",
        "pdf": "NEET2018_main.pdf",
        "mode": "right",
        "note": "Public NEET 2018 paper+key mirror",
    },
    {
        "year": 2019,
        "code": "G1",
        "pdf": "NEET2019_G1.pdf",
        "mode": "full",
        "note": "Resonance public solution booklet code G1",
    },
    {
        "year": 2020,
        "code": "E1",
        "pdf": "NEET2020_E1.pdf",
        "mode": "right",
        "note": "Official-style Hindi+English booklet; English column cropped",
    },
    {
        "year": 2021,
        "code": "M1",
        "pdf": "NEET2021_M1.pdf",
        "mode": "right",
        "note": "Public Hindi+English booklet code M1; English column cropped",
    },
    {
        "year": 2023,
        "code": "F1",
        "pdf": "TRY_NEET2023_F1.pdf",
        "mode": "full",
        "note": "Aakash public Q&A booklet NEET UG 2023 code F1",
    },
    {
        "year": 2024,
        "code": "R1",
        "pdf": "TRY_NEET2024_R1.pdf",
        "mode": "full",
        "note": "Aakash public answers & solutions NEET UG 2024 code R1",
    },
]


def extract_for(src: dict) -> tuple[list[dict], list[str]]:
    pdf = PDF_DIR / src["pdf"]
    gaps: list[str] = []
    if not pdf.exists():
        return [], [f"PDF missing: {pdf.name}"]
    if src["mode"] == "right":
        # Try a few crop widths; pick richest parse
        best: list[dict] = []
        for x in (280, 300, 320, 250):
            text = run_pdftotext(pdf, x=x, y=0, w=420, h=1200)
            qs = parse_blocks(text)
            if len(qs) > len(best):
                best = qs
        if len(best) < 100:
            # fallback full text
            qs = parse_blocks(run_pdftotext(pdf))
            if len(qs) > len(best):
                best = qs
                gaps.append("Right-column crop weak; fell back to full-page text")
        return best, gaps
    text = run_pdftotext(pdf)
    return parse_blocks(text), gaps


def build_2022_from_neighbors() -> dict:
    """2022 official booklet in mirror was a sample ebook, not the paper.
    Build a structured 200-Q paper from overlapping public PYQs (2019/2021/2023)
    clearly marked as reconstructed."""
    gaps = [
        "Official 2022 booklet in ALL-PYQ-Papers 'main' is a Career360 sample ebook, not NTA paper.",
        "2022 paper reconstructed from adjacent-year public PYQ extracts (2019, 2021, 2023) with NEET 2022 structure.",
    ]
    pool: list[dict] = []
    for y in (2019, 2021, 2023):
        path = OUT_DIR / f"neet-{y}.json"
        if path.exists():
            data = json.loads(path.read_text())
            pool.extend([q for q in data["questions"] if not q.get("placeholder")])
    # diversify by subject
    selected = []
    used = set()
    for subject in ("Physics", "Chemistry", "Biology"):
        need = 50 if subject != "Biology" else 100
        got = [q for q in pool if q["subject"] == subject and q["stem"] not in used]
        for q in got[:need]:
            used.add(q["stem"])
            selected.append(q)
    # pad if short
    while len(selected) < 200 and pool:
        for q in pool:
            if q["stem"] not in used:
                used.add(q["stem"])
                selected.append(q)
            if len(selected) >= 200:
                break
    raw = []
    for i, q in enumerate(selected[:200], start=1):
        raw.append(
            {
                "number": i,
                "stem": q["stem"],
                "options": q["options"],
                "answer": q["correctOption"],
            }
        )
    return finalize(2022, "RECON", "Reconstructed from public adjacent-year PYQs", raw, gaps)


def build_2025_placeholder_with_ocr_note() -> dict:
    gaps = [
        "NEET 2025 PDFs in public mirrors are scanned image-only (no extractable text).",
        "OCR of cover pages succeeded but full-booklet OCR quality was insufficient for reliable MCQ parsing in this build.",
        "Paper scaffold uses 2024 parsed items reshaped to 2025 pattern as interim content; replace with official transcription.",
    ]
    path = OUT_DIR / "neet-2024.json"
    raw = []
    if path.exists():
        data = json.loads(path.read_text())
        for i, q in enumerate(data["questions"][:200], start=1):
            raw.append({"number": i, "stem": q["stem"], "options": q["options"], "answer": q["correctOption"]})
    return finalize(2025, "INTERIM", "Interim content pending 2025 OCR/transcription", raw, gaps)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = []
    for src in SOURCES:
        print(f"Building {src['year']}...")
        qs, gaps = extract_for(src)
        gaps = list(gaps)
        gaps.append(f"Source: {src['note']}")
        paper = finalize(src["year"], src["code"], src["note"], qs, gaps)
        out = OUT_DIR / f"neet-{src['year']}.json"
        out.write_text(json.dumps(paper, ensure_ascii=False, indent=2))
        print(
            f"  -> {out.name}: parsed={paper['stats']['parsedQuestions']} placeholders={paper['stats']['placeholders']} estAns={paper['stats']['estimatedAnswers']}"
        )
        manifest.append(
            {
                "year": src["year"],
                "code": src["code"],
                "file": out.name,
                "stats": paper["stats"],
                "gaps": paper["gaps"],
                "candidateCount": paper["candidateCount"],
            }
        )

    # Depend on prior outputs
    paper22 = build_2022_from_neighbors()
    (OUT_DIR / "neet-2022.json").write_text(json.dumps(paper22, ensure_ascii=False, indent=2))
    manifest.append(
        {
            "year": 2022,
            "code": paper22["code"],
            "file": "neet-2022.json",
            "stats": paper22["stats"],
            "gaps": paper22["gaps"],
            "candidateCount": paper22["candidateCount"],
        }
    )
    print(f"  -> neet-2022.json reconstructed")

    paper25 = build_2025_placeholder_with_ocr_note()
    (OUT_DIR / "neet-2025.json").write_text(json.dumps(paper25, ensure_ascii=False, indent=2))
    manifest.append(
        {
            "year": 2025,
            "code": paper25["code"],
            "file": "neet-2025.json",
            "stats": paper25["stats"],
            "gaps": paper25["gaps"],
            "candidateCount": paper25["candidateCount"],
        }
    )
    print(f"  -> neet-2025.json interim")

    manifest.sort(key=lambda x: x["year"])
    META_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    print("Wrote", META_PATH)


if __name__ == "__main__":
    main()
