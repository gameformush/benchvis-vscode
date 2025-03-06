import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as Handlebars from 'handlebars';

// Import the benchstat parser
import { BenchstatData, BenchstatMetric, parseBenchstatOutput } from './benchstatParser';

// Define color palettes
const colorPalettes = {
    default: ['#36a2eb', '#ff6384', '#4bc0c0', '#ff9f40', '#9966ff', '#ffcd56', '#c9cbcf'],
    pastel: ['#8dd3c7', '#bebada', '#fb8072', '#80b1d3', '#fdb462', '#b3de69', '#fccde5'],
    vivid: ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#ffff33', '#a65628'],
    dark: ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2'],
    blues: ['#00429d', '#2e59a8', '#4771b2', '#5d8abd', '#73a2c6', '#8abccf', '#a5d5d8', '#c7e9da', '#ffffe0'],
    fire: ['#ff0000', '#ff5a00', '#ff9a00', '#ffce00', '#ffe808', '#cbff01', '#87ff00', '#00ff00', '#00ff96']
};

// Visualization panel singleton
let currentPanel: vscode.WebviewPanel | undefined = undefined;

/**
 * Creates or reveals a webview panel for visualizing benchstat data
 * @param context Extension context
 * @param benchstatData Parsed benchstat data to visualize
 */
export function createBenchstatVisualizationPanel(
    context: vscode.ExtensionContext, 
    benchstatData: BenchstatData
) {
    const columnToShowIn = vscode.window.activeTextEditor
        ? vscode.window.activeTextEditor.viewColumn
        : undefined;

    // If we already have a panel, show it
    if (currentPanel) {
        currentPanel.reveal(columnToShowIn);
        updateBenchstatVisualizationPanel(currentPanel, benchstatData, context);
        return;
    }

    // Otherwise, create a new panel
    currentPanel = vscode.window.createWebviewPanel(
        'benchstatVisualization',
        'Benchstat Visualization',
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
                case 'updateBenchstatVisualization':
                    // Handle visualization update requests
                    const { selectedImplementations, selectedMetric, chartType, showDeltas } = message;
                    console.log('Updating benchstat visualization with:', { 
                        selectedImplementations, 
                        selectedMetric, 
                        chartType, 
                        showDeltas 
                    });
                    return;
                case 'exportChart':
                    // Handle chart export requests
                    const { format, dataUrl } = message;
                    exportChart(dataUrl, format);
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
    updateBenchstatVisualizationPanel(currentPanel, benchstatData, context);
}

/**
 * Exports the chart as an image file
 * @param dataUrl The data URL of the chart image
 * @param format The format to export (png, jpg, svg)
 */
async function exportChart(dataUrl: string, format: string): Promise<void> {
    try {
        // Remove header from the data URL to get the base64 string
        const base64Data = dataUrl.split(',')[1];
        
        // Show file save dialog
        const filters: { [name: string]: string[] } = {};
        filters[format.toUpperCase()] = [format];
        
        const uri = await vscode.window.showSaveDialog({
            filters,
            saveLabel: `Export as ${format.toUpperCase()}`,
            defaultUri: vscode.Uri.file(`benchstat-chart.${format}`)
        });
        
        if (uri) {
            // Convert base64 to buffer
            const buffer = Buffer.from(base64Data, 'base64');
            
            // Write the file
            await fs.promises.writeFile(uri.fsPath, buffer);
            vscode.window.showInformationMessage(`Chart exported as ${uri.fsPath}`);
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to export chart: ${error}`);
    }
}

/**
 * Updates the benchstat visualization panel
 * @param panel The webview panel to update
 * @param benchstatData The benchstat data to visualize
 * @param context Extension context
 */
function updateBenchstatVisualizationPanel(
    panel: vscode.WebviewPanel, 
    benchstatData: BenchstatData,
    context: vscode.ExtensionContext
) {
    // Get the Chart.js URI
    const chartJsUri = panel.webview.asWebviewUri(
        vscode.Uri.file(path.join(context.extensionPath, 'node_modules', 'chart.js', 'dist', 'chart.umd.js'))
    );

    // Read the template file
    const templatePath = path.join(context.extensionPath, 'src', 'templates', 'benchstat.hbs');
    const templateContent = fs.readFileSync(templatePath, 'utf8');
    
    // Compile the template
    const template = Handlebars.compile(templateContent);
    
    // Create metrics objects for the template
    const metricObjects = benchstatData.metrics.map(metricName => {
        let displayName = metricName;
        
        // Use more readable names for common metrics
        if (metricName.includes('sec/op')) {
            displayName = 'Execution Time';
        } else if (metricName.includes('B/s')) {
            displayName = 'Throughput';
        } else if (metricName.includes('op/s')) {
            displayName = 'Operations Rate';
        }
        
        return { 
            unit: metricName,
            name: displayName
        };
    });
    
    // Create implementation objects, marking the base implementation
    const implementationObjects = benchstatData.implementations.map(impl => ({
        name: impl,
        isBase: impl === benchstatData.baseImplementation
    }));
    
    // Create a JSON string of the benchstat data for use in the webview
    const benchstatDataJson = JSON.stringify(benchstatData);
    
    // Render the template with data
    const html = template({
        chartJsUri: chartJsUri,
        benchstatData,
        metrics: metricObjects,
        implementations: implementationObjects,
        colorPalettes,
        benchstatDataJson,
        colorPalettesJson: JSON.stringify(colorPalettes)
    });
    
    panel.webview.html = html;
}