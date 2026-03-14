# BaseJump

Convert numeric literals between bases directly in the editor. BaseJump detects the base of any number under the cursor, presents all valid conversions in a quick-pick menu, and replaces the token in place — or copies the result to the clipboard.

## Features

- **Automatic base detection** — recognizes hexadecimal (`0x`), binary (`0b`), octal (`0o`/leading-zero), and decimal literals, with and without digit-group separators.
- **Interactive conversion** — the **Convert Number** command opens a quick-pick showing every valid target base for the token at the cursor. Select a conversion to apply it.
- **Digit-group separators** — results can include nibble separators for binary (`0b1010'1010`), byte separators for hex (`0xFF'AA`), and thousands separators for decimal (`1'000'000`).
- **Language-aware delimiters** — the separator character matches the convention for the active file's language (C/C++ → `'`, Python/Rust/Java/Go/Kotlin/Swift → `_`, Markdown/plain text → space). Fully overridable per-language in settings.
- **Toggle Delimiters** — add, remove, or switch the digit-group separators on an existing literal in one command.
- **Whole-file conversion** — the **Convert File** command scans the entire document and converts every compatible token in one operation, using a quick-pick to choose the source→target pair. Great when you paste in a bunch of numbers for conversion in a temporary editor.
- **Favorites** — star any conversion in the quick-pick to pin it at the top for fast access. Favorites are remembered across sessions.
- **Multi-cursor and multi-selection** — all active selections or cursor positions are processed simultaneously.
- **Copy or replace** — choose whether conversions replace the token in the editor or copy the result to the clipboard.

## Context Menu

Right-clicking in any editor shows a **BaseJump** submenu containing:

| Entry | Action |
|---|---|
| Convert Number | Detect base and show conversion quick-pick for the token at the cursor |
| Convert File | Convert all compatible tokens in the file using a selected source→target pair |
| Toggle Delimiters | Add, remove, or switch digit-group separators on the current token |

## Commands and Keyboard Shortcuts

All BaseJump commands are available in the Command Palette under the `BaseJump:` category and can be bound to keyboard shortcuts in **Preferences → Keyboard Shortcuts**.

| Command | ID | Description |
|---|---|---|
| Convert Number | `basejump.convertNumber` | Interactive quick-pick conversion at the cursor |
| Convert File | `basejump.convertFile` | Convert all tokens in the file |
| Toggle Delimiters | `basejump.toggleDelimiters` | Add/remove/switch digit separators |
| Convert to Binary | `basejump.convertToBinary` | Direct conversion to binary |
| Convert to Binary (nibbles) | `basejump.convertToBinaryDelimited` | Binary with nibble separators |
| Convert to Octal | `basejump.convertToOctal` | Direct conversion to octal |
| Convert to Decimal | `basejump.convertToDecimal` | Direct conversion to decimal |
| Convert to Decimal (thousands) | `basejump.convertToDecimalDelimited` | Decimal with thousands separators |
| Convert to Hexadecimal | `basejump.convertToHex` | Direct conversion to hexadecimal |
| Convert to Hexadecimal (bytes) | `basejump.convertToHexDelimited` | Hexadecimal with byte separators |

The direct-conversion commands (`convertToBinary`, `convertToHex`, etc.) are well suited for keyboard shortcuts — they operate immediately on the token at the cursor without opening a menu.

## Settings

| Setting | Default | Description |
|---|---|---|
| `basejump.defaultAction` | `replaceInEditor` | Whether a conversion replaces the token or copies to the clipboard. |
| `basejump.enableOctal` | `true` | Include octal in base detection and the conversion menu. |
| `basejump.enableBinaryNibbles` | `true` | Show nibble-separated binary as a secondary option. |
| `basejump.enableHexBytes` | `true` | Show byte-separated hex as a secondary option. |
| `basejump.enableDecimalThousands` | `true` | Show thousands-separated decimal as a secondary option. |
| `basejump.fallbackDelimiter` | `apostrophe` | Global fallback separator character when no language default applies. Choices: `apostrophe`, `underscore`, `space`, `hyphen`, `period`. |

The `basejump.fallbackDelimiter` setting is language-overridable, so you can set a different separator per language in your `settings.json`:

```jsonc
"[python]": {
  "basejump.fallbackDelimiter": "underscore"
}
```

## License

See LICENSE for details.
