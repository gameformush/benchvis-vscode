import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as Handlebars from 'handlebars';

// Register Handlebars helpers
Handlebars.registerHelper('lt', function (a, b) {
    return a < b;
});

Handlebars.registerHelper('eq', function (a, b) {
    return a === b;
});

// Visualization panel singleton
let currentPanel: vscode.WebviewPanel | undefined = undefined;

/**
 * Creates or reveals a webview panel for visualizing benchmark data
 * @param context Extension context
 * @param filePath The path to the benchmark file
 * @param content The content of the benchmark file
 */
export function createVisualizationPanel(
    context: vscode.ExtensionContext, filePath: string, content: string
) {
    const columnToShowIn = vscode.window.activeTextEditor
        ? vscode.window.activeTextEditor.viewColumn
        : undefined;

    // If we already have a panel, show it
    if (currentPanel) {
        currentPanel.reveal(columnToShowIn);
        updateVisualizationPanel(currentPanel, filePath, content, context);
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
    updateVisualizationPanel(currentPanel, filePath, content, context);
}

/**
 * Updates the visualization panel with benchmark data
 * @param panel The webview panel to update
 * @param filePath The path to the benchmark file
 * @param data The benchmark data content
 * @param context Extension context
 */
function updateVisualizationPanel(
    panel: vscode.WebviewPanel,
    filePath: string, data: string,
    context: vscode.ExtensionContext
) {
    try {
        // Get the WASM URI
        const wasmUri = panel.webview.asWebviewUri(
            vscode.Uri.file(path.join(context.extensionPath, 'dist', 'main.wasm'))
        );

        // Get the WASM JS URI
        const wasmJs = panel.webview.asWebviewUri(
            vscode.Uri.file(path.join(context.extensionPath, 'templates', 'wasm.js'))
        );

        // Get the WASM visualization JS URI
        const wasmVisualizationJs = panel.webview.asWebviewUri(
            vscode.Uri.file(path.join(context.extensionPath, 'dist', 'wasm-ui', 'wasmVisualization.js'))
        );

        // Read the template file (using the new TypeScript-based template)
        const templatePath = path.join(context.extensionPath, 'templates', 'wasm-ts.hbs');
        const templateContent = fs.readFileSync(templatePath, 'utf8');

        const nonce = getNonce();

        // Compile the template
        const template = Handlebars.compile(templateContent);

        // Get Chart.js URI
        const chartJsUri = panel.webview.asWebviewUri(
            vscode.Uri.file(path.join(context.extensionPath, 'node_modules', 'chart.js', 'dist', 'chart.umd.js'))
        );

        // Render the template with data
        const html = template({
            WASM_URL: wasmUri,
            chartJsUri: chartJsUri,
            cspSource: panel.webview.cspSource,
            nonce: nonce,
            wasmjs: wasmJs,
            wasmVisualizationJs: wasmVisualizationJs
        });

        // Set the webview HTML content
        panel.webview.html = html;

        // Handle messages from the webview
        panel.webview.onDidReceiveMessage((event) => {
            switch (event.command) {
                case "loaded":
                    // When the WASM module is loaded, send the benchmark data for parsing
                    panel.webview.postMessage({
                        command: 'parseBenchmark', 
                        data: {
                            paths: [filePath],
                            data: [data]
                        }
                    });
                    break;
            }
        });
    } catch (error) {
        console.error('Error updating visualization panel:', error);
        vscode.window.showErrorMessage(`Failed to create visualization: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Generates a nonce for content security policy
 * @returns A randomly generated nonce string
 */
const getNonce = (): string => {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
