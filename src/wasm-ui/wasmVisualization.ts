/**
 * WASM Visualization Module
 * 
 * This module contains the TypeScript code for the WASM-based visualization component.
 * It provides functionality for parsing and visualizing benchmark data using WebAssembly.
 */

// Type definitions for the module
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

export interface VSCodeAPI {
    postMessage(message: any): void;
}

export interface ChartConfiguration {
    type: string;
    data: {
        labels: string[];
        datasets: any[];
    };
    options: any;
}

export interface ColorPalettes {
    [key: string]: string[];
}

interface WasmResponse {
    data?: string;
    error?: string;
}

// Declare external functions from the WASM module
declare global {
    function parseBenchmarkFiles(jsonData: string): BenchmarkResult[] | WasmResponse;
    function acquireVsCodeApi(): VSCodeAPI;
    class Go {
        importObject: any;
        argv: string[];
        env: any;
        exit: (code: number) => void;
        run(instance: WebAssembly.Instance): void;
    }
    interface Window {
        Chart: any;
    }
}

// Store color palettes
const colorPalettes: ColorPalettes = {
    default: ['#4285F4', '#EA4335', '#FBBC05', '#34A853', '#8E24AA', '#0097A7', '#00C853', '#FF6D00'],
    pastel: ['#ff9aa2', '#c7ceea', '#b5ead7', '#ffdac1', '#e2f0cb', '#c5a3ff', '#9de3d0', '#f6c3b7']
};

/**
 * WASM Visualization Controller
 * 
 * This class handles the interaction between the WASM module and the visualization interface.
 */
export class WasmVisualizationController {
    private selectedPalette: string = 'default';
    private customColors: string[] = [...colorPalettes.default];
    private benchmarkChart: any = null;
    private benchmarkResults: BenchmarkResult[] = [];
    private vscode: VSCodeAPI;
    private wasm: WebAssembly.Instance | null = null;
    
    constructor(private wasmUrl: string) {
        this.vscode = acquireVsCodeApi();
        
        // Check if Chart.js is available
        window.addEventListener('load', () => {
            if (typeof window.Chart === 'undefined') {
                this.showError("Chart.js library is not loaded. Unable to display visualization.");
                console.error("Chart.js is not defined");
            } else {
                console.log("Chart.js is loaded successfully");
            }
        });
        
        // Initialize WASM
        this.initWasm();
        
        // Set up event listeners
        this.setupEventListeners();
    }
    
    /**
     * Shows an error message in the UI
     */
    private showError(message: string): void {
        const errorContainer = document.getElementById('error-container');
        if (!errorContainer) return;
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        errorContainer.innerHTML = '';
        errorContainer.appendChild(errorDiv);
    }
    
    /**
     * Initializes the WebAssembly module
     */
    private initWasm(): void {
        const go = new Go();
        if ('instantiateStreaming' in WebAssembly) {
            WebAssembly.instantiateStreaming(fetch(this.wasmUrl), go.importObject)
                .then((obj) => {
                    this.wasm = obj.instance;
                    go.run(this.wasm);
                    console.log("WASM loaded");
                    this.vscode.postMessage({ command: 'loaded' });
                })
                .catch(error => {
                    this.showError(`Error loading WASM: ${error.message}`);
                    console.error("WASM loading error:", error);
                });
        } else {
            fetch(this.wasmUrl)
                .then(resp => resp.arrayBuffer())
                .then(bytes => 
                    WebAssembly.instantiate(bytes, go.importObject)
                        .then((obj) => {
                            this.wasm = obj.instance;
                            go.run(this.wasm);
                            console.log("WASM loaded");
                            this.vscode.postMessage({ command: 'loaded' });
                        })
                )
                .catch(error => {
                    this.showError(`Error loading WASM: ${error.message}`);
                    console.error("WASM loading error:", error);
                });
        }
    }
    
    /**
     * Sets up event listeners for the UI elements
     */
    private setupEventListeners(): void {
        // Handle messages from the extension
        window.addEventListener("message", (event) => {
            try {
                console.log("Received message:", event.data);
                
                if (event.data?.command === 'parseBenchmark') {
                    this.handleParseBenchmark(event.data);
                }
            } catch (error) {
                const err = error as Error;
                this.showError(`Error processing message: ${err.message}`);
                console.error("Error processing message:", error);
            }
        });
    }
    
    /**
     * Handles the parseBenchmark command from the extension
     */
    private handleParseBenchmark(data: any): void {
        console.log("Parsing benchmark data:", data.data);
        try {
            if (!data.data) {
                this.showError("No benchmark data provided");
                return;
            }
            
            let dataToProcess: string;
            
            // Check if data is a string or an object with data property
            if (typeof data.data === 'string') {
                dataToProcess = data.data;
            } else if (data.data && typeof data.data.data === 'string') {
                // The data is nested in a data property
                dataToProcess = data.data.data;
            } else {
                // Otherwise try to stringify it
                dataToProcess = JSON.stringify(data.data);
            }
            
            // If dataToProcess is already a string that looks like JSON, don't stringify it again
            const jsonData = typeof dataToProcess === 'string' && 
                (dataToProcess.startsWith('[') || dataToProcess.startsWith('{')) ?
                dataToProcess : JSON.stringify(dataToProcess);
            
            console.log("JSON data for parsing:", jsonData.substring(0, 100) + "...");
            
            try {
                const results = parseBenchmarkFiles(jsonData);
                console.log("Parsed benchmark results:", results);
                
                if (typeof results === 'object' && results !== null && 'data' in results) {
                    // Handle WASM response format with data and error properties
                    const wasmResponse = results as WasmResponse;
                    if (wasmResponse.error) {
                        this.showError(`WASM parsing error: ${wasmResponse.error}`);
                        return;
                    }
                    
                    try {
                        if (wasmResponse.data) {
                            const parsedData = JSON.parse(wasmResponse.data);
                            this.processBenchmarkResults(parsedData);
                        }
                    } catch (parseError) {
                        const err = parseError as Error;
                        this.showError(`Error parsing WASM results data: ${err.message}`);
                        console.error("JSON parse error:", parseError);
                    }
                } else {
                    // Direct array result
                    this.processBenchmarkResults(results as BenchmarkResult[]);
                }
            } catch (wasmError) {
                const err = wasmError as Error;
                this.showError(`WASM function error: ${err.message}`);
                console.error("WASM error:", wasmError);
            }
        } catch (error) {
            const err = error as Error;
            this.showError(`Error parsing benchmark data: ${err.message}`);
            console.error("Error in parseBenchmarkFiles:", error);
        }
    }
    
    /**
     * Helper function to set alpha of a color
     */
    private setAlpha(color: string, alpha: number): string {
        if (color.startsWith('#')) {
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
        return color;
    }
    
    /**
     * Helper function to format metric values
     */
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
            // For decimal values, round to 2 decimal places
            if (Math.floor(value) !== value) {
                return value.toFixed(2) + ' ' + metric;
            }
            
            // Default formatting
            return `${value} ${metric}`;
        }
    }
    
    /**
     * Helper function to format metric names for display
     */
    private formatMetricName(metricName: string): string {
        switch (metricName) {
            case 'sec/op': return 'Time (sec/op)';
            case 'ns/op': return 'Time (ns/op)';
            case 'B/op': return 'Memory (B/op)';
            case 'allocs/op': return 'Allocations (allocs/op)';
            case 'size': return 'Size (bytes)';
            default:
                // Format custom metrics
                return metricName
                    .replace(/_/g, ' ')
                    .replace(/\//g, ' per ')
                    .replace(/\b\w/g, c => c.toUpperCase());
        }
    }
    
    /**
     * Update custom color inputs in the UI
     */
    private updateCustomColorInputs(): void {
        const container = document.getElementById('custom-colors');
        if (!container) return;
        
        container.innerHTML = '';
        
        // Get selected benchmarks and create color inputs for each
        const checkboxes = document.querySelectorAll('.benchmark-checkbox:checked');
        Array.from(checkboxes).forEach((checkbox, index) => {
            const nameEl = checkbox.nextElementSibling;
            if (!nameEl) return;
            
            const name = nameEl.textContent || `Benchmark ${index + 1}`;
            const colorIndex = index % this.customColors.length;
            
            const colorInput = document.createElement('div');
            colorInput.className = 'color-input';
            colorInput.innerHTML = `
                <input type="color" data-index="${index}" value="${this.customColors[colorIndex]}">
                <span>${name}</span>
            `;
            
            container.appendChild(colorInput);
        });
        
        // Add event listeners to color inputs
        document.querySelectorAll('#custom-colors input[type="color"]').forEach(input => {
            input.addEventListener('change', (event) => {
                const target = event.target as HTMLInputElement;
                const index = parseInt(target.dataset.index || '0');
                this.customColors[index % this.customColors.length] = target.value;
                try {
                    this.updateChart(this.benchmarkResults);
                } catch (error) {
                    const err = error as Error;
                    this.showError(`Error updating chart: ${err.message}`);
                    console.error(error);
                }
            });
        });
    }
    
    /**
     * Get metric value from a benchmark result
     */
    private getResultMetricValue(result: BenchmarkResult, metricName: string): number | null {
        if (!result || !result.values || !Array.isArray(result.values)) {
            return null;
        }
        
        const metric = result.values.find(v => v && v.unit === metricName);
        return metric ? metric.value : null;
    }
    
    /**
     * Get selected benchmarks from the UI
     */
    private getSelectedBenchmarks(results: BenchmarkResult[]): BenchmarkResult[] {
        if (!results || !Array.isArray(results)) {
            return [];
        }
        
        const checkboxes = document.querySelectorAll('.benchmark-checkbox:checked');
        const selectedNames = Array.from(checkboxes).map(checkbox => {
            const nameEl = checkbox.nextElementSibling;
            return nameEl ? nameEl.textContent : '';
        }).filter(Boolean);
        
        return results.filter(result => result && selectedNames.includes(result.name));
    }
    
    /**
     * Process benchmark results and prepare data for visualization
     */
    private processBenchmarkResults(results: BenchmarkResult[]): void {
        try {
            // Clear any previous errors
            const errorContainer = document.getElementById('error-container');
            if (errorContainer) {
                errorContainer.innerHTML = '';
            }
            
            if (!results) {
                this.showError("No benchmark results returned from WASM function");
                console.error("No results from parseBenchmarkFiles");
                return;
            }
            
            if (!Array.isArray(results)) {
                this.showError("Invalid benchmark results format: not an array");
                console.error("Results is not an array:", results);
                return;
            }
            
            if (results.length === 0) {
                this.showError("No benchmark results found in data");
                console.error("Empty results array");
                return;
            }
            
            // Check if Chart.js is available
            if (typeof window.Chart === 'undefined') {
                this.showError("Chart.js library is not loaded. Unable to display visualization.");
                console.error("Chart.js is not defined");
                return;
            }
            
            this.benchmarkResults = results;
            console.log("Processing benchmark results:", results);
            
            // Extract available metrics from results
            const availableMetrics: Array<{name: string, displayName: string, originalUnit: string}> = [];
            let metricsFound = false;
            
            // Look through all results for metrics
            for (let i = 0; i < results.length; i++) {
                const result = results[i];
                if (result && Array.isArray(result.values) && result.values.length > 0) {
                    result.values.forEach(value => {
                        if (value && value.unit) {
                            // Check if this metric is already in our list
                            if (!availableMetrics.some(m => m.name === value.unit)) {
                                availableMetrics.push({
                                    name: value.unit,
                                    displayName: this.formatMetricName(value.unit),
                                    originalUnit: value.orig_unit || value.unit
                                });
                            }
                        }
                    });
                    metricsFound = true;
                }
            }
            
            if (!metricsFound) {
                this.showError("No valid metrics found in benchmark results");
                console.error("No valid metrics in results");
                return;
            }
            
            // Populate metric selection dropdown
            const metricSelect = document.getElementById('metric-select') as HTMLSelectElement;
            if (!metricSelect) return;
            
            metricSelect.innerHTML = '';
            availableMetrics.forEach(metric => {
                const option = document.createElement('option');
                option.value = metric.name;
                option.textContent = metric.displayName;
                metricSelect.appendChild(option);
            });
            
            // Create benchmark list for selection
            const benchmarkList = document.getElementById('benchmark-list');
            if (!benchmarkList) return;
            
            benchmarkList.innerHTML = '';
            
            // Group results by name to avoid duplicates in the list
            const benchmarkNames = new Set<string>();
            results.forEach(result => {
                if (result && result.name) {
                    benchmarkNames.add(result.name);
                }
            });
            
            if (benchmarkNames.size === 0) {
                this.showError("No valid benchmark names found in results");
                console.error("No valid benchmark names");
                return;
            }
            
            // Add benchmarks to list
            Array.from(benchmarkNames).sort().forEach((name, index) => {
                const item = document.createElement('div');
                item.className = 'benchmark-item';
                
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'benchmark-checkbox';
                checkbox.dataset.index = index.toString();
                checkbox.checked = true; // Default to checked
                
                const label = document.createElement('label');
                label.textContent = name;
                
                item.appendChild(checkbox);
                item.appendChild(label);
                benchmarkList.appendChild(item);
            });
            
            // Add event listeners to UI elements
            this.setupUIEventListeners();
            
            // Initialize chart
            this.updateCustomColorInputs();
            this.updateChart(results);
        } catch (error) {
            const err = error as Error;
            this.showError(`Error processing benchmark results: ${err.message}`);
            console.error("Error in processBenchmarkResults:", error);
        }
    }
    
    /**
     * Setup event listeners for UI elements after benchmark results are processed
     */
    private setupUIEventListeners(): void {
        // Add event listeners to checkboxes
        document.querySelectorAll('.benchmark-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                try {
                    this.updateCustomColorInputs();
                    this.updateChart(this.benchmarkResults);
                } catch (error) {
                    const err = error as Error;
                    this.showError(`Error updating chart: ${err.message}`);
                    console.error(error);
                }
            });
        });
        
        // Update metric selection event listener
        const metricSelect = document.getElementById('metric-select');
        if (metricSelect) {
            metricSelect.addEventListener('change', () => {
                try {
                    this.updateChart(this.benchmarkResults);
                } catch (error) {
                    const err = error as Error;
                    this.showError(`Error updating chart: ${err.message}`);
                    console.error(error);
                }
            });
        }
        
        const chartType = document.getElementById('chart-type');
        if (chartType) {
            chartType.addEventListener('change', () => {
                try {
                    this.updateChart(this.benchmarkResults);
                } catch (error) {
                    const err = error as Error;
                    this.showError(`Error updating chart: ${err.message}`);
                    console.error(error);
                }
            });
        }
        
        // Setup color palette selection
        document.querySelectorAll('.palette').forEach(palette => {
            palette.addEventListener('click', (event) => {
                try {
                    const target = event.target as HTMLElement;
                    const paletteElement = target.closest('.palette');
                    if (paletteElement) {
                        const paletteName = paletteElement.getAttribute('data-palette') || 'default';
                        this.selectedPalette = paletteName;
                        this.customColors = [...colorPalettes[paletteName]];
                        
                        // Update selected palette UI
                        document.querySelectorAll('.palette').forEach(p => {
                            p.classList.remove('selected');
                        });
                        paletteElement.classList.add('selected');
                        
                        this.updateCustomColorInputs();
                        this.updateChart(this.benchmarkResults);
                    }
                } catch (error) {
                    const err = error as Error;
                    this.showError(`Error updating palette: ${err.message}`);
                    console.error(error);
                }
            });
        });
    }
    
    /**
     * Update chart with benchmark results
     */
    private updateChart(results: BenchmarkResult[]): void {
        try {
            // Check if Chart.js is loaded
            if (typeof window.Chart === 'undefined') {
                this.showError("Chart.js library is not loaded. Unable to display visualization.");
                console.error("Chart.js is not defined");
                return;
            }
            
            if (!results || !Array.isArray(results) || results.length === 0) {
                this.showError("No valid benchmark results to visualize");
                return;
            }
            
            const selectedBenchmarks = this.getSelectedBenchmarks(results);
            const metricSelect = document.getElementById('metric-select') as HTMLSelectElement;
            const chartTypeSelect = document.getElementById('chart-type') as HTMLSelectElement;
            
            if (!metricSelect || !chartTypeSelect) {
                this.showError("UI elements not found");
                return;
            }
            
            const selectedMetric = metricSelect.value;
            const chartType = chartTypeSelect.value;
            
            if (selectedBenchmarks.length === 0) {
                console.warn("No benchmarks selected");
                return;
            }
            
            if (!selectedMetric) {
                console.warn("No metric selected");
                return;
            }
            
            // Prepare chart data
            const datasets: any[] = [];
            const benchmarkNamesSet = new Set<string>();
            
            // Group by benchmark name
            const benchmarksByName: {[name: string]: BenchmarkResult[]} = {};
            selectedBenchmarks.forEach(benchmark => {
                if (benchmark && benchmark.name) {
                    if (!benchmarksByName[benchmark.name]) {
                        benchmarksByName[benchmark.name] = [];
                        benchmarkNamesSet.add(benchmark.name);
                    }
                    benchmarksByName[benchmark.name].push(benchmark);
                }
            });
            
            if (benchmarkNamesSet.size === 0) {
                console.warn("No valid benchmark names found");
                return;
            }
            
            // Create a dataset for each unique benchmark name
            const benchmarkNames = Array.from(benchmarkNamesSet).sort();
            benchmarkNames.forEach((name, index) => {
                const benchmarks = benchmarksByName[name];
                if (!benchmarks || benchmarks.length === 0) return;
                
                // Get values for this benchmark
                const dataPoints = benchmarks.map(benchmark => 
                    this.getResultMetricValue(benchmark, selectedMetric));
                
                // Only add dataset if we have valid data
                if (dataPoints.some(value => value !== null)) {
                    // Get color for this benchmark
                    const colorIndex = index % this.customColors.length;
                    const baseColor = this.customColors[colorIndex];
                    
                    // Create dataset
                    const dataset = {
                        label: name,
                        data: dataPoints,
                        backgroundColor: this.setAlpha(baseColor, 0.5),
                        borderColor: baseColor,
                        borderWidth: 1,
                        hoverBackgroundColor: this.setAlpha(baseColor, 0.7),
                        hoverBorderColor: baseColor,
                        pointBackgroundColor: baseColor,
                        pointBorderColor: '#fff',
                        pointHoverBackgroundColor: '#fff',
                        pointHoverBorderColor: baseColor
                    };
                    
                    datasets.push(dataset);
                }
            });
            
            if (datasets.length === 0) {
                console.warn("No datasets created - no valid data for selected metric");
                return;
            }
            
            // Determine chart labels based on benchmark configurations
            let chartLabels: string[] = [];
            
            if (selectedBenchmarks.length > 0) {
                // Try to find a good differentiating key in the config
                const configKeys = new Set<string>();
                selectedBenchmarks.forEach(benchmark => {
                    if (benchmark && benchmark.config && Array.isArray(benchmark.config)) {
                        benchmark.config.forEach(cfg => {
                            if (cfg && cfg.key) {
                                configKeys.add(cfg.key);
                            }
                        });
                    }
                });
                
                // If we have configs, try to use them as labels
                if (configKeys.size > 0) {
                    // Find keys that have different values across benchmarks
                    const differentiatingKeys = Array.from(configKeys).filter(key => {
                        const values = new Set();
                        selectedBenchmarks.forEach(benchmark => {
                            if (benchmark && benchmark.config && Array.isArray(benchmark.config)) {
                                const config = benchmark.config.find(cfg => cfg && cfg.key === key);
                                if (config && config.value) {
                                    values.add(config.value);
                                }
                            }
                        });
                        return values.size > 1;
                    });
                    
                    if (differentiatingKeys.length > 0) {
                        // Use the first differentiating key
                        const key = differentiatingKeys[0];
                        chartLabels = selectedBenchmarks.map(benchmark => {
                            if (benchmark && benchmark.config && Array.isArray(benchmark.config)) {
                                const config = benchmark.config.find(cfg => cfg && cfg.key === key);
                                return config && config.value ? `${key}: ${config.value}` : 'Unknown';
                            }
                            return 'Unknown';
                        });
                    }
                }
            }
            
            // If we couldn't determine labels from config, use benchmark names or indices
            if (chartLabels.length === 0) {
                if (chartType === 'bar' || chartType === 'line') {
                    chartLabels = benchmarkNames;
                } else {
                    // For other chart types, use indices
                    chartLabels = selectedBenchmarks.map((_, i) => `Run ${i + 1}`);
                }
            }
            
            // Make sure chartLabels has same length as data if we have datasets
            if (datasets.length > 0 && datasets[0].data && datasets[0].data.length > 0) {
                while (chartLabels.length < datasets[0].data.length) {
                    chartLabels.push(`Item ${chartLabels.length + 1}`);
                }
            }
            
            // Prepare chart configuration
            const chartConfig: ChartConfiguration = {
                type: chartType,
                data: {
                    labels: chartLabels,
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: this.formatMetricName(selectedMetric)
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
                                    if (label) {
                                        label += ': ';
                                    }
                                    if (context.parsed.y !== null) {
                                        label += this.formatMetricValue(context.parsed.y, selectedMetric);
                                    }
                                    return label;
                                }
                            }
                        },
                        legend: {
                            position: 'top'
                        },
                        title: {
                            display: true,
                            text: `Benchmark Results - ${this.formatMetricName(selectedMetric)}`
                        }
                    }
                }
            };
            
            // Create or update the chart
            try {
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
                
                if (this.benchmarkChart) {
                    this.benchmarkChart.destroy();
                }
                
                this.benchmarkChart = new window.Chart(ctx, chartConfig);
                
                // Send message to the extension with the selected options
                this.vscode.postMessage({
                    command: 'updateVisualization',
                    selectedBenchmarks: benchmarkNames,
                    selectedMetric,
                    chartType
                });
            } catch (chartError) {
                const err = chartError as Error;
                this.showError(`Failed to create chart: ${err.message}`);
                console.error("Chart creation error:", chartError);
            }
        } catch (error) {
            const err = error as Error;
            this.showError(`Error creating chart: ${err.message}`);
            console.error("Error in updateChart:", error);
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