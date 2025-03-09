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
let disposableListener: vscode.Disposable | undefined = undefined;

/**
 * Creates or reveals a webview panel for visualizing benchmark data
 * @param context Extension context
 * @param filePaths The path to the benchmark file
 * @param contents The content of the benchmark file
 */
export function createVisualizationPanel(
    context: vscode.ExtensionContext, filePaths: string[], contents: string[]
) {
    const columnToShowIn = vscode.window.activeTextEditor
        ? vscode.window.activeTextEditor.viewColumn
        : undefined;

    // If we already have a panel, show it
    if (currentPanel) {
        currentPanel.reveal(columnToShowIn);
        updateVisualizationPanel(currentPanel, context);
        listenMessages(currentPanel, filePaths, contents);
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

    listenMessages(currentPanel, filePaths, contents);

    // When the panel is closed, clean up resources
    currentPanel.onDidDispose(
        () => {
            currentPanel = undefined;
        },
        null,
        context.subscriptions
    );

    // Set the initial HTML content
    updateVisualizationPanel(currentPanel, context);
}

function listenMessages(currentPanel: vscode.WebviewPanel, filePaths: string[], contents: string[]) {
    if (disposableListener) {
        disposableListener.dispose();
        disposableListener = undefined;
    }
    disposableListener = currentPanel.webview.onDidReceiveMessage((event) => {
        switch (event.command) {
            case 'exportChart':
                // Handle chart export requests
                const { format, dataUrl } = event;
                exportChart(dataUrl, format);
                return;

            case "loaded":
                // When the WASM module is loaded, send the benchmark data for parsing
                currentPanel?.webview.postMessage({
                    command: 'parseBenchmark',
                    data: {
                        paths: filePaths.map(p => path.basename(p)),
                        data: contents
                    }
                });
                break;
        }
    });
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
 * Updates the visualization panel with benchmark data
 * @param panel The webview panel to update
 * @param filePath The path to the benchmark file
 * @param data The benchmark data content
 * @param context Extension context
 */
function updateVisualizationPanel(
    panel: vscode.WebviewPanel,
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
