/**
 * Map PDF Symbol-font / Private Use Area glyphs (and common OCR junk)
 * to real Unicode so physics/chemistry text renders without the Symbol font.
 *
 * Adobe Symbol encoding is often emitted by pdftotext as U+F0xx.
 */

const SYMBOL_F0: Record<number, string> = {
  0x21: "!",
  0x22: "∀",
  0x23: "#",
  0x24: "∃",
  0x25: "%",
  0x26: "&",
  0x27: "∋",
  0x28: "(",
  0x29: ")",
  0x2a: "∗",
  0x2b: "+",
  0x2c: ",",
  0x2d: "−",
  0x2e: ".",
  0x2f: "/",
  0x30: "0",
  0x31: "1",
  0x32: "2",
  0x33: "3",
  0x34: "4",
  0x35: "5",
  0x36: "6",
  0x37: "7",
  0x38: "8",
  0x39: "9",
  0x3a: ":",
  0x3b: ";",
  0x3c: "<",
  0x3d: "=",
  0x3e: ">",
  0x3f: "?",
  0x40: "≅",
  0x41: "Α",
  0x42: "Β",
  0x43: "Χ",
  0x44: "Δ",
  0x45: "Ε",
  0x46: "Φ",
  0x47: "Γ",
  0x48: "Η",
  0x49: "Ι",
  0x4a: "ϑ",
  0x4b: "Κ",
  0x4c: "Λ",
  0x4d: "Μ",
  0x4e: "Ν",
  0x4f: "Ο",
  0x50: "Π",
  0x51: "Θ",
  0x52: "Ρ",
  0x53: "Σ",
  0x54: "Τ",
  0x55: "Υ",
  0x56: "ς",
  0x57: "Ω",
  0x58: "Ξ",
  0x59: "Ψ",
  0x5a: "Ζ",
  0x5b: "[",
  0x5c: "∴",
  0x5d: "]",
  0x5e: "⊥",
  0x5f: "_",
  0x60: "‾",
  0x61: "α",
  0x62: "β",
  0x63: "χ",
  0x64: "δ",
  0x65: "ε",
  0x66: "φ",
  0x67: "γ",
  0x68: "η",
  0x69: "ι",
  0x6a: "ϕ",
  0x6b: "κ",
  0x6c: "λ",
  0x6d: "μ",
  0x6e: "ν",
  0x6f: "ο",
  0x70: "π",
  0x71: "θ",
  0x72: "ρ",
  0x73: "σ",
  0x74: "τ",
  0x75: "υ",
  0x76: "ϖ",
  0x77: "ω",
  0x78: "ξ",
  0x79: "ψ",
  0x7a: "ζ",
  0x7e: "∼",
  0xa0: "€",
  0xa1: "ϒ",
  0xa2: "′",
  0xa3: "≤",
  0xa4: "⁄",
  0xa5: "∞",
  0xa6: "ƒ",
  0xa7: "♣",
  0xa8: "♦",
  0xa9: "♥",
  0xaa: "♠",
  0xab: "↔",
  0xac: "←",
  0xad: "↑",
  0xae: "→",
  0xaf: "↓",
  0xb0: "°",
  0xb1: "±",
  0xb2: "″",
  0xb3: "≥",
  0xb4: "×",
  0xb5: "∝",
  0xb6: "∂",
  0xb7: "•",
  0xb8: "÷",
  0xb9: "≠",
  0xba: "≡",
  0xbb: "≈",
  0xbc: "…",
  0xbd: "⏐",
  0xbe: "⎯",
  0xbf: "↵",
  0xc0: "ℵ",
  0xc1: "ℑ",
  0xc2: "ℜ",
  0xc3: "℘",
  0xc4: "⊗",
  0xc5: "⊕",
  0xc6: "∅",
  0xc7: "∩",
  0xc8: "∪",
  0xc9: "⊃",
  0xca: "⊇",
  0xcb: "⊄",
  0xcc: "⊂",
  0xcd: "⊆",
  0xce: "∈",
  0xcf: "∉",
  0xd0: "∠",
  0xd1: "∇",
  0xd2: "®",
  0xd3: "©",
  0xd4: "™",
  0xd5: "∏",
  0xd6: "√",
  0xd7: "⋅",
  0xd8: "¬",
  0xd9: "∧",
  0xda: "∨",
  0xdb: "⇔",
  0xdc: "⇐",
  0xdd: "⇑",
  0xde: "⇒",
  0xdf: "⇓",
  0xe0: "◊",
  0xe1: "⟨",
  0xe2: "®",
  0xe3: "©",
  0xe4: "™",
  0xe5: "∑",
  0xe6: "⎛",
  0xe7: "⎜",
  0xe8: "⎝",
  0xe9: "⎡",
  0xea: "⎢",
  0xeb: "⎣",
  0xec: "⎧",
  0xed: "⎨",
  0xee: "⎩",
  0xef: "⎪",
  0xf1: "⟩",
  0xf2: "∫",
  0xf3: "⌠",
  0xf4: "⎮",
  0xf5: "⌡",
  0xf6: "⎞",
  0xf7: "⎟",
  0xf8: "⎠",
  0xf9: "⎤",
  0xfa: "⎥",
  0xfb: "⎦",
  0xfc: "⎫",
  0xfd: "⎬",
  0xfe: "⎭",
};

/** Extra Wingdings / PDF-specific PUAs seen in NEET extracts */
const EXTRA: Record<number, string> = {
  0xf8e5: "∈",
  0xf8e6: "(",
  0xf8e7: "(",
  0xf8e8: ")",
  0xf8e9: "[",
  0xf8ea: "]",
  0xf8eb: "{",
  0xf8ec: "{",
  0xf8ed: "}",
  0xf8ee: "⟨",
  0xf8ef: "⟩",
  0xf8f0: "√",
  0xf8f1: "∫",
  0xf8f2: "≤",
  0xf8f3: "≥",
  0xf8f4: "≠",
  0xf8f5: "≈",
  0xf8f6: "(",
  0xf8f7: ")",
  0xf8f8: "[",
  0xf8f9: "]",
  0xf8fa: "{",
  0xf8fb: "}",
};

function mapChar(ch: string): string {
  const cp = ch.codePointAt(0);
  if (cp == null) return ch;
  if (EXTRA[cp]) return EXTRA[cp];
  // U+F020–U+F0FF → Symbol
  if (cp >= 0xf020 && cp <= 0xf0ff) {
    const mapped = SYMBOL_F0[cp - 0xf000];
    if (mapped) return mapped;
  }
  // Some extractors use U+F000 + ascii directly
  if (cp >= 0xf000 && cp <= 0xf0ff) {
    const mapped = SYMBOL_F0[cp & 0xff];
    if (mapped) return mapped;
  }
  if (cp === 0xfffd) return ""; // drop replacement char
  return ch;
}

/** Light math-ish wrappers for KaTeX without rewriting wording. */
function lightMathHints(text: string): string {
  let t = text;
  // Wrap simple superscripts like 10^-6 or x^2 when not already in $...$
  t = t.replace(/(?<!\$)\b(\d+)\s*\^\s*([+\-]?\d+)\b(?!\$)/g, "$$1^{$2}$");
  t = t.replace(/(?<!\$)\b10\s*[−\-]\s*(\d+)\b(?!\$)/g, "$10^{-$1}$");
  // Quantum numbers commonly written as n2 / n1 in OCR
  t = t.replace(/(?<!\$)\bn([12])\s*=\s*(\d+)\b(?!\$)/g, "$n_$1 = $2$");
  t = t.replace(/(?<!\$)\bn([12])\b(?!\$)/g, "$n_$1$");
  // μm already unicode; ensure micro sign forms
  t = t.replace(/µ/g, "μ");
  return t;
}

export function normalizeScientificText(input: string): string {
  if (!input) return "";
  let out = "";
  for (const ch of input) out += mapChar(ch);
  // tidy doubled spaces from dropped chars
  out = out.replace(/[ \t]{2,}/g, " ");
  out = lightMathHints(out);
  return out;
}
