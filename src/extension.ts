import * as vscode from "vscode";

const FAVORITES_KEY = "numcpy.favorites";

// --- Nibble delimiter ---

const NIBBLE_DELIMITER_CHARS: Record<string, string> = {
  underscore: "_",
  hyphen: "-",
  space: " ",
  period: ".",
};

function getDelimiterChar(cfg: vscode.WorkspaceConfiguration): string {
  const key = cfg.get<string>("nibbleDelimiter", "underscore");
  return NIBBLE_DELIMITER_CHARS[key] ?? "_";
}

// Strip all recognized nibble delimiter characters from a string
function stripNibbleDelimiters(s: string): string {
  return s.replace(/[|_\-. ]/g, "");
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
  // Covers |, _, -, and . (not space — handled below)
  const inlineRegex = /(?:0b)?[01]+(?:[|_\-.][01]+)+/i;
  const inlineRange = doc.getWordRangeAtPosition(position, inlineRegex);
  if (inlineRange) {
    return { text: doc.getText(inlineRange), range: inlineRange };
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

interface NumberBase {
  name: string;
  base: number;
  value: number;
}

interface ConversionQuickPickItem extends vscode.QuickPickItem {
  convertedValue: string;
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

// --- Number detection ---

function detectValidBases(text: string, enableOctal: boolean): NumberBase[] {
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

  // Decimal: only pure digit strings
  if (/^[0-9]+$/.test(clean)) {
    validBases.push({ name: "Decimal", base: 10, value: parseInt(clean, 10) });
  }

  // Hexadecimal: 0x prefix, or contains a–f chars
  if (/^0x[0-9a-f]+$/i.test(clean)) {
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

const BASE_ORDER = [
  "Binary",
  "Binary (nibbles)",
  "Octal",
  "Decimal",
  "Hexadecimal",
];

function toBinaryNibbles(value: number, delimChar: string): string {
  const bits = value.toString(2);
  const padded = bits.padStart(Math.ceil(bits.length / 4) * 4, "0");
  const groups = padded.match(/[01]{4}/g) ?? [padded];
  return "0b" + groups.join(delimChar);
}

function convertToAllBases(
  value: number,
  enableOctal: boolean,
  enableNibbles: boolean,
  nibbleDelim: string,
): Record<string, string> {
  const result: Record<string, string> = {
    Binary: "0b" + value.toString(2),
    Decimal: value.toString(10),
    Hexadecimal: "0x" + value.toString(16).toUpperCase(),
  };
  if (enableOctal) {
    result["Octal"] = "0o" + value.toString(8);
  }
  if (enableNibbles) {
    result["Binary (nibbles)"] = toBinaryNibbles(value, nibbleDelim);
  }
  return result;
}

// --- QuickPick item builder ---

function buildItems(
  validBases: NumberBase[],
  enableOctal: boolean,
  enableNibbles: boolean,
  nibbleDelim: string,
  context: vscode.ExtensionContext,
  copyButton: vscode.QuickInputButton,
  replaceButton: vscode.QuickInputButton,
  starButtons: {
    full: vscode.QuickInputButton;
    empty: vscode.QuickInputButton;
  },
): ConversionQuickPickItem[] {
  const items: ConversionQuickPickItem[] = [];

  for (const source of validBases) {
    const conversions = convertToAllBases(
      source.value,
      enableOctal,
      enableNibbles,
      nibbleDelim,
    );
    for (const targetName of BASE_ORDER) {
      if (!enableOctal && targetName === "Octal") {
        continue;
      }
      if (!enableNibbles && targetName === "Binary (nibbles)") {
        continue;
      }
      if (targetName === source.name) {
        continue;
      }
      const converted = conversions[targetName];
      if (converted === undefined) {
        continue;
      }

      const key = `${source.name}\u2192${targetName}`;
      const fav = isFavorite(context, key);

      items.push({
        label: converted,
        detail: key,
        convertedValue: converted,
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

  // Sort: favorites first, then by canonical base order within each group
  items.sort((a, b) => {
    const aFav = isFavorite(context, a.conversionKey) ? 0 : 1;
    const bFav = isFavorite(context, b.conversionKey) ? 0 : 1;
    if (aFav !== bFav) {
      return aFav - bFav;
    }
    return BASE_ORDER.indexOf(a.targetBase) - BASE_ORDER.indexOf(b.targetBase);
  });

  return items;
}

// --- activate ---

export function activate(context: vscode.ExtensionContext) {
  console.log("NumCpy extension is now active!");

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
    "numcpy.convertNumber",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor found");
        return;
      }

      // --- Extract text and range ---
      let extractedText = "";
      let textRange: vscode.Range;

      const selection = editor.selection;
      if (selection.isEmpty) {
        const extracted = extractNibbleAwareToken(
          editor.document,
          selection.active,
        );
        if (!extracted) {
          vscode.window.showWarningMessage("No word found at cursor position");
          return;
        }
        extractedText = extracted.text;
        textRange = extracted.range;
      } else {
        extractedText = editor.document.getText(selection);
        textRange = selection;
      }

      console.log("NumCpy extracted text:", extractedText);

      // --- Configuration ---
      const cfg = vscode.workspace.getConfiguration("numcpy");
      const defaultAction = cfg.get<string>("defaultAction", "copyToClipboard");
      const enableOctal = cfg.get<boolean>("enableOctal", true);
      const enableNibbles = cfg.get<boolean>("enableBinaryNibbles", true);
      const nibbleDelim = getDelimiterChar(cfg);

      // --- Detect valid bases ---
      const validBases = detectValidBases(extractedText, enableOctal);
      if (validBases.length === 0) {
        vscode.window.showWarningMessage(
          `"${extractedText}" is not a valid number in any supported base`,
        );
        return;
      }

      // --- Build items ---
      let items = buildItems(
        validBases,
        enableOctal,
        enableNibbles,
        nibbleDelim,
        context,
        copyButton,
        replaceButton,
        starButtons,
      );
      if (items.length === 0) {
        vscode.window.showInformationMessage("No conversions available");
        return;
      }

      // --- Helper actions ---
      const activeEditor = editor; // capture for closures

      async function doCopy(value: string) {
        await vscode.env.clipboard.writeText(value);
        vscode.window.showInformationMessage(`Copied: ${value}`);
      }

      function doReplace(value: string) {
        activeEditor.edit((eb) => eb.replace(textRange, value));
        vscode.window.showInformationMessage(`Replaced with: ${value}`);
      }

      // --- Build and show QuickPick ---
      const qp = vscode.window.createQuickPick<ConversionQuickPickItem>();
      const defaultHint =
        defaultAction === "replaceInEditor"
          ? "Enter replaces in editor  |  [copy] copy  |  [star] toggle favorite"
          : "Enter copies to clipboard  |  [replace] replace  |  [star] toggle favorite";
      qp.title = `Convert: "${extractedText}" (${validBases.map((b) => b.name).join(", ")})  ·  ${defaultHint}`;
      qp.placeholder = "Select a conversion";
      qp.items = items;

      // Button clicks
      qp.onDidTriggerItemButton(async (e) => {
        const item = e.item;
        if (e.button === copyButton) {
          await doCopy(item.convertedValue);
          qp.hide();
        } else if (e.button === replaceButton) {
          doReplace(item.convertedValue);
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
          doReplace(selected.convertedValue);
        } else {
          await doCopy(selected.convertedValue);
        }
        qp.hide();
      });

      qp.onDidHide(() => qp.dispose());
      qp.show();
    },
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {
  console.log("NumCpy extension is now deactivated");
}
