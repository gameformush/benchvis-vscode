import * as vscode from 'vscode';
import { promises as fs } from 'fs';
import { parseBenchstatOutput } from '../../benchstatParser';
import { createBenchstatVisualizationPanel } from './benchstatVis';

export const benchStat = (context: vscode.ExtensionContext) => async () => {
  // Check for active text editor
  vscode.window.showInformationMessage('Starting benchstat visualization...');
  const activeEditor = vscode.window.activeTextEditor;
  if (!activeEditor) {
    vscode.window.showErrorMessage('No active file. Please open a benchstat file first.');
    return;
  }

  const document = activeEditor.document;
  const filePath = document.uri.fsPath;
  console.log(`Active file path: ${filePath}`);

  try {
    const content = await fs.readFile(filePath, 'utf8');
    const benchstatData = parseBenchstatOutput(content);

    // Log the parsed data for debugging
    console.log('Parsed benchstat data:', JSON.stringify(benchstatData, (key, value) => {
      // Convert Map objects to regular objects for JSON serialization
      if (value instanceof Map) {
        return Object.fromEntries(value);
      }
      return value;
    }, 2));

    // Create visualization panel
    createBenchstatVisualizationPanel(context, benchstatData);

  } catch (error) {
    console.error(error);
    vscode.window.showErrorMessage(`Failed to parse benchstat file: ${error}`);
  }
}