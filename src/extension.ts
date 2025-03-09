import * as vscode from 'vscode';
import { visFile } from './commands/visFile/visFile';
import { benchStat } from './commands/benchStat/benchstat';
import { wasmCmd, wasmMultiCmd } from './commands/wasmTest/wasm';

export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "benchvis-vscode" is now active!');

	context.subscriptions.push(
		vscode.commands.registerCommand('benchvis-vscode.visualize-file', visFile(context)),
		vscode.commands.registerCommand('benchvis-vscode.visualize-benchstat', benchStat(context)),
		vscode.commands.registerCommand('benchvis-vscode.visualize-benchmark', wasmCmd(context)),
		vscode.commands.registerCommand('benchvis-vscode.visualize-benchmark-selected', wasmMultiCmd(context))
	);
}

// This method is called when your extension is deactivated
export function deactivate() { }
