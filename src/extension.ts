import * as vscode from "vscode";
import {
  DELIMITER_CHARS,
  LANGUAGE_DELIMITER_DEFAULTS,
  BASE_ORDER,
  NumberBase,
  detectValidBases,
  convertToAllBases,
  baseFamilyName,
  getDirectCommandCandidates,
  convertValueToTarget,
  toggleDelimitersForToken,
} from "./conversion";

const FAVORITES_KEY = "basejump.favorites";

// --- Delimiter ---

function getDelimiterChar(
  cfg: vscode.WorkspaceConfiguration,
  languageId?: string,
): string {
  const inspection = cfg.inspect<string>("fallbackDelimiter");

  // 1. Per-language [language] block override in settings.json.
  const hasLanguageOverride =
    inspection?.globalLanguageValue !== undefined ||
    inspection?.workspaceLanguageValue !== undefined ||
    inspection?.workspaceFolderLanguageValue !== undefined;

  if (hasLanguageOverride) {
    const key = cfg.get<string>("fallbackDelimiter", "apostrophe");
    return DELIMITER_CHARS[key] ?? "'";
  }

  // 2. Built-in language defaults.
  if (languageId) {
    const langKey = LANGUAGE_DELIMITER_DEFAULTS[languageId.toLowerCase()];
    if (langKey) {
      return DELIMITER_CHARS[langKey] ?? "'";
    }
  }

  // 3. This setting (global / workspace fallback, or package.json default).
  const key = cfg.get<string>("fallbackDelimiter", "apostrophe");
  return DELIMITER_CHARS[key] ?? "'";
}

/**
 * Returns the delimiter to use specifically for decimal thousands output.
 * For files with no built-in language mapping and no per-language override,
 * returns " " to trigger the locale-aware separator in toDecimalThousands
 * (e.g. "," in en-US, "." in European locales) — keeping decimal output
 * readable without the tokenizer-breaking space used for binary/hex.
 */
function getDecimalDelimiterChar(
  cfg: vscode.WorkspaceConfiguration,
  languageId?: string,
): string {
  const inspection = cfg.inspect<string>("fallbackDelimiter");
  const hasLanguageOverride =
    inspection?.globalLanguageValue !== undefined ||
    inspection?.workspaceLanguageValue !== undefined ||
    inspection?.workspaceFolderLanguageValue !== undefined;

  // If the user explicitly chose a delimiter for this language, honour it.
  if (hasLanguageOverride) {
    return getDelimiterChar(cfg, languageId);
  }

  // If there's a built-in language mapping, honour it.
  if (languageId && LANGUAGE_DELIMITER_DEFAULTS[languageId.toLowerCase()]) {
    return getDelimiterChar(cfg, languageId);
  }

  // Unmapped language with no override — use the locale's thousands separator for decimal.
  return (1000).toLocaleString().replace(/\d/g, "")[0] ?? ",";
}

/**
 * Extracts a potentially nibble-delimited binary token from the document at position.
 *
 * Strategy:
 * 1. Try custom regex that captures inline delimiters (|, _, -, .) in one word-range call.
 * 2. Fall back to standard word; if it looks like binary, walk left/right on the line
 *    to collect adjacent nibble groups connected by space or period delimiters.
 */
function extractNibbleAwareToken(
  doc: vscode.TextDocument,
  position: vscode.Position,
): { text: string; range: vscode.Range } | undefined {
  // Try custom regex: 0b-prefixed or bare, with at least one inline delimiter group
  // Covers |, _, -, . and ' (not space — handled below)
  const inlineRegex = /(?:0b)?[01]+(?:[|_\-.'][01]+)+/i;
  const inlineRange = doc.getWordRangeAtPosition(position, inlineRegex);
  if (inlineRange) {
    return { text: doc.getText(inlineRange), range: inlineRange };
  }

  // Try custom regex for thousands-delimited decimal (groups of exactly 3 digits)
  const decThousandsRegex = /\d{1,3}(?:[|'_\-.',]\d{3})+/;
  const decThousandsRange = doc.getWordRangeAtPosition(
    position,
    decThousandsRegex,
  );
  if (decThousandsRange) {
    return { text: doc.getText(decThousandsRange), range: decThousandsRange };
  }

  // Try custom regex for hex with byte delimiters (0x prefix required)
  const hexInlineRegex = /0x[0-9a-fA-F]+(?:[|_\-.'][0-9a-fA-F]+)+/i;
  const hexInlineRange = doc.getWordRangeAtPosition(position, hexInlineRegex);
  if (hexInlineRange) {
    return { text: doc.getText(hexInlineRange), range: hexInlineRange };
  }

  // Standard word fallback
  const baseRange = doc.getWordRangeAtPosition(position);
  if (!baseRange) {
    return undefined;
  }
  const baseText = doc.getText(baseRange);

  // Only attempt space/period expansion if the word looks like binary
  if (!/^(?:0b)?[01]+$/i.test(baseText)) {
    return { text: baseText, range: baseRange };
  }

  // Walk the line in both directions collecting nibble groups over space/period boundaries
  const line = doc.lineAt(position.line).text;
  let startCh = baseRange.start.character;
  let endCh = baseRange.end.character;

  // Expand left
  while (startCh > 0) {
    const delim = line[startCh - 1];
    if (delim !== " " && delim !== ".") {
      break;
    }
    // Walk left over binary digits
    let ls = startCh - 2;
    if (ls < 0) {
      break;
    }
    while (ls > 0 && /[01]/.test(line[ls - 1])) {
      ls--;
    }
    // Accept an optional 0b prefix
    if (ls >= 2 && line.slice(ls - 2, ls).toLowerCase() === "0b") {
      ls -= 2;
    }
    const leftWord = line.slice(ls, startCh - 1);
    if (
      !/^(?:0b)?[01]+$/i.test(leftWord) ||
      leftWord.replace(/^0b/i, "").length === 0
    ) {
      break;
    }
    startCh = ls;
  }

  // Expand right
  while (endCh < line.length) {
    const delim = line[endCh];
    if (delim !== " " && delim !== ".") {
      break;
    }
    let re = endCh + 1;
    if (re >= line.length) {
      break;
    }
    while (re < line.length && /[01]/.test(line[re])) {
      re++;
    }
    const rightWord = line.slice(endCh + 1, re);
    if (!/^[01]+$/.test(rightWord) || rightWord.length === 0) {
      break;
    }
    endCh = re;
  }

  const expandedRange = new vscode.Range(
    position.line,
    startCh,
    position.line,
    endCh,
  );
  return { text: doc.getText(expandedRange), range: expandedRange };
}
const DEFAULT_FAVORITES = [
  "Decimal\u2192Hexadecimal",
  "Hexadecimal\u2192Decimal",
];

interface SelectionToken {
  text: string;
  range: vscode.Range;
  validBases: NumberBase[];
}

interface ConversionQuickPickItem extends vscode.QuickPickItem {
  convertedValues: string[];
  sourceBase: string;
  targetBase: string;
  conversionKey: string;
}

interface FileConversionItem extends vscode.QuickPickItem {
  sourceBase: string;
  targetBase: string;
  conversionKey: string;
}

// --- Favorites helpers ---

function getFavorites(context: vscode.ExtensionContext): string[] {
  return context.globalState.get<string[]>(FAVORITES_KEY, DEFAULT_FAVORITES);
}

async function toggleFavorite(
  context: vscode.ExtensionContext,
  key: string,
): Promise<boolean> {
  const favs = getFavorites(context);
  const idx = favs.indexOf(key);
  if (idx === -1) {
    favs.push(key);
  } else {
    favs.splice(idx, 1);
  }
  await context.globalState.update(FAVORITES_KEY, favs);
  return idx === -1; // true if now a favorite
}

function isFavorite(context: vscode.ExtensionContext, key: string): boolean {
  return getFavorites(context).includes(key);
}

// --- QuickPick item builder ---

function buildItems(
  tokens: SelectionToken[],
  enableOctal: boolean,
  enableNibbles: boolean,
  enableHexBytes: boolean,
  enableDecimalThousands: boolean,
  nibbleDelim: string,
  decimalDelimChar: string,
  context: vscode.ExtensionContext,
  copyButton: vscode.QuickInputButton,
  replaceButton: vscode.QuickInputButton,
  starButtons: {
    full: vscode.QuickInputButton;
    empty: vscode.QuickInputButton;
  },
  grouping: string,
  alwaysPrefix: boolean,
): ConversionQuickPickItem[] {
  const items: ConversionQuickPickItem[] = [];

  // All tokens share the same valid base names after intersection
  for (const source of tokens[0].validBases) {
    // Compute conversions for each token's numeric value in this source base.
    // addPrefix: always true unless setting disabled AND the source token had no explicit prefix.
    const perTokenConversions = tokens.map((t) => {
      const tokenBase = t.validBases.find((b) => b.name === source.name)!;
      const tokenHasPrefix = /^0[bxo]/i.test(t.text.trim());
      const addPrefix = alwaysPrefix || tokenHasPrefix;
      return convertToAllBases(
        tokenBase.value,
        enableOctal,
        enableNibbles,
        enableHexBytes,
        enableDecimalThousands,
        nibbleDelim,
        addPrefix,
        decimalDelimChar,
      );
    });

    for (const targetName of BASE_ORDER) {
      if (!enableOctal && targetName === "Octal") {
        continue;
      }
      if (!enableNibbles && targetName === "Binary (nibbles)") {
        continue;
      }
      if (!enableHexBytes && targetName === "Hexadecimal (bytes)") {
        continue;
      }
      if (!enableDecimalThousands && targetName === "Decimal (thousands)") {
        continue;
      }
      // For same-name pairs OR cross-pairs within the binary/hex/decimal families, only skip
      // if the conversion is a true no-op for every token (output === source text).
      const binaryFamily = ["Binary", "Binary (nibbles)"];
      const hexFamily = ["Hexadecimal", "Hexadecimal (bytes)"];
      const decimalFamily = ["Decimal", "Decimal (thousands)"];
      const sameFamilyCross =
        (binaryFamily.includes(source.name) &&
          binaryFamily.includes(targetName)) ||
        (hexFamily.includes(source.name) && hexFamily.includes(targetName)) ||
        (decimalFamily.includes(source.name) &&
          decimalFamily.includes(targetName));
      if (targetName === source.name || sameFamilyCross) {
        const anyDiffers = perTokenConversions.some(
          (c, i) => c[targetName] !== tokens[i].text,
        );
        if (!anyDiffers) {
          continue;
        }
      }
      const convertedValues = perTokenConversions
        .map((c) => c[targetName])
        .filter((v): v is string => v !== undefined);
      if (convertedValues.length !== tokens.length) {
        continue;
      }

      const key = `${source.name}\u2192${targetName}`;
      const fav = isFavorite(context, key);

      // Single token: show the converted value; multi: summary line to keep it readable
      const label =
        convertedValues.length === 1
          ? convertedValues[0]
          : `Convert ${convertedValues.length} items to ${targetName}`;

      items.push({
        label,
        detail: key,
        convertedValues,
        sourceBase: source.name,
        targetBase: targetName,
        conversionKey: key,
        buttons: [
          copyButton,
          replaceButton,
          fav ? starButtons.full : starButtons.empty,
        ],
      });
    }
  }

  // Sort: favorites first, then non-favorites. Within each tier, order depends on grouping.
  items.sort((a, b) => {
    const aFav = isFavorite(context, a.conversionKey) ? 0 : 1;
    const bFav = isFavorite(context, b.conversionKey) ? 0 : 1;
    if (aFav !== bFav) {
      return aFav - bFav;
    }
    if (grouping === "byTarget") {
      const tCmp =
        BASE_ORDER.indexOf(a.targetBase) - BASE_ORDER.indexOf(b.targetBase);
      if (tCmp !== 0) return tCmp;
      return a.sourceBase.localeCompare(b.sourceBase);
    } else {
      const sCmp = a.sourceBase.localeCompare(b.sourceBase);
      if (sCmp !== 0) return sCmp;
      return (
        BASE_ORDER.indexOf(a.targetBase) - BASE_ORDER.indexOf(b.targetBase)
      );
    }
  });

  // Insert separators between the Favorites group and each group.
  const withSeparators: ConversionQuickPickItem[] = [];
  let lastGroup: string | null = null;
  for (const item of items) {
    const group = isFavorite(context, item.conversionKey)
      ? "\u2605 Favorites"
      : grouping === "byTarget"
        ? `To ${item.targetBase}`
        : `From ${item.sourceBase}`;
    if (group !== lastGroup) {
      withSeparators.push({
        label: group,
        kind: vscode.QuickPickItemKind.Separator,
        convertedValues: [],
        sourceBase: "",
        targetBase: "",
        conversionKey: "",
        buttons: [],
      });
      lastGroup = group;
    }
    withSeparators.push(item);
  }

  return withSeparators;
}

// --- File conversion helpers ---

function buildFileConversionItems(
  enableOctal: boolean,
  enableNibbles: boolean,
  enableHexBytes: boolean,
  enableDecimalThousands: boolean,
  context: vscode.ExtensionContext,
): FileConversionItem[] {
  const sourceBases = ["Binary", "Octal", "Decimal", "Hexadecimal"].filter(
    (b) => b !== "Octal" || enableOctal,
  );
  const items: FileConversionItem[] = [];

  for (const sourceName of sourceBases) {
    for (const targetName of BASE_ORDER) {
      if (!enableOctal && targetName === "Octal") {
        continue;
      }
      if (!enableNibbles && targetName === "Binary (nibbles)") {
        continue;
      }
      if (!enableHexBytes && targetName === "Hexadecimal (bytes)") {
        continue;
      }
      if (!enableDecimalThousands && targetName === "Decimal (thousands)") {
        continue;
      }
      // Allow same-base conversions only for types where stripping delimiters is meaningful.
      if (
        targetName === sourceName &&
        sourceName !== "Binary" &&
        sourceName !== "Decimal" &&
        sourceName !== "Hexadecimal"
      ) {
        continue;
      }
      const key = `${sourceName}\u2192${targetName}`;
      const fav = isFavorite(context, key);
      items.push({
        label: (fav ? "$(star-full) " : "") + key,
        sourceBase: sourceName,
        targetBase: targetName,
        conversionKey: key,
      });
    }
  }

  // Sort: favorites first, then by source base order, then by target base order
  items.sort((a, b) => {
    const aFav = isFavorite(context, a.conversionKey) ? 0 : 1;
    const bFav = isFavorite(context, b.conversionKey) ? 0 : 1;
    if (aFav !== bFav) {
      return aFav - bFav;
    }
    const sCmp =
      BASE_ORDER.indexOf(a.sourceBase) - BASE_ORDER.indexOf(b.sourceBase);
    if (sCmp !== 0) {
      return sCmp;
    }
    return BASE_ORDER.indexOf(a.targetBase) - BASE_ORDER.indexOf(b.targetBase);
  });

  return items;
}

/**
 * Scans the entire document for tokens whose detected bases include sourceBaseName.
 * Uses a broad candidate regex then delegates to detectValidBases for classification.
 */
function scanDocumentForBase(
  document: vscode.TextDocument,
  sourceBaseName: string,
  enableOctal: boolean,
): Array<{ text: string; range: vscode.Range; value: number }> {
  const text = document.getText();
  // Thousands-delimited decimal must come before the bare hex fallback to be
  // tried first. Inline delimiters: |, ', _, -, ., , (comma — input only, not output).
  const tokenRegex =
    /\b(?:0b[01]+(?:[|_\-.'][01]+)*|0x[0-9a-fA-F]+(?:[|_\-.'][0-9a-fA-F]+)*|0o[0-7]+|\d{1,3}(?:[|'_\-.',]\d{3})+|[0-9a-fA-F]+)\b/gi;
  const results: Array<{ text: string; range: vscode.Range; value: number }> =
    [];

  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(text)) !== null) {
    const matchText = match[0];
    const bases = detectValidBases(matchText, enableOctal);
    const sourceBase = bases.find((b) => b.name === sourceBaseName);
    if (!sourceBase) {
      continue;
    }
    const startPos = document.positionAt(match.index);
    const endPos = document.positionAt(match.index + matchText.length);
    results.push({
      text: matchText,
      range: new vscode.Range(startPos, endPos),
      value: sourceBase.value,
    });
  }

  return results;
}

// --- Scan a selection range for all number tokens ---
function scanRangeForTokens(
  document: vscode.TextDocument,
  range: vscode.Range,
  enableOctal: boolean,
): SelectionToken[] {
  const text = document.getText(range);
  const tokenRegex =
    /\b(?:0b[01]+(?:[|_\-.'][01]+)*|0x[0-9a-fA-F]+(?:[|_\-.'][0-9a-fA-F]+)*|0o[0-7]+|\d{1,3}(?:[|'_\-.',]\d{3})+|[0-9a-fA-F]+)\b/gi;
  const results: SelectionToken[] = [];
  const startOffset = document.offsetAt(range.start);
  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(text)) !== null) {
    const matchText = match[0];
    const bases = detectValidBases(matchText, enableOctal);
    if (bases.length === 0) continue;
    const startPos = document.positionAt(startOffset + match.index);
    const endPos = document.positionAt(
      startOffset + match.index + matchText.length,
    );
    results.push({
      text: matchText,
      range: new vscode.Range(startPos, endPos),
      validBases: bases,
    });
  }
  return results;
}

// --- Direct convert command ---

async function convertToCommand(targetName: string): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active editor found");
    return;
  }

  const cfg = vscode.workspace.getConfiguration("basejump", editor.document);
  const nibbleDelim = getDelimiterChar(cfg, editor.document.languageId);
  const decimalDelimChar = getDecimalDelimiterChar(
    cfg,
    editor.document.languageId,
  );
  const assumeDecimal = cfg.get<boolean>("assumeDecimalWithoutPrefix", true);
  const assumeBinary = cfg.get<boolean>("assumeBinaryWithoutPrefix", true);
  const alwaysPrefix = cfg.get<boolean>("alwaysPrefixConversions", true);
  const family = baseFamilyName(targetName);

  // Step 1: Extract tokens and gather source candidates for each selection.
  interface TokenWithCandidates {
    text: string;
    range: vscode.Range;
    candidates: NumberBase[];
  }
  const tokenList: TokenWithCandidates[] = [];

  for (const sel of editor.selections) {
    const subTokens: Array<{ text: string; range: vscode.Range }> = [];
    if (sel.isEmpty) {
      const extracted = extractNibbleAwareToken(editor.document, sel.active);
      if (extracted) subTokens.push(extracted);
    } else {
      for (const t of scanRangeForTokens(editor.document, sel, true)) {
        subTokens.push({ text: t.text, range: t.range });
      }
    }
    for (const extracted of subTokens) {
      const raw = getDirectCommandCandidates(
        extracted.text,
        assumeBinary,
        assumeDecimal,
      );
      const candidates =
        raw.length === 1
          ? raw
          : raw.filter((c) => baseFamilyName(c.name) !== family);
      if (candidates.length > 0) {
        tokenList.push({
          text: extracted.text,
          range: extracted.range,
          candidates,
        });
      }
    }
  }

  if (tokenList.length === 0) {
    vscode.window.showWarningMessage(
      "No valid numbers found at cursor positions",
    );
    return;
  }

  // Step 2: Split into unambiguous (1 candidate) and ambiguous (>1 candidates).
  interface ResolvedToken {
    range: vscode.Range;
    source: NumberBase;
    text: string;
  }
  const resolved: ResolvedToken[] = [];
  const ambiguous: TokenWithCandidates[] = [];

  for (const t of tokenList) {
    if (t.candidates.length === 1) {
      resolved.push({ range: t.range, source: t.candidates[0], text: t.text });
    } else {
      ambiguous.push(t);
    }
  }

  // Step 3: If any tokens are ambiguous, ask the user once.
  if (ambiguous.length > 0) {
    // Union of all candidate bases across ambiguous tokens, deduped and sorted.
    const seen = new Set<string>();
    const uniqueCandidates: NumberBase[] = [];
    for (const t of ambiguous) {
      for (const c of t.candidates) {
        if (!seen.has(c.name)) {
          seen.add(c.name);
          uniqueCandidates.push(c);
        }
      }
    }
    uniqueCandidates.sort(
      (a, b) => BASE_ORDER.indexOf(a.name) - BASE_ORDER.indexOf(b.name),
    );

    const tokenLabel =
      ambiguous.length === 1
        ? `"${ambiguous[0].text.trim()}"`
        : `${ambiguous.length} tokens`;

    interface BaseItem extends vscode.QuickPickItem {
      base: NumberBase;
    }
    const chosenBase = await new Promise<NumberBase | undefined>((resolve) => {
      const qp = vscode.window.createQuickPick<BaseItem>();
      qp.title = `Source base for ${tokenLabel}`;
      qp.placeholder = "Select the base to convert from";
      qp.items = uniqueCandidates.map((c) => ({
        label: c.name,
        description: `= ${c.value}`,
        base: c,
      }));
      qp.onDidAccept(() => {
        resolve(qp.selectedItems[0]?.base);
        qp.dispose();
      });
      qp.onDidHide(() => {
        resolve(undefined);
        qp.dispose();
      });
      qp.show();
    });

    if (!chosenBase) return; // user dismissed

    for (const t of ambiguous) {
      const match = t.candidates.find((c) => c.name === chosenBase.name);
      if (match) {
        resolved.push({ range: t.range, source: match, text: t.text });
      }
    }
  }

  // Step 4: Convert and collect edits.
  const edits: Array<{ range: vscode.Range; newText: string }> = [];
  for (const { range, source, text } of resolved) {
    const sourceHasPrefix = /^0[bxo]/i.test(text.trim());
    const addPrefix = alwaysPrefix || sourceHasPrefix;
    const converted = convertValueToTarget(
      source.value,
      targetName,
      nibbleDelim,
      addPrefix,
      decimalDelimChar,
    );
    if (converted === undefined) continue;
    if (converted === text.trim()) continue; // silent no-op
    edits.push({ range, newText: converted });
  }

  if (edits.length === 0) return;

  const applied = await editor.edit((eb) => {
    for (const e of edits) {
      eb.replace(e.range, e.newText);
    }
  });
  if (!applied) {
    const clipText = edits.map((e) => e.newText).join("\n");
    await vscode.env.clipboard.writeText(clipText);
    const msg =
      edits.length === 1
        ? `Editor is read-only — copied to clipboard`
        : `Editor is read-only — ${edits.length} values copied to clipboard`;
    vscode.window.showInformationMessage(msg);
    return;
  }
  if (edits.length > 1) {
    vscode.window.showInformationMessage(`Converted ${edits.length} tokens`);
  }
}

// --- activate ---

function updateMenuContextKeys(): void {
  const cfg = vscode.workspace.getConfiguration("basejump");
  vscode.commands.executeCommand(
    "setContext",
    "basejump.menuLayout",
    cfg.get<string>("contextMenuLayout", "submenu"),
  );
  vscode.commands.executeCommand(
    "setContext",
    "basejump.menuConvertNumber",
    cfg.get<boolean>("menuShowConvertNumber", true),
  );
  vscode.commands.executeCommand(
    "setContext",
    "basejump.menuConvertEditorContent",
    cfg.get<boolean>("menuShowConvertEditorContent", true),
  );
  vscode.commands.executeCommand(
    "setContext",
    "basejump.menuToggleDelimiters",
    cfg.get<boolean>("menuShowToggleDelimiters", true),
  );
  vscode.commands.executeCommand(
    "setContext",
    "basejump.menuConvertToBinary",
    cfg.get<boolean>("menuShowConvertToBinary", false),
  );
  vscode.commands.executeCommand(
    "setContext",
    "basejump.menuConvertToBinaryDelimited",
    cfg.get<boolean>("menuShowConvertToBinaryDelimited", false),
  );
  vscode.commands.executeCommand(
    "setContext",
    "basejump.menuConvertToOctal",
    cfg.get<boolean>("menuShowConvertToOctal", false),
  );
  vscode.commands.executeCommand(
    "setContext",
    "basejump.menuConvertToDecimal",
    cfg.get<boolean>("menuShowConvertToDecimal", false),
  );
  vscode.commands.executeCommand(
    "setContext",
    "basejump.menuConvertToDecimalDelimited",
    cfg.get<boolean>("menuShowConvertToDecimalDelimited", false),
  );
  vscode.commands.executeCommand(
    "setContext",
    "basejump.menuConvertToHex",
    cfg.get<boolean>("menuShowConvertToHex", false),
  );
  vscode.commands.executeCommand(
    "setContext",
    "basejump.menuConvertToHexDelimited",
    cfg.get<boolean>("menuShowConvertToHexDelimited", false),
  );
}

export function activate(context: vscode.ExtensionContext) {
  console.log("BaseJump extension is now active!");

  // Ensure default favorites are seeded on first install
  if (context.globalState.get<string[]>(FAVORITES_KEY) === undefined) {
    context.globalState.update(FAVORITES_KEY, DEFAULT_FAVORITES);
  }

  // Persistent button objects (identity used to detect which was clicked)
  const copyButton: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon("copy"),
    tooltip: "Copy to Clipboard",
  };
  const replaceButton: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon("replace"),
    tooltip: "Replace in Editor",
  };
  const starFull: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon("star-full"),
    tooltip: "Remove from Favorites",
  };
  const starEmpty: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon("star-empty"),
    tooltip: "Add to Favorites",
  };
  const starButtons = { full: starFull, empty: starEmpty };

  const disposable = vscode.commands.registerCommand(
    "basejump.convertNumber",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor found");
        return;
      }

      // --- Configuration ---
      const cfg = vscode.workspace.getConfiguration(
        "basejump",
        editor.document,
      );
      const defaultAction = cfg.get<string>("defaultAction", "replaceInEditor");
      const enableOctal = cfg.get<boolean>("enableOctal", false);
      const enableDelimitedVariants = cfg.get<boolean>(
        "enableDelimitedVariants",
        true,
      );
      const enableNibbles = enableDelimitedVariants;
      const enableHexBytes = enableDelimitedVariants;
      const enableDecimalThousands = enableDelimitedVariants;
      const nibbleDelim = getDelimiterChar(cfg, editor.document.languageId);
      const decimalDelimChar = getDecimalDelimiterChar(
        cfg,
        editor.document.languageId,
      );
      const conversionGrouping = cfg.get<string>(
        "conversionGrouping",
        "byTarget",
      );
      const alwaysPrefix = cfg.get<boolean>("alwaysPrefixConversions", true);

      // --- Extract tokens for all cursors/selections ---
      const activeTokens: SelectionToken[] = [];
      for (const sel of editor.selections) {
        if (sel.isEmpty) {
          const extracted = extractNibbleAwareToken(
            editor.document,
            sel.active,
          );
          if (!extracted) continue;
          const bases = detectValidBases(extracted.text, enableOctal);
          if (bases.length > 0) {
            activeTokens.push({
              text: extracted.text,
              range: extracted.range,
              validBases: bases,
            });
          }
        } else {
          for (const token of scanRangeForTokens(
            editor.document,
            sel,
            enableOctal,
          )) {
            activeTokens.push(token);
          }
        }
      }

      if (activeTokens.length === 0) {
        vscode.window.showWarningMessage(
          "No valid numbers found at cursor positions",
        );
        return;
      }

      // --- Compute intersection of valid base names across all tokens ---
      let commonBaseNames = activeTokens[0].validBases.map((b) => b.name);
      for (let i = 1; i < activeTokens.length; i++) {
        const nameSet = new Set(activeTokens[i].validBases.map((b) => b.name));
        commonBaseNames = commonBaseNames.filter((n) => nameSet.has(n));
      }

      if (commonBaseNames.length === 0) {
        vscode.window.showWarningMessage(
          "No common numeric base found across all selections",
        );
        return;
      }

      // Filter each token's validBases to only the intersecting names
      const tokens: SelectionToken[] = activeTokens.map((t) => ({
        ...t,
        validBases: t.validBases.filter((b) =>
          commonBaseNames.includes(b.name),
        ),
      }));

      // --- Build items ---
      const items = buildItems(
        tokens,
        enableOctal,
        enableNibbles,
        enableHexBytes,
        enableDecimalThousands,
        nibbleDelim,
        decimalDelimChar,
        context,
        copyButton,
        replaceButton,
        starButtons,
        conversionGrouping,
        alwaysPrefix,
      );
      if (items.length === 0) {
        vscode.window.showInformationMessage("No conversions available");
        return;
      }

      // --- Helper actions ---
      const activeEditor = editor; // capture for closures

      async function doCopy(values: string[]) {
        const clipText = values.join("\n");
        await vscode.env.clipboard.writeText(clipText);
        if (values.length === 1) {
          vscode.window.showInformationMessage(`Copied: ${values[0]}`);
        } else {
          vscode.window.showInformationMessage(
            `Copied ${values.length} values to clipboard`,
          );
        }
      }

      async function doReplace(values: string[]) {
        const applied = await activeEditor.edit((eb) => {
          for (let i = 0; i < activeTokens.length; i++) {
            eb.replace(activeTokens[i].range, values[i]);
          }
        });
        if (!applied) {
          const clipText = values.join("\n");
          await vscode.env.clipboard.writeText(clipText);
          const msg =
            values.length === 1
              ? `Editor is read-only — copied to clipboard`
              : `Editor is read-only — ${values.length} values copied to clipboard`;
          vscode.window.showInformationMessage(msg);
          return;
        }
        if (values.length > 1) {
          vscode.window.showInformationMessage(
            `Replaced ${values.length} tokens`,
          );
        }
      }

      // --- Build and show QuickPick ---
      const qp = vscode.window.createQuickPick<ConversionQuickPickItem>();
      const defaultHint =
        defaultAction === "replaceInEditor"
          ? "Enter replaces in editor  |  [copy] copy  |  [star] toggle favorite"
          : "Enter copies to clipboard  |  [replace] replace  |  [star] toggle favorite";
      const titleSource =
        tokens.length === 1
          ? `"${tokens[0].text}"`
          : `${tokens.length} selections`;
      qp.title = `Convert: ${titleSource} (${commonBaseNames.join(", ")})  ·  ${defaultHint}`;
      qp.placeholder = "Select a conversion";
      qp.items = items;

      // Button clicks
      qp.onDidTriggerItemButton(async (e) => {
        const item = e.item;
        if (e.button === copyButton) {
          await doCopy(item.convertedValues);
          qp.hide();
        } else if (e.button === replaceButton) {
          await doReplace(item.convertedValues);
          qp.hide();
        } else if (e.button === starFull || e.button === starEmpty) {
          const nowFav = await toggleFavorite(context, item.conversionKey);
          // Update just the star button on the affected item in-place
          const updated = qp.items.map((i) => {
            if (i.conversionKey !== item.conversionKey) {
              return i;
            }
            const newButtons = [
              copyButton,
              replaceButton,
              nowFav ? starFull : starEmpty,
            ];
            return { ...i, buttons: newButtons };
          });
          qp.items = updated;
        }
      });

      // Default accept action
      qp.onDidAccept(async () => {
        const [selected] = qp.selectedItems;
        if (!selected) {
          return;
        }
        if (defaultAction === "replaceInEditor") {
          await doReplace(selected.convertedValues);
        } else {
          await doCopy(selected.convertedValues);
        }
        qp.hide();
      });

      qp.onDidHide(() => qp.dispose());
      qp.show();
    },
  );

  context.subscriptions.push(disposable);

  const convertFileDisposable = vscode.commands.registerCommand(
    "basejump.convertEditorContent",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor found");
        return;
      }

      const cfg = vscode.workspace.getConfiguration(
        "basejump",
        editor.document,
      );
      const enableOctal = cfg.get<boolean>("enableOctal", false);
      const enableDelimitedVariants = cfg.get<boolean>(
        "enableDelimitedVariants",
        true,
      );
      const enableNibbles = enableDelimitedVariants;
      const enableHexBytes = enableDelimitedVariants;
      const enableDecimalThousands = enableDelimitedVariants;
      const nibbleDelim = getDelimiterChar(cfg, editor.document.languageId);
      const decimalDelimChar = getDecimalDelimiterChar(
        cfg,
        editor.document.languageId,
      );
      const alwaysPrefix = cfg.get<boolean>("alwaysPrefixConversions", true);
      const items = buildFileConversionItems(
        enableOctal,
        enableNibbles,
        enableHexBytes,
        enableDecimalThousands,
        context,
      );
      if (items.length === 0) {
        vscode.window.showInformationMessage("No conversions available");
        return;
      }

      const qp = vscode.window.createQuickPick<FileConversionItem>();
      qp.title =
        "Convert Editor Content — select a conversion to apply to all matching tokens";
      qp.placeholder = "Select a conversion";
      qp.items = items;

      qp.onDidAccept(async () => {
        const [selected] = qp.selectedItems;
        qp.hide();
        if (!selected) {
          return;
        }

        const matches = scanDocumentForBase(
          editor.document,
          selected.sourceBase,
          enableOctal,
        );

        if (matches.length === 0) {
          vscode.window.showInformationMessage(
            `No matches found for ${selected.conversionKey}`,
          );
          return;
        }

        const wsEdit = new vscode.WorkspaceEdit();
        let changeCount = 0;
        for (const m of matches) {
          const tokenHasPrefix = /^0[bxo]/i.test(m.text.trim());
          const addPrefix = alwaysPrefix || tokenHasPrefix;
          const conversions = convertToAllBases(
            m.value,
            enableOctal,
            enableNibbles,
            enableHexBytes,
            enableDecimalThousands,
            nibbleDelim,
            addPrefix,
            decimalDelimChar,
          );
          const converted = conversions[selected.targetBase];
          // Skip no-op replacements (e.g. plain binary when doing Binary→Binary
          // on a token that has no delimiters to strip).
          if (converted !== undefined && converted !== m.text) {
            wsEdit.replace(editor.document.uri, m.range, converted);
            changeCount++;
          }
        }

        if (changeCount === 0) {
          vscode.window.showInformationMessage(
            `No changes needed for ${selected.conversionKey}`,
          );
          return;
        }

        await vscode.workspace.applyEdit(wsEdit);
        vscode.window.showInformationMessage(
          `${changeCount} replacement${changeCount === 1 ? "" : "s"} applied (${selected.conversionKey})`,
        );
      });

      qp.onDidHide(() => qp.dispose());
      qp.show();
    },
  );

  context.subscriptions.push(convertFileDisposable);

  const toggleDelimitersDisposable = vscode.commands.registerCommand(
    "basejump.toggleDelimiters",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor found");
        return;
      }

      const cfg = vscode.workspace.getConfiguration(
        "basejump",
        editor.document,
      );
      const enableOctal = cfg.get<boolean>("enableOctal", true);
      const nibbleDelim = getDelimiterChar(cfg, editor.document.languageId);
      const decimalDelimChar = getDecimalDelimiterChar(
        cfg,
        editor.document.languageId,
      );

      const edits: Array<{ range: vscode.Range; newText: string }> = [];
      for (const sel of editor.selections) {
        const extracted = sel.isEmpty
          ? extractNibbleAwareToken(editor.document, sel.active)
          : { text: editor.document.getText(sel), range: sel };
        if (!extracted) {
          continue;
        }
        const toggled = toggleDelimitersForToken(
          extracted.text,
          enableOctal,
          nibbleDelim,
          decimalDelimChar,
        );
        if (toggled !== undefined) {
          edits.push({ range: extracted.range, newText: toggled });
        }
      }

      if (edits.length === 0) {
        vscode.window.showWarningMessage(
          "No delimiter-toggleable number found at cursor position",
        );
        return;
      }

      const applied = await editor.edit((eb) => {
        for (const e of edits) {
          eb.replace(e.range, e.newText);
        }
      });
      if (!applied) {
        const clipText = edits.map((e) => e.newText).join("\n");
        await vscode.env.clipboard.writeText(clipText);
        const msg =
          edits.length === 1
            ? `Editor is read-only — copied to clipboard`
            : `Editor is read-only — ${edits.length} values copied to clipboard`;
        vscode.window.showInformationMessage(msg);
      }
    },
  );

  context.subscriptions.push(toggleDelimitersDisposable);

  // Direct convert commands (keyboard-shortcut friendly)
  const directConvertTargets: { cmd: string; target: string }[] = [
    { cmd: "basejump.convertToBinary", target: "Binary" },
    { cmd: "basejump.convertToBinaryDelimited", target: "Binary (nibbles)" },
    { cmd: "basejump.convertToOctal", target: "Octal" },
    { cmd: "basejump.convertToDecimal", target: "Decimal" },
    {
      cmd: "basejump.convertToDecimalDelimited",
      target: "Decimal (thousands)",
    },
    { cmd: "basejump.convertToHex", target: "Hexadecimal" },
    { cmd: "basejump.convertToHexDelimited", target: "Hexadecimal (bytes)" },
  ];
  for (const { cmd, target } of directConvertTargets) {
    context.subscriptions.push(
      vscode.commands.registerCommand(cmd, () => convertToCommand(target)),
    );
  }

  // Initialize context menu keys and keep them in sync with settings
  updateMenuContextKeys();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("basejump")) {
        updateMenuContextKeys();
      }
    }),
  );
}

export function deactivate() {
  console.log("BaseJump extension is now deactivated");
}
