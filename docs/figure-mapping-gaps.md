# Figure mapping — matched crops & remaining gaps

Remap script: `scripts/remap-figures.py` (v4). Seed: `CONTENT_VERSION = 8`.

## Policy
- Attach only **cropped diagram boxes** (embedded PDF figures or isolated ink regions).
- Reject logos, headers, watermarks, and full-page / multi-question text bands.
- Prefer an explicit **placeholder** over a wrong image.

## Matched (cropped)

| Year | Questions | Source |
|------|-----------|--------|
| 2017 | 16 | page-diagram-crop |
| 2019 | 146, 149, 161, 162, 164, 173 | pdf-crop |
| 2022 | 156, 159, 171, 172, 174, 183 | stem-match ← 2019 |
| 2023 | 10, 21, 25, 41, 45, 47, 48, 50 | pdf-crop (TRY_NEET2023_F1) |
| 2024 | 1, 4, 6, 25, 26, 30, 34, 41, 111, 113, 128, 145, 167 | pdf-crop (TRY_NEET2024_R1) |
| 2025 | same Q set as 2024 | stem-match ← 2024 |

## Unmatched placeholders

| Year | Questions | Why |
|------|-----------|-----|
| 2016 | 12 | No usable PDF embeds |
| 2017 | 11, 36 | Coaching PDF embeds are logos only |
| 2018 | 101, 128, 148, 179 | Full-page scan; isolator rejected text bands |
| 2019 | 135 | PV figure not isolated |
| 2020 | 108, 138, 160 | Duplicate stems in paper JSON + scan PDF |
| 2021 | 7, 24, 31, 34, 40, 43, 44, 48 | Duplicate stems + bilingual scan, no embeds |
| 2022 | 145 | No stem twin with a good crop |

## Re-run
```bash
python3 scripts/remap-figures.py
# then bump CONTENT_VERSION and redeploy so Mongo upserts figureSrc
```
