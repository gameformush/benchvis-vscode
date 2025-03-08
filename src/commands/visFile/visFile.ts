import * as vscode from 'vscode';
import { promises as fs } from 'fs';
import { parseGoBenchmarkOutput } from '../../parser';
import { createVisualizationPanel } from './visualization';
export const visFile = (context: vscode.ExtensionContext) => async () => {
  // The code you place here will be executed every time your command is executed
  vscode.window.showInformationMessage('Starting benchmark visualization...');
  const activeEditor = vscode.window.activeTextEditor;
  if (!activeEditor) {
    vscode.window.showErrorMessage('No active file. Please open a benchmark file first.');
    return;
  }

  const document = activeEditor.document;
  const filePath = document.uri.fsPath;
  console.log(`Active file path: ${filePath}`);

  try {
    const content = await fs.readFile(filePath, 'utf8');
    const benchmarkData = parseGoBenchmarkOutput(content);

    // Log the parsed data for debugging
    console.log('Parsed benchmark data:', JSON.stringify(benchmarkData, (key, value) => {
      // Convert Map objects to regular objects for JSON serialization
      if (value instanceof Map) {
        return Object.fromEntries(value);
      }
      return value;
    }, 2));

    // Create visualization panel
    createVisualizationPanel(context, benchmarkData);

  } catch (error) {
    console.error(error);
    vscode.window.showErrorMessage(`Failed to parse benchmark file: ${error}`);
  }
}