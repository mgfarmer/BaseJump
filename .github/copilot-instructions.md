# BaseJump – Copilot Instructions

## Always: Run Tests After Code Changes

After completing any code change — bug fix, feature, refactor, or settings update — run the full test suite before finishing:

```
yarn test
```

All tests must pass. If a test fails due to the change, fix it before stopping. If a pre-existing test is stale (behaviour intentionally changed), remove or update it and explain why.

## Always: Update README When Behavior or Settings Change

Whenever any of the following change, update `README.md` to match:

- Settings (new, removed, renamed, default value changed, description changed)
- Commands (new, removed, renamed, ID changed)
- UI behavior (toasts, quick-pick grouping, titles)
- Feature behavior (detection, conversion output, block selection, etc.)

The README `## Settings` table must stay in sync with `package.json` — correct names, defaults, and descriptions.

## Surgical Changes Only

- Touch only what is directly required by the request.
- Do not refactor, reformat, or "improve" adjacent code.
- Do not add error handling, abstractions, or configurability that wasn't asked for.
- If unused imports or variables result from your changes, remove them. Do not remove pre-existing dead code unless asked.

## Discuss Before Implementing Significant Changes

For changes that eliminate existing functionality, change default behavior, or involve significant architectural decisions, present the trade-offs and confirm intent before writing code.

## Code Conventions

- **Test files**: `src/test/suite/conversion.test.ts` (pure logic), `src/test/suite/extension.test.ts` (integration/VS Code)
- **Pure logic**: `src/conversion.ts` — no VS Code imports, all functions exported and unit-tested
- **Extension glue**: `src/extension.ts` — VS Code API, commands, QuickPick, settings reads
- **Build**: `yarn compile`, **Test**: `yarn test`, **Package**: `yarn package`
- Settings defaults in `package.json` must match the hardcoded fallback values in `cfg.get<T>(key, fallback)` calls in `extension.ts`
- Command IDs in `package.json` `contributes.commands` and `contributes.menus` must match the strings passed to `vscode.commands.registerCommand` in `extension.ts`

## Toast Behavior

- **Single token conversions**: silent — no success toast.
- **Multi-token conversions** (multi-cursor, block selection, explicit commands processing >1 token): show a brief summary, e.g. `"Converted N tokens"`.
- **Copy to clipboard**: always toast regardless of token count.
- **Convert Editor Content**: always toast with replacement count, e.g. `"N replacements applied (source→target)"`.
- **Errors and warnings** (no token found, no common base, etc.): always show.
