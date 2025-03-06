# BenchVis: Go Benchmark Visualization

BenchVis is a VS Code extension for visualizing Go benchmark results. It supports both raw Go benchmark output and `benchstat` formatted comparisons with an interactive, customizable visualization interface.

## Features

### Raw Go Benchmark Visualization

Visualize the results of Go benchmarks directly from test output:

- Parse and visualize raw Go benchmark output (`go test -bench` results)
- Automatically detect and format custom metrics
- Interactive charts with multiple visualization options
- Support for various input sizes and benchmark configurations

To use this feature:
1. Run your Go benchmarks and copy the output
2. Open the output in VS Code
3. Run the command `BenchVis: Visualize Go Benchmark Output`

### Benchstat Visualization

Visualize and compare benchmark results processed with Go's `benchstat` tool:

- Interactive comparison of multiple benchmark implementations
- Support for standard benchstat metrics (time, throughput)
- Delta percentage visualization with color coding
- Customizable charts with multiple views and options

To use this feature:
1. Run benchstat to compare benchmark results
2. Open the benchstat output in VS Code
3. Run the command `BenchVis: Visualize Benchstat Output`

### Visualization Features

Both visualization modes provide:

- Multiple chart types (bar, line, radar, scatter)
- Customizable color palettes
- Chart export functionality (PNG)
- Interactive data exploration
- Tabular data view
- Appearance customization options
- Support for logarithmic scale for throughput metrics
- Normalization to baseline implementation

## Requirements

- VS Code 1.60.0 or higher
- For generating benchmarks, you need Go installed

The extension has no external dependencies and works with any Go benchmark output.

## Usage

### Working with Raw Go Benchmarks

1. Run your Go benchmarks with:
   ```sh
   go test -bench . > benchmarks.txt
   ```

2. Open the benchmark file in VS Code

3. Open the command palette (Ctrl+Shift+P / Cmd+Shift+P) and run:
   ```
   BenchVis: Visualize Go Benchmark Output
   ```

### Working with Benchstat Output

1. Run benchstat to compare benchmark results:
   ```sh
   benchstat old.txt new.txt > comparison.txt
   ```

2. Open the comparison file in VS Code

3. Open the command palette (Ctrl+Shift+P / Cmd+Shift+P) and run:
   ```
   BenchVis: Visualize Benchstat Output
   ```

## Chart Interface

The visualization interface provides multiple options:

- **Chart View**: The primary visualization with customizable charts
- **Table View**: Tabular data representation with color-coded deltas
- **Appearance**: Customize chart settings, fonts, and display options

### Chart Controls

- **Implementations**: Select which benchmark implementations to display
- **Metric**: Choose between time, throughput, or custom metrics
- **Chart Type**: Select between bar, line, radar, and scatter charts
- **Options**: Toggle delta display, normalization, and other features
- **Colors**: Choose from predefined color palettes or customize colors
- **Export**: Save charts as PNG images

## Release Notes

### 1.0.0

Initial release with support for:
- Raw Go benchmark visualization
- Benchstat comparison visualization
- Interactive charts and customization options

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

**Enjoy visualizing your Go benchmarks!**
