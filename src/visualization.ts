import * as vscode from 'vscode';
import * as path from 'path';

// Import the benchmark data interfaces
import { BenchmarkMetadata, BenchmarkResult } from './extension';

// Available metrics for visualization
export type MetricType = 'ns/op' | 'B/op' | 'allocs/op' | 'size';

// Chart types supported
export type ChartType = 'bar' | 'line' | 'radar' | 'scatter';

// Visualization panel singleton
let currentPanel: vscode.WebviewPanel | undefined = undefined;

/**
 * Creates or reveals a webview panel for visualizing benchmark data
 * @param context Extension context
 * @param benchmarkData Parsed benchmark data to visualize
 */
export function createVisualizationPanel(
    context: vscode.ExtensionContext, 
    benchmarkData: { metadata: BenchmarkMetadata, results: BenchmarkResult[] }
) {
    const columnToShowIn = vscode.window.activeTextEditor
        ? vscode.window.activeTextEditor.viewColumn
        : undefined;

    // If we already have a panel, show it
    if (currentPanel) {
        currentPanel.reveal(columnToShowIn);
        updateVisualizationPanel(currentPanel, benchmarkData);
        return;
    }

    // Otherwise, create a new panel
    currentPanel = vscode.window.createWebviewPanel(
        'benchvisVisualization',
        'Benchmark Visualization',
        columnToShowIn || vscode.ViewColumn.One,
        {
            // Enable JavaScript in the webview
            enableScripts: true,
            // Restrict the webview to only load content from our extension's directory
            localResourceRoots: [
                vscode.Uri.file(path.join(context.extensionPath, 'node_modules', 'chart.js', 'dist')),
                vscode.Uri.file(context.extensionPath)
            ],
            retainContextWhenHidden: true,
        }
    );

    // Handle messages from the webview
    currentPanel.webview.onDidReceiveMessage(
        message => {
            switch (message.command) {
                case 'updateVisualization':
                    // Handle visualization update requests
                    const { selectedBenchmarks, selectedMetric, chartType, chartColors } = message;
                    console.log('Updating visualization with:', { selectedBenchmarks, selectedMetric, chartType, chartColors });
                    return;
            }
        },
        undefined,
        context.subscriptions
    );

    // When the panel is closed, clean up resources
    currentPanel.onDidDispose(
        () => {
            currentPanel = undefined;
        },
        null,
        context.subscriptions
    );

    // Set the initial HTML content
    updateVisualizationPanel(currentPanel, benchmarkData);
}

/**
 * Updates the visualization panel with benchmark data
 * @param panel The webview panel to update
 * @param benchmarkData The benchmark data to visualize
 */
function updateVisualizationPanel(
    panel: vscode.WebviewPanel, 
    benchmarkData: { metadata: BenchmarkMetadata, results: BenchmarkResult[] }
) {
    // Get the Chart.js URI
    const chartJsUri = panel.webview.asWebviewUri(
        vscode.Uri.file(path.join(panel.webview.options.localResourceRoots![0].fsPath, 'chart.umd.js'))
    );

    panel.webview.html = getVisualizationHtml(panel.webview, chartJsUri, benchmarkData);
}

/**
 * Generates the HTML for the visualization panel
 * @param webview The webview to generate HTML for
 * @param chartJsUri The URI to the Chart.js library
 * @param benchmarkData The benchmark data to visualize
 * @returns The HTML content for the webview
 */
function getVisualizationHtml(
    webview: vscode.Webview, 
    chartJsUri: vscode.Uri, 
    benchmarkData: { metadata: BenchmarkMetadata, results: BenchmarkResult[] }
): string {
    // Create a JSON string of the benchmark data for use in the webview
    const benchmarkDataJson = JSON.stringify(benchmarkData, (key, value) => {
        // Convert Map objects to regular objects for JSON serialization
        if (value instanceof Map) {
            return Object.fromEntries(value);
        }
        return value;
    });

    // List of available metrics
    const metrics = [
        { id: 'ns/op', name: 'Time (ns/op)' },
        { id: 'B/op', name: 'Memory (B/op)' },
        { id: 'allocs/op', name: 'Allocations (allocs/op)' },
        { id: 'size', name: 'Size' }
    ];

    // List of chart types
    const chartTypes = [
        { id: 'bar', name: 'Bar Chart' },
        { id: 'line', name: 'Line Chart' },
        { id: 'radar', name: 'Radar Chart' },
        { id: 'scatter', name: 'Scatter Plot' }
    ];

    // Define some color palettes
    const colorPalettes = {
        default: ['#36a2eb', '#ff6384', '#4bc0c0', '#ff9f40', '#9966ff', '#ffcd56', '#c9cbcf'],
        pastel: ['#8dd3c7', '#bebada', '#fb8072', '#80b1d3', '#fdb462', '#b3de69', '#fccde5'],
        vivid: ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#ffff33', '#a65628'],
        dark: ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2']
    };

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Benchmark Visualization</title>
        <script src="${chartJsUri}"></script>
        <style>
            body {
                font-family: var(--vscode-font-family);
                color: var(--vscode-foreground);
                background-color: var(--vscode-editor-background);
                padding: 20px;
                margin: 0;
            }
            h1, h2 {
                color: var(--vscode-editor-foreground);
            }
            .metadata {
                margin-bottom: 20px;
                padding: 10px;
                background-color: var(--vscode-editor-inactiveSelectionBackground);
                border-radius: 5px;
            }
            .controls {
                display: flex;
                flex-wrap: wrap;
                gap: 15px;
                margin-bottom: 20px;
                padding: 15px;
                background-color: var(--vscode-editor-inactiveSelectionBackground);
                border-radius: 5px;
            }
            .control-group {
                flex: 1;
                min-width: 200px;
            }
            .control-group h3 {
                margin-top: 0;
            }
            label {
                display: block;
                margin-bottom: 5px;
            }
            select, input[type="color"] {
                width: 100%;
                padding: 8px;
                margin-bottom: 10px;
                background-color: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border: 1px solid var(--vscode-input-border);
                border-radius: 3px;
            }
            button {
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                padding: 8px 16px;
                border-radius: 3px;
                cursor: pointer;
                margin-top: 10px;
            }
            button:hover {
                background-color: var(--vscode-button-hoverBackground);
            }
            .benchmark-list {
                max-height: 200px;
                overflow-y: auto;
                padding: 5px;
                background-color: var(--vscode-input-background);
                border: 1px solid var(--vscode-input-border);
                border-radius: 3px;
            }
            .benchmark-item {
                display: flex;
                align-items: center;
                margin-bottom: 5px;
            }
            .benchmark-item input {
                margin-right: 8px;
            }
            .chart-container {
                position: relative;
                height: 400px;
                margin-top: 20px;
                padding: 15px;
                background-color: var(--vscode-editor-inactiveSelectionBackground);
                border-radius: 5px;
            }
            .color-palette {
                display: flex;
                gap: 10px;
                margin-bottom: 10px;
            }
            .palette {
                cursor: pointer;
                display: flex;
                width: 100px;
                height: 20px;
                border-radius: 3px;
                overflow: hidden;
            }
            .palette-color {
                flex: 1;
                height: 100%;
            }
            .palette.selected {
                outline: 2px solid var(--vscode-focusBorder);
            }
            .custom-colors {
                display: flex;
                flex-wrap: wrap;
                gap: 5px;
                margin-top: 10px;
            }
            .color-input {
                display: flex;
                align-items: center;
                margin-bottom: 5px;
            }
            .color-input input {
                margin-right: 5px;
                width: 50px;
            }
        </style>
    </head>
    <body>
        <h1>Benchmark Visualization</h1>
        
        <div class="metadata">
            <h2>Environment</h2>
            <p><strong>OS:</strong> ${benchmarkData.metadata.goos}</p>
            <p><strong>Arch:</strong> ${benchmarkData.metadata.goarch}</p>
            <p><strong>Package:</strong> ${benchmarkData.metadata.pkg}</p>
            <p><strong>CPU:</strong> ${benchmarkData.metadata.cpu}</p>
        </div>
        
        <div class="controls">
            <div class="control-group">
                <h3>Benchmarks</h3>
                <div class="benchmark-list">
                    ${benchmarkData.results.map((result, index) => {
                        // Get a unique param value for each benchmark run group if available
                        const displayName = result.name.replace('Benchmark', '');
                        return `
                            <div class="benchmark-item">
                                <input type="checkbox" id="benchmark-${index}" value="${result.name}" data-index="${index}" class="benchmark-checkbox" ${index < 3 ? 'checked' : ''}>
                                <label for="benchmark-${index}">${displayName}</label>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
            
            <div class="control-group">
                <h3>Metrics</h3>
                <select id="metric-select">
                    ${metrics.map(metric => `<option value="${metric.id}">${metric.name}</option>`).join('')}
                </select>
                
                <h3>Chart Type</h3>
                <select id="chart-type">
                    ${chartTypes.map(chartType => `<option value="${chartType.id}">${chartType.name}</option>`).join('')}
                </select>
            </div>
            
            <div class="control-group">
                <h3>Colors</h3>
                <div class="color-palette">
                    ${Object.entries(colorPalettes).map(([name, colors], index) => `
                        <div class="palette ${name === 'default' ? 'selected' : ''}" data-palette="${name}">
                            ${colors.slice(0, 5).map(color => `<div class="palette-color" style="background-color: ${color}"></div>`).join('')}
                        </div>
                    `).join('')}
                </div>
                
                <div id="custom-colors" class="custom-colors">
                    <!-- Custom color inputs will be added dynamically -->
                </div>
            </div>
        </div>
        
        <div class="chart-container">
            <canvas id="benchmarkChart"></canvas>
        </div>
        
        <script>
            // Store the benchmark data
            const benchmarkData = ${benchmarkDataJson};
            
            // Store color palettes
            const colorPalettes = ${JSON.stringify(colorPalettes)};
            let selectedPalette = 'default';
            let customColors = [...colorPalettes.default];
            
            // Initialize chart
            let benchmarkChart = null;
            
            // Get selected benchmarks
            function getSelectedBenchmarks() {
                const checkboxes = document.querySelectorAll('.benchmark-checkbox:checked');
                return Array.from(checkboxes).map(checkbox => {
                    const index = parseInt(checkbox.dataset.index);
                    return benchmarkData.results[index];
                });
            }
            
            // Get metric value from a run
            function getMetricValue(run, metricName) {
                if (!run.metrics) {
                    return null;
                }
                
                const metric = run.metrics.find(m => m.name === metricName);
                return metric ? metric.value : null;
            }
            
            // Update the chart based on selected options
            function updateChart() {
                const selectedBenchmarks = getSelectedBenchmarks();
                const selectedMetric = document.getElementById('metric-select').value;
                const chartType = document.getElementById('chart-type').value;
                
                if (selectedBenchmarks.length === 0) {
                    return;
                }
                
                // Send message to the extension with the selected options
                vscode.postMessage({
                    command: 'updateVisualization',
                    selectedBenchmarks: selectedBenchmarks.map(b => b.name),
                    selectedMetric,
                    chartType,
                    chartColors: customColors
                });
                
                // Prepare chart data
                const datasets = [];
                
                // Process each selected benchmark
                selectedBenchmarks.forEach((benchmark, benchmarkIndex) => {
                    // Group runs by parameter if available
                    const paramGroups = new Map();
                    
                    benchmark.runs.forEach(run => {
                        let paramKey = 'default';
                        
                        // If run has parameters, use the first parameter as the key
                        if (run.params && run.params.name) {
                            paramKey = run.params.name;
                        }
                        
                        if (!paramGroups.has(paramKey)) {
                            paramGroups.set(paramKey, []);
                        }
                        
                        paramGroups.get(paramKey).push(run);
                    });
                    
                    // Create a dataset for each parameter group
                    Array.from(paramGroups.entries()).forEach(([paramKey, runs], paramIndex) => {
                        // Calculate average value for each run
                        const data = [];
                        
                        runs.forEach(run => {
                            const value = getMetricValue(run, selectedMetric);
                            if (value !== null) {
                                data.push(value);
                            } else {
                                data.push(null); // Use null for missing data
                            }
                        });
                        
                        // Only include this dataset if it has data
                        if (data.some(value => value !== null)) {
                            // Create a dataset
                            const colorIndex = (benchmarkIndex + paramIndex) % customColors.length;
                            const baseColor = customColors[colorIndex];
                            
                            const displayName = benchmark.name.replace('Benchmark', '');
                            const datasetLabel = paramKey !== 'default' 
                                ? \`\${displayName} [\${paramKey}]\` 
                                : displayName;
                            
                            const dataset = {
                                label: datasetLabel,
                                data: data,
                                backgroundColor: setAlpha(baseColor, 0.5),
                                borderColor: baseColor,
                                borderWidth: 1,
                                hoverBackgroundColor: setAlpha(baseColor, 0.7),
                                hoverBorderColor: baseColor,
                                pointBackgroundColor: baseColor,
                                pointBorderColor: '#fff',
                                pointHoverBackgroundColor: '#fff',
                                pointHoverBorderColor: baseColor
                            };
                            
                            datasets.push(dataset);
                        }
                    });
                });
                
                // Get chart labels
                const chartLabels = [];
                
                // Use parameter values as labels
                const allParams = new Set();
                selectedBenchmarks.forEach(benchmark => {
                    benchmark.runs.forEach(run => {
                        if (run.params && run.params.name) {
                            allParams.add(run.params.name);
                        }
                    });
                });
                
                const sortedParams = Array.from(allParams).sort((a, b) => {
                    // If both are numeric, sort numerically
                    const numA = parseFloat(a);
                    const numB = parseFloat(b);
                    if (!isNaN(numA) && !isNaN(numB)) {
                        return numA - numB;
                    }
                    // Otherwise, sort alphabetically
                    return a.localeCompare(b);
                });
                
                // Use sorted params as labels
                chartLabels.push(...sortedParams);
                
                // If no parameters found, use numeric indices
                if (chartLabels.length === 0) {
                    chartLabels.push('1', '2', '3', '4', '5');
                }
                
                // Prepare chart configuration
                const chartConfig = {
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
                                    text: getMetricLabel(selectedMetric)
                                }
                            },
                            x: {
                                title: {
                                    display: true,
                                    text: 'Parameter Value'
                                }
                            }
                        },
                        plugins: {
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        let label = context.dataset.label || '';
                                        if (label) {
                                            label += ': ';
                                        }
                                        if (context.parsed.y !== null) {
                                            label += formatMetricValue(context.parsed.y, selectedMetric);
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
                                text: \`Benchmark Results - \${getMetricLabel(selectedMetric)}\`
                            }
                        }
                    }
                };
                
                // Create or update the chart
                const ctx = document.getElementById('benchmarkChart').getContext('2d');
                
                if (benchmarkChart) {
                    benchmarkChart.destroy();
                }
                
                benchmarkChart = new Chart(ctx, chartConfig);
            }
            
            // Helper function to set alpha of a color
            function setAlpha(color, alpha) {
                if (color.startsWith('#')) {
                    const r = parseInt(color.slice(1, 3), 16);
                    const g = parseInt(color.slice(3, 5), 16);
                    const b = parseInt(color.slice(5, 7), 16);
                    return \`rgba(\${r}, \${g}, \${b}, \${alpha})\`;
                }
                return color;
            }
            
            // Helper function to get metric label
            function getMetricLabel(metric) {
                switch (metric) {
                    case 'ns/op': return 'Time (ns/op)';
                    case 'B/op': return 'Memory (B/op)';
                    case 'allocs/op': return 'Allocations (allocs/op)';
                    case 'size': return 'Size';
                    default: return metric;
                }
            }
            
            // Helper function to format metric values
            function formatMetricValue(value, metric) {
                switch (metric) {
                    case 'ns/op':
                        if (value > 1000000) {
                            return \`\${(value / 1000000).toFixed(2)} ms/op\`;
                        } else if (value > 1000) {
                            return \`\${(value / 1000).toFixed(2)} µs/op\`;
                        } else {
                            return \`\${value.toFixed(2)} ns/op\`;
                        }
                    case 'B/op':
                        if (value > 1048576) {
                            return \`\${(value / 1048576).toFixed(2)} MB/op\`;
                        } else if (value > 1024) {
                            return \`\${(value / 1024).toFixed(2)} KB/op\`;
                        } else {
                            return \`\${value.toFixed(2)} B/op\`;
                        }
                    case 'allocs/op':
                        return \`\${value} allocs/op\`;
                    case 'size':
                        return \`\${value}\`;
                    default:
                        return \`\${value}\`;
                }
            }
            
            // Update custom color inputs
            function updateCustomColorInputs() {
                const container = document.getElementById('custom-colors');
                container.innerHTML = '';
                
                // Get selected benchmarks and create color inputs for each
                const selectedBenchmarks = getSelectedBenchmarks();
                selectedBenchmarks.forEach((benchmark, index) => {
                    const displayName = benchmark.name.replace('Benchmark', '');
                    const colorIndex = index % customColors.length;
                    
                    const colorInput = document.createElement('div');
                    colorInput.className = 'color-input';
                    colorInput.innerHTML = \`
                        <input type="color" data-index="\${index}" value="\${customColors[colorIndex]}">
                        <span>\${displayName}</span>
                    \`;
                    
                    container.appendChild(colorInput);
                });
                
                // Add event listeners to color inputs
                document.querySelectorAll('#custom-colors input[type="color"]').forEach(input => {
                    input.addEventListener('change', (event) => {
                        const index = parseInt(event.target.dataset.index);
                        customColors[index % customColors.length] = event.target.value;
                        updateChart();
                    });
                });
            }
            
            // Add event listeners
            document.querySelectorAll('.benchmark-checkbox').forEach(checkbox => {
                checkbox.addEventListener('change', () => {
                    updateCustomColorInputs();
                    updateChart();
                });
            });
            
            document.getElementById('metric-select').addEventListener('change', updateChart);
            document.getElementById('chart-type').addEventListener('change', updateChart);
            
            document.querySelectorAll('.palette').forEach(palette => {
                palette.addEventListener('click', (event) => {
                    const paletteElement = event.target.closest('.palette');
                    if (paletteElement) {
                        const paletteName = paletteElement.dataset.palette;
                        selectedPalette = paletteName;
                        customColors = [...colorPalettes[paletteName]];
                        
                        // Update selected palette UI
                        document.querySelectorAll('.palette').forEach(p => {
                            p.classList.remove('selected');
                        });
                        paletteElement.classList.add('selected');
                        
                        updateCustomColorInputs();
                        updateChart();
                    }
                });
            });
            
            // Acquire VS Code API
            const vscode = acquireVsCodeApi();
            
            // Initialize the chart
            updateCustomColorInputs();
            updateChart();
        </script>
    </body>
    </html>`;
}