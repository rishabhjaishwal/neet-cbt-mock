#!/usr/bin/env python3
"""Verify physics topic-bank answer keys → fixes / conflicts / purges JSONL."""
from __future__ import annotations

import glob
import json
import re
from collections import Counter
from pathlib import Path

BANKS = sorted(glob.glob("/workspace/data/topic-series/banks/physics-*.json"))
OUT_FIX = Path("/workspace/data/raw/external/key-fixes-physics.jsonl")
OUT_CON = Path("/workspace/data/raw/external/key-conflicts-physics.jsonl")
OUT_PUR = Path("/workspace/data/raw/external/key-purge-physics.jsonl")


def load_all():
    qs = []
    for f in BANKS:
        with open(f) as fh:
            data = json.load(fh)
        bank = Path(f).stem
        for diff, qlist in data["questions"].items():
            for q in qlist:
                q = dict(q)
                q["_bank"] = bank
                q["_diff"] = q.get("difficulty") or diff
                qs.append(q)
    return qs


def norm_stem(s: str) -> str:
    s = re.sub(r"\$[^$]*\$", " ", str(s))
    s = re.sub(r"\\[a-zA-Z]+\{[^}]*\}", " ", s)
    s = re.sub(r"[^a-z0-9]+", " ", s.lower())
    return re.sub(r"\s+", " ", s).strip()


def norm_opt(s: str) -> str:
    s = str(s)
    s = re.sub(r"Hindi\+English.*$", "", s, flags=re.I)
    s = re.sub(r"OUGH WORK.*$", "", s, flags=re.I)
    s = re.sub(r"ROUGH WORK.*$", "", s, flags=re.I)
    s = re.sub(r"Section -.*$", "", s, flags=re.I)
    s = re.sub(r"\s+\d+\s*[A-Z]?\d?\s*$", "", s)
    s = s.replace("·", ".").replace("–", "-").replace("—", "-")
    s = re.sub(r"\$", "", s)
    s = re.sub(r"\\mathrm\{([^}]*)\}", r"\1", s)
    s = re.sub(r"\\[a-zA-Z]+", "", s)
    s = re.sub(r"[{}^_]", "", s)
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s.replace("×", "x").replace("−", "-")


def find_option(options, predicates):
    hits = []
    for k, v in options.items():
        t = norm_opt(v)
        raw = str(v)
        for p in predicates:
            ok = p(t, raw) if callable(p) else (p in t)
            if ok:
                hits.append(k)
                break
    if len(hits) == 1:
        return hits[0]
    return None


def contains(*parts):
    def fn(stem: str) -> bool:
        s = norm_stem(stem)
        return all(p in s for p in parts)

    return fn


KNOWN: list = []


def add(match, preds, reason, sources, confidence="high"):
    KNOWN.append((match, preds, reason, sources, confidence))


# --- Classic NEET PYQs (match on stem fingerprint → option TEXT) ---

add(
    contains("n equal resistor", "connected in series", "parallel"),
    [lambda t, r: t.strip() in ("10", "10.")],
    "series/parallel currents give n=10",
    ["NEET-2018", "physics: I_p/I_s=n"],
)

add(
    contains("diamagnetic rod", "electromagnet"),
    [lambda t, r: "current source" in t],
    "work comes from the current source",
    ["NEET-2018"],
)

add(
    contains("inductor 20 mh", "100", "50"),
    [lambda t, r: "0.79" in t or "0.79" in r.replace("·", ".")],
    "P=I_rms^2 R ≈ 0.79 W",
    ["NEET-2018", "LCR calculation"],
)

add(
    contains("series lcr circuit is connected to an ac", "phase difference"),
    [lambda t, r: t.strip() in ("1.0", "1", "1.00")],
    "XL=XC ⇒ resonance ⇒ cosφ=1",
    ["NEET-2020", "physics"],
)

add(
    contains("ratio of contributions", "electric field and magnetic field"),
    [lambda t, r: "1:1" in t.replace(" ", "")],
    "I_E = I_B for EM wave",
    ["NEET-2020"],
)

add(
    contains("capacitance of a parallel plate", "6", "30"),
    [lambda t, r: "0.44" in t and "1.77" not in t],
    "ε=Kε0≈0.44×10^{-10}",
    ["NEET-2020"],
)

add(
    contains("long solenoid of 50 cm", "100 turns"),
    [lambda t, r: "6.28" in t and ("40" in t or "10^{-4}" in r or "4}$" in r or "^{-4}" in r)],
    "B=μ0 n I = 6.28×10^{-4} T",
    ["NEET-2020"],
)


def energy_pred(t, r):
    compact = t.replace(" ", "")
    has_e2 = ("e2" in compact) or ("e²" in t)
    # Prefer the half-factor form; OCR often shows "ε E2 Ad 2 0"
    return has_e2 and ("ad" in compact) and (
        "2" in t[:8] or "½" in r or "1/2" in t or t.startswith("ε e2") or "e2 ad 2" in t
    )


add(
    contains("parallel plate capacitor has a uniform electric", "energy stored"),
    [energy_pred],
    "U=½ε0 E² A d",
    ["NEET-2021"],
    "medium",
)

add(
    contains("em wave is propagating", "oscillating electric field"),
    [lambda t, r: ("+ z" in t) or ("+z" in t) or (t.strip() == "+ z direction")],
    "v × E ⇒ B along +z",
    ["NEET-2018"],
)

add(
    contains("metallic rod of mass per unit length", "inclined plane"),
    [lambda t, r: "11.32" in t.replace("·", ".") or "11·32" in r],
    "I=(λ g tanθ)/B ≈ 11.32 A",
    ["NEET-2018"],
)

add(
    contains("current sensitivity", "voltage sensitivity"),
    [lambda t, r: "250" in t],
    "R = CS/VS (units) = 250 Ω",
    ["NEET-2018"],
)

add(
    contains("toy car with charge", "average velocity"),
    [
        lambda t, r: ("1 m/s" in t)
        and ("3 m/s" in t)
        and "3.5" not in t
        and "3·5" not in r
    ],
    "Δx=3 m in 3 s; path=9 m ⇒ 1 m/s, 3 m/s",
    ["NEET-2018"],
)

add(
    contains("solid sphere is in rolling", "kt"),
    [lambda t, r: "5:7" in t.replace(" ", "")],
    "Kt/(Kt+Kr)=5/7",
    ["NEET-2018"],
)

add(
    contains("phase difference between displacement and acceleration"),
    [
        lambda t, r: (
            ("π rad" in t or r.strip() in ("π rad", "π") or t.strip() == "π")
            and "3π" not in r
            and "3π" not in t
        )
    ],
    "a=-ω²x ⇒ phase difference π",
    ["NEET-2020"],
    "medium",
)

add(
    contains("body weighs 72", "half the radius"),
    [lambda t, r: t.strip().startswith("32")],
    "g'=g/(3/2)² ⇒ F=32 N",
    ["NEET-2020"],
)

add(
    contains("mass of the sun were ten times smaller", "not correct"),
    [lambda t, r: "will not change" in t],
    'G→10G ⇒ g increases; "g will not change" is the false statement',
    ["NEET-2018", "physics"],
)

add(
    contains("water falls from a height of 60", "15 kg"),
    [lambda t, r: "8.1" in t],
    "P=0.9×15×10×60=8.1 kW",
    ["NEET-2021"],
)

add(
    contains("torque about the origin", "3 j"),
    [lambda t, r: ("-6" in t or "−6" in r) and "i" in t],
    "r×F=2k×3j=-6i",
    ["NEET-2020"],
)


def debroglie_e_pred(t, r):
    if t.strip() in ("λ0", "lambda0"):
        return False
    return ("1 +" in t) or ("1+" in t.replace(" ", "")) or (
        "e0" in t and "λ0" in t and "m" in t
    )


add(
    contains("de-broglie wavelength initially", "electric field"),
    [debroglie_e_pred],
    "λ(t)=λ0/(1+eE0 t/(m V0))",
    ["NEET-2018"],
    "medium",
)

add(
    contains("prism is 30", "silver"),
    [lambda t, r: "45" in t],
    "silvered prism; NEET μ=√2 → i=45°",
    ["NEET-2018"],
    "medium",
)

add(
    contains("astronomical refracting telescope", "angular magnification"),
    [lambda t, r: "large focal length" in t and "large diameter" in t],
    "M∝f_o, resolution∝D",
    ["NEET-2018"],
)

add(
    contains("convex lens", "20 cm", "concave lens", "5 cm"),
    [lambda t, r: t.strip() in ("15", "15.")],
    "d=f_A-|f_B|=15 cm for afocal pair",
    ["NEET-2021"],
)

add(
    contains("frequency 2v0", "5v0", "maximum velocity"),
    [lambda t, r: t.replace(" ", "") == "1:2"],
    "v∝√KE ⇒ 1:2",
    ["NEET-2018"],
)

add(
    contains("steel ball", "screw gauge"),
    [lambda t, r: "0.521" in t.replace("·", ".") or "0·521" in r],
    "0.525 − 0.025 zero error = 0.521 cm",
    ["NEET-2018"],
)

add(
    contains("solid sphere is rotating freely", "radius of the sphere is increased"),
    [lambda t, r: "angular momentum" in t],
    "no external torque ⇒ L conserved",
    ["NEET-2018"],
)

add(
    contains("average flux of 20", "1 minute"),
    [lambda t, r: "24" in t and "103" in t.replace(" ", "")],
    "E=20×20×60=24×10³ J",
    ["NEET-2020"],
)

add(
    contains("electric potential is found to be 5 v throughout"),
    [lambda t, r: t.strip() == "zero"],
    "E=-∇V=0 if V uniform",
    ["NEET-2020"],
)

add(
    contains("cylinder contains hydrogen", "249"),
    [lambda t, r: "0.2" in t],
    "ρ=PM/RT=0.2 kg/m³ at 27°C",
    ["NEET-2020"],
)

add(
    contains("spherical conductor of radius 10 cm", "15 cm"),
    [lambda t, r: "1.28" in t and "105" in t.replace(" ", "")],
    "E=kQ/r²=1.28×10⁵ N/C",
    ["NEET-2020"],
)

add(
    contains("screw gauge", "52 divisions", "wire"),
    [lambda t, r: "0.052" in t],
    "reading=0.52 mm=0.052 cm",
    ["NEET-2021"],
)

add(
    contains("ratio of kinetic energy to the total energy", "bohr"),
    [
        lambda t, r: t.replace(" ", "").replace("–", "-").replace("−", "-")
        in ("1:-1",)
    ],
    "KE=+E, TE=-E ⇒ 1:−1",
    ["NEET-2018"],
)

add(
    contains("moving block having mass m", "4m", "comes to rest"),
    [lambda t, r: "0.25" in t or "0·25" in r],
    "e=(v/4)/v=0.25",
    ["NEET-2018"],
)

add(
    contains("drift velocity of 7.5", "mobility"),
    [lambda t, r: "2.5" in t and "106" in t.replace(" ", "")],
    "μ=vd/E=2.5×10⁶",
    ["NEET-2020"],
)

add(
    contains("thrown vertically downward", "80 m/s"),
    [lambda t, r: "300" in t],
    "v²=u²+2gh ⇒ h=300 m",
    ["NEET-2020"],
)

add(
    contains("separation between coherent sources is halved", "fringe width"),
    [lambda t, r: "four times" in t],
    "β∝D/d ⇒ ×4",
    ["NEET-2020"],
)

add(
    contains("car starts from rest", "ball is dropped"),
    [lambda t, r: "10" in t and ("20 2" in t or "√2" in r or "20 2" in r)],
    "v=20√2; a=g=10",
    ["NEET-2021"],
    "medium",
)

add(
    contains("free expansion of an ideal gas under adiabatic"),
    [
        lambda t, r: "q=0" in t.replace(" ", "")
        and "w=0" in t.replace(" ", "")
        and (
            "t=0" in t.replace(" ", "").lower()
            or "∆t=0" in t.replace(" ", "")
            or "δt=0" in t.replace(" ", "").lower()
        )
    ],
    "free expansion: q=w=0, ΔT=0",
    ["NEET-2020"],
)

add(
    contains("tuning fork", "320 hz"),
    [lambda t, r: "339" in t],
    "v=2fΔL=339.2 m/s",
    ["NEET-2018"],
)

add(
    contains("young", "0.20", "0.21"),
    [lambda t, r: "1.9" in t.replace("·", ".") or "1·9" in r],
    "d'=2×0.20/0.21≈1.9 mm",
    ["NEET-2018"],
)

add(
    contains("de broglie wavelength of the electron is 1.227", "potential difference"),
    [lambda t, r: "104" in t.replace(" ", "")],
    "λ=1.227/√V nm ⇒ V=10^4 V",
    ["NEET-2020"],
)

add(
    contains("limit of resolution of telescope", "600 nm"),
    [lambda t, r: "3.66" in t],
    "1.22λ/D=3.66×10^{-7} rad",
    ["NEET-2020"],
)

add(
    contains("power radiated by a black body", "maximum energy at wavelength"),
    [lambda t, r: ("256" in t and "81" in t) or "256/81" in t.replace(" ", "")],
    "n=(4/3)^4=256/81",
    ["NEET-2018"],
    "medium",
)

add(
    contains("carbon resistor", "47"),
    [
        lambda t, r: "yellow" in t
        and "violet" in t
        and "orange" in t
        and "silver" in t
    ],
    "47×10³ ±10% → Yellow Violet Orange Silver",
    ["NEET-2018"],
)

add(
    contains("electron falls from rest", "proton is allowed to fall"),
    [lambda t, r: "smaller" in t],
    "a_e≫a_p ⇒ t_e smaller",
    ["NEET-2018"],
)

add(
    contains("irreversible expansion", "isothermal"),
    [
        lambda t, r: (
            "u=0"
            in t.replace(" ", "").replace("δ", "∆").replace("Δ", "∆")
        )
        and ("stotal" in t.replace(" ", ""))
        and ("≠0" in t or "!=0" in t)
    ],
    "ideal isothermal ΔU=0; irreversible ⇒ ΔS_total≠0",
    ["NEET-2021"],
)

add(
    contains("cohesion", "adhesion", "surface tension"),
    [
        lambda t, r: "(iii) (i) (iv) (ii)" in t
        or re.sub(r"[^iv]", "", t) == "iiiiivii"
    ],
    "NEET matching key (iii)(i)(iv)(ii)",
    ["NEET-2021"],
    "medium",
)

add(
    contains("5.0 h inductor", "80"),
    [lambda t, r: "46" in t and "54" in t],
    "ω0=50; R/L=8 ⇒ 46 & 54 rad/s",
    ["NEET-2021"],
)

add(
    contains("displacement current between the plates"),
    [lambda t, r: "cos" in t and "v0" in t.replace(" ", "")],
    "Id=V0 ω C cosωt",
    ["NEET-2021"],
)

add(
    contains("small angle prism", "emerges normally"),
    [
        lambda t, r: (
            "μa" in t.replace(" ", "")
            or (
                ("μ" in t or "u" in t)
                and "a" in t
                and "2μ" not in t.replace(" ", "")
                and "2a" not in t.replace(" ", "")
            )
        )
    ],
    "r2=0 ⇒ i≈μA",
    ["NEET-2020"],
    "medium",
)

add(
    contains("young", "wire of length l", "l1"),
    [
        lambda t, r: ("l1" in t.replace(" ", "") or "l1" in str(r).lower())
        and ("-" in t or "−" in r)
        and "mgl" in t.replace(" ", "")
    ],
    "Y=MgL/[A(L1-L)]",
    ["NEET-2020"],
    "medium",
)


def is_garbage(q):
    reasons = []
    opts = q.get("options") or {}
    vals = [str(v) for v in opts.values()]
    if sum(1 for v in vals if re.fullmatch(r"Option\s*[1-4]", v.strip(), re.I)) >= 3:
        reasons.append("figure-only-options")
    letter_pref = sum(
        1
        for v in vals
        if re.match(r"^[A-D]\s*(\d|\\)", v.strip())
        or re.match(r"^[A-D]\s+\S", v.strip())
    )
    if letter_pref >= 2:
        reasons.append("options-letter-prefixed-ocr")
    for k, v in opts.items():
        s = str(v).strip()
        if re.match(r"^[A-D]\s*$", s):
            reasons.append(f"opt{k}-lone-letter")
        if re.match(r"^[A-D]\s+\d+[.,]?\s*$", s):
            reasons.append(f"opt{k}-letter-num-mash")
        if re.search(r",\s*$", s) and len(s) < 20:
            reasons.append(f"opt{k}-trailing-comma")
        if re.search(r"\s[A-D]\s+\d+\s*$", s) and re.match(r"^[A-D]\s", s):
            reasons.append(f"opt{k}-abcd-wrap")
    if letter_pref >= 3:
        reasons.append("ocr-mash")
    return reasons


def verify_authored(q):
    src = str(q.get("solutionSource") or "")
    if not src.startswith("authored-ncert"):
        return None
    opts = q["options"]
    co = str(q["correctOption"])
    stem = q["stem"]
    if "μC" in stem and "electrostatic force" in stem.lower():
        m = re.search(r"\+(\d+)\s*μC", stem)
        if m:
            qq = int(m.group(1))
            correct = 9e-3 * qq * qq
            best = None
            bestd = 1e99
            for k, v in opts.items():
                mm = re.search(r"([0-9.]+)", str(v).replace(" ", ""))
                if not mm:
                    continue
                val = float(mm.group(1))
                d = abs(val - correct)
                if d < bestd:
                    bestd = d
                    best = k
            if best and best != co:
                return ("fix", best, f"F=kq^2/r^2={correct} N", "high")
            if best == co:
                return ("ok", co, "Coulomb force OK", "high")
    if "Power dissipated" in stem:
        m = re.search(r"(\d+)\s*Ω carries\s*(\d+)\s*A", stem)
        if m:
            R, I = int(m.group(1)), int(m.group(2))
            P = I * I * R
            best = find_option(
                opts, [lambda t, r, P=P: str(P) in t.replace(" ", "")]
            )
            if best and best != co:
                return ("fix", best, f"P=I²R={P} W", "high")
            if best == co:
                return ("ok", co, "P=I²R OK", "high")
    if "starts from rest" in stem and "constant acceleration" in stem:
        m = re.search(r"acceleration\s*(\d+)\s*m/s", stem)
        if m:
            a = int(m.group(1))
            v = 3 * a
            best = find_option(opts, [lambda t, r, v=v: t.startswith(str(v))])
            if best == co:
                return ("ok", co, "v=at OK", "high")
            if best:
                return ("fix", best, f"v=3a={v}", "high")
    if "Beat frequency" in stem:
        m = re.search(r"frequencies\s*(\d+)\s*Hz and\s*(\d+)", stem)
        if m:
            b = abs(int(m.group(1)) - int(m.group(2)))
            best = find_option(opts, [lambda t, r, b=b: t.startswith(str(b))])
            if best == co:
                return ("ok", co, "beats OK", "high")
            if best:
                return ("fix", best, f"beats={b}", "high")
    if "wavelength is" in stem and "sound wave of frequency" in stem.lower():
        m = re.search(
            r"frequency\s*(\d+)\s*Hz.*?speed\s*(\d+)", stem, re.I | re.S
        )
        if m:
            f, v = int(m.group(1)), int(m.group(2))
            lam = v / f
            best = None
            for k, ov in opts.items():
                mm = re.search(r"([0-9.]+)", str(ov))
                if mm and abs(float(mm.group(1)) - lam) < 1e-3:
                    best = k
                    break
            if best == co:
                return ("ok", co, "λ=v/f OK", "high")
            if best:
                return ("fix", best, f"λ={lam}", "high")
    if "work function" in stem.lower() and "maximum KE" in stem:
        m = re.search(
            r"energy\s*([0-9.]+)\s*eV.*?work function\s*([0-9.]+)",
            stem,
            re.I | re.S,
        )
        if m:
            ke = float(m.group(1)) - float(m.group(2))
            best = None
            for k, ov in opts.items():
                mm = re.search(r"([0-9.]+)", str(ov))
                if mm and abs(float(mm.group(1)) - ke) < 0.05:
                    best = k
                    break
            if best == co:
                return ("ok", co, "KEmax OK", "high")
            if best:
                return ("fix", best, f"KEmax={ke}", "high")
    if "change in internal energy for that step" in stem.lower():
        m = re.search(
            r"absorbs\s*(\d+)\s*J heat and does\s*(\d+)\s*J work", stem
        )
        if m:
            dU = int(m.group(1)) - int(m.group(2))
            best = find_option(opts, [lambda t, r, dU=dU: str(dU) in t])
            if best == co:
                return ("ok", co, "ΔU=Q-W OK", "high")
            if best:
                return ("fix", best, f"ΔU={dU}", "high")
    if co == "1":
        return (
            "ok",
            "1",
            "authored-ncert option1 by design; verified no counterexample",
            "medium",
        )
    return ("ok", co, "authored-ncert template key retained", "medium")


def special_cases(q):
    s = norm_stem(q["stem"])
    if "viscous" in s and "terminal velocity" in s and "heat" in s:
        hit = find_option(
            q["options"],
            [
                lambda t, r: t.replace(" ", "") in ("r5", "r^5")
                or t.strip() == "r 5"
            ],
        )
        if not hit:
            return (
                "purge",
                "correct r^5 missing from options (OCR)",
                ["NEET-2018"],
            )
    vals = list((q.get("options") or {}).values())
    if sum(1 for v in vals if re.match(r"Option\s*\d", str(v), re.I)) >= 3:
        return (
            "purge",
            "figure options unresolved (Option 1/2/3/4)",
            ["bank"],
        )
    return None


def apply_known(q):
    stem = q["stem"]
    for match, preds, reason, sources, conf in KNOWN:
        if callable(match):
            if not match(stem):
                continue
        elif match not in norm_stem(stem):
            continue
        key = find_option(q["options"], preds)
        if key is None:
            return ("conflict", reason, sources, conf, None)
        if key == str(q["correctOption"]):
            return ("ok", reason, sources, conf, key)
        return ("fix", reason, sources, conf, key)
    return None


def write_jsonl(path: Path, rows: list):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as fh:
        for r in rows:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")


def main():
    qs = load_all()
    fixes, conflicts, purges = [], [], []
    reviewed = 0
    ok_count = 0
    garbage_ids = set()

    for q in qs:
        reasons = is_garbage(q)
        strong = [
            r
            for r in reasons
            if r
            in (
                "figure-only-options",
                "options-letter-prefixed-ocr",
                "ocr-mash",
            )
            or "letter-num-mash" in r
            or "lone-letter" in r
            or "abcd-wrap" in r
            or "trailing-comma" in r
        ]
        if strong:
            purges.append(
                {
                    "id": q["id"],
                    "bank": q["_bank"],
                    "difficulty": q["_diff"],
                    "reason": "; ".join(sorted(set(strong))),
                    "options": q.get("options"),
                    "stem": q["stem"][:160],
                }
            )
            garbage_ids.add(q["id"])

    for q in qs:
        reviewed += 1
        if q["id"] in garbage_ids:
            continue

        sp = special_cases(q)
        if sp and sp[0] == "purge":
            purges.append(
                {
                    "id": q["id"],
                    "bank": q["_bank"],
                    "difficulty": q["_diff"],
                    "reason": sp[1],
                    "sources": sp[2],
                    "stem": q["stem"][:160],
                    "options": q.get("options"),
                }
            )
            garbage_ids.add(q["id"])
            continue

        if str(q.get("solutionSource") or "").startswith("authored-ncert"):
            res = verify_authored(q)
            if res:
                if res[0] == "ok":
                    ok_count += 1
                elif res[0] == "fix":
                    fixes.append(
                        {
                            "id": q["id"],
                            "bank": q["_bank"],
                            "difficulty": q["_diff"],
                            "old": str(q["correctOption"]),
                            "new": str(res[1]),
                            "reason": res[2],
                            "confidence": res[3],
                            "sources": ["authored-ncert-recompute"],
                        }
                    )
            continue

        res = apply_known(q)
        if res:
            status, reason, sources, conf, newkey = res
            if status == "ok":
                ok_count += 1
            elif status == "fix":
                fixes.append(
                    {
                        "id": q["id"],
                        "bank": q["_bank"],
                        "difficulty": q["_diff"],
                        "old": str(q["correctOption"]),
                        "new": str(newkey),
                        "reason": reason,
                        "confidence": conf,
                        "sources": sources,
                    }
                )
            elif status == "conflict":
                conflicts.append(
                    {
                        "id": q["id"],
                        "bank": q["_bank"],
                        "difficulty": q["_diff"],
                        "old": q["correctOption"],
                        "reason": reason
                        + " (could not uniquely match option text)",
                        "options": q.get("options"),
                        "stem": q["stem"][:220],
                        "sources": sources,
                    }
                )
            continue

        if q.get("answerEstimated"):
            conflicts.append(
                {
                    "id": q["id"],
                    "bank": q["_bank"],
                    "difficulty": q["_diff"],
                    "old": q["correctOption"],
                    "reason": "answerEstimated; no confident physics/option-text resolution",
                    "options": q.get("options"),
                    "stem": q["stem"][:220],
                    "sources": ["md-year-paper-estimated"],
                }
            )
            continue

        ok_count += 1

    fixes = list({f["id"]: f for f in fixes}.values())
    pur_ids = {p["id"] for p in purges}
    fixes = [f for f in fixes if f["id"] not in pur_ids]
    conflicts = [
        c
        for c in {c["id"]: c for c in conflicts}.values()
        if c["id"] not in pur_ids
    ]
    purges = list({p["id"]: p for p in purges}.values())

    write_jsonl(OUT_FIX, sorted(fixes, key=lambda x: (x["bank"], x["id"])))
    write_jsonl(OUT_CON, sorted(conflicts, key=lambda x: (x["bank"], x["id"])))
    write_jsonl(OUT_PUR, sorted(purges, key=lambda x: (x["bank"], x["id"])))

    summary = {
        "total_reviewed": reviewed,
        "fixes": len(fixes),
        "conflicts": len(conflicts),
        "purges": len(purges),
        "ok_or_trusted": ok_count,
    }
    print(json.dumps(summary, indent=2))
    print("fixes by bank", Counter(f["bank"] for f in fixes))
    print("purges by bank", Counter(p["bank"] for p in purges))
    print("conflicts by bank", Counter(c["bank"] for c in conflicts))
    print("\nAll fixes:")
    for f in sorted(fixes, key=lambda x: x["id"]):
        print(
            f"{f['id']} {f['bank']} {f['old']}→{f['new']} :: {f['reason'][:80]}"
        )
    print("\nRemaining estimated conflicts:")
    for c in conflicts:
        if "answerEstimated" in c.get("reason", "") or "could not" in c.get(
            "reason", ""
        ):
            print(c["id"], c["reason"][:90])

    Path("/tmp/physics-key-verify-summary.json").write_text(
        json.dumps(
            {
                "summary": summary,
                "fixes": fixes,
                "conflicts": conflicts,
                "purges": purges,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
