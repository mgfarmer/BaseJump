# BaseJump

Convert numeric literals between bases directly in the editor. BaseJump detects the base of any number under the cursor, presents all valid conversions in a quick-pick menu, and replaces the token in place — or copies the result to the clipboard.

## Features

- **Automatic base detection** — recognizes hexadecimal (`0x`), binary (`0b`), octal (`0o`/leading-zero), and decimal literals, with and without digit-group separators.
- **Interactive conversion** — the **Convert Number** command opens a quick-pick showing every valid target base for the token at the cursor. Select a conversion to apply it.
- **Digit-group separators** — results can include nibble separators for binary (`0b1010'1010`), byte separators for hex (`0xFF'AA`), and thousands separators for decimal (`1'000'000`).
- **Language-aware delimiters** — the separator character matches the convention for the active file's language (C/C++ → `'`, Python/Rust/Java/Go/Kotlin/Swift → `_`, Markdown/plain text → space). Fully overridable per-language in settings.
- **Toggle Delimiters** — add, remove, or switch the digit-group separators on an existing literal in one command.
- **Whole-file conversion** — the **Convert Editor Content** command scans the entire document and converts every compatible token in one operation, using a quick-pick to choose the target base. Great when you paste in a bunch of numbers for conversion in a temporary editor.
- **Favorites** — star any conversion in the quick-pick to pin it at the top for fast access. Favorites are remembered across sessions.
- **Block selection** — select a range of text and run **Convert Number** or a direct command; BaseJump scans the selected block for all individual tokens and converts every one in a single operation.
- **Multi-cursor and multi-selection** — all active cursors and block selections are processed simultaneously.
- **Copy or replace** — choose whether conversions replace the token in the editor or copy the result to the clipboard. Per-item copy and replace buttons in the quick-pick let you override the default for any individual conversion on the fly.

## Context Menu

Right-clicking in any editor shows a **BaseJump** submenu containing:

| Entry | Action |
|---|---|
| Convert Number | Detect base and show conversion quick-pick for the token at the cursor |
| Convert Editor Content | Convert all compatible tokens in the file using a selected source→target pair |
| Toggle Delimiters | Add, remove, or switch digit-group separators on the current token |

## Commands and Keyboard Shortcuts

All BaseJump commands are available in the Command Palette under the `BaseJump:` category and can be bound to keyboard shortcuts in **Preferences → Keyboard Shortcuts**.

| Command | ID | Description |
|---|---|---|
| Convert Number | `basejump.convertNumber` | Interactive quick-pick conversion at the cursor |
| Convert Editor Content | `basejump.convertEditorContent` | Convert all tokens in the file |
| Toggle Delimiters | `basejump.toggleDelimiters` | Add/remove/switch digit separators |
| Convert to Binary | `basejump.convertToBinary` | Direct conversion to binary |
| Convert to Binary (nibbles) | `basejump.convertToBinaryDelimited` | Binary with nibble separators |
| Convert to Octal | `basejump.convertToOctal` | Direct conversion to octal |
| Convert to Decimal | `basejump.convertToDecimal` | Direct conversion to decimal |
| Convert to Decimal (thousands) | `basejump.convertToDecimalDelimited` | Decimal with thousands separators |
| Convert to Hexadecimal | `basejump.convertToHex` | Direct conversion to hexadecimal |
| Convert to Hexadecimal (bytes) | `basejump.convertToHexDelimited` | Hexadecimal with byte separators |

The direct-conversion commands (`convertToBinary`, `convertToHex`, etc.) are well suited for keyboard shortcuts — they operate immediately on the token at the cursor(s) or seelcted block(s) only opening a menu if source bases are ambiguous.

## Settings

| Setting | Default | Description |
|---|---|---|
| `basejump.defaultAction` | `replaceInEditor` | Whether accepting a conversion in the quick-pick replaces the token in the editor (`replaceInEditor`) or copies it to the clipboard (`copyToClipboard`). |
| `basejump.enableOctal` | `false` | Include octal in base detection and the **Convert Number** quick-pick. Disable to declutter the menu — the explicit **Convert to Octal** command remains available regardless. |
| `basejump.enableDelimitedVariants` | `true` | Show nibble-separated binary, byte-separated hex, and thousands-separated decimal as additional options in the quick-pick and **Convert Editor Content** target list. Disable to keep the list shorter. |
| `basejump.fallbackDelimiter` | `apostrophe` | Digit-group separator used when no per-language override or built-in language default applies. Choices: `apostrophe` (`'`), `underscore` (`_`), `space`, `hyphen` (`-`), `period` (`.`). |
| `basejump.conversionGrouping` | `byTarget` | How the **Convert Number** quick-pick is grouped: `byTarget` groups all conversions that produce the same base together; `bySource` groups by the detected source base. |
| `basejump.alwaysPrefixConversions` | `true` | When enabled, results always include the base prefix (`0b`, `0x`, `0o`). When disabled, a prefix is only added if the source token itself was prefixed — bare inputs produce bare outputs. |
| `basejump.assumeBinaryWithoutPrefix` | `true` | Treat an unprefixed token made entirely of `0` and `1` digits as binary, skipping the source-base picker. Takes precedence over **Assume Decimal**. |
| `basejump.assumeDecimalWithoutPrefix` | `true` | Treat an unprefixed all-digit token (or thousands-grouped number) as decimal, skipping the source-base picker. |

The `basejump.fallbackDelimiter` setting is language-overridable, so you can set a different separator per language in your `settings.json`:

```jsonc
"[python]": {
  "basejump.fallbackDelimiter": "underscore"
}
```

Built-in language defaults (applied automatically without any configuration): C/C++ → `'`, Python/Rust/Java/Go/Kotlin/Swift → `_`, Markdown/plain text → space.

**Special case — Decimal (thousands) in text/Markdown files:** When the delimiter for a file is space, converting to `Decimal (thousands)` would produce output like `1 000 000`, which is ambiguous and unfamiliar to most readers. Instead, BaseJump automatically uses the system locale's thousands separator for decimal output in these files — typically `,` on en-US systems (giving `1,000,000`) or `.` on European locales. This only affects decimal thousands output; binary nibble and hex byte output in text files still use space as normal.

## License

See LICENSE for details.
