import * as assert from "assert";
import * as vscode from "vscode";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Opens an in-memory text document, shows it in an editor, sets the provided
 * selection(s), executes a VS Code command, then returns the final document text.
 */
async function runCommandOnContent(
  content: string,
  languageId: string,
  selections: vscode.Selection[],
  command: string,
): Promise<string> {
  const doc = await vscode.workspace.openTextDocument({
    content,
    language: languageId,
  });
  const editor = await vscode.window.showTextDocument(doc);
  editor.selections = selections;
  await vscode.commands.executeCommand(command);
  // Give the edit a tick to settle
  await new Promise((r) => setTimeout(r, 50));
  return doc.getText();
}

/** Returns a Selection that covers the first occurrence of `token` in `content`. */
function selectionOf(content: string, token: string): vscode.Selection {
  const idx = content.indexOf(token);
  assert.ok(idx >= 0, `Token "${token}" not found in content`);
  const start = new vscode.Position(0, idx);
  const end = new vscode.Position(0, idx + token.length);
  return new vscode.Selection(start, end);
}

// ---------------------------------------------------------------------------
// Direct convert commands – single selection
// ---------------------------------------------------------------------------
suite("Integration – convertToDecimal", () => {
  test("0xFF → 255", async () => {
    const content = "0xFF";
    const result = await runCommandOnContent(
      content,
      "cpp",
      [selectionOf(content, "0xFF")],
      "basejump.convertToDecimal",
    );
    assert.strictEqual(result, "255");
  });

  test("0b1010 → 10", async () => {
    const content = "0b1010";
    const result = await runCommandOnContent(
      content,
      "cpp",
      [selectionOf(content, "0b1010")],
      "basejump.convertToDecimal",
    );
    assert.strictEqual(result, "10");
  });

  test("0o17 → 15", async () => {
    const content = "0o17";
    const result = await runCommandOnContent(
      content,
      "cpp",
      [selectionOf(content, "0o17")],
      "basejump.convertToDecimal",
    );
    assert.strictEqual(result, "15");
  });
});

suite("Integration – convertToHex", () => {
  test("255 → 0xFF", async () => {
    const content = "255";
    const result = await runCommandOnContent(
      content,
      "cpp",
      [selectionOf(content, "255")],
      "basejump.convertToHex",
    );
    assert.strictEqual(result, "0xFF");
  });

  test("0b11111111 → 0xFF", async () => {
    const content = "0b11111111";
    const result = await runCommandOnContent(
      content,
      "cpp",
      [selectionOf(content, "0b11111111")],
      "basejump.convertToHex",
    );
    assert.strictEqual(result, "0xFF");
  });
});

suite("Integration – convertToBinary", () => {
  test("0xFF → 0b11111111", async () => {
    const content = "0xFF";
    const result = await runCommandOnContent(
      content,
      "cpp",
      [selectionOf(content, "0xFF")],
      "basejump.convertToBinary",
    );
    assert.strictEqual(result, "0b11111111");
  });

  test("0o377 (octal) → 0b11111111", async () => {
    // 0o377 has an unambiguous prefix so resolveSource always returns Octal.
    const content = "0o377";
    const result = await runCommandOnContent(
      content,
      "cpp",
      [selectionOf(content, "0o377")],
      "basejump.convertToBinary",
    );
    assert.strictEqual(result, "0b11111111");
  });
});

suite("Integration – convertToBinaryDelimited", () => {
  test("0xFF → 0b1111'1111 (cpp uses apostrophe)", async () => {
    const content = "0xFF";
    const result = await runCommandOnContent(
      content,
      "cpp",
      [selectionOf(content, "0xFF")],
      "basejump.convertToBinaryDelimited",
    );
    assert.strictEqual(result, "0b1111'1111");
  });
});

suite("Integration – convertToHexDelimited", () => {
  test("0xFFAA → 0xFF'AA (cpp uses apostrophe)", async () => {
    const content = "0xFFAA";
    const result = await runCommandOnContent(
      content,
      "cpp",
      [selectionOf(content, "0xFFAA")],
      "basejump.convertToHexDelimited",
    );
    assert.strictEqual(result, "0xFF'AA");
  });
});

suite("Integration – convertToOctal", () => {
  test("0xFF → 0o377", async () => {
    const content = "0xFF";
    const result = await runCommandOnContent(
      content,
      "cpp",
      [selectionOf(content, "0xFF")],
      "basejump.convertToOctal",
    );
    assert.strictEqual(result, "0o377");
  });
});

suite("Integration – convertToDecimalDelimited", () => {
  test("0xFF → 255 (≤3 digits, no thousands delimiter)", async () => {
    // 255 decimal is ≤3 digits so toDecimalThousands returns "255" (same as Decimal)
    // The command will silently no-op because converted===source for plain Decimal target
    // But for Decimal (thousands) it should still produce "255"
    const content = "0xFF";
    const result = await runCommandOnContent(
      content,
      "cpp",
      [selectionOf(content, "0xFF")],
      "basejump.convertToDecimalDelimited",
    );
    assert.strictEqual(result, "255");
  });
});

// ---------------------------------------------------------------------------
// toggleDelimiters command
// ---------------------------------------------------------------------------
suite("Integration – toggleDelimiters", () => {
  test("adds nibble delimiters to plain 0b binary (cpp → apostrophe)", async () => {
    const content = "0b10101010";
    // Place cursor inside the token (no selection)
    const cursorPos = new vscode.Position(0, 3);
    const result = await runCommandOnContent(
      content,
      "cpp",
      [new vscode.Selection(cursorPos, cursorPos)],
      "basejump.toggleDelimiters",
    );
    assert.strictEqual(result, "0b1010'1010");
  });

  test("strips nibble delimiters from 0b1010'1010", async () => {
    const content = "0b1010'1010";
    const cursorPos = new vscode.Position(0, 3);
    const result = await runCommandOnContent(
      content,
      "cpp",
      [new vscode.Selection(cursorPos, cursorPos)],
      "basejump.toggleDelimiters",
    );
    assert.strictEqual(result, "0b10101010");
  });

  test("adds byte delimiters to plain 0xFFAA (cpp → apostrophe)", async () => {
    const content = "0xFFAA";
    const cursorPos = new vscode.Position(0, 3);
    const result = await runCommandOnContent(
      content,
      "cpp",
      [new vscode.Selection(cursorPos, cursorPos)],
      "basejump.toggleDelimiters",
    );
    assert.strictEqual(result, "0xFF'AA");
  });

  test("strips byte delimiters from 0xFF'AA", async () => {
    const content = "0xFF'AA";
    const cursorPos = new vscode.Position(0, 3);
    const result = await runCommandOnContent(
      content,
      "cpp",
      [new vscode.Selection(cursorPos, cursorPos)],
      "basejump.toggleDelimiters",
    );
    assert.strictEqual(result, "0xFFAA");
  });
});

// ---------------------------------------------------------------------------
// Multi-selection batch conversion
// ---------------------------------------------------------------------------
suite("Integration – multi-selection", () => {
  test("converts two 0xFF tokens to decimal simultaneously", async () => {
    // Two tokens on the same line separated by a space
    const content = "0xFF 0xFF";
    const sel1 = selectionOf(content, "0xFF");
    // Second occurrence starts at index 5
    const idx2 = content.indexOf("0xFF", sel1.end.character);
    const sel2 = new vscode.Selection(
      new vscode.Position(0, idx2),
      new vscode.Position(0, idx2 + 4),
    );
    const result = await runCommandOnContent(
      content,
      "cpp",
      [sel1, sel2],
      "basejump.convertToDecimal",
    );
    assert.strictEqual(result, "255 255");
  });
});

// ---------------------------------------------------------------------------
// Ambiguous token – direct command is a no-op
// ---------------------------------------------------------------------------
suite("Integration – ambiguous token (no-op)", () => {
  test('"10" with convertToBinary leaves content unchanged (source ambiguous)', async () => {
    // "10" could be decimal or hex → resolveSource returns undefined → no edit
    const content = "10";
    const result = await runCommandOnContent(
      content,
      "cpp",
      [selectionOf(content, "10")],
      "basejump.convertToBinary",
    );
    assert.strictEqual(result, "10");
  });
});

// ---------------------------------------------------------------------------
// Multi-cursor (empty-selection / cursor-only positions)
// ---------------------------------------------------------------------------
suite("Integration – multi-cursor", () => {
  test("three cursors on hex tokens all converted to decimal", async () => {
    // "0xFF 0xAA 0x0F" — tokens at offsets 0–3, 5–8, 10–13
    const content = "0xFF 0xAA 0x0F";
    const cursors = [1, 6, 11].map(
      (ch) =>
        new vscode.Selection(
          new vscode.Position(0, ch),
          new vscode.Position(0, ch),
        ),
    );
    const result = await runCommandOnContent(
      content,
      "cpp",
      cursors,
      "basejump.convertToDecimal",
    );
    assert.strictEqual(result, "255 170 15");
  });

  test("two cursors on binary tokens both nibble-delimited", async () => {
    // Tokens on separate lines to avoid the space-expansion logic in
    // extractNibbleAwareToken (which merges space-separated binary nibble groups).
    const content = "0b10101010\n0b11001100";
    const cursors = [
      new vscode.Selection(
        new vscode.Position(0, 3),
        new vscode.Position(0, 3),
      ),
      new vscode.Selection(
        new vscode.Position(1, 3),
        new vscode.Position(1, 3),
      ),
    ];
    const result = await runCommandOnContent(
      content,
      "cpp",
      cursors,
      "basejump.toggleDelimiters",
    );
    assert.strictEqual(result, "0b1010'1010\n0b1100'1100");
  });

  test("mix of explicit selection and cursor in same command", async () => {
    // sel1 covers "0xFF" as text; cur2 is a cursor inside "0xAA"
    const content = "0xFF 0xAA";
    const sel1 = selectionOf(content, "0xFF");
    const idx2 = content.indexOf("0xAA");
    const cur2 = new vscode.Selection(
      new vscode.Position(0, idx2 + 1),
      new vscode.Position(0, idx2 + 1),
    );
    const result = await runCommandOnContent(
      content,
      "cpp",
      [sel1, cur2],
      "basejump.convertToDecimal",
    );
    assert.strictEqual(result, "255 170");
  });
});

// ---------------------------------------------------------------------------
// Whole-file conversion (basejump.convertFile)
// ---------------------------------------------------------------------------
suite("Integration – convertFile", () => {
  /**
   * Runs convertFile against a document and accepts the first QuickPick item.
   * The default favorites are sorted by BASE_ORDER source index, so
   * "Decimal→Hexadecimal" (Decimal = index 3) always appears before
   * "Hexadecimal→Decimal" (Hexadecimal = index 5) and comes first.
   */
  async function runFileConversion(
    content: string,
    languageId: string,
  ): Promise<string> {
    const doc = await vscode.workspace.openTextDocument({
      content,
      language: languageId,
    });
    await vscode.window.showTextDocument(doc);
    // Execute the command – it shows the QuickPick and completes (QP is now visible)
    await vscode.commands.executeCommand("basejump.convertFile");
    // Accept whichever item is currently highlighted (first = top favorite)
    await vscode.commands.executeCommand(
      "workbench.action.acceptSelectedQuickOpenItem",
    );
    // Allow the WorkspaceEdit to settle
    await new Promise((r) => setTimeout(r, 300));
    return doc.getText();
  }

  test("converts all decimal tokens in file to hex (Decimal→Hex favorite)", async () => {
    // "255 16" → "0xFF 0x10"
    // "255" and "16" are unambiguously resolved as Decimal with value 255 / 16
    // because scanDocumentForBase picks the Decimal interpretation.
    const result = await runFileConversion("255 16", "cpp");
    assert.strictEqual(result, "0xFF 0x10");
  });

  test("converts multiple tokens of different decimal values", async () => {
    // Three decimal values on separate lines
    const result = await runFileConversion("10\n255\n4096", "cpp");
    assert.strictEqual(result, "0xA\n0xFF\n0x1000");
  });
});
