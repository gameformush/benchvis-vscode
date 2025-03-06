import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as Handlebars from 'handlebars';

// Register Handlebars helpers
Handlebars.registerHelper('lt', function(a, b) {
    return a < b;
});

Handlebars.registerHelper('eq', function(a, b) {
    return a === b;
});

/**
 * Formats a metric ID into a user-friendly name
 * @param metricId The metric ID to format (e.g., "ns/op", "size", "custom_metric")
 * @returns A formatted name for display
 */
function formatMetricName(metricId: string): string {
    // Custom formatting for known metrics
    switch (metricId) {
        case 'ns/op':
            return 'Time (ns/op)';
        case 'B/op':
            return 'Memory (B/op)';
        case 'allocs/op':
            return 'Allocations (allocs/op)';
        case 'size':
            return 'Size';
        default:
            // For custom metrics, capitalize first letter of each word and clean up
            return metricId
                .replace(/_/g, ' ')
                .replace(/\//g, ' per ')
                .replace(/\b\w/g, c => c.toUpperCase());
    }
}

// Import the benchmark data interfaces
import { BenchmarkMetadata, BenchmarkResult } from './extension';

// Available metrics for visualization
export type MetricType = 'ns/op' | 'B/op' | 'allocs/op' | 'size';

// Chart types supported
export type ChartType = 'bar' | 'line' | 'radar' | 'scatter';

// Visualization panel singleton
let currentPanel: vscode.WebviewPanel | undefined = undefined;

// Base metrics (we'll add custom metrics as they're detected)
const baseMetrics = [
    { id: 'ns/op', name: 'Time (ns/op)' },
    { id: 'B/op', name: 'Memory (B/op)' },
    { id: 'allocs/op', name: 'Allocations (allocs/op)' }
];

// Define chart types
const chartTypes = [
    { id: 'bar', name: 'Bar Chart' },
    { id: 'line', name: 'Line Chart' },
    { id: 'radar', name: 'Radar Chart' },
    { id: 'scatter', name: 'Scatter Plot' }
];

// Define color palettes
const colorPalettes = {
    default: ['#36a2eb', '#ff6384', '#4bc0c0', '#ff9f40', '#9966ff', '#ffcd56', '#c9cbcf'],
    pastel: ['#8dd3c7', '#bebada', '#fb8072', '#80b1d3', '#fdb462', '#b3de69', '#fccde5'],
    vivid: ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#ffff33', '#a65628'],
    dark: ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2']
};

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
        updateVisualizationPanel(currentPanel, benchmarkData, context);
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
    updateVisualizationPanel(currentPanel, benchmarkData, context);
}

/**
 * Updates the visualization panel with benchmark data
 * @param panel The webview panel to update
 * @param benchmarkData The benchmark data to visualize
 * @param context Extension context
 */
function updateVisualizationPanel(
    panel: vscode.WebviewPanel, 
    benchmarkData: { metadata: BenchmarkMetadata, results: BenchmarkResult[] },
    context: vscode.ExtensionContext
) {
    // Get the Chart.js URI
    const chartJsUri = panel.webview.asWebviewUri(
        vscode.Uri.file(path.join(context.extensionPath, 'node_modules', 'chart.js', 'dist', 'chart.umd.js'))
    );

    // Read the template file
    const templatePath = path.join(context.extensionPath, 'src', 'templates', 'visualization.hbs');
    const templateContent = fs.readFileSync(templatePath, 'utf8');
    
    // Compile the template
    const template = Handlebars.compile(templateContent);
    
    // Create a JSON string of the benchmark data for use in the webview
    const benchmarkDataJson = JSON.stringify(benchmarkData, (key, value) => {
        // Convert Map objects to regular objects for JSON serialization
        if (value instanceof Map) {
            return Object.fromEntries(value);
        }
        return value;
    });
    
    // Detect all unique metric types
    const uniqueMetricIds = new Set<string>();
    benchmarkData.results.forEach(result => {
        result.runs.forEach(run => {
            if (run.metrics) {
                run.metrics.forEach(metric => {
                    uniqueMetricIds.add(metric.name);
                });
            }
        });
    });
    
    // Create the final metrics list with base metrics first, then any detected custom metrics
    const allMetrics = [...baseMetrics];
    
    // Add any custom metrics that weren't in the base set
    uniqueMetricIds.forEach(metricId => {
        if (!baseMetrics.some(m => m.id === metricId)) {
            allMetrics.push({ id: metricId, name: formatMetricName(metricId) });
        }
    });
    
    // Render the template with data
    const html = template({
        chartJsUri: chartJsUri,
        metadata: benchmarkData.metadata,
        results: benchmarkData.results.map(result => ({
            ...result,
            displayName: result.name.replace('Benchmark', '')
        })),
        metrics: allMetrics,
        chartTypes: chartTypes,
        colorPalettes: colorPalettes,
        benchmarkData: benchmarkDataJson,
        colorPalettesJson: JSON.stringify(colorPalettes)
    });
    
    panel.webview.html = html;
}