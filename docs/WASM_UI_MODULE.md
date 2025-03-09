# WASM UI Module

This document describes the WASM UI module, a TypeScript-based component that handles visualization of benchmark data using WebAssembly.

## Overview

The WASM UI module is a standalone TypeScript module that is compiled separately from the main VSCode extension. It provides a clean separation of concerns between the template UI code and the extension code, enabling independent development and maintenance of each component.

## Architecture

The architecture consists of the following components:

1. **TypeScript Module (`src/wasm-ui/wasmVisualization.ts`)**: Contains the TypeScript code that handles the visualization logic, extracted from the original JavaScript embedded in the `wasm.hbs` template.

2. **Handlebars Template (`templates/wasm-ts.hbs`)**: The HTML template that includes the UI markup and imports the compiled TypeScript module.

3. **Build Configuration**: The build process is configured to compile the WASM UI module separately from the main extension code.

## Directory Structure

```
benchvis-vscode/
├── src/
│   ├── wasm-ui/
│   │   ├── wasmVisualization.ts  # The TypeScript module
│   │   └── tsconfig.json         # TypeScript configuration for the module
│   ├── commands/
│   │   └── wasmTest/
│   │       ├── visualization.ts  # Updated to use the TypeScript module
│   │       └── wasm.ts
│   └── extension.ts
├── templates/
│   ├── wasm.hbs                  # Original template with embedded JavaScript
│   ├── wasm-ts.hbs               # New template that imports the TypeScript module
│   └── wasm.js                   # WASM support JavaScript
├── dist/
│   ├── extension.js              # Compiled extension code
│   ├── main.wasm                 # WASM binary
│   └── wasm-ui/
│       └── wasmVisualization.js  # Compiled WASM UI module
├── esbuild.js                    # Build configuration
└── Makefile                      # Build commands
```

## Build Process

The build process is configured to compile the WASM UI module separately from the main extension code, enabling independent development and maintenance of each component.

### Building the WASM UI Module

To build only the WASM UI module:

```bash
make build-wasm-ui
# or
node esbuild.js --wasm-ui-only
```

### Building the Extension

To build only the extension:

```bash
make build-extension
# or
node esbuild.js --extension-only
```

### Building Both

To build both the extension and the WASM UI module:

```bash
make build
# or
node esbuild.js
```

### Watch Mode

To build in watch mode:

```bash
make watch
# or
node esbuild.js --watch
```

## Module Integration

The WASM UI module is integrated with the extension through the following steps:

1. The `visualization.ts` file in the `commands/wasmTest` directory loads the compiled WASM UI module.

2. The `wasm-ts.hbs` template includes a reference to the compiled module.

3. When the visualization panel is created, the module is initialized with the URL to the WASM binary.

## Types and Interfaces

The WASM UI module defines the following types and interfaces:

- `BenchmarkValue`: Represents a benchmark value with its unit.
- `BenchmarkConfig`: Represents a configuration key-value pair.
- `BenchmarkResult`: Represents a benchmark result with its name, values, and configuration.
- `VSCodeAPI`: Interface for the VS Code API that the webview uses to communicate with the extension.
- `ChartConfiguration`: Configuration for Chart.js charts.
- `ColorPalettes`: Collection of color palettes for visualization.

## Development Workflow

1. Make changes to the TypeScript module in `src/wasm-ui/wasmVisualization.ts`.
2. Build the module using `make build-wasm-ui`.
3. Test the changes by running the extension.

## Maintenance

When updating the WASM UI module:

1. Ensure that any new interfaces or types are properly defined.
2. Update the `wasm-ts.hbs` template if necessary.
3. Update the build configuration if new files are added.
4. Document any changes to the module's API or behavior.