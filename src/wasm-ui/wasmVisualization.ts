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

const vscode = acquireVsCodeApi();

/**
 * WASM Visualization Controller
 */
export class WasmVisualizationController {
    private selectedPalette = 'default';
    private customColors = [...COLOR_PALETTES.default];
    private benchmarkChart: any = null;
    private benchmarkReport: BenchmarkReport = []; // Store benchmark report directly
    private files: File[] = [];
    private currentTab = 'unified-tab';

    // Chart settings
    private chartSettings = {
        showGrid: true,
        showXGrid: true,
        showYGrid: true,
        pointStyle: 'circle',
        enableAnimations: true,
        legendPosition: 'top',
        titleSize: 14,
        labelSize: 12,
        tickSize: 10
    };

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
            } else if (event.data?.command === 'refreshData') {
                // Re-run the analysis with updated configuration
                this.refreshBenchmarkData();
            }
        } catch (error) {
            this.showError(`Error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Refresh the benchmark data with updated config options
     */
    private refreshBenchmarkData(): void {
        if (!this.files || this.files.length === 0) {
            this.showError("No benchmark data available to refresh");
            return;
        }

        // Create and use the same data structure expected by parseBenchmarkData
        const data: ParseBenchmarkData = {
            paths: this.files.map(f => f.path),
            data: this.files.map(f => f.data)
        };

        // Re-parse with updated configuration values
        this.parseBenchmarkData(data);
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
                vscode.postMessage({ command: 'loaded' });
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
            // Get config values from the UI
            const config: Config = this.getConfigFromUI();

            // Create the benchStatRequest with the data and config
            const benchStatRequest: BenchStatRequest = {
                paths: data.paths,
                data: data.data,
                config: config
            };

            // Call buildBenchstat instead of parseBenchmarkFiles
            const [result, error] = callBuildBenchstat(benchStatRequest);
            if (error) {
                this.showError(`WASM error: ${error}`);
                return;
            }
            if (!result) {
                this.showError("No benchmark data returned");
                return;
            }

            // Process the benchmark results
            this.processBenchstatResults(result);
        } catch (error) {
            this.showError(`Error parsing data: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Get configuration options from UI inputs
     */
    private getConfigFromUI(): Config {
        const config: Config = {};

        // Get filter value
        const filterInput = document.getElementById('benchmark-filter') as HTMLInputElement;
        if (filterInput && filterInput.value) {
            config.filter = filterInput.value;
        }

        // Get row value
        const rowInput = document.getElementById('benchmark-row') as HTMLInputElement;
        if (rowInput && rowInput.value) {
            config.row = rowInput.value;
        }

        // Get col value
        const colInput = document.getElementById('benchmark-col') as HTMLInputElement;
        if (colInput && colInput.value) {
            config.col = colInput.value;
        }

        // Get ignore value
        const ignoreInput = document.getElementById('benchmark-ignore') as HTMLInputElement;
        if (ignoreInput && ignoreInput.value) {
            config.ignore = ignoreInput.value;
        }

        // Get table value
        const tableInput = document.getElementById('benchmark-table') as HTMLInputElement;
        if (tableInput && tableInput.value) {
            config.table = tableInput.value;
        }

        // Get confidence value
        const confidenceInput = document.getElementById('benchmark-confidence') as HTMLInputElement;
        if (confidenceInput && confidenceInput.value) {
            const confidenceValue = parseFloat(confidenceInput.value);
            if (!isNaN(confidenceValue)) {
                config.confidence = confidenceValue;
            }
        }

        // Get compareAlpha value
        const compareAlphaInput = document.getElementById('benchmark-compare-alpha') as HTMLInputElement;
        if (compareAlphaInput && compareAlphaInput.value) {
            const compareAlphaValue = parseFloat(compareAlphaInput.value);
            if (!isNaN(compareAlphaValue)) {
                config.compareAlpha = compareAlphaValue;
            }
        }

        return config;
    }

    /**
     * Process benchmark report from benchstat
     */
    private processBenchstatResults(results: BenchmarkReport): void {
        // Validate results
        if (!results || !Array.isArray(results) || results.length === 0) {
            this.showError("No valid benchmark data found");
            return;
        }

        // Extract metrics from the first result
        const firstTable = results[0];
        if (!firstTable || !firstTable.unit) {
            this.showError("Invalid benchmark data format");
            return;
        }

        // Store the benchmark report directly
        this.benchmarkReport = results;

        // Extract metrics and populate UI
        const metrics = this.extractMetricsFromReport(results);
        this.populateMetricsDropdown(metrics);

        // Create benchmark list from report rows and cols
        this.createBenchmarkListFromReport(results);

        // Setup event listeners
        this.setupUIEventListeners();

        // Initialize visualization
        this.updateChartFromReport(results);
    }

    /**
     * Extract metrics from BenchmarkReport
     */
    private extractMetricsFromReport(report: BenchmarkReport): Array<{ name: string, displayName: string }> {
        const metrics: Array<{ name: string, displayName: string }> = [];
        let metricsFound = false;

        // Add metrics from tables
        report.forEach(table => {
            if (table?.unit && !metrics.some(m => m.name === table.unit)) {
                metrics.push({
                    name: table.unit,
                    displayName: this.formatMetricName(table.unit)
                });
                metricsFound = true;
            }
        });

        if (!metricsFound) {
            this.showError("No valid metrics found in the report");
        }

        return metrics;
    }

    /**
     * Create benchmark list from BenchmarkReport
     */
    private createBenchmarkListFromReport(report: BenchmarkReport): void {
        const list = document.getElementById('benchmark-list');
        if (!list) return;

        list.innerHTML = '';

        // Collect all unique row names across all tables
        const benchmarkNames = new Set<string>();
        report.forEach(table => {
            if (table?.rows) {
                table.rows.forEach(row => benchmarkNames.add(row));
            }
        });

        if (benchmarkNames.size === 0) {
            this.showError("No benchmark names found in the report");
            return;
        }

        // Add benchmark items to list
        Array.from(benchmarkNames).sort().forEach((name, index) => {
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

    /**
     * Update chart using BenchmarkReport data
     */
    private updateChartFromReport(report: BenchmarkReport): void {
        try {
            if (!window.Chart) {
                this.showError("Chart.js not available");
                return;
            }

            const metricSelect = document.getElementById('metric-select') as HTMLSelectElement;
            const chartTypeSelect = document.getElementById('chart-type') as HTMLSelectElement;
            if (!metricSelect || !chartTypeSelect) return;

            const selectedMetric = metricSelect.value;
            const chartType = chartTypeSelect.value;
            if (!selectedMetric) return;

            // Get selected benchmarks
            const selectedBenchmarks = this.getSelectedBenchmarksFromReport(report);
            if (selectedBenchmarks.length === 0) return;

            // Prepare chart data
            const { datasets, labels } = this.prepareChartDataFromReport(
                selectedBenchmarks,
                selectedMetric,
                chartType,
                report
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

            // Update table view with the same data
            this.updateTableFromReport(report, selectedMetric);
        } catch (error) {
            this.showError(`Chart error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Get selected benchmarks from checkboxes
     */
    private getSelectedBenchmarksFromReport(): string[] {
        const checkboxes = document.querySelectorAll('.benchmark-checkbox:checked');
        return Array.from(checkboxes)
            .map(checkbox => {
                const nameEl = checkbox.nextElementSibling;
                return nameEl ? nameEl.textContent : '';
            })
            .filter(Boolean) as string[];
    }

    /**
     * Prepare chart data from BenchmarkReport
     */
    private prepareChartDataFromReport(
        selectedBenchmarks: string[],
        metric: string,
        chartType: string,
        report: BenchmarkReport
    ): { datasets: ChartDataset[], labels: string[] } {
        // Find the table with the selected metric
        const table = report.find(t => t.unit === metric);
        if (!table || !table.rows || !table.cols || !table.cells) {
            return { datasets: [], labels: [] };
        }

        // Filter rows based on selected benchmarks
        const filteredRows = table.rows.filter(row => selectedBenchmarks.includes(row));
        if (filteredRows.length === 0) {
            return { datasets: [], labels: [] };
        }

        // Create datasets - one for each column
        const datasets: ChartDataset[] = [];

        table.cols.forEach((col, colIndex) => {
            const data: (number | null)[] = [];

            // Collect data points for this column across all selected rows
            filteredRows.forEach(row => {
                const cell = table.cells[row]?.[col];
                data.push(cell ? cell.center : null);
            });

            // Skip if no valid data
            if (!data.some(d => d !== null)) return;

            // Get color for this dataset
            const colorIndex = colIndex % this.customColors.length;
            const color = this.customColors[colorIndex];

            datasets.push({
                label: col,
                data: data,
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

        // Use row names as labels
        const labels = filteredRows;

        return { datasets, labels };
    }

    /**
     * Update table view with data from BenchmarkReport
     */
    private updateTableFromReport(report: BenchmarkReport, selectedMetric: string): void {
        const tableHeader = document.getElementById('table-header');
        const tableBody = document.getElementById('table-body');
        if (!tableHeader || !tableBody) return;

        // Clear existing table
        tableHeader.innerHTML = '';
        tableBody.innerHTML = '';

        // Find the table with the selected metric
        const table = report.find(t => t.unit === selectedMetric);
        if (!table || !table.rows || !table.cols || !table.cells) {
            return;
        }

        // Create header row
        const headerRow = document.createElement('tr');
        const benchmarkHeader = document.createElement('th');
        benchmarkHeader.textContent = 'Benchmark';
        headerRow.appendChild(benchmarkHeader);

        // Add column headers
        table.cols.forEach(col => {
            const th = document.createElement('th');
            th.textContent = col;
            headerRow.appendChild(th);
        });

        tableHeader.appendChild(headerRow);

        // Get selected benchmarks
        const selectedBenchmarks = this.getSelectedBenchmarksFromReport(report);

        // Create table rows
        table.rows.forEach(row => {
            // Skip if not selected
            if (!selectedBenchmarks.includes(row)) return;

            const tr = document.createElement('tr');

            // Add row name
            const rowCell = document.createElement('td');
            rowCell.textContent = row;
            tr.appendChild(rowCell);

            // Add data cells
            table.cols.forEach(col => {
                const cell = table.cells[row]?.[col];
                const td = document.createElement('td');

                if (cell) {
                    td.textContent = this.formatMetricValue(cell.center, selectedMetric);

                    // Add comparison info if available
                    if (cell.comparison) {
                        const deltaSpan = document.createElement('span');
                        deltaSpan.className = 'delta-value';
                        deltaSpan.textContent = ` (${cell.comparison.delta})`;
                        td.appendChild(deltaSpan);
                    }

                    // Add warning if any
                    if (cell.warnings && cell.warnings.length > 0) {
                        td.classList.add('has-warning');
                        td.title = cell.warnings.join('\n');
                    }
                }

                tr.appendChild(td);
            });

            tableBody.appendChild(tr);
        });
    }

    private populateMetricsDropdown(metrics: Array<{ name: string, displayName: string }>): void {
        // Update main metric select
        const select = document.getElementById('metric-select') as HTMLSelectElement;
        if (select) {
            select.innerHTML = '';
            metrics.forEach(metric => {
                const option = document.createElement('option');
                option.value = metric.name;
                option.textContent = metric.displayName;
                select.appendChild(option);
            });
        }

        // Also update table metric select
        const tableSelect = document.getElementById('table-metric-select') as HTMLSelectElement;
        if (tableSelect) {
            tableSelect.innerHTML = '';
            metrics.forEach(metric => {
                const option = document.createElement('option');
                option.value = metric.name;
                option.textContent = metric.displayName;
                tableSelect.appendChild(option);
            });
        }
    }

    private setupUIEventListeners(): void {
        // Checkbox listeners
        document.querySelectorAll('.benchmark-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.updateChartFromReport(this.benchmarkReport)
            });
        });

        // Initialize settings inputs with current values
        this.initializeSettingsInputs();

        // Metric selector listener
        const metricSelect = document.getElementById('metric-select');
        if (metricSelect) {
            metricSelect.addEventListener('change', () => {
                this.updateChartFromReport(this.benchmarkReport)
            });
        }

        // Chart type listener
        const chartType = document.getElementById('chart-type');
        if (chartType) {
            chartType.addEventListener('change', () => {
                this.updateChartFromReport(this.benchmarkReport)

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

                    this.updateChartFromReport(this.benchmarkReport)
                }
            });
        });
    }

    private createChartConfig(
        chartType: string,
        labels: string[],
        datasets: ChartDataset[],
        metric: string
    ): any {
        // Apply chart settings
        const { showGrid, showXGrid, showYGrid, pointStyle, enableAnimations,
            legendPosition, titleSize, labelSize, tickSize } = this.chartSettings;

        // Add point style to datasets if applicable
        if (pointStyle && (chartType === 'line' || chartType === 'scatter' || chartType === 'radar')) {
            datasets.forEach(dataset => {
                (dataset as any).pointStyle = pointStyle;
            });
        }

        return {
            type: chartType,
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: enableAnimations ? 1000 : 0
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: this.formatMetricName(metric),
                            font: {
                                size: labelSize
                            }
                        },
                        grid: {
                            display: showGrid && showYGrid,
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            font: {
                                size: tickSize
                            }
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Benchmark',
                            font: {
                                size: labelSize
                            }
                        },
                        grid: {
                            display: showGrid && showXGrid,
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            font: {
                                size: tickSize
                            }
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
                    legend: {
                        position: legendPosition,
                        labels: {
                            font: {
                                size: labelSize
                            }
                        }
                    },
                    title: {
                        display: true,
                        text: `Benchmark Results - ${this.formatMetricName(metric)}`,
                        font: {
                            size: titleSize
                        }
                    }
                }
            }
        };
    }

    private renderChart(
        config: any,
        benchmarks: string[],
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
        vscode.postMessage({
            command: 'updateVisualization',
            selectedBenchmarks: benchmarks,
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

    /**
     * Initialize settings form elements with current values
     */
    private initializeSettingsInputs(): void {
        // Initialize checkboxes
        const showGridEl = document.getElementById('show-grid') as HTMLInputElement;
        if (showGridEl) showGridEl.checked = this.chartSettings.showGrid;

        const showXGridEl = document.getElementById('show-x-grid') as HTMLInputElement;
        if (showXGridEl) showXGridEl.checked = this.chartSettings.showXGrid;

        const showYGridEl = document.getElementById('show-y-grid') as HTMLInputElement;
        if (showYGridEl) showYGridEl.checked = this.chartSettings.showYGrid;

        const enableAnimationsEl = document.getElementById('enable-animations') as HTMLInputElement;
        if (enableAnimationsEl) enableAnimationsEl.checked = this.chartSettings.enableAnimations;

        // Initialize selects
        const pointStyleEl = document.getElementById('point-style') as HTMLSelectElement;
        if (pointStyleEl) pointStyleEl.value = this.chartSettings.pointStyle;

        const legendPositionEl = document.getElementById('legend-position') as HTMLSelectElement;
        if (legendPositionEl) legendPositionEl.value = this.chartSettings.legendPosition;

        // Initialize ranges and their display values
        const titleSizeEl = document.getElementById('title-size') as HTMLInputElement;
        const titleSizeValueEl = document.getElementById('title-size-value');
        if (titleSizeEl) {
            titleSizeEl.value = this.chartSettings.titleSize.toString();
            if (titleSizeValueEl) titleSizeValueEl.textContent = `${this.chartSettings.titleSize}px`;
        }

        const labelSizeEl = document.getElementById('label-size') as HTMLInputElement;
        const labelSizeValueEl = document.getElementById('label-size-value');
        if (labelSizeEl) {
            labelSizeEl.value = this.chartSettings.labelSize.toString();
            if (labelSizeValueEl) labelSizeValueEl.textContent = `${this.chartSettings.labelSize}px`;
        }

        const tickSizeEl = document.getElementById('tick-size') as HTMLInputElement;
        const tickSizeValueEl = document.getElementById('tick-size-value');
        if (tickSizeEl) {
            tickSizeEl.value = this.chartSettings.tickSize.toString();
            if (tickSizeValueEl) tickSizeValueEl.textContent = `${this.chartSettings.tickSize}px`;
        }
    }

    /**
     * Handle tab change event from the UI
     * @param tabId The ID of the tab that was selected
     */
    public handleTabChange(tabId: string): void {
        this.currentTab = tabId;

        // With a unified tab view, we just need to make sure both chart and table are updated
        if (tabId === 'unified-tab') {
            const metricSelect = document.getElementById('metric-select') as HTMLSelectElement;
            if (metricSelect && metricSelect.value) {
                this.updateChartFromReport(this.benchmarkReport);
            }
        } else if (tabId === 'settings-tab') {
            // No additional action needed for settings tab
        }
    }

    /**
     * Update a chart setting and refresh the chart
     * @param setting The setting to update
     * @param value The new value for the setting
     */
    public updateChartSetting(setting: string, value: any): void {
        if (setting in this.chartSettings) {
            (this.chartSettings as any)[setting] = value;

            // Update chart if we're on the unified tab
            if (this.currentTab === 'unified-tab' && this.benchmarkChart) {
                this.updateChartFromReport(this.benchmarkReport);
            }
        }
    }

    /**
     * Export the chart as an image
     * @param format The format to export ('png' or 'svg')
     */
    public exportChart(format: string): void {
        if (!this.benchmarkChart) {
            this.showError("No chart to export");
            return;
        }

        try {
            const dataUrl = this.benchmarkChart.toBase64Image();

            // Send the data URL to the extension for saving
            vscode.postMessage({
                command: 'exportChart',
                format: format,
                dataUrl: dataUrl
            });
        } catch (error) {
            this.showError(`Failed to export chart: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}

/**
 * Initialize the WASM visualization
 * @param wasmUrl URL to the WASM binary
 */
export function initializeWasmVisualization(wasmUrl: string): WasmVisualizationController {
    return new WasmVisualizationController(wasmUrl);
}