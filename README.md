# NumCpy

A VS Code extension that adds a context menu command to process selected text in the editor.

## Features

- **Context Menu Command**: Right-click on selected text in any editor to process it
- The command only appears when text is selected
- Example implementation converts selected text to uppercase

## Development

### Prerequisites

- Node.js and Yarn
- VS Code

### Getting Started

1. Clone the repository:

   ```bash
   git clone https://github.com/mgfarmer/numcpy.git
   cd numcpy
   ```

2. Install dependencies:

   ```bash
   yarn install
   ```

3. Compile TypeScript:

   ```bash
   yarn compile
   ```

### Testing the Extension

1. Open this project in VS Code
2. Press `F5` to open a new Extension Development Host window
3. In the new window, open any file and select some text
4. Right-click on the selection to see "Process Text with NumCpy" in the context menu
5. Click the command to process the selected text

### Available Scripts

- `yarn compile` - Compile TypeScript to JavaScript
- `yarn watch` - Watch mode for automatic compilation
- `yarn lint` - Run ESLint on the source code

## Project Structure

```
.
├── src/
│   └── extension.ts      # Main extension code
├── out/                  # Compiled JavaScript (generated)
├── package.json          # Extension manifest
├── tsconfig.json         # TypeScript configuration
└── .vscodeignore        # Files to exclude from package
```

## Extension Configuration

The extension contributes:

- **Command**: `numcpy.processText` - Process selected text
- **Context Menu**: Appears in editor context menu when text is selected

## License

See LICENSE file for details.
