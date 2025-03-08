import * as vscode from 'vscode';
import { promises as fs } from 'fs';
import { createVisualizationPanel } from './visualization';
export const wasmCmd = (context: vscode.ExtensionContext) => async () => {
  try {
    // The code you place here will be executed every time your command is executed
    vscode.window.showInformationMessage('Starting wasm visualization...');
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      vscode.window.showErrorMessage('No active file. Please open a benchmark file first.');
      return;
    }

    const document = activeEditor.document;
    const filePath = document.uri.fsPath;
    console.log(`Active file path: ${filePath}`);

    const content = await fs.readFile(filePath, 'utf8');
    // Create visualization panel
    createVisualizationPanel(context, filePath, content);

  } catch (error) {
    console.error(error);
    vscode.window.showErrorMessage(`Failed to parse benchmark file: ${error}`);
  }
}