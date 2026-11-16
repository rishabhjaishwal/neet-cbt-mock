#!/usr/bin/env python3
"""
Remap NEET paper figures: attach cropped diagram boxes (not full pages / logos)
to the matching question via PDF layout (question y-range ↔ image bbox).
"""
from __future__ import annotations

import hashlib
import json
import re
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageOps, ImageStat

ROOT = Path(__file__).resolve().parents[1]
PAPERS = ROOT / "data" / "papers"
RAW_PDFS = ROOT / "data" / "raw" / "pdfs"
PUBLIC = ROOT / "public" / "figures"

YEAR_PDF_PREFERRED = {
    2017: ["NEET2017_A.pdf", "NEET2017.pdf"],
    2018: ["NEET2018_main.pdf", "NEET2018.pdf"],
    2019: ["NEET2019_G1.pdf"],
    2020: ["NEET2020_E1.pdf"],
    2021: ["NEET2021_M1.pdf"],
    2022: ["TRY_NEET2022_main.pdf", "NEET2022_main.pdf"],
    2023: ["TRY_NEET2023_F1.pdf", "NEET2023_E1.pdf"],
    2024: ["TRY_NEET2024_R1.pdf", "NEET2024_Q1.pdf"],
    2025: ["NEET2025_46.pdf"],
}

FIG_RE = re.compile(
    r"see\s+(the\s+)?figure|as\s+shown\s+in\s+(the\s+)?figure|"
    r"shown\s+in\s+(the\s+)?figure|following\s+(diagram|figure|circuit)|"
    r"given\s+figure|in\s+the\s+figure|as\s+shown\s+in\s+figure|"
    r"shown\s+in\s+figure|given\s+figures|as\s+shown\s+below|"
    r"as\s+shown\s+in\s+the\s+circuit|circuit\s+(diagram\s+)?shown|"
    r"in\s+the\s+above\s+diagram|above\s+diagram|"
    r"shown\s+in\s+the\s+figures?|as\s+shown\s+in\s+figure|"
    r"figure\s+below|figures?\s*\([a-d]\)|from\s+the\s+given\s+figure",
    re.I,
)

# Known watermark / logo / header pixel sizes (reject always)
JUNK_PIXEL_SIZES = {
    (812, 465),
    (469, 268),
    (800, 458),
    (469, 269),
    (797, 562),  # Aakash gray watermark
    (500, 500),  # Vedantu logo tile
    (163, 115),
    (161, 114),
    (108, 76),
    (403, 284),  # cover art
    (354, 150),
}


@dataclass
class ImgBox:
    page: int
    top: float
    left: float
    width: float
    height: float
    src: Path


@dataclass
class QMark:
    number: int
    page: int
    top: float


def needs_figure(stem: str) -> bool:
    return bool(FIG_RE.search(stem or ""))


def resolve_pdf(year: int) -> Path | None:
    for name in YEAR_PDF_PREFERRED.get(year, []):
        p = RAW_PDFS / name
        if p.exists():
            return p
    return None


def _stem_score(snippet: str) -> int:
    plain = re.sub(r"<[^>]+>", " ", snippet)
    plain = re.sub(r"\s+", " ", plain).strip()
    alpha = sum(c.isalpha() for c in plain)
    score = alpha
    if FIG_RE.search(plain):
        score += 80
    if re.search(r"\b(which|following|shown|select|correct|options?)\b", plain, re.I):
        score += 40
    if re.search(r"\b(test booklet|rough work|CODE for this|hours 20 minutes)\b", plain, re.I):
        score -= 100
    if alpha < 25:
        score -= 50
    return score


def parse_xml(xml_path: Path) -> tuple[list[QMark], list[ImgBox], Path]:
    text = xml_path.read_text(encoding="utf-8", errors="ignore")
    base = xml_path.parent
    qmarks: list[tuple[QMark, int]] = []
    images: list[ImgBox] = []

    page_re = re.compile(r'<page number="(\d+)"[^>]*>', re.I)
    parts = page_re.split(text)
    for i in range(1, len(parts), 2):
        page = int(parts[i])
        body = parts[i + 1] if i + 1 < len(parts) else ""
        for m in re.finditer(
            r'<text[^>]*top="([\d.]+)"[^>]*>\s*(?:<[^>]+>)*\s*(\d{1,3})\.\s*',
            body,
        ):
            top = float(m.group(1))
            num = int(m.group(2))
            if 1 <= num <= 200:
                snip = body[m.end() : m.end() + 280]
                qmarks.append((QMark(num, page, top), _stem_score(snip)))
        for m in re.finditer(
            r'<image[^>]*top="([\d.]+)"[^>]*left="([\d.]+)"[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"[^>]*src="([^"]+)"',
            body,
        ):
            top, left, w, h = map(float, m.group(1, 2, 3, 4))
            src = Path(m.group(5))
            if not src.is_absolute():
                src = base / src.name
            if not src.exists():
                alt = base / Path(m.group(5)).name
                src = alt if alt.exists() else src
            images.append(ImgBox(page, top, left, w, h, src))

    best: dict[int, tuple[QMark, int]] = {}
    for qm, score in qmarks:
        prev = best.get(qm.number)
        if not prev or score > prev[1]:
            best[qm.number] = (qm, score)
    return [v[0] for v in best.values()], images, base


def _pixel_looks_like_logo(path: Path) -> bool:
    try:
        with Image.open(path) as im:
            im = im.convert("RGB")
            w, h = im.size
            if (w, h) in JUNK_PIXEL_SIZES:
                return True
            if w >= 900 and h >= 1100:
                return True
            # Near-square saturated tiles (brand logos)
            if 0.85 <= w / max(h, 1) <= 1.15 and 200 <= w <= 600:
                small = im.resize((48, 48))
                sats = []
                for r, g, b in small.getdata():
                    mx, mn = max(r, g, b), min(r, g, b)
                    sats.append((mx - mn) / mx if mx else 0)
                if sum(sats) / len(sats) > 0.25:
                    return True
            # Large pale watermark-like gray blocks with very little ink variance
            if w >= 700 and h >= 450:
                g = ImageOps.grayscale(im.resize((80, 60)))
                st = ImageStat.Stat(g)
                if st.stddev[0] < 18:
                    return True
            # Tiny smask / empty
            if path.stat().st_size < 900:
                return True
    except Exception:
        return True
    return False


def is_logo_or_junk(img: ImgBox) -> bool:
    if img.width < 80 or img.height < 55:
        return True
    if img.width * img.height < 9000:
        return True
    if img.top < 90 and img.height < 90:
        return True
    if img.width > 700 and img.height < 90:
        return True
    if img.width >= 700 and img.height >= 900:
        return True
    # Layout size matching known watermarks
    if abs(img.width - 797) < 8 and abs(img.height - 562) < 8:
        return True
    if abs(img.width - 812) < 8 and abs(img.height - 465) < 8:
        return True
    if not img.src.exists():
        return True
    try:
        with Image.open(img.src) as im:
            pw, ph = im.size
        if (pw, ph) in JUNK_PIXEL_SIZES:
            return True
        if pw >= 780 and 400 <= ph <= 520 and img.top < 120:
            return True
    except Exception:
        return True
    return _pixel_looks_like_logo(img.src)


def find_zone_end(xml_text_for_page: str, q_top: float) -> float:
    ends: list[float] = []
    for m in re.finditer(
        r'<text[^>]*top="([\d.]+)"[^>]*>[^<]*(?:Answer\s*\(|\bSol\.|\bSolution\b)',
        xml_text_for_page,
        re.I,
    ):
        t = float(m.group(1))
        if t > q_top + 20:
            ends.append(t)
    return min(ends) if ends else q_top + 520


def page_bodies(xml_path: Path) -> dict[int, str]:
    text = xml_path.read_text(encoding="utf-8", errors="ignore")
    page_re = re.compile(r'<page number="(\d+)"[^>]*>', re.I)
    parts = page_re.split(text)
    out: dict[int, str] = {}
    for i in range(1, len(parts), 2):
        out[int(parts[i])] = parts[i + 1] if i + 1 < len(parts) else ""
    return out


def page_size_map(xml_path: Path) -> dict[int, tuple[float, float]]:
    text = xml_path.read_text(encoding="utf-8", errors="ignore")
    out: dict[int, tuple[float, float]] = {}
    for m in re.finditer(
        r'<page number="(\d+)"[^>]*height="([\d.]+)"[^>]*width="([\d.]+)"',
        text,
    ):
        out[int(m.group(1))] = (float(m.group(2)), float(m.group(3)))
    for m in re.finditer(
        r'<page number="(\d+)"[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"',
        text,
    ):
        out.setdefault(int(m.group(1)), (float(m.group(3)), float(m.group(2))))
    return out


def pick_candidates(
    q: QMark,
    q_next: QMark | None,
    images: list[ImgBox],
    bodies: dict[int, str],
) -> list[ImgBox]:
    body = bodies.get(q.page, "")
    end = find_zone_end(body, q.top)
    if q_next and q_next.page == q.page:
        end = min(end, q_next.top - 5)

    candidates: list[ImgBox] = []
    for im in images:
        if is_logo_or_junk(im):
            continue
        if im.page == q.page and (q.top - 5) <= im.top <= end + 30:
            candidates.append(im)
    if not candidates:
        for im in images:
            if is_logo_or_junk(im):
                continue
            if im.page == q.page + 1 and im.top < 420:
                candidates.append(im)

    def rank(im: ImgBox) -> tuple:
        area = im.width * im.height
        short_pen = 1 if im.height < 100 else 0
        # Prefer typical diagram aspect (not ultra-wide banners)
        aspect = im.width / max(im.height, 1)
        wide_pen = 1 if aspect > 4.5 else 0
        return (short_pen, wide_pen, -area, im.top)

    candidates.sort(key=rank)
    return candidates


def save_cropped(img: ImgBox, dest: Path, used_hashes: set[str]) -> bool:
    try:
        if _pixel_looks_like_logo(img.src):
            return False
        im = Image.open(img.src)
        if im.mode in ("RGBA", "LA"):
            rgb = Image.new("RGB", im.size, (255, 255, 255))
            rgb.paste(im, mask=im.split()[-1])
            im = rgb
        else:
            im = im.convert("RGB")
        w, h = im.size
        if (w, h) in JUNK_PIXEL_SIZES:
            return False
        if w >= 900 and h >= 1100:
            return False
        if w >= 780 and 400 <= h <= 570:
            return False  # header / watermark banners
        raw = im.tobytes()
        digest = hashlib.md5(raw).hexdigest()
        if digest in used_hashes:
            return False
        im.thumbnail((1000, 1000))
        dest.parent.mkdir(parents=True, exist_ok=True)
        im.save(dest, format="PNG", optimize=True)
        if not (dest.exists() and dest.stat().st_size > 800):
            return False
        used_hashes.add(digest)
        return True
    except Exception:
        return False


def _row_ink(gray: Image.Image) -> list[float]:
    w, h = gray.size
    pix = gray.load()
    dens = []
    for y in range(h):
        ink = 0
        for x in range(0, w, 2):
            if pix[x, y] < 200:
                ink += 1
        dens.append(ink / max(w // 2, 1))
    return dens


def _extract_diagram_from_band(band: Image.Image) -> Image.Image | None:
    """Tight-crop a diagram-like region from a question band; reject text-only bands."""
    g = ImageOps.grayscale(band)
    w, h = g.size
    if h < 60 or w < 80:
        return None
    dens = _row_ink(g)
    # Smooth
    sm = dens[:]
    for i in range(1, len(dens) - 1):
        sm[i] = (dens[i - 1] + dens[i] + dens[i + 1]) / 3

    # Split into content blocks separated by near-white gaps
    gap_thr = 0.02
    blocks: list[tuple[int, int]] = []
    start = None
    for y, d in enumerate(sm):
        if d > gap_thr:
            if start is None:
                start = y
        else:
            if start is not None and y - start >= 18:
                blocks.append((start, y))
            start = None
    if start is not None and h - start >= 18:
        blocks.append((start, h))

    if not blocks:
        return None

    def block_score(b: tuple[int, int]) -> float:
        y0, y1 = b
        bh = y1 - y0
        sub = dens[y0:y1]
        mean = sum(sub) / max(len(sub), 1)
        # Text blocks: many thin peaks; diagrams: more continuous mid density, taller
        peaks = sum(1 for i in range(1, len(sub) - 1) if sub[i] > sub[i - 1] and sub[i] > sub[i + 1] and sub[i] > 0.08)
        peak_rate = peaks / max(bh / 12, 1)
        # Prefer medium height, not full-band text walls
        height_bonus = min(bh, 320) / 320
        text_pen = peak_rate * 1.5
        # Very tall nearly-full band with high peak rate = question text
        if bh > h * 0.7 and peak_rate > 1.2:
            return -10
        return height_bonus * 2 + mean * 0.5 - text_pen

    ranked = sorted(blocks, key=block_score, reverse=True)
    best = ranked[0]
    if block_score(best) < 0.15:
        return None
    y0, y1 = best
    # Pad slightly
    y0 = max(0, y0 - 6)
    y1 = min(h, y1 + 6)
    crop = band.crop((0, y0, w, y1))
    # Trim horizontal margins to ink
    cg = ImageOps.grayscale(crop)
    cw, ch = cg.size
    pix = cg.load()
    xs = [x for x in range(cw) for y in range(0, ch, 3) if pix[x, y] < 200]
    ys = [y for y in range(ch) for x in range(0, cw, 3) if pix[x, y] < 200]
    if not xs or not ys:
        return None
    x0, x1 = max(0, min(xs) - 8), min(cw, max(xs) + 8)
    yy0, yy1 = max(0, min(ys) - 8), min(ch, max(ys) + 8)
    tight = crop.crop((x0, yy0, x1, yy1))
    tw, th = tight.size
    if tw < 70 or th < 80:
        return None
    # Reject if still looks like dense multi-line text (options list)
    tg = ImageOps.grayscale(tight)
    td = _row_ink(tg)
    peaks = sum(
        1
        for i in range(1, len(td) - 1)
        if td[i] > td[i - 1] and td[i] > td[i + 1] and td[i] > 0.08
    )
    if peaks > max(8, th / 14) and th > 180:
        return None
    # Reject near-full original band (we failed to isolate a figure)
    if th > h * 0.72 and tw > w * 0.85:
        return None
    return tight


def render_diagram_crop(
    pdf: Path,
    page: int,
    top: float,
    end: float,
    page_height: float,
    page_width: float,
    dest: Path,
    used_hashes: set[str],
) -> bool:
    """Rasterize page, crop English column question band, isolate diagram box."""
    try:
        with tempfile.TemporaryDirectory() as td:
            td_path = Path(td)
            prefix = td_path / "page"
            subprocess.run(
                [
                    "pdftoppm",
                    "-png",
                    "-r",
                    "140",
                    "-f",
                    str(page),
                    "-l",
                    str(page),
                    str(pdf),
                    str(prefix),
                ],
                check=False,
                capture_output=True,
            )
            files = list(td_path.glob("page*.png"))
            if not files:
                return False
            im = Image.open(files[0]).convert("RGB")
            w, h = im.size
            if page_height <= 0:
                page_height = 1188
            y0 = int(max(0, (top / page_height) * h) - 4)
            y1 = int(min(h, (end / page_height) * h) + 4)
            if y1 - y0 < 70:
                y1 = min(h, y0 + 200)
            # Prefer English column on bilingual NTA pages (right half)
            # but keep full width if page is single-column
            if w > 900:
                x0 = int(w * 0.50)
                x1 = int(w * 0.96)
            else:
                x0 = int(w * 0.06)
                x1 = int(w * 0.94)
            band = im.crop((x0, y0, x1, y1))
            diagram = _extract_diagram_from_band(band)
            if diagram is None:
                # Retry full-width band (single-column coaching PDFs)
                if w > 900:
                    band2 = im.crop((int(w * 0.06), y0, int(w * 0.94), y1))
                    diagram = _extract_diagram_from_band(band2)
            if diagram is None:
                return False
            digest = hashlib.md5(diagram.tobytes()).hexdigest()
            if digest in used_hashes:
                return False
            diagram.thumbnail((1000, 1000))
            dest.parent.mkdir(parents=True, exist_ok=True)
            diagram.save(dest, format="PNG", optimize=True)
            if not (dest.exists() and dest.stat().st_size > 1500):
                return False
            used_hashes.add(digest)
            return True
    except Exception:
        return False


def write_placeholder(dest: Path, label: str) -> None:
    dest.write_text(
        f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 200" role="img">
  <rect width="480" height="200" fill="#fff8e6" stroke="#d97706" stroke-dasharray="6 4"/>
  <text x="240" y="88" text-anchor="middle" font-family="sans-serif" font-size="15" fill="#92400e">Figure not matched to a cropped diagram</text>
  <text x="240" y="118" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#a16207">{label}</text>
</svg>
''',
        encoding="utf-8",
    )


def process_year(year: int) -> dict:
    paper_path = PAPERS / f"neet-{year}.json"
    paper = json.loads(paper_path.read_text())
    pdf = resolve_pdf(year)
    fig_qs = [q for q in paper["questions"] if needs_figure(q.get("stem", ""))]
    report = {
        "year": year,
        "pdf": str(pdf) if pdf else None,
        "figure_questions": len(fig_qs),
        "matched": 0,
        "placeholder": 0,
        "cleared": 0,
        "details": [],
    }
    # Always clear previous figure associations for figure-needing + previously attached
    for q in paper["questions"]:
        if q.get("figureSrc") or needs_figure(q.get("stem", "")):
            # remove stale files for this question id
            for ext in (".png", ".svg"):
                stale = PUBLIC / f"{q['id']}{ext}"
                if stale.exists():
                    stale.unlink()
            q.pop("figureSrc", None)
            q.pop("figureKind", None)
            report["cleared"] += 1

    if not pdf:
        for q in fig_qs:
            dest = PUBLIC / f"{q['id']}.svg"
            write_placeholder(dest, f"{year} Q{q['number']}")
            q["figureSrc"] = f"/figures/{dest.name}"
            q["figureKind"] = "missing-placeholder"
            report["placeholder"] += 1
        paper_path.write_text(json.dumps(paper, ensure_ascii=False, indent=2) + "\n")
        return report

    with tempfile.TemporaryDirectory(prefix=f"neetfig-{year}-") as td:
        tdir = Path(td)
        subprocess.run(
            ["pdftohtml", "-xml", "-hidden", str(pdf), str(tdir / "doc")],
            check=False,
            capture_output=True,
        )
        xmls = list(tdir.glob("*.xml"))
        if not xmls:
            report["error"] = "pdftohtml produced no xml"
            for q in fig_qs:
                dest = PUBLIC / f"{q['id']}.svg"
                write_placeholder(dest, f"{year} Q{q['number']}")
                q["figureSrc"] = f"/figures/{dest.name}"
                q["figureKind"] = "missing-placeholder"
                report["placeholder"] += 1
            paper_path.write_text(json.dumps(paper, ensure_ascii=False, indent=2) + "\n")
            return report
        xml_path = xmls[0]
        qmarks, images, _ = parse_xml(xml_path)
        bodies = page_bodies(xml_path)
        sizes = page_size_map(xml_path)
        ordered = sorted(qmarks, key=lambda x: (x.page, x.top))
        used_hashes: set[str] = set()
        used_keys: set[tuple[int, float, float]] = set()

        for idx, qm in enumerate(ordered):
            q_next = ordered[idx + 1] if idx + 1 < len(ordered) else None
            paper_q = next((x for x in paper["questions"] if x["number"] == qm.number), None)
            if not paper_q or not needs_figure(paper_q.get("stem", "")):
                continue
            dest_png = PUBLIC / f"{paper_q['id']}.png"
            dest_svg = PUBLIC / f"{paper_q['id']}.svg"

            ok = False
            for cand in pick_candidates(qm, q_next, images, bodies):
                key = (cand.page, cand.top, cand.left)
                if key in used_keys:
                    continue
                if save_cropped(cand, dest_png, used_hashes):
                    used_keys.add(key)
                    paper_q["figureSrc"] = f"/figures/{dest_png.name}"
                    paper_q["figureKind"] = "pdf-crop"
                    report["matched"] += 1
                    report["details"].append(
                        {
                            "q": qm.number,
                            "page": cand.page,
                            "box": [cand.left, cand.top, cand.width, cand.height],
                            "file": dest_png.name,
                            "pixels": list(Image.open(dest_png).size),
                            "kind": "pdf-crop",
                        }
                    )
                    ok = True
                    break

            if not ok:
                ph, pw = sizes.get(qm.page, (1188.0, 918.0))
                end = find_zone_end(bodies.get(qm.page, ""), qm.top)
                if q_next and q_next.page == qm.page:
                    end = min(end, q_next.top - 5)
                if render_diagram_crop(pdf, qm.page, qm.top, end, ph, pw, dest_png, used_hashes):
                    paper_q["figureSrc"] = f"/figures/{dest_png.name}"
                    paper_q["figureKind"] = "page-diagram-crop"
                    report["matched"] += 1
                    report["details"].append(
                        {
                            "q": qm.number,
                            "page": qm.page,
                            "status": "page-diagram-crop",
                            "file": dest_png.name,
                            "pixels": list(Image.open(dest_png).size),
                        }
                    )
                    ok = True

            if not ok:
                write_placeholder(dest_svg, f"{year} Q{qm.number} — unmatched crop")
                paper_q["figureSrc"] = f"/figures/{dest_svg.name}"
                paper_q["figureKind"] = "missing-placeholder"
                report["placeholder"] += 1
                report["details"].append({"q": qm.number, "page": qm.page, "status": "placeholder"})

        for q in paper["questions"]:
            if needs_figure(q.get("stem", "")) and not q.get("figureSrc"):
                dest = PUBLIC / f"{q['id']}.svg"
                write_placeholder(dest, f"{year} Q{q['number']}")
                q["figureSrc"] = f"/figures/{dest.name}"
                q["figureKind"] = "missing-placeholder"
                report["placeholder"] += 1

        paper["stats"] = paper.get("stats") or {}
        paper["stats"]["withFigures"] = sum(1 for q in paper["questions"] if q.get("figureSrc"))
        paper["stats"]["figuresMatched"] = report["matched"]
        paper["stats"]["figuresPlaceholder"] = report["placeholder"]
        gaps = [g for g in (paper.get("gaps") or []) if "Figure remap" not in str(g)]
        gaps.append(
            f"Figure remap v4: matched={report['matched']} placeholder={report['placeholder']} "
            "(cropped diagram boxes only; logos/headers/full-page bands rejected)."
        )
        paper["gaps"] = gaps
        paper_path.write_text(json.dumps(paper, ensure_ascii=False, indent=2) + "\n")

    return report


def copy_2025_from_2024() -> int:
    """2025 scanned PDF has no usable embeds; copy by stem match from 2024 crops."""
    p24 = json.loads((PAPERS / "neet-2024.json").read_text())
    p25 = json.loads((PAPERS / "neet-2025.json").read_text())
    by = {
        q["stem"][:140]: q
        for q in p24["questions"]
        if str(q.get("figureKind", "")).startswith("pdf-crop")
        and str(q.get("figureSrc", "")).endswith(".png")
    }
    n = 0
    for q in p25["questions"]:
        src_q = by.get(q["stem"][:140])
        if not src_q:
            continue
        sf = ROOT / "public" / str(src_q["figureSrc"]).lstrip("/")
        if not sf.exists():
            continue
        for ext in (".png", ".svg"):
            stale = PUBLIC / f"{q['id']}{ext}"
            if stale.exists():
                stale.unlink()
        dest = PUBLIC / f"{q['id']}{sf.suffix}"
        dest.write_bytes(sf.read_bytes())
        q["figureSrc"] = f"/figures/{dest.name}"
        q["figureKind"] = "pdf-crop+from-2024-stem-match"
        n += 1
    p25["stats"] = p25.get("stats") or {}
    p25["stats"]["figuresMatched"] = n
    p25["stats"]["withFigures"] = sum(1 for q in p25["questions"] if q.get("figureSrc"))
    gaps = [g for g in (p25.get("gaps") or []) if "Figure remap" not in str(g)]
    gaps.append(
        f"Figure remap v4: 2025 uses {n} stem-matched 2024 cropped diagrams (scan PDF had no embeds)."
    )
    p25["gaps"] = gaps
    (PAPERS / "neet-2025.json").write_text(json.dumps(p25, ensure_ascii=False, indent=2) + "\n")
    return n


def main() -> None:
    PUBLIC.mkdir(parents=True, exist_ok=True)
    summaries = []
    for year in range(2016, 2026):
        print("processing", year, flush=True)
        try:
            summaries.append(process_year(year))
        except Exception as e:
            summaries.append({"year": year, "error": str(e)})
            print(" ERROR", e)
    n25 = copy_2025_from_2024()
    print("2025 stem-copied from 2024:", n25)
    out = ROOT / "data" / "papers" / "figure-remap-report.json"
    out.write_text(json.dumps(summaries, indent=2) + "\n")
    for s in summaries:
        print(
            s.get("year"),
            "matched",
            s.get("matched"),
            "placeholder",
            s.get("placeholder"),
            "pdf",
            s.get("pdf"),
            s.get("error", ""),
        )


if __name__ == "__main__":
    main()
