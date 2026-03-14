/**
 * Pure conversion utilities – no VS Code API dependency.
 * Extracted from extension.ts so they can be unit-tested without a VS Code host.
 */

// --- Delimiter ---

export const DELIMITER_CHARS: Record<string, string> = {
  underscore: "_",
  hyphen: "-",
  space: " ",
  period: ".",
  apostrophe: "'",
};

// Language-specific delimiter defaults (used when the user has not set an explicit
// override for the active document's language).
// Resolution order: language-level setting → global setting → this map → hardcoded default.
export const LANGUAGE_DELIMITER_DEFAULTS: Record<string, string> = {
  // C / C++ — apostrophe is the standard digit separator (C++14 / C23)
  c: "apostrophe",
  cpp: "apostrophe",
  // Underscore languages
  python: "underscore",
  rust: "underscore",
  java: "underscore",
  kotlin: "underscore",
  swift: "underscore",
  go: "underscore",
  vhdl: "underscore",
  systemverilog: "underscore",
  verilog: "underscore",
};

// Strip all recognized nibble delimiter characters from a string
export function stripNibbleDelimiters(s: string): string {
  return s.replace(/[|_\-. ']/g, "");
}

// --- Number detection ---

export interface NumberBase {
  name: string;
  base: number;
  value: number;
}

export function detectValidBases(
  text: string,
  enableOctal: boolean,
): NumberBase[] {
  const validBases: NumberBase[] = [];
  const clean = text.trim();

  // Binary: 0b prefix, or bare 0/1 string, or nibble-delimited form.
  // Strip ALL recognized nibble delimiters (|, _, -, ., space) before parsing.
  const cleanBinary = stripNibbleDelimiters(clean);
  const hadDelimiter = cleanBinary !== clean; // original contained a nibble delimiter
  if (/^0b[01]+$/i.test(cleanBinary)) {
    validBases.push({
      name: "Binary",
      base: 2,
      value: parseInt(cleanBinary.slice(2), 2),
    });
  } else if (/^[01]+$/.test(cleanBinary) && hadDelimiter) {
    // Bare 0/1 string with delimiters → unambiguously binary
    validBases.push({
      name: "Binary",
      base: 2,
      value: parseInt(cleanBinary, 2),
    });
  } else if (/^[01]+$/.test(clean)) {
    validBases.push({ name: "Binary", base: 2, value: parseInt(clean, 2) });
  }

  // Octal: 0o prefix, or legacy leading-zero, or bare 0-7 digits (only when enabled)
  if (enableOctal) {
    if (/^0o[0-7]+$/i.test(clean)) {
      validBases.push({
        name: "Octal",
        base: 8,
        value: parseInt(clean.slice(2), 8),
      });
    } else if (/^0[0-7]+$/.test(clean) && clean.length > 1) {
      validBases.push({ name: "Octal", base: 8, value: parseInt(clean, 8) });
    } else if (/^[0-7]+$/.test(clean)) {
      validBases.push({ name: "Octal", base: 8, value: parseInt(clean, 8) });
    }
  }

  // Decimal: pure digit strings, OR thousands-separated form (1'000'000, 1_000_000, 1,000,000 etc.).
  // Thousands form: 1–3 leading digits then groups of exactly 3 digits with a delimiter.
  // Comma is accepted as input-only (never output) to handle common US-locale notation.
  if (/^[0-9]+$/.test(clean)) {
    validBases.push({ name: "Decimal", base: 10, value: parseInt(clean, 10) });
  } else if (/^\d{1,3}(?:[|'_\-. ,]\d{3})+$/.test(clean)) {
    const stripped = clean.replace(/[|'_\-. ,]/g, "");
    if (/^[0-9]+$/.test(stripped)) {
      validBases.push({
        name: "Decimal",
        base: 10,
        value: parseInt(stripped, 10),
      });
    }
  }

  // Hexadecimal: 0x-prefixed with byte delimiters, 0x-prefix plain, or contains a–f chars.
  // Reuse cleanBinary (= stripNibbleDelimiters(clean)) for the delimiter-stripped form.
  if (hadDelimiter && /^0x[0-9a-f]+$/i.test(cleanBinary)) {
    validBases.push({
      name: "Hexadecimal",
      base: 16,
      value: parseInt(cleanBinary.slice(2), 16),
    });
  } else if (/^0x[0-9a-f]+$/i.test(clean)) {
    validBases.push({
      name: "Hexadecimal",
      base: 16,
      value: parseInt(clean.slice(2), 16),
    });
  } else if (/^[0-9a-f]+$/i.test(clean)) {
    validBases.push({
      name: "Hexadecimal",
      base: 16,
      value: parseInt(clean, 16),
    });
  }

  // Deduplicate by value+name (a pure decimal "255" will also match hex; that's intentional)
  return validBases.filter(
    (b, i, arr) => arr.findIndex((x) => x.name === b.name) === i,
  );
}

// --- Conversion ---

export const BASE_ORDER = [
  "Binary",
  "Binary (nibbles)",
  "Octal",
  "Decimal",
  "Decimal (thousands)",
  "Hexadecimal",
  "Hexadecimal (bytes)",
];

export function toBinaryNibbles(value: number, delimChar: string): string {
  const bits = value.toString(2);
  const padded = bits.padStart(Math.ceil(bits.length / 4) * 4, "0");
  const groups = padded.match(/[01]{4}/g) ?? [padded];
  return "0b" + groups.join(delimChar);
}

export function toHexBytes(value: number, delimChar: string): string {
  const hex = value.toString(16).toUpperCase();
  const padded = hex.padStart(Math.ceil(hex.length / 2) * 2, "0");
  const groups = padded.match(/.{2}/g) ?? [padded];
  return "0x" + groups.join(delimChar);
}

export function toDecimalThousands(value: number, delimChar: string): string {
  // Space makes no sense as a thousands separator in human-readable output —
  // fall back to the locale's thousands separator (e.g. "," in en-US, "." in de-DE).
  let effectiveDelim = delimChar;
  if (delimChar === " ") {
    // Extract just the separator from a locale-formatted number.
    effectiveDelim = (1000).toLocaleString().replace(/\d/g, "")[0] ?? ",";
  }
  const s = value.toString(10);
  if (s.length <= 3) {
    return s; // no delimiter needed; no-op suppression will hide this target
  }
  const groups: string[] = [];
  let i = s.length;
  while (i > 0) {
    groups.unshift(s.slice(Math.max(0, i - 3), i));
    i -= 3;
  }
  return groups.join(effectiveDelim);
}

export function convertToAllBases(
  value: number,
  enableOctal: boolean,
  enableNibbles: boolean,
  enableHexBytes: boolean,
  enableDecimalThousands: boolean,
  nibbleDelim: string,
  addPrefix = true,
  decimalDelimChar = nibbleDelim,
): Record<string, string> {
  const result: Record<string, string> = {
    Binary: (addPrefix ? "0b" : "") + value.toString(2),
    Decimal: value.toString(10),
    Hexadecimal: (addPrefix ? "0x" : "") + value.toString(16).toUpperCase(),
  };
  if (enableOctal) {
    result["Octal"] = (addPrefix ? "0o" : "") + value.toString(8);
  }
  if (enableNibbles) {
    const s = toBinaryNibbles(value, nibbleDelim);
    result["Binary (nibbles)"] = addPrefix ? s : s.slice(2);
  }
  if (enableHexBytes) {
    const s = toHexBytes(value, nibbleDelim);
    result["Hexadecimal (bytes)"] = addPrefix ? s : s.slice(2);
  }
  if (enableDecimalThousands) {
    result["Decimal (thousands)"] = toDecimalThousands(value, decimalDelimChar);
  }
  return result;
}

// --- Direct conversion helpers ---

/** Returns the base family name for a (possibly delimited) target name. */
export function baseFamilyName(targetName: string): string {
  if (targetName.startsWith("Binary")) return "Binary";
  if (targetName.startsWith("Decimal")) return "Decimal";
  if (targetName.startsWith("Hexadecimal")) return "Hexadecimal";
  return targetName; // "Octal"
}

/**
 * Attempt to resolve the source base for a token given a target base family name.
 * Returns undefined when the source cannot be determined unambiguously.
 * Disambiguation order:
 *   1. Unambiguous prefix (0b / 0x / 0o) → immediate answer
 *   2. detectValidBases (octal always enabled for disambiguation)
 *   3. Remove target-family candidates
 *   4. If still multiple, remove Octal
 *   5. If still multiple → undefined (ambiguous)
 */
export function resolveSource(
  text: string,
  targetFamily: string,
): NumberBase | undefined {
  const clean = text.trim();
  const stripped = stripNibbleDelimiters(clean);

  // Unambiguous prefix checks
  if (/^0b[01]+$/i.test(stripped)) {
    return { name: "Binary", base: 2, value: parseInt(stripped.slice(2), 2) };
  }
  if (/^0x[0-9a-f]+$/i.test(stripped)) {
    return {
      name: "Hexadecimal",
      base: 16,
      value: parseInt(stripped.slice(2), 16),
    };
  }
  if (/^0o[0-7]+$/i.test(clean)) {
    return { name: "Octal", base: 8, value: parseInt(clean.slice(2), 8) };
  }

  // General disambiguation — always enable octal so we can explicitly eliminate it
  let candidates = detectValidBases(clean, true);

  // Remove target-family candidates
  candidates = candidates.filter((c) => c.name !== targetFamily);
  if (candidates.length === 1) return candidates[0];
  if (candidates.length === 0) return undefined;

  // Eliminate Octal (rarely the intended source)
  candidates = candidates.filter((c) => c.name !== "Octal");
  if (candidates.length === 1) return candidates[0];

  return undefined; // still ambiguous
}

/** Convert a numeric value to the requested target representation. */
export function convertValueToTarget(
  value: number,
  targetName: string,
  nibbleDelim: string,
  addPrefix = true,
  decimalDelimChar = nibbleDelim,
): string | undefined {
  switch (targetName) {
    case "Binary":
      return (addPrefix ? "0b" : "") + value.toString(2);
    case "Binary (nibbles)": {
      const s = toBinaryNibbles(value, nibbleDelim);
      return addPrefix ? s : s.slice(2);
    }
    case "Octal":
      return (addPrefix ? "0o" : "") + value.toString(8);
    case "Decimal":
      return value.toString(10);
    case "Decimal (thousands)":
      return toDecimalThousands(value, decimalDelimChar);
    case "Hexadecimal":
      return (addPrefix ? "0x" : "") + value.toString(16).toUpperCase();
    case "Hexadecimal (bytes)": {
      const s = toHexBytes(value, nibbleDelim);
      return addPrefix ? s : s.slice(2);
    }
    default:
      return undefined;
  }
}

/**
 * For direct conversion commands: determine candidate source bases for a token.
 *
 * Rules:
 * - Explicit prefix (0b / 0x / 0o) → single unambiguous candidate; all others void.
 * - No explicit prefix → candidates from detectValidBases with octal excluded
 *   (a bare or legacy-octal token without an explicit 0o prefix is never a candidate).
 * - When assumeBinaryWithoutPrefix is true, tokens made entirely of 0/1 chars
 *   (with or without valid nibble delimiters, but no explicit 0b/0x/0o prefix)
 *   are restricted to Binary only. Takes precedence over assumeDecimalWithoutPrefix.
 * - When assumeDecimalWithoutPrefix is true, tokens consisting only of decimal
 *   digits (or thousands-delimited digit groups) are restricted to Decimal only.
 */
export function getDirectCommandCandidates(
  text: string,
  assumeBinaryWithoutPrefix: boolean,
  assumeDecimalWithoutPrefix: boolean,
): NumberBase[] {
  const clean = text.trim();
  const stripped = stripNibbleDelimiters(clean);

  // Explicit prefix → single unambiguous candidate.
  if (/^0b[01]+$/i.test(stripped))
    return [{ name: "Binary", base: 2, value: parseInt(stripped.slice(2), 2) }];
  if (/^0x[0-9a-f]+$/i.test(stripped))
    return [
      { name: "Hexadecimal", base: 16, value: parseInt(stripped.slice(2), 16) },
    ];
  if (/^0o[0-7]+$/i.test(clean))
    return [{ name: "Octal", base: 8, value: parseInt(clean.slice(2), 8) }];

  // No explicit prefix: detect candidates, always excluding octal.
  let candidates = detectValidBases(clean, false);

  // assumeBinaryWithoutPrefix takes precedence: a bare 0/1-only token → Binary only.
  if (assumeBinaryWithoutPrefix && /^[01]+$/.test(stripped)) {
    const bin = candidates.find((c) => c.name === "Binary");
    if (bin) return [bin];
  }

  // When assumeDecimalWithoutPrefix is on, a decimal-looking token is Decimal only.
  if (assumeDecimalWithoutPrefix) {
    const isDecimalLooking =
      /^[0-9]+$/.test(clean) || /^\d{1,3}(?:[|'_\-. ]\d{3})+$/.test(clean);
    if (isDecimalLooking && candidates.some((c) => c.name === "Decimal")) {
      candidates = candidates.filter((c) => c.name === "Decimal");
    }
  }

  return candidates;
}

/**
 * Determines what the toggled form of a delimited/plain token should be.
 * - If the token already has delimiters → return the stripped (plain) form.
 * - If the token has no delimiters → return the appropriately delimited form.
 * Returns undefined if the token type doesn't support delimiter toggling (e.g. octal).
 */
export function toggleDelimitersForToken(
  text: string,
  enableOctal: boolean,
  nibbleDelim: string,
  decimalDelimChar = nibbleDelim,
): string | undefined {
  const clean = text.trim();
  const stripped = stripNibbleDelimiters(clean);
  const hasDelimiters = stripped !== clean;

  // Binary: 0b prefix (with or without delimiters)
  const cleanBinary = stripped;
  if (/^0b[01]+$/i.test(cleanBinary)) {
    const value = parseInt(cleanBinary.slice(2), 2);
    const reformatted = toBinaryNibbles(value, nibbleDelim);
    if (hasDelimiters) {
      return clean === reformatted
        ? "0b" + value.toString(2) // already correct delimiter → strip
        : reformatted; // wrong delimiter → switch
    } else {
      return reformatted; // add nibble delimiters
    }
  }

  // Hexadecimal: 0x prefix required for toggle (avoids ambiguity)
  if (/^0x[0-9a-f]+$/i.test(cleanBinary)) {
    const value = parseInt(cleanBinary.slice(2), 16);
    const reformatted = toHexBytes(value, nibbleDelim);
    if (hasDelimiters) {
      return clean === reformatted
        ? "0x" + value.toString(16).toUpperCase() // already correct delimiter → strip
        : reformatted; // wrong delimiter → switch
    } else {
      return reformatted; // add byte delimiters
    }
  }

  // Decimal: pure digits, or thousands-delimited form (comma is input-only separator)
  const decStripped = clean.replace(/[|'_\-. ,]/g, "");
  const decHasDelimiters = decStripped !== clean;
  if (/^[0-9]+$/.test(decStripped)) {
    const value = parseInt(decStripped, 10);
    const reformatted = toDecimalThousands(value, decimalDelimChar);
    if (reformatted === decStripped) {
      return undefined; // value < 1000, no-op
    }
    // Thousands form must have proper grouping (1–3 leading + groups of 3)
    const isThousandsForm = /^\d{1,3}(?:[|'_\-. ,]\d{3})+$/.test(clean);
    if (decHasDelimiters && isThousandsForm) {
      return clean === reformatted
        ? decStripped // already correct delimiter → strip
        : reformatted; // wrong delimiter → switch
    } else if (!decHasDelimiters) {
      return reformatted; // add thousands separators
    }
  }

  return undefined; // unsupported type (e.g. bare octal)
}
