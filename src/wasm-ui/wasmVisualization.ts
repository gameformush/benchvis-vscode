/**
 * WASM Visualization Module
 */

// Core Types
export interface BenchmarkValue {
    value: number;
    unit: string;
    orig_unit?: string;
}

export interface BenchmarkConfig {
    key: string;
    value: string;
}

export interface BenchmarkResult {
    name: string;
    values: BenchmarkValue[];
    config?: BenchmarkConfig[];
}

interface ParseBenchmarkData {
    paths: string[];
    data: string[];
}

interface Config {
    filter?: string;
    row?: string;
    col?: string;
    ignore?: string;
    table?: string;
    confidence?: number;
    compareAlpha?: number;
}

export interface BenchStatRequest {
    paths: string[];
    data: string[];
    config: Config
}

// Main benchmark data structure
interface BenchmarkData {
    ".unit": string;
    unit: string;
    assumption: string;
    cells: Record<string, Record<string, BenchmarkMeasurement>>;
    cols: string[];
    goarch: string;
    goos: string;
    pkg: string;
    rows: string[];
    summary: Record<string, BenchmarkSummaryItem>;
    summaryLabel: string;
}

// Measurement data for a single benchmark
interface BenchmarkMeasurement {
    center: number;
    range: string;
    comparison?: {
        delta: string;
        nSamples: number;
        pValue: number;
    };
    warnings?: string[];
}

// Summary item
interface BenchmarkSummaryItem {
    value: number;
    pctChange?: string;
    ratio?: number;
}

// Array of benchmark data
type BenchmarkReport = BenchmarkData[];


// Utility Interface Types

interface WasmResponse {
    data?: string;
    error?: string;
}

interface ChartDataset {
    label: string;
    data: (number | null)[];
    backgroundColor: string;
    borderColor: string;
    borderWidth: number;
    hoverBackgroundColor: string;
    hoverBorderColor: string;
    pointBackgroundColor: string;
    pointBorderColor: string;
    pointHoverBackgroundColor: string;
    pointHoverBorderColor: string;
}

// Global Declarations
declare global {
    function parseBenchmarkFiles(jsonData: string): BenchmarkResult[] | WasmResponse;
    function buildBenchstat(jsonData: string): WasmResponse;
    function acquireVsCodeApi(): { postMessage(message: any): void };
    class Go {
        importObject: any;
        argv: string[];
        env: any;
        exit(code: number): void;
        run(instance: WebAssembly.Instance): void;
    }
    interface Window {
        Chart: any;
    }
}

// Color Palettes
const COLOR_PALETTES = {
    default: ['#4285F4', '#EA4335', '#FBBC05', '#34A853', '#8E24AA', '#0097A7', '#00C853', '#FF6D00'],
    pastel: ['#ff9aa2', '#c7ceea', '#b5ead7', '#ffdac1', '#e2f0cb', '#c5a3ff', '#9de3d0', '#f6c3b7']
};

interface File {
    path: string
    data: string
}

export const callBuildBenchstat = (args: BenchStatRequest): [BenchmarkReport | null, string | null] => {
    const wasmResponse = buildBenchstat(JSON.stringify(args)) as WasmResponse;
    if (wasmResponse.error) {
        return [null, wasmResponse.error];
    }
    if (!wasmResponse.data) {
        return [null, "WASM no benchstat data returned"]
    }

    return [(JSON.parse(wasmResponse.data)), null];
}

/**
 * WASM Visualization Controller
 */
export class WasmVisualizationController {
    private customColors = [...COLOR_PALETTES.default];
    private benchmarkChart: any = null;
    private benchmarkResults: BenchmarkResult[] = [];
    private vscode = acquireVsCodeApi();
    private files: File[] = [];

    constructor(private wasmUrl: string) {
        this.initializeApplication();
    }

    private initializeApplication(): void {
        // Check Chart.js availability on load
        window.addEventListener('load', () => {
            if (!window.Chart) {
                this.showError("Chart.js library is not loaded");
                console.error("Chart.js is not defined");
            }
        });

        // Initialize WASM
        this.loadWasmModule();

        // Set up message listener
        window.addEventListener("message", this.handleMessage.bind(this));
    }

    private handleMessage(event: MessageEvent): void {
        try {
            if (event.data?.command === 'parseBenchmark') {
                this.parseBenchmarkData(event.data.data);
            }
        } catch (error) {
            this.showError(`Error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private loadWasmModule(): void {
        const go = new Go();

        const loadWasm = 'instantiateStreaming' in WebAssembly
            ? WebAssembly.instantiateStreaming(fetch(this.wasmUrl), go.importObject)
            : fetch(this.wasmUrl)
                .then(resp => resp.arrayBuffer())
                .then(bytes => WebAssembly.instantiate(bytes, go.importObject));

        loadWasm
            .then(obj => {
                go.run(obj.instance);
                this.vscode.postMessage({ command: 'loaded' });
            })
            .catch(error => {
                this.showError(`Failed to load WASM: ${error.message}`);
            });
    }

    private parseBenchmarkData(data: ParseBenchmarkData | null): void {
        if (!data) {
            this.showError("No benchmark data provided");
            return;
        }

        this.files = []
        for (let i = 0; i < data.paths.length; i++) {
            this.files.push({ path: data.paths[i], data: data.data[i] });
        }

        try {
            const wasmResponse = parseBenchmarkFiles(JSON.stringify(data)) as WasmResponse;
            if (wasmResponse.error) {
                this.showError(`WASM error: ${wasmResponse.error}`);
                return;
            }
            if (!wasmResponse.data) {
                this.showError("WASM parseBenchmarkFiles no data returned")
                return
            }
            this.processBenchmarkResults(JSON.parse(wasmResponse.data));
        } catch (error) {
            this.showError(`Error parsing data: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private processBenchmarkResults(results: BenchmarkResult[]): void {
        // Validate results
        if (!this.validateResults(results)) return;

        this.benchmarkResults = results;

        // Extract metrics and populate UI
        const metrics = this.extractMetrics(results);
        this.populateMetricsDropdown(metrics);

        // Create benchmark list
        this.createBenchmarkList(results);

        // Setup event listeners
        this.setupUIEventListeners();

        // Initialize visualization
        this.updateCustomColorInputs();
        this.updateChart(results);
    }

    private validateResults(results: BenchmarkResult[]): boolean {
        if (!results) {
            this.showError("No benchmark results returned");
            return false;
        }

        if (!Array.isArray(results)) {
            this.showError("Invalid benchmark results format");
            return false;
        }

        if (results.length === 0) {
            this.showError("No benchmark results found");
            return false;
        }

        if (!window.Chart) {
            this.showError("Chart.js library is not loaded");
            return false;
        }

        return true;
    }

    private extractMetrics(results: BenchmarkResult[]): Array<{ name: string, displayName: string }> {
        const metrics: Array<{ name: string, displayName: string }> = [];
        let metricsFound = false;

        results.forEach(result => {
            if (result?.values?.length) {
                result.values.forEach(value => {
                    if (value?.unit && !metrics.some(m => m.name === value.unit)) {
                        metrics.push({
                            name: value.unit,
                            displayName: this.formatMetricName(value.unit)
                        });
                        metricsFound = true;
                    }
                });
            }
        });

        if (!metricsFound) {
            this.showError("No valid metrics found");
        }

        return metrics;
    }

    private populateMetricsDropdown(metrics: Array<{ name: string, displayName: string }>): void {
        const select = document.getElementById('metric-select') as HTMLSelectElement;
        if (!select) return;

        select.innerHTML = '';
        metrics.forEach(metric => {
            const option = document.createElement('option');
            option.value = metric.name;
            option.textContent = metric.displayName;
            select.appendChild(option);
        });
    }

    private createBenchmarkList(results: BenchmarkResult[]): void {
        const list = document.getElementById('benchmark-list');
        if (!list) return;

        list.innerHTML = '';

        // Get unique benchmark names
        const names = new Set<string>();
        results.forEach(result => {
            if (result?.name) names.add(result.name);
        });

        if (names.size === 0) {
            this.showError("No valid benchmark names found");
            return;
        }

        // Add benchmark items to list
        Array.from(names).sort().forEach((name, index) => {
            const item = document.createElement('div');
            item.className = 'benchmark-item';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'benchmark-checkbox';
            checkbox.dataset.index = index.toString();
            checkbox.checked = true;

            const label = document.createElement('label');
            label.textContent = name;

            item.appendChild(checkbox);
            item.appendChild(label);
            list.appendChild(item);
        });
    }

    private setupUIEventListeners(): void {
        // Checkbox listeners
        document.querySelectorAll('.benchmark-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.updateCustomColorInputs();
                this.updateChart(this.benchmarkResults);
            });
        });

        // Metric selector listener
        const metricSelect = document.getElementById('metric-select');
        if (metricSelect) {
            metricSelect.addEventListener('change', () => {
                this.updateChart(this.benchmarkResults);
            });
        }

        // Chart type listener
        const chartType = document.getElementById('chart-type');
        if (chartType) {
            chartType.addEventListener('change', () => {
                this.updateChart(this.benchmarkResults);
            });
        }

        // Color palette listeners
        document.querySelectorAll('.palette').forEach(palette => {
            palette.addEventListener('click', (event) => {
                const target = event.target as HTMLElement;
                const paletteElement = target.closest('.palette');
                if (paletteElement) {
                    const paletteName = paletteElement.getAttribute('data-palette') || 'default';
                    this.customColors = [...COLOR_PALETTES[paletteName as keyof typeof COLOR_PALETTES]];

                    // Update UI
                    document.querySelectorAll('.palette').forEach(p => {
                        p.classList.remove('selected');
                    });
                    paletteElement.classList.add('selected');

                    this.updateCustomColorInputs();
                    this.updateChart(this.benchmarkResults);
                }
            });
        });
    }

    private updateCustomColorInputs(): void {
        const container = document.getElementById('custom-colors');
        if (!container) return;

        container.innerHTML = '';

        // Get selected benchmarks
        const checkboxes = document.querySelectorAll('.benchmark-checkbox:checked');
        Array.from(checkboxes).forEach((checkbox, index) => {
            const nameEl = checkbox.nextElementSibling;
            if (!nameEl) return;

            const name = nameEl.textContent || `Benchmark ${index + 1}`;
            const colorIndex = index % this.customColors.length;

            // Create color input
            const colorInput = document.createElement('div');
            colorInput.className = 'color-input';
            colorInput.innerHTML = `
                <input type="color" data-index="${index}" value="${this.customColors[colorIndex]}">
                <span>${name}</span>
            `;

            container.appendChild(colorInput);
        });

        // Add event listeners
        document.querySelectorAll('#custom-colors input[type="color"]').forEach(input => {
            input.addEventListener('change', (event) => {
                const target = event.target as HTMLInputElement;
                const index = parseInt(target.dataset.index || '0');
                this.customColors[index % this.customColors.length] = target.value;
                this.updateChart(this.benchmarkResults);
            });
        });
    }

    private updateChart(results: BenchmarkResult[]): void {
        try {
            if (!window.Chart) {
                this.showError("Chart.js not available");
                return;
            }

            const selectedBenchmarks = this.getSelectedBenchmarks(results);
            if (selectedBenchmarks.length === 0) return;

            const metricSelect = document.getElementById('metric-select') as HTMLSelectElement;
            const chartTypeSelect = document.getElementById('chart-type') as HTMLSelectElement;
            if (!metricSelect || !chartTypeSelect) return;

            const selectedMetric = metricSelect.value;
            const chartType = chartTypeSelect.value;
            if (!selectedMetric) return;

            // Prepare chart data
            const { datasets, labels } = this.prepareChartData(
                selectedBenchmarks,
                selectedMetric,
                chartType
            );

            if (datasets.length === 0) return;

            // Create chart config
            const chartConfig = this.createChartConfig(
                chartType,
                labels,
                datasets,
                selectedMetric
            );

            // Render chart
            this.renderChart(chartConfig, selectedBenchmarks, selectedMetric, chartType);

        } catch (error) {
            this.showError(`Chart error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private prepareChartData(
        benchmarks: BenchmarkResult[],
        metric: string,
        chartType: string
    ): { datasets: ChartDataset[], labels: string[] } {
        // Group benchmarks by name
        const benchmarksByName: Record<string, BenchmarkResult[]> = {};
        const nameSet = new Set<string>();

        benchmarks.forEach(benchmark => {
            if (benchmark?.name) {
                if (!benchmarksByName[benchmark.name]) {
                    benchmarksByName[benchmark.name] = [];
                    nameSet.add(benchmark.name);
                }
                benchmarksByName[benchmark.name].push(benchmark);
            }
        });

        const names = Array.from(nameSet).sort();

        // Create datasets
        const datasets: ChartDataset[] = [];

        names.forEach((name, index) => {
            const benchmarkGroup = benchmarksByName[name];
            if (!benchmarkGroup?.length) return;

            // Get metric values
            const values = benchmarkGroup.map(benchmark => {
                return this.getMetricValue(benchmark, metric);
            });

            // Skip if no valid values
            if (!values.some(v => v !== null)) return;

            // Get color for this dataset
            const colorIndex = index % this.customColors.length;
            const color = this.customColors[colorIndex];

            datasets.push({
                label: name,
                data: values,
                backgroundColor: this.setAlpha(color, 0.5),
                borderColor: color,
                borderWidth: 1,
                hoverBackgroundColor: this.setAlpha(color, 0.7),
                hoverBorderColor: color,
                pointBackgroundColor: color,
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: color
            });
        });

        // Determine chart labels
        let labels = this.determineChartLabels(benchmarks, names, chartType);

        // Ensure labels match dataset length
        if (datasets.length > 0 && datasets[0].data.length > labels.length) {
            while (labels.length < datasets[0].data.length) {
                labels.push(`Item ${labels.length + 1}`);
            }
        }

        return { datasets, labels };
    }

    private determineChartLabels(
        benchmarks: BenchmarkResult[],
        benchmarkNames: string[],
        chartType: string
    ): string[] {
        // First try to use config values for labels
        const configKeys = new Set<string>();
        benchmarks.forEach(benchmark => {
            if (benchmark?.config?.length) {
                benchmark.config.forEach(cfg => {
                    if (cfg?.key) configKeys.add(cfg.key);
                });
            }
        });

        // Find differentiating keys
        const differentiatingKeys = Array.from(configKeys).filter(key => {
            const values = new Set();
            benchmarks.forEach(benchmark => {
                if (benchmark?.config?.length) {
                    const config = benchmark.config.find(cfg => cfg?.key === key);
                    if (config?.value) values.add(config.value);
                }
            });
            return values.size > 1;
        });

        // Use first differentiating key if available
        if (differentiatingKeys.length > 0) {
            const key = differentiatingKeys[0];
            return benchmarks.map(benchmark => {
                if (benchmark?.config?.length) {
                    const config = benchmark.config.find(cfg => cfg?.key === key);
                    return config?.value ? `${key}: ${config.value}` : 'Unknown';
                }
                return 'Unknown';
            });
        }

        // Fallback to benchmark names or indices
        return chartType === 'bar' || chartType === 'line'
            ? benchmarkNames
            : benchmarks.map((_, i) => `Run ${i + 1}`);
    }

    private createChartConfig(
        chartType: string,
        labels: string[],
        datasets: ChartDataset[],
        metric: string
    ): any {
        return {
            type: chartType,
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: this.formatMetricName(metric)
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Benchmark'
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: (context: any) => {
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                if (context.parsed.y !== null) {
                                    label += this.formatMetricValue(context.parsed.y, metric);
                                }
                                return label;
                            }
                        }
                    },
                    legend: { position: 'top' },
                    title: {
                        display: true,
                        text: `Benchmark Results - ${this.formatMetricName(metric)}`
                    }
                }
            }
        };
    }

    private renderChart(
        config: any,
        benchmarks: BenchmarkResult[],
        metric: string,
        chartType: string
    ): void {
        const canvas = document.getElementById('benchmarkChart') as HTMLCanvasElement;
        if (!canvas) {
            this.showError("Chart canvas not found");
            return;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            this.showError("Canvas context not available");
            return;
        }

        // Destroy existing chart if it exists
        if (this.benchmarkChart) {
            this.benchmarkChart.destroy();
        }

        // Create new chart
        this.benchmarkChart = new window.Chart(ctx, config);

        // Notify extension
        this.vscode.postMessage({
            command: 'updateVisualization',
            selectedBenchmarks: Array.from(new Set(benchmarks.map(b => b.name))),
            selectedMetric: metric,
            chartType
        });
    }

    // Utility Methods

    private showError(message: string): void {
        const container = document.getElementById('error-container');
        if (!container) return;

        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        container.innerHTML = '';
        container.appendChild(errorDiv);
        console.error(message);
    }

    private setAlpha(color: string, alpha: number): string {
        if (color.startsWith('#')) {
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
        return color;
    }

    private formatMetricValue(value: number, metric: string): string {
        if (metric === 'sec/op') {
            if (value < 0.000001) {
                return `${(value * 1000000000).toFixed(2)} ns/op`;
            } else if (value < 0.001) {
                return `${(value * 1000000).toFixed(2)} µs/op`;
            } else if (value < 1) {
                return `${(value * 1000).toFixed(2)} ms/op`;
            } else {
                return `${value.toFixed(4)} sec/op`;
            }
        } else if (metric === 'B/op') {
            if (value > 1048576) {
                return `${(value / 1048576).toFixed(2)} MB/op`;
            } else if (value > 1024) {
                return `${(value / 1024).toFixed(2)} KB/op`;
            } else {
                return `${value.toFixed(2)} B/op`;
            }
        } else if (metric === 'allocs/op') {
            return `${value} allocs/op`;
        } else if (metric === 'size') {
            return `${value} bytes`;
        } else {
            return Math.floor(value) !== value
                ? `${value.toFixed(2)} ${metric}`
                : `${value} ${metric}`;
        }
    }

    private formatMetricName(metricName: string): string {
        switch (metricName) {
            case 'sec/op': return 'Time (sec/op)';
            case 'ns/op': return 'Time (ns/op)';
            case 'B/op': return 'Memory (B/op)';
            case 'allocs/op': return 'Allocations (allocs/op)';
            case 'size': return 'Size (bytes)';
            default:
                return metricName
                    .replace(/_/g, ' ')
                    .replace(/\//g, ' per ')
                    .replace(/\b\w/g, c => c.toUpperCase());
        }
    }

    private getSelectedBenchmarks(results: BenchmarkResult[]): BenchmarkResult[] {
        if (!results?.length) return [];

        const checkboxes = document.querySelectorAll('.benchmark-checkbox:checked');
        const selectedNames = Array.from(checkboxes)
            .map(checkbox => {
                const nameEl = checkbox.nextElementSibling;
                return nameEl ? nameEl.textContent : '';
            })
            .filter(Boolean);

        return results.filter(result => result?.name && selectedNames.includes(result.name));
    }

    private getMetricValue(result: BenchmarkResult, metricName: string): number | null {
        if (!result?.values?.length) return null;

        const metric = result.values.find(v => v?.unit === metricName);
        return metric ? metric.value : null;
    }
}

/**
 * Initialize the WASM visualization
 * @param wasmUrl URL to the WASM binary
 */
export function initializeWasmVisualization(wasmUrl: string): WasmVisualizationController {
    return new WasmVisualizationController(wasmUrl);
}