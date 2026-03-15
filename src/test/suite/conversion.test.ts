import * as assert from "assert";
import {
  BASE_ORDER,
  baseFamilyName,
  convertToAllBases,
  convertValueToTarget,
  detectValidBases,
  getDirectCommandCandidates,
  resolveSource,
  stripNibbleDelimiters,
  toBinaryNibbles,
  toDecimalThousands,
  toHexBytes,
  toggleDelimitersForToken,
  getCommentStyle,
  buildAnnotationInsertions,
} from "../../conversion";

// ---------------------------------------------------------------------------
// stripNibbleDelimiters
// ---------------------------------------------------------------------------
suite("stripNibbleDelimiters", () => {
  test("strips underscores", () => {
    assert.strictEqual(stripNibbleDelimiters("0b1010_1010"), "0b10101010");
  });

  test("strips apostrophes", () => {
    assert.strictEqual(stripNibbleDelimiters("0xFF'AA'BB"), "0xFFAABB");
  });

  test("strips spaces", () => {
    assert.strictEqual(stripNibbleDelimiters("1 000 000"), "1000000");
  });

  test("strips hyphens", () => {
    assert.strictEqual(stripNibbleDelimiters("1-000-000"), "1000000");
  });

  test("strips periods", () => {
    assert.strictEqual(stripNibbleDelimiters("1.234.567"), "1234567");
  });

  test("strips pipe characters", () => {
    assert.strictEqual(stripNibbleDelimiters("1|010|101"), "1010101");
  });

  test("no-op when no delimiters present", () => {
    assert.strictEqual(stripNibbleDelimiters("DEADBEEF"), "DEADBEEF");
  });
});

// ---------------------------------------------------------------------------
// detectValidBases
// ---------------------------------------------------------------------------
suite("detectValidBases – Binary", () => {
  test("0b-prefixed binary", () => {
    // "0b1010" also matches bare hex (b is a valid hex digit), so length may be >1.
    // Assert that Binary IS present with the correct value.
    const result = detectValidBases("0b1010", false);
    const binary = result.find((b) => b.name === "Binary");
    assert.ok(binary, "Binary not found");
    assert.strictEqual(binary!.value, 10);
  });

  test("0b-prefixed binary is case-insensitive", () => {
    const result = detectValidBases("0B1010", false);
    const binary = result.find((b) => b.name === "Binary");
    assert.ok(binary, "Binary not found");
    assert.strictEqual(binary!.value, 10);
  });

  test("nibble-delimited bare binary is unambiguously binary", () => {
    const result = detectValidBases("1010_1010", false);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, "Binary");
    assert.strictEqual(result[0].value, 170);
  });

  test("apostrophe-delimited 0b binary", () => {
    const result = detectValidBases("0b1010'1010", false);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, "Binary");
    assert.strictEqual(result[0].value, 170);
  });

  test("bare 0/1 string without delimiter matches multiple bases", () => {
    const result = detectValidBases("1010", false);
    const names = result.map((b) => b.name);
    assert.ok(names.includes("Binary"), "Binary expected");
    assert.ok(names.includes("Decimal"), "Decimal expected");
    assert.ok(names.includes("Hexadecimal"), "Hexadecimal expected");
  });

  test("invalid binary digit with 0b prefix returns no Binary", () => {
    const result = detectValidBases("0b2", false);
    assert.ok(
      !result.find((b) => b.name === "Binary"),
      "Binary should not be detected",
    );
  });
});

suite("detectValidBases – Octal", () => {
  test("0o-prefixed octal", () => {
    const result = detectValidBases("0o755", true);
    const octal = result.find((b) => b.name === "Octal");
    assert.ok(octal, "Octal not found");
    assert.strictEqual(octal!.value, 493);
  });

  test("legacy leading-zero octal", () => {
    const result = detectValidBases("0755", true);
    const octal = result.find((b) => b.name === "Octal");
    assert.ok(octal, "Octal not found");
    assert.strictEqual(octal!.value, 493);
  });

  test("octal hidden when enableOctal=false", () => {
    const result = detectValidBases("0o755", false);
    assert.ok(
      !result.find((b) => b.name === "Octal"),
      "Octal should be absent",
    );
  });

  test("invalid octal digit (8) returns no Octal", () => {
    const result = detectValidBases("0o8", true);
    assert.ok(
      !result.find((b) => b.name === "Octal"),
      "Octal should not be detected",
    );
  });
});

suite("detectValidBases – Decimal", () => {
  test("plain integer", () => {
    const result = detectValidBases("1234", false);
    const dec = result.find((b) => b.name === "Decimal");
    assert.ok(dec, "Decimal not found");
    assert.strictEqual(dec!.value, 1234);
  });

  test("apostrophe thousands-delimited decimal", () => {
    // Use 2'000'000: stripped form "2000000" contains '2' so is NOT valid binary,
    // making Decimal the only match.
    const result = detectValidBases("2'000'000", false);
    const dec = result.find((b) => b.name === "Decimal");
    assert.ok(dec, "Decimal not found");
    assert.strictEqual(dec!.value, 2000000);
    assert.ok(
      !result.find((b) => b.name === "Binary"),
      "Binary should not be detected",
    );
  });

  test("underscore thousands-delimited decimal", () => {
    const result = detectValidBases("2_000_000", false);
    const dec = result.find((b) => b.name === "Decimal");
    assert.ok(dec, "Decimal not found");
    assert.strictEqual(dec!.value, 2000000);
    assert.ok(
      !result.find((b) => b.name === "Binary"),
      "Binary should not be detected",
    );
  });

  test("space thousands-delimited decimal", () => {
    const result = detectValidBases("2 000 000", false);
    const dec = result.find((b) => b.name === "Decimal");
    assert.ok(dec, "Decimal not found");
    assert.strictEqual(dec!.value, 2000000);
    assert.ok(
      !result.find((b) => b.name === "Binary"),
      "Binary should not be detected",
    );
  });
});

suite("detectValidBases – Hexadecimal", () => {
  test("0x-prefixed hex", () => {
    const result = detectValidBases("0xFF", false);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, "Hexadecimal");
    assert.strictEqual(result[0].value, 255);
  });

  test("byte-delimited 0x hex", () => {
    const result = detectValidBases("0xFF'AA'BB", false);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, "Hexadecimal");
    assert.strictEqual(result[0].value, 0xffaabb);
  });

  test("bare uppercase hex is detected", () => {
    const result = detectValidBases("DEADBEEF", false);
    const hex = result.find((b) => b.name === "Hexadecimal");
    assert.ok(hex, "Hexadecimal not found");
    assert.strictEqual(hex!.value, 0xdeadbeef);
  });

  test("bare 'FF' resolves only to Hexadecimal (a-f chars force hex)", () => {
    const result = detectValidBases("FF", false);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, "Hexadecimal");
    assert.strictEqual(result[0].value, 255);
  });
});

suite("detectValidBases – ambiguous zero", () => {
  test('"0" with octal enabled matches four bases', () => {
    const result = detectValidBases("0", true);
    const names = result.map((b) => b.name);
    assert.ok(names.includes("Binary"), "Binary expected");
    assert.ok(names.includes("Octal"), "Octal expected");
    assert.ok(names.includes("Decimal"), "Decimal expected");
    assert.ok(names.includes("Hexadecimal"), "Hexadecimal expected");
    for (const b of result) {
      assert.strictEqual(b.value, 0);
    }
  });
});

// ---------------------------------------------------------------------------
// toBinaryNibbles
// ---------------------------------------------------------------------------
suite("toBinaryNibbles", () => {
  test("single nibble – no separator", () => {
    assert.strictEqual(toBinaryNibbles(10, "'"), "0b1010");
  });

  test("two nibbles with apostrophe", () => {
    assert.strictEqual(toBinaryNibbles(170, "'"), "0b1010'1010");
  });

  test("two nibbles with underscore", () => {
    assert.strictEqual(toBinaryNibbles(255, "_"), "0b1111_1111");
  });

  test("zero becomes 0b0000", () => {
    assert.strictEqual(toBinaryNibbles(0, "'"), "0b0000");
  });

  test("one gets left-padded to nibble", () => {
    assert.strictEqual(toBinaryNibbles(1, "'"), "0b0001");
  });

  test("16-bit value produces four nibble groups", () => {
    assert.strictEqual(toBinaryNibbles(65535, "_"), "0b1111_1111_1111_1111");
  });
});

// ---------------------------------------------------------------------------
// toHexBytes
// ---------------------------------------------------------------------------
suite("toHexBytes", () => {
  test("single byte – no separator", () => {
    assert.strictEqual(toHexBytes(255, "'"), "0xFF");
  });

  test("two bytes with apostrophe", () => {
    assert.strictEqual(toHexBytes(0xaabb, "'"), "0xAA'BB");
  });

  test("three bytes with apostrophe", () => {
    assert.strictEqual(toHexBytes(0xffaabb, "'"), "0xFF'AA'BB");
  });

  test("odd nibble count is left-padded to even", () => {
    // 0xFAABBCC → "0F AA BB CC"
    assert.strictEqual(toHexBytes(0xfaabbcc, "'"), "0x0F'AA'BB'CC");
  });

  test("single-digit value is zero-padded to byte", () => {
    assert.strictEqual(toHexBytes(15, "_"), "0x0F");
  });
});

// ---------------------------------------------------------------------------
// toDecimalThousands
// ---------------------------------------------------------------------------
suite("toDecimalThousands", () => {
  test("value ≤999 is returned as-is (no delimiter)", () => {
    assert.strictEqual(toDecimalThousands(999, "'"), "999");
  });

  test("1000 with apostrophe", () => {
    assert.strictEqual(toDecimalThousands(1000, "'"), "1'000");
  });

  test("1000000 with apostrophe", () => {
    assert.strictEqual(toDecimalThousands(1000000, "'"), "1'000'000");
  });

  test("1000000 with underscore", () => {
    assert.strictEqual(toDecimalThousands(1000000, "_"), "1_000_000");
  });

  test("non-round millions value", () => {
    assert.strictEqual(toDecimalThousands(1999999, "'"), "1'999'999");
  });
});

// ---------------------------------------------------------------------------
// baseFamilyName
// ---------------------------------------------------------------------------
suite("baseFamilyName", () => {
  for (const [target, expected] of [
    ["Binary", "Binary"],
    ["Binary (nibbles)", "Binary"],
    ["Octal", "Octal"],
    ["Decimal", "Decimal"],
    ["Decimal (thousands)", "Decimal"],
    ["Hexadecimal", "Hexadecimal"],
    ["Hexadecimal (bytes)", "Hexadecimal"],
  ] as [string, string][]) {
    test(`"${target}" → "${expected}"`, () => {
      assert.strictEqual(baseFamilyName(target), expected);
    });
  }
});

// ---------------------------------------------------------------------------
// convertValueToTarget
// ---------------------------------------------------------------------------
suite("convertValueToTarget", () => {
  const DELIM = "'";

  test("Binary", () => {
    assert.strictEqual(
      convertValueToTarget(255, "Binary", DELIM),
      "0b11111111",
    );
  });

  test("Binary (nibbles)", () => {
    assert.strictEqual(
      convertValueToTarget(255, "Binary (nibbles)", DELIM),
      "0b1111'1111",
    );
  });

  test("Octal", () => {
    assert.strictEqual(convertValueToTarget(255, "Octal", DELIM), "0o377");
  });

  test("Decimal", () => {
    assert.strictEqual(convertValueToTarget(255, "Decimal", DELIM), "255");
  });

  test("Decimal (thousands)", () => {
    assert.strictEqual(
      convertValueToTarget(1000000, "Decimal (thousands)", DELIM),
      "1'000'000",
    );
  });

  test("Hexadecimal", () => {
    assert.strictEqual(convertValueToTarget(255, "Hexadecimal", DELIM), "0xFF");
  });

  test("Hexadecimal (bytes)", () => {
    assert.strictEqual(
      convertValueToTarget(0xaabb, "Hexadecimal (bytes)", DELIM),
      "0xAA'BB",
    );
  });

  test("unknown target returns undefined", () => {
    assert.strictEqual(
      convertValueToTarget(255, "ElvenScript", DELIM),
      undefined,
    );
  });
});

// ---------------------------------------------------------------------------
// convertValueToTarget – addPrefix=false (alwaysPrefixConversions disabled)
// ---------------------------------------------------------------------------
suite("convertValueToTarget – addPrefix=false", () => {
  const DELIM = "'";

  test("Binary: no 0b prefix", () => {
    assert.strictEqual(
      convertValueToTarget(10, "Binary", DELIM, false),
      "1010",
    );
  });

  test("Binary (nibbles): prefix stripped, delimiters kept", () => {
    assert.strictEqual(
      convertValueToTarget(255, "Binary (nibbles)", DELIM, false),
      "1111'1111",
    );
  });

  test("Octal: no 0o prefix", () => {
    assert.strictEqual(convertValueToTarget(255, "Octal", DELIM, false), "377");
  });

  test("Decimal: unchanged (never had a prefix)", () => {
    assert.strictEqual(
      convertValueToTarget(255, "Decimal", DELIM, false),
      "255",
    );
  });

  test("Decimal (thousands): unchanged (never had a prefix)", () => {
    assert.strictEqual(
      convertValueToTarget(1000000, "Decimal (thousands)", DELIM, false),
      "1'000'000",
    );
  });

  test("Hexadecimal: no 0x prefix", () => {
    assert.strictEqual(
      convertValueToTarget(255, "Hexadecimal", DELIM, false),
      "FF",
    );
  });

  test("Hexadecimal (bytes): prefix stripped, delimiters kept", () => {
    assert.strictEqual(
      convertValueToTarget(0xaabb, "Hexadecimal (bytes)", DELIM, false),
      "AA'BB",
    );
  });

  test("addPrefix=true produces same output as default", () => {
    assert.strictEqual(
      convertValueToTarget(255, "Hexadecimal", DELIM, true),
      convertValueToTarget(255, "Hexadecimal", DELIM),
    );
  });
});

// ---------------------------------------------------------------------------
// convertToAllBases
// ---------------------------------------------------------------------------
suite("convertToAllBases", () => {
  test("all optional flags false → three core keys", () => {
    const result = convertToAllBases(255, false, false, false, false, "'");
    assert.ok("Binary" in result);
    assert.ok("Decimal" in result);
    assert.ok("Hexadecimal" in result);
    assert.ok(!("Octal" in result));
    assert.ok(!("Binary (nibbles)" in result));
    assert.ok(!("Hexadecimal (bytes)" in result));
    assert.ok(!("Decimal (thousands)" in result));
    assert.strictEqual(Object.keys(result).length, 3);
  });

  test("enableOctal=true adds Octal key", () => {
    const result = convertToAllBases(255, true, false, false, false, "'");
    assert.ok("Octal" in result);
    assert.strictEqual(result["Octal"], "0o377");
  });

  test("enableNibbles=true adds Binary (nibbles) key", () => {
    const result = convertToAllBases(255, false, true, false, false, "'");
    assert.ok("Binary (nibbles)" in result);
    assert.strictEqual(result["Binary (nibbles)"], "0b1111'1111");
  });

  test("enableHexBytes=true adds Hexadecimal (bytes) key", () => {
    const result = convertToAllBases(0xaabb, false, false, true, false, "'");
    assert.ok("Hexadecimal (bytes)" in result);
    assert.strictEqual(result["Hexadecimal (bytes)"], "0xAA'BB");
  });

  test("enableDecimalThousands=true adds Decimal (thousands) key", () => {
    const result = convertToAllBases(1000000, false, false, false, true, "'");
    assert.ok("Decimal (thousands)" in result);
    assert.strictEqual(result["Decimal (thousands)"], "1'000'000");
  });

  test("all flags true → 7 keys matching BASE_ORDER", () => {
    const result = convertToAllBases(255, true, true, true, true, "'");
    assert.strictEqual(Object.keys(result).length, BASE_ORDER.length);
    for (const key of BASE_ORDER) {
      assert.ok(key in result, `Missing key "${key}"`);
    }
  });
});

// ---------------------------------------------------------------------------
// resolveSource
// ---------------------------------------------------------------------------
suite("resolveSource – unambiguous prefix", () => {
  test("0b prefix → Binary", () => {
    const src = resolveSource("0b1010", "Decimal");
    assert.strictEqual(src?.name, "Binary");
    assert.strictEqual(src?.value, 10);
  });

  test("0b prefix with delimiter → Binary (strips before check)", () => {
    const src = resolveSource("0b1010'1010", "Decimal");
    assert.strictEqual(src?.name, "Binary");
    assert.strictEqual(src?.value, 170);
  });

  test("0x prefix → Hexadecimal", () => {
    const src = resolveSource("0xFF", "Decimal");
    assert.strictEqual(src?.name, "Hexadecimal");
    assert.strictEqual(src?.value, 255);
  });

  test("0x prefix with delimiter → Hexadecimal", () => {
    const src = resolveSource("0xFF'AA", "Decimal");
    assert.strictEqual(src?.name, "Hexadecimal");
    assert.strictEqual(src?.value, 0xffaa);
  });

  test("0o prefix → Octal", () => {
    const src = resolveSource("0o77", "Decimal");
    assert.strictEqual(src?.name, "Octal");
    assert.strictEqual(src?.value, 63);
  });
});

suite("resolveSource – disambiguation", () => {
  test('"FF" → Hexadecimal (only valid candidate after removing Decimal)', () => {
    const src = resolveSource("FF", "Decimal");
    assert.strictEqual(src?.name, "Hexadecimal");
    assert.strictEqual(src?.value, 255);
  });

  test('"255" targeting Binary → undefined (Decimal + Hex both remain after removing Octal)', () => {
    // "255" is not valid binary, so candidates after removing Binary family are
    // [Octal, Decimal, Hex]. After removing Octal: [Decimal, Hex] → still ambiguous.
    const src = resolveSource("255", "Binary");
    assert.strictEqual(src, undefined);
  });

  test('"255" targeting Hexadecimal → Decimal', () => {
    const src = resolveSource("255", "Hexadecimal");
    assert.strictEqual(src?.name, "Decimal");
    assert.strictEqual(src?.value, 255);
  });

  test('"10" targeting Binary → undefined (Decimal + Hex remain, still ambiguous)', () => {
    const src = resolveSource("10", "Binary");
    assert.strictEqual(src, undefined);
  });
});

// ---------------------------------------------------------------------------
// toggleDelimitersForToken
// ---------------------------------------------------------------------------
suite("toggleDelimitersForToken – Binary", () => {
  test("adds nibble delimiters to plain binary", () => {
    assert.strictEqual(
      toggleDelimitersForToken("0b10101010", false, "'"),
      "0b1010'1010",
    );
  });

  test("strips delimiters when correct delimiter already present", () => {
    assert.strictEqual(
      toggleDelimitersForToken("0b1010'1010", false, "'"),
      "0b10101010",
    );
  });

  test("switches wrong delimiter to current delimiter", () => {
    assert.strictEqual(
      toggleDelimitersForToken("0b1010_1010", false, "'"),
      "0b1010'1010",
    );
  });

  test("single nibble binary toggle is a no-op back to itself", () => {
    // toBinaryNibbles(0b1010, "'") = "0b1010" – already same → strip → "0b1010"
    // The result should be the nibble form (adding delimiters) which equals the plain → strip
    const result = toggleDelimitersForToken("0b0000", false, "'");
    // 0b0000 → toBinaryNibbles(0,"'") = "0b0000" → returns "0b0000" (add delimiters)
    assert.strictEqual(result, "0b0000");
  });
});

suite("toggleDelimitersForToken – Hexadecimal", () => {
  test("adds byte delimiters to plain 0x hex", () => {
    assert.strictEqual(
      toggleDelimitersForToken("0xFFAA", false, "'"),
      "0xFF'AA",
    );
  });

  test("strips byte delimiters when correct delimiter present", () => {
    assert.strictEqual(
      toggleDelimitersForToken("0xFF'AA", false, "'"),
      "0xFFAA",
    );
  });

  test("switches wrong byte delimiter to current delimiter", () => {
    assert.strictEqual(
      toggleDelimitersForToken("0xFF_AA", false, "'"),
      "0xFF'AA",
    );
  });

  test("bare hex without 0x prefix → undefined (avoids ambiguity)", () => {
    assert.strictEqual(toggleDelimitersForToken("FF", false, "'"), undefined);
  });
});

suite("toggleDelimitersForToken – Decimal", () => {
  test("adds thousands delimiters to plain integer", () => {
    assert.strictEqual(
      toggleDelimitersForToken("1000000", false, "'"),
      "1'000'000",
    );
  });

  test("strips thousands delimiters when correct delimiter present", () => {
    assert.strictEqual(
      toggleDelimitersForToken("1'000'000", false, "'"),
      "1000000",
    );
  });

  test("switches wrong thousands delimiter to current", () => {
    assert.strictEqual(
      toggleDelimitersForToken("1_000_000", false, "'"),
      "1'000'000",
    );
  });

  test("value ≤999 returns undefined (no-op)", () => {
    assert.strictEqual(toggleDelimitersForToken("999", false, "'"), undefined);
  });
});

suite("toggleDelimitersForToken – unsupported types", () => {
  test("bare octal (no 0o prefix) → undefined", () => {
    assert.strictEqual(toggleDelimitersForToken("77", true, "'"), undefined);
  });

  test("0o-prefixed octal → undefined", () => {
    assert.strictEqual(toggleDelimitersForToken("0o77", true, "'"), undefined);
  });
});

// ---------------------------------------------------------------------------
// getDirectCommandCandidates
// Helper: extract sorted candidate names from a result
// ---------------------------------------------------------------------------
function candidateNames(
  candidates: ReturnType<typeof getDirectCommandCandidates>,
): string[] {
  return candidates.map((c) => c.name);
}

// --- Explicit prefix: settings are irrelevant, always single candidate ---
suite("getDirectCommandCandidates – explicit prefix", () => {
  test("0b prefix → Binary only, value correct", () => {
    const r = getDirectCommandCandidates("0b1010", false, false);
    assert.deepStrictEqual(candidateNames(r), ["Binary"]);
    assert.strictEqual(r[0].value, 10);
  });

  test("0x prefix → Hexadecimal only, value correct", () => {
    const r = getDirectCommandCandidates("0xFF", false, false);
    assert.deepStrictEqual(candidateNames(r), ["Hexadecimal"]);
    assert.strictEqual(r[0].value, 255);
  });

  test("0o prefix → Octal only, value correct", () => {
    const r = getDirectCommandCandidates("0o77", false, false);
    assert.deepStrictEqual(candidateNames(r), ["Octal"]);
    assert.strictEqual(r[0].value, 63);
  });

  test("0b prefix with nibble delimiter → Binary only (delimiter stripped)", () => {
    const r = getDirectCommandCandidates("0b1010'1010", false, false);
    assert.deepStrictEqual(candidateNames(r), ["Binary"]);
    assert.strictEqual(r[0].value, 170);
  });

  test("0b prefix wins over assumeDecimalWithoutPrefix", () => {
    const r = getDirectCommandCandidates("0b1010", false, true);
    assert.deepStrictEqual(candidateNames(r), ["Binary"]);
  });

  test("0x prefix wins over assumeBinaryWithoutPrefix", () => {
    const r = getDirectCommandCandidates("0xFF", true, false);
    assert.deepStrictEqual(candidateNames(r), ["Hexadecimal"]);
  });
});

// --- No prefix, both settings false: octal always excluded ---
suite("getDirectCommandCandidates – no prefix, both settings false", () => {
  test('"FF" → Hexadecimal only (silent convert)', () => {
    const r = getDirectCommandCandidates("FF", false, false);
    assert.deepStrictEqual(candidateNames(r), ["Hexadecimal"]);
  });

  test('"1234" → Decimal + Hexadecimal (QuickPick)', () => {
    const r = getDirectCommandCandidates("1234", false, false);
    assert.ok(r.length > 1, "expected multiple candidates for QuickPick");
    assert.ok(
      r.some((c) => c.name === "Decimal"),
      "Decimal expected",
    );
    assert.ok(
      r.some((c) => c.name === "Hexadecimal"),
      "Hexadecimal expected",
    );
  });

  test('"1010" → Binary + Decimal + Hexadecimal (QuickPick)', () => {
    const r = getDirectCommandCandidates("1010", false, false);
    assert.ok(r.length > 1);
    assert.ok(r.some((c) => c.name === "Binary"));
    assert.ok(r.some((c) => c.name === "Decimal"));
    assert.ok(r.some((c) => c.name === "Hexadecimal"));
  });

  test('"10" → Binary + Decimal + Hexadecimal (QuickPick)', () => {
    const r = getDirectCommandCandidates("10", false, false);
    assert.ok(r.length > 1);
    assert.ok(r.some((c) => c.name === "Binary"));
    assert.ok(r.some((c) => c.name === "Decimal"));
    assert.ok(r.some((c) => c.name === "Hexadecimal"));
  });

  test('"77" → Decimal + Hexadecimal, Octal excluded (QuickPick)', () => {
    const r = getDirectCommandCandidates("77", false, false);
    assert.ok(r.length > 1);
    assert.ok(r.some((c) => c.name === "Decimal"));
    assert.ok(r.some((c) => c.name === "Hexadecimal"));
    assert.ok(
      !r.some((c) => c.name === "Octal"),
      "Octal must not appear without explicit prefix",
    );
  });

  test('"077" legacy octal syntax → Decimal + Hexadecimal, Octal excluded', () => {
    const r = getDirectCommandCandidates("077", false, false);
    assert.ok(
      !r.some((c) => c.name === "Octal"),
      "Octal must not appear without 0o prefix",
    );
  });
});

// --- assumeDecimalWithoutPrefix=true, assumeBinary=false ---
suite("getDirectCommandCandidates – assumeDecimal only", () => {
  test('"1234" (all digits) → Decimal only (silent convert)', () => {
    const r = getDirectCommandCandidates("1234", false, true);
    assert.deepStrictEqual(candidateNames(r), ["Decimal"]);
    assert.strictEqual(r[0].value, 1234);
  });

  test('"1010" (all digits) → Decimal only, not Binary (silent convert)', () => {
    const r = getDirectCommandCandidates("1010", false, true);
    assert.deepStrictEqual(candidateNames(r), ["Decimal"]);
    assert.strictEqual(r[0].value, 1010);
  });

  test('"10" (all digits) → Decimal only (silent convert)', () => {
    const r = getDirectCommandCandidates("10", false, true);
    assert.deepStrictEqual(candidateNames(r), ["Decimal"]);
    assert.strictEqual(r[0].value, 10);
  });

  test('"77" (all digits) → Decimal only (silent convert)', () => {
    const r = getDirectCommandCandidates("77", false, true);
    assert.deepStrictEqual(candidateNames(r), ["Decimal"]);
  });

  test('"FF" (non-decimal chars) → Hexadecimal only, unaffected by setting', () => {
    const r = getDirectCommandCandidates("FF", false, true);
    assert.deepStrictEqual(candidateNames(r), ["Hexadecimal"]);
  });

  test('"1_000_000" (thousands-delimited) → Decimal only (silent convert)', () => {
    const r = getDirectCommandCandidates("1_000_000", false, true);
    assert.deepStrictEqual(candidateNames(r), ["Decimal"]);
    assert.strictEqual(r[0].value, 1000000);
  });
});

// --- assumeBinaryWithoutPrefix=true, assumeDecimal=false ---
suite("getDirectCommandCandidates – assumeBinary only", () => {
  test('"1010" (all 0/1) → Binary only (silent convert)', () => {
    const r = getDirectCommandCandidates("1010", true, false);
    assert.deepStrictEqual(candidateNames(r), ["Binary"]);
    assert.strictEqual(r[0].value, 10);
  });

  test('"0110" (all 0/1) → Binary only (silent convert)', () => {
    const r = getDirectCommandCandidates("0110", true, false);
    assert.deepStrictEqual(candidateNames(r), ["Binary"]);
    assert.strictEqual(r[0].value, 6);
  });

  test('"11" (all 0/1) → Binary only (silent convert)', () => {
    const r = getDirectCommandCandidates("11", true, false);
    assert.deepStrictEqual(candidateNames(r), ["Binary"]);
    assert.strictEqual(r[0].value, 3);
  });

  test('"1234" (has 2-9 digits) → not all 0/1 → Decimal + Hexadecimal (QuickPick)', () => {
    const r = getDirectCommandCandidates("1234", true, false);
    assert.ok(r.length > 1);
    assert.ok(r.some((c) => c.name === "Decimal"));
    assert.ok(r.some((c) => c.name === "Hexadecimal"));
  });

  test('"FF" (not all 0/1) → Hexadecimal only, unaffected by setting', () => {
    const r = getDirectCommandCandidates("FF", true, false);
    assert.deepStrictEqual(candidateNames(r), ["Hexadecimal"]);
  });

  test('"0b1010" explicit prefix wins over assumeBinary rule', () => {
    // The explicit-prefix path returns early before assumption logic runs.
    const r = getDirectCommandCandidates("0b1010", true, false);
    assert.deepStrictEqual(candidateNames(r), ["Binary"]);
    assert.strictEqual(r[0].value, 10);
  });
});

// --- Both settings true: assumeBinary takes precedence for 0/1 tokens ---
suite(
  "getDirectCommandCandidates – both assumeBinary and assumeDecimal true",
  () => {
    test('"1010" (all 0/1) → Binary wins over Decimal assumption', () => {
      const r = getDirectCommandCandidates("1010", true, true);
      assert.deepStrictEqual(candidateNames(r), ["Binary"]);
      assert.strictEqual(r[0].value, 10);
    });

    test('"10" (all 0/1) → Binary wins over Decimal assumption', () => {
      const r = getDirectCommandCandidates("10", true, true);
      assert.deepStrictEqual(candidateNames(r), ["Binary"]);
      assert.strictEqual(r[0].value, 2);
    });

    test('"1234" (not all 0/1, all digits) → Decimal assumption applies', () => {
      const r = getDirectCommandCandidates("1234", true, true);
      assert.deepStrictEqual(candidateNames(r), ["Decimal"]);
      assert.strictEqual(r[0].value, 1234);
    });

    test('"FF" (neither 0/1 nor pure decimal) → Hexadecimal only, unaffected', () => {
      const r = getDirectCommandCandidates("FF", true, true);
      assert.deepStrictEqual(candidateNames(r), ["Hexadecimal"]);
    });

    test('"77" (not all 0/1, all digits) → Decimal assumption applies', () => {
      const r = getDirectCommandCandidates("77", true, true);
      assert.deepStrictEqual(candidateNames(r), ["Decimal"]);
    });
  },
);

// ---------------------------------------------------------------------------
// getCommentStyle
// ---------------------------------------------------------------------------
suite("getCommentStyle – slash languages", () => {
  test("typescript → //", () => {
    assert.deepStrictEqual(getCommentStyle("typescript"), {
      prefix: "//",
      suffix: "",
    });
  });
  test("typescriptreact → //", () => {
    assert.deepStrictEqual(getCommentStyle("typescriptreact"), {
      prefix: "//",
      suffix: "",
    });
  });
  test("javascript → //", () => {
    assert.deepStrictEqual(getCommentStyle("javascript"), {
      prefix: "//",
      suffix: "",
    });
  });
  test("cpp → //", () => {
    assert.deepStrictEqual(getCommentStyle("cpp"), {
      prefix: "//",
      suffix: "",
    });
  });
  test("c → //", () => {
    assert.deepStrictEqual(getCommentStyle("c"), { prefix: "//", suffix: "" });
  });
  test("csharp → //", () => {
    assert.deepStrictEqual(getCommentStyle("csharp"), {
      prefix: "//",
      suffix: "",
    });
  });
  test("java → //", () => {
    assert.deepStrictEqual(getCommentStyle("java"), {
      prefix: "//",
      suffix: "",
    });
  });
  test("go → //", () => {
    assert.deepStrictEqual(getCommentStyle("go"), { prefix: "//", suffix: "" });
  });
  test("rust → //", () => {
    assert.deepStrictEqual(getCommentStyle("rust"), {
      prefix: "//",
      suffix: "",
    });
  });
  test("kotlin → //", () => {
    assert.deepStrictEqual(getCommentStyle("kotlin"), {
      prefix: "//",
      suffix: "",
    });
  });
  test("swift → //", () => {
    assert.deepStrictEqual(getCommentStyle("swift"), {
      prefix: "//",
      suffix: "",
    });
  });
  test("dart → //", () => {
    assert.deepStrictEqual(getCommentStyle("dart"), {
      prefix: "//",
      suffix: "",
    });
  });
});

suite("getCommentStyle – hash languages", () => {
  test("python → #", () => {
    assert.deepStrictEqual(getCommentStyle("python"), {
      prefix: "#",
      suffix: "",
    });
  });
  test("ruby → #", () => {
    assert.deepStrictEqual(getCommentStyle("ruby"), {
      prefix: "#",
      suffix: "",
    });
  });
  test("shellscript → #", () => {
    assert.deepStrictEqual(getCommentStyle("shellscript"), {
      prefix: "#",
      suffix: "",
    });
  });
  test("bash → #", () => {
    assert.deepStrictEqual(getCommentStyle("bash"), {
      prefix: "#",
      suffix: "",
    });
  });
  test("powershell → #", () => {
    assert.deepStrictEqual(getCommentStyle("powershell"), {
      prefix: "#",
      suffix: "",
    });
  });
  test("yaml → #", () => {
    assert.deepStrictEqual(getCommentStyle("yaml"), {
      prefix: "#",
      suffix: "",
    });
  });
  test("dockerfile → #", () => {
    assert.deepStrictEqual(getCommentStyle("dockerfile"), {
      prefix: "#",
      suffix: "",
    });
  });
  test("r → #", () => {
    assert.deepStrictEqual(getCommentStyle("r"), { prefix: "#", suffix: "" });
  });
});

suite("getCommentStyle – double-dash languages", () => {
  test("lua → --", () => {
    assert.deepStrictEqual(getCommentStyle("lua"), {
      prefix: "--",
      suffix: "",
    });
  });
  test("sql → --", () => {
    assert.deepStrictEqual(getCommentStyle("sql"), {
      prefix: "--",
      suffix: "",
    });
  });
  test("haskell → --", () => {
    assert.deepStrictEqual(getCommentStyle("haskell"), {
      prefix: "--",
      suffix: "",
    });
  });
  test("vhdl → --", () => {
    assert.deepStrictEqual(getCommentStyle("vhdl"), {
      prefix: "--",
      suffix: "",
    });
  });
});

suite("getCommentStyle – block-comment languages", () => {
  test("html → <!-- -->", () => {
    assert.deepStrictEqual(getCommentStyle("html"), {
      prefix: "<!--",
      suffix: " -->",
    });
  });
  test("xml → <!-- -->", () => {
    assert.deepStrictEqual(getCommentStyle("xml"), {
      prefix: "<!--",
      suffix: " -->",
    });
  });
  test("markdown → <!-- -->", () => {
    assert.deepStrictEqual(getCommentStyle("markdown"), {
      prefix: "<!--",
      suffix: " -->",
    });
  });
  test("css → /* */", () => {
    assert.deepStrictEqual(getCommentStyle("css"), {
      prefix: "/*",
      suffix: " */",
    });
  });
  test("scss → /* */", () => {
    assert.deepStrictEqual(getCommentStyle("scss"), {
      prefix: "/*",
      suffix: " */",
    });
  });
  test("less → /* */", () => {
    assert.deepStrictEqual(getCommentStyle("less"), {
      prefix: "/*",
      suffix: " */",
    });
  });
});

suite("getCommentStyle – defaults", () => {
  test("unknown language → //", () => {
    assert.deepStrictEqual(getCommentStyle("unknown-lang"), {
      prefix: "//",
      suffix: "",
    });
  });
  test("empty string → //", () => {
    assert.deepStrictEqual(getCommentStyle(""), { prefix: "//", suffix: "" });
  });
  test("case insensitive: TypeScript (capital T) → //", () => {
    assert.deepStrictEqual(getCommentStyle("TypeScript"), {
      prefix: "//",
      suffix: "",
    });
  });
  test("case insensitive: PYTHON → #", () => {
    assert.deepStrictEqual(getCommentStyle("PYTHON"), {
      prefix: "#",
      suffix: "",
    });
  });
});

// ---------------------------------------------------------------------------
// buildAnnotationInsertions
// ---------------------------------------------------------------------------
suite("buildAnnotationInsertions – single token", () => {
  test("no indent, slash style", () => {
    const result = buildAnnotationInsertions(
      [{ lineNum: 3, lineIndent: "", text: "255" }],
      ["0xFF"],
      { prefix: "//", suffix: "" },
    );
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].lineNum, 3);
    assert.strictEqual(result[0].commentText, "// BaseJump: 255 = 0xFF\n");
  });

  test("with indent preserved", () => {
    const result = buildAnnotationInsertions(
      [{ lineNum: 1, lineIndent: "    ", text: "0xFF" }],
      ["255"],
      { prefix: "//", suffix: "" },
    );
    assert.strictEqual(result[0].commentText, "    // BaseJump: 0xFF = 255\n");
  });

  test("hash style (#)", () => {
    const result = buildAnnotationInsertions(
      [{ lineNum: 0, lineIndent: "", text: "255" }],
      ["0xFF"],
      { prefix: "#", suffix: "" },
    );
    assert.strictEqual(result[0].commentText, "# BaseJump: 255 = 0xFF\n");
  });

  test("double-dash style (--)", () => {
    const result = buildAnnotationInsertions(
      [{ lineNum: 0, lineIndent: "", text: "255" }],
      ["0xFF"],
      { prefix: "--", suffix: "" },
    );
    assert.strictEqual(result[0].commentText, "-- BaseJump: 255 = 0xFF\n");
  });

  test("block-comment style with suffix (html)", () => {
    const result = buildAnnotationInsertions(
      [{ lineNum: 0, lineIndent: "  ", text: "255" }],
      ["0xFF"],
      { prefix: "<!--", suffix: " -->" },
    );
    assert.strictEqual(
      result[0].commentText,
      "  <!-- BaseJump: 255 = 0xFF -->\n",
    );
  });

  test("css block-comment style with suffix", () => {
    const result = buildAnnotationInsertions(
      [{ lineNum: 0, lineIndent: "\t", text: "255" }],
      ["0xFF"],
      { prefix: "/*", suffix: " */" },
    );
    assert.strictEqual(result[0].commentText, "\t/* BaseJump: 255 = 0xFF */\n");
  });
});

suite("buildAnnotationInsertions – multi-token same line", () => {
  test("two tokens on line 2 → one comment combining both", () => {
    const result = buildAnnotationInsertions(
      [
        { lineNum: 2, lineIndent: "  ", text: "255" },
        { lineNum: 2, lineIndent: "  ", text: "0b11" },
      ],
      ["0xFF", "3"],
      { prefix: "//", suffix: "" },
    );
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].lineNum, 2);
    assert.strictEqual(
      result[0].commentText,
      "  // BaseJump: 255 = 0xFF, 0b11 = 3\n",
    );
  });

  test("three tokens on same line → one comment", () => {
    const result = buildAnnotationInsertions(
      [
        { lineNum: 0, lineIndent: "", text: "10" },
        { lineNum: 0, lineIndent: "", text: "20" },
        { lineNum: 0, lineIndent: "", text: "30" },
      ],
      ["0xA", "0x14", "0x1E"],
      { prefix: "//", suffix: "" },
    );
    assert.strictEqual(result.length, 1);
    assert.strictEqual(
      result[0].commentText,
      "// BaseJump: 10 = 0xA, 20 = 0x14, 30 = 0x1E\n",
    );
  });
});

suite("buildAnnotationInsertions – multi-token different lines", () => {
  test("two tokens on different lines → two insertions in reverse order", () => {
    const result = buildAnnotationInsertions(
      [
        { lineNum: 1, lineIndent: "", text: "10" },
        { lineNum: 5, lineIndent: "", text: "255" },
      ],
      ["0xA", "0xFF"],
      { prefix: "//", suffix: "" },
    );
    assert.strictEqual(result.length, 2);
    // Reverse order: line 5 first, then line 1
    assert.strictEqual(result[0].lineNum, 5);
    assert.strictEqual(result[0].commentText, "// BaseJump: 255 = 0xFF\n");
    assert.strictEqual(result[1].lineNum, 1);
    assert.strictEqual(result[1].commentText, "// BaseJump: 10 = 0xA\n");
  });

  test("tokens on lines 0, 3, 7 → result ordered 7, 3, 0", () => {
    const result = buildAnnotationInsertions(
      [
        { lineNum: 0, lineIndent: "", text: "1" },
        { lineNum: 7, lineIndent: "\t", text: "3" },
        { lineNum: 3, lineIndent: "  ", text: "2" },
      ],
      ["0x1", "0x3", "0x2"],
      { prefix: "//", suffix: "" },
    );
    assert.deepStrictEqual(
      result.map((r) => r.lineNum),
      [7, 3, 0],
    );
  });

  test("mixed: two on line 4, one on line 1 → reverse order [4, 1]", () => {
    const result = buildAnnotationInsertions(
      [
        { lineNum: 4, lineIndent: "", text: "255" },
        { lineNum: 1, lineIndent: "", text: "10" },
        { lineNum: 4, lineIndent: "", text: "16" },
      ],
      ["0xFF", "0xA", "0x10"],
      { prefix: "#", suffix: "" },
    );
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].lineNum, 4);
    assert.strictEqual(
      result[0].commentText,
      "# BaseJump: 255 = 0xFF, 16 = 0x10\n",
    );
    assert.strictEqual(result[1].lineNum, 1);
    assert.strictEqual(result[1].commentText, "# BaseJump: 10 = 0xA\n");
  });
});

suite("buildAnnotationInsertions – edge cases", () => {
  test("empty token list → empty result", () => {
    const result = buildAnnotationInsertions([], [], {
      prefix: "//",
      suffix: "",
    });
    assert.deepStrictEqual(result, []);
  });

  test("indent from first token on line is used when two tokens share a line", () => {
    const result = buildAnnotationInsertions(
      [
        { lineNum: 0, lineIndent: "    ", text: "1" },
        { lineNum: 0, lineIndent: "\t", text: "2" }, // second token's indent ignored
      ],
      ["0x1", "0x2"],
      { prefix: "//", suffix: "" },
    );
    assert.ok(result[0].commentText.startsWith("    "));
  });
});
