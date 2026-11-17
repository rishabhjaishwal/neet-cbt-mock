#!/usr/bin/env python3
"""
Fix NEET paper subject labels and order.

1) Score each stem for Physics / Chemistry / Biology.
2) Detect the paper's native subject-block order from high-confidence hits.
3) Slice contiguous quotas in that native order (by original Q number).
4) Emit Physics → Chemistry → Biology with fresh contiguous numbers + sections.
Keeps question `id` / figureSrc stable.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from statistics import median

ROOT = Path(__file__).resolve().parents[1]
PAPERS = ROOT / "data" / "papers"

PHYS_RE = [
    (re.compile(p, re.I), w)
    for p, w in [
        (r"\b(capacitor|inductor|resistor|lcr|lc circuit|impedance|galvanometer|potentiometer|transformer|solenoid)\b", 5),
        (r"\b(electric field|magnetic field|magnetic flux|faraday|lenz|emf|rms|ampere|volt)\b", 4),
        (r"\b(photoelectric|de-?broglie|photon|compton|planck|stefan|wien)\b", 5),
        (r"\b(lens|mirror|prism|focal length|refraction|diffraction|interference|polarisation|polarization)\b", 5),
        (r"\b(spectral lines?|balmer|lyman|paschen|wavelength|wave number|rydberg)\b", 5),
        (r"\b(solid angle|dimensions as those of|dimensional formula|same dimensions)\b", 5),
        (r"\b(screw gauge|vernier|least count|pitch of)\b", 5),
        (r"\b(radius of gyration|moment of inertia|angular velocity|centripetal)\b", 4),
        (r"\b(young.?s double slit|double slit experiment|monochromatic source)\b", 6),
        (r"\b(work function|caesium|cesium|photoelectrons?)\b", 5),
        (r"\b(particle moving in a circle|uniform speed takes a time|period of revolution)\b", 5),
        (r"\b(water falls from a height|operate a turbine|hydroelectric)\b", 5),
        (r"\b(half life of a radioactive|radioactive substance)\b", 5),
        (r"\b(adiabatic|isothermal|carnot|thermodynamic|pv diagram|entropy increases)\b", 4),
        (r"\b(simple pendulum|shm|angular momentum|torque|projectile|gravitational)\b", 4),
        (r"\b(young.?s modulus|surface tension|viscosity|bernoulli|doppler|ultrasonic)\b", 4),
        (r"\b(radioactiv|nuclear|alpha-?particle|wave equation)\b", 4),
        (r"\b(semiconductor|diode|logic gate|black.?body)\b", 4),
        (r"\b(velocity|acceleration|momentum|kinetic energy|friction|oscillat|rolling|wheel)\b", 3),
        (r"\b(ohm|henry|farad|tesla|weber|newton|joule|watt)\b", 2),
        (r"bullock cart|linear speed|point p moves|point q", 6),
        (r"non-reflecting surface|average flux of 20\s*w", 6),
        (r"cylinder contains hydrogen gas at pressure", 5),
        (r"phase difference between displacement and acceleration", 6),
        (r"toy car with charge|frictionless horizontal plane", 5),
        (r"metallic rod of mass per unit length", 5),
        (r"carbon resistor.*(kΩ|kohm|kω)", 5),
        (r"uniform circular disc of radius", 5),
        (r"uniform rope of length L and mass", 5),
        (r"electron falls from rest through a vertical distance", 6),
        (r"tuning fork.*resonance.*glass tube", 6),
        (r"wire of length L, area of cross section", 5),
        (r"cup of coffee cools", 4),
        (r"potentiometer circuit a cell of emf", 6),
        (r"infinitely long straight conductor carries a current", 6),
        (r"terminal voltage of the battery", 5),
        (r"iron bar of length L has magnetic moment", 5),
        (r"electromagnetic wave travelling", 5),
        (r"mass of the bob in a simple pendulum", 5),
        (r"siren emitting a sound of frequency", 5),
        (r"thin spherical shell is charged", 5),
        (r"horizontal force 10 n is applied to a block", 5),
        (r"light ray enters through a right angled prism", 5),
        (r"bar magnet is moving towards solenoid", 5),
    ]
]

CHEM_RE = [
    (re.compile(p, re.I), w)
    for p, w in [
        (r"\b(benzene|huckel|phenol|alkane|alkene|alkyne|aldehyde|ketone|carboxylic|amine|amide|grignard)\b", 5),
        (r"\b(sn1|sn2|electrophilic|nucleophilic|hybridis|hybridiz|orbital|electronegativ)\b", 4),
        (r"\b(coordination|ligand|crystal field|werner|[Cc]omplex(?:es)?)\b", 4),
        (r"\b(pH|buffer|titration|colligative|raoult|henry.?s law|van der waals)\b", 5),
        (r"\b(enthalpy|gibbs|hess.?s|lattice energy|bond enthalpy)\b", 4),
        (r"\b(mole|molarity|molality|stoichiometr|empirical formula)\b", 3),
        (r"\b(periodic table|lanthanoid|actinoid|isotope)\b", 3),
        (r"\b(electrolysis|electrode potential|nernst|redox reaction)\b", 4),
        (r"\b(benzoic acid|hinsberg|fcc|bcc|unit cell|centimolar)\b", 5),
        (r"\b(spin only.?magnetic moment|\[co\(|\[cof6)\b", 5),
        (r"ohm–1 cm–1|ohm-1 cm-1|conductivity of centimolar", 5),
        (r"reaction that does not give benzoic acid", 6),
        (r"alkali metal chloride \(mcl\)", 5),
        (r"freezing point depression constant", 6),
        (r"which reaction is not a redox reaction", 6),
        (r"following solutions were prepared by mixing different volumes of naoh", 5),
        (r"two polypeptides of human insulin are linked", 0),  # bio
    ]
]

BIO_RE = [
    (re.compile(p, re.I), w)
    for p, w in [
        (r"\b(mitosis|meiosis|organelle|nucleolus|ribosom|mitochondri|chloroplast)\b", 6),
        (r"\b(dna|rna|mrna|gene|allele|chromosome|transcription|translation|mendel)\b", 6),
        (r"\b(photosynthesis|calvin|stomata|xylem|phloem|auxin|gibberellin|cytokinin)\b", 6),
        (r"\b(nephron|kidney|neuron|hormone|thyroid|parathyroid|antibody|immunity)\b", 6),
        (r"\b(ecosystem|species|population|evolution|darwin|niche|marsupial)\b", 5),
        (r"\b(flower|pollen|ovule|seed|angiosperm|gymnosperm|bryophyte)\b", 5),
        (r"\b(blood group|progeny|zygote|gamete|fertilization|embryo)\b", 5),
        (r"\b(icbn|taxon|phylum|kingdom|nomenclature)\b", 6),
        (r"\b(pcr|plasmid|restriction enzyme|rnai|cloning|biotech)\b", 5),
        (r"\b(hutch and slack|c4 pathway|tricarboxylic|lecithin|weed-?free lawns)\b", 6),
        (r"\b(secretory cells|nucleoplasmic|70 s ribosom|cladophora|azotobacter)\b", 6),
        (r"\b(erythropoiesis|gastric cells|inheritance of blood)\b", 6),
        (r"\b(plant growth regulator|sugarcane|loss of water in liquid)\b", 5),
        (r"\b(anatomical features|essential elements and their functions in plants)\b", 6),
        (r"\b(antibodies to neutralize pathogens|acquired immune)\b", 6),
        (r"cell organelles is present in the highest number", 6),
        (r"match the following diseases with the causative organism", 6),
        (r"out of the following options which one.*propagat", 4),
        (r"auxin is used by gardeners", 6),
    ]
]

PLACEHOLDER = re.compile(r"\[PLACEHOLDER\]|could not be recovered", re.I)
CONF_THRESHOLD = 3.0


def weighted_hits(patterns: list, text: str) -> float:
    return float(sum(w for rx, w in patterns if rx.search(text)))


def score_all(stem: str) -> dict[str, float]:
    t = stem or ""
    return {
        "Physics": weighted_hits(PHYS_RE, t),
        "Chemistry": weighted_hits(CHEM_RE, t),
        "Biology": weighted_hits(BIO_RE, t),
    }


def best_subject(stem: str) -> tuple[str | None, float, float]:
    if PLACEHOLDER.search(stem or ""):
        return None, 0.0, 0.0
    sc = score_all(stem)
    ordered = sorted(sc.items(), key=lambda kv: kv[1], reverse=True)
    best_s, best_v = ordered[0]
    second_v = ordered[1][1]
    if best_v < CONF_THRESHOLD:
        return None, best_v, best_v - second_v
    return best_s, best_v, best_v - second_v


def structure_for(year: int, total: int) -> str:
    if total >= 200 or year >= 2021:
        return "section-ab-200"
    return "classic-180"


def quotas_for(structure: str) -> dict[str, int]:
    if structure == "classic-180":
        return {"Physics": 45, "Chemistry": 45, "Biology": 90}
    return {"Physics": 50, "Chemistry": 50, "Biology": 100}


def assign_section(structure: str, subject: str, index_in_subject: int) -> str:
    if structure == "classic-180":
        return "A"
    if subject in ("Physics", "Chemistry"):
        return "A" if index_in_subject < 35 else "B"
    if index_in_subject < 35:
        return "A"
    if index_in_subject < 50:
        return "B"
    if index_in_subject < 85:
        return "A"
    return "B"


TOPIC_HINTS = {
    "Physics": [
        (r"photoelectric|photon|quantum|de-?broglie", "Modern Physics"),
        (r"nuclear|radioactiv|alpha", "Nuclear Physics"),
        (r"lens|mirror|optics|prism|refraction", "Optics"),
        (r"circuit|capacitor|current|magnetic|emf|lcr|potentiometer", "Electromagnetism"),
        (r"thermo|entropy|adiabatic|heat|coffee cools", "Thermodynamics"),
        (r"wave|sound|doppler|shm|oscillat|siren", "Waves & Oscillations"),
        (r"force|motion|momentum|torque|gravitat|friction|rolling|wheel|pendulum", "Mechanics"),
    ],
    "Chemistry": [
        (r"alkane|alkene|benzene|alcohol|amine|organic|benzoic", "Organic Chemistry"),
        (r"coordination|ligand|periodic|atomic|complex", "Inorganic Chemistry"),
        (r"thermo|enthalpy|equilibrium|kinetics|solution|colligative|electro|redox|pH", "Physical Chemistry"),
    ],
    "Biology": [
        (r"gene|dna|rna|mendel|allele|biotech|pcr", "Genetics & Biotech"),
        (r"plant|photosynthesis|stomata|flower|seed|auxin", "Botany"),
        (r"human|blood|heart|kidney|hormone|neuron|immunity", "Human Physiology"),
        (r"cell|mitosis|meiosis|organelle|tissue", "Cell Biology"),
        (r"ecosystem|evolution|species|population", "Ecology & Evolution"),
    ],
}


def infer_topic(subject: str, stem: str) -> str:
    for pattern, topic in TOPIC_HINTS.get(subject, []):
        if re.search(pattern, stem or "", re.I):
            return topic
    return f"{subject} General"


def detect_native_order(questions: list[dict]) -> list[str]:
    """Return subject order as they appear in the source paper (by Q number)."""
    hits: dict[str, list[int]] = {"Physics": [], "Chemistry": [], "Biology": []}
    for q in questions:
        subj, val, _ = best_subject(q.get("stem", ""))
        if subj:
            hits[subj].append(int(q["number"]))
    medians = {}
    for s, nums in hits.items():
        if nums:
            medians[s] = median(nums)
    if len(medians) < 2:
        return ["Physics", "Chemistry", "Biology"]
    return sorted(medians.keys(), key=lambda s: medians[s])


def process_paper(path: Path) -> dict:
    paper = json.loads(path.read_text())
    year = paper["year"]
    qs = sorted(paper["questions"], key=lambda q: q.get("number", 0))
    total = len(qs)
    structure = structure_for(year, total)
    quotas = quotas_for(structure)
    assert sum(quotas.values()) == total

    native = detect_native_order(qs)
    for s in ("Physics", "Chemistry", "Biology"):
        if s not in native:
            native.append(s)

    nta = ["Physics", "Chemistry", "Biology"]
    slices: dict[str, list[dict]] = {s: [] for s in nta}

    if native[:3] == nta:
        # Paper already in NTA order — keep positional blocks, repair in place.
        idx = 0
        for subj in nta:
            need = quotas[subj]
            slices[subj] = qs[idx : idx + need]
            idx += need
    else:
        # Source booklet ordered differently — slice by native order, then remap.
        idx = 0
        native_slices: dict[str, list[dict]] = {}
        for subj in native:
            need = quotas[subj]
            native_slices[subj] = qs[idx : idx + need]
            idx += need
        slices = native_slices

    repair_swaps = repair_blocks(slices, quotas)

    # Emit NTA display order Physics → Chemistry → Biology
    ordered: list[dict] = []
    n = 1
    match_scores = []
    for subj in ("Physics", "Chemistry", "Biology"):
        block = slices[subj]
        for i, q in enumerate(block):
            q = dict(q)
            q["number"] = n
            q["subject"] = subj
            q["section"] = assign_section(structure, subj, i)
            q["topic"] = infer_topic(subj, q.get("stem", ""))
            sc = score_all(q.get("stem", "")).get(subj, 0)
            match_scores.append(sc)
            ordered.append(q)
            n += 1

    paper["questions"] = ordered
    paper["structure"] = structure
    paper["totalQuestions"] = len(ordered)
    paper["stats"] = paper.get("stats") or {}
    paper["stats"]["subjectOrder"] = "Physics→Chemistry→Biology"
    paper["stats"]["nativePaperOrder"] = "→".join(native)
    paper["stats"]["subjectCounts"] = {
        s: sum(1 for q in ordered if q["subject"] == s) for s in ("Physics", "Chemistry", "Biology")
    }
    paper["stats"]["subjectMatchAvgScore"] = round(sum(match_scores) / max(len(match_scores), 1), 2)
    paper["stats"]["subjectRepairSwaps"] = repair_swaps
    gaps = [g for g in (paper.get("gaps") or []) if "Subject order fix" not in str(g)]
    gaps.append(
        f"Subject order fix v3: native order {paper['stats']['nativePaperOrder']}; "
        f"display Physics→Chemistry→Biology; swaps={repair_swaps}."
    )
    paper["gaps"] = gaps
    path.write_text(json.dumps(paper, ensure_ascii=False, indent=2) + "\n")
    return {
        "year": year,
        "native": native,
        "after": paper["stats"]["subjectCounts"],
        "avgScore": paper["stats"]["subjectMatchAvgScore"],
        "swaps": repair_swaps,
    }


def repair_blocks(slices: dict[str, list[dict]], quotas: dict[str, int]) -> int:
    """Swap only when a question confidently belongs elsewhere AND partner is a weak fit."""
    swaps = 0
    for _ in range(10):
        moved = False
        for subj, block in slices.items():
            for i, q in enumerate(list(block)):
                want, val, margin = best_subject(q.get("stem", ""))
                if not want or want == subj or val < CONF_THRESHOLD or margin < 1.5:
                    continue
                partner_idx = None
                partner_score = -1e9
                for j, p in enumerate(slices[want]):
                    pw, pv, pm = best_subject(p.get("stem", ""))
                    psc = score_all(p.get("stem", ""))
                    # Prefer partner that belongs in `subj`, else least loyal to `want`
                    if pw == subj and pv >= CONF_THRESHOLD:
                        score = 300 + pv + val
                    elif pw is None:
                        score = 120 + val
                    elif pw != want:
                        score = 150 + pv + val
                    else:
                        # Partner looks like `want` — only displace if current item is very strong
                        # and partner is the weakest `want` loyalty in the block
                        loyalty = psc.get(want, 0) - max(
                            psc.get(s, 0) for s in psc if s != want
                        )
                        score = (40 + val) - loyalty * 3
                    if score > partner_score:
                        partner_score = score
                        partner_idx = j
                if partner_idx is None:
                    continue
                if partner_score < 80 and val < 5.5:
                    continue
                slices[subj][i], slices[want][partner_idx] = (
                    slices[want][partner_idx],
                    slices[subj][i],
                )
                swaps += 1
                moved = True
        if not moved:
            break
    for subj in slices:
        slices[subj].sort(key=lambda q: q.get("number", 0))
    return swaps


def main() -> None:
    reports = []
    for year in range(2016, 2026):
        path = PAPERS / f"neet-{year}.json"
        if not path.exists():
            continue
        print("fixing", year, flush=True)
        reports.append(process_paper(path))
    (PAPERS / "subject-order-fix-report.json").write_text(json.dumps(reports, indent=2) + "\n")
    for r in reports:
        print(r)


if __name__ == "__main__":
    main()
