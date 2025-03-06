// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { promises as fs } from 'fs';

// Interfaces for Go benchmark data
interface BenchmarkMetadata {
	goos: string;
	goarch: string;
	pkg: string;
	cpu: string;
}

interface BenchmarkResult {
	name: string;
	runs: BenchmarkRun[];
}

interface Metric {
	name: string;
	value: number;
}

interface BenchmarkRun {
	iterations: number;
	metrics?: Metric[];
	params: Map<string, string | undefined>;
}

/**
 * Parses Go benchmark output into structured data
 * @param content The raw benchmark output text
 * @returns Parsed benchmark data
 */
export function parseGoBenchmarkOutput(content: string): { metadata: BenchmarkMetadata, results: BenchmarkResult[] } {
	const lines = content.split('\n');

	// Parse metadata (goos, goarch, pkg, cpu)
	const metadata: BenchmarkMetadata = {
		goos: '',
		goarch: '',
		pkg: '',
		cpu: ''
	};

	// Map to group benchmark runs by name
	const benchmarkMap = new Map<string, BenchmarkResult>();

	// Process each line
	for (const line of lines) {
		// Skip empty lines
		if (!line.trim()) {
			continue;
		}

		// Parse metadata lines
		if (line.startsWith('goos:')) {
			metadata.goos = line.replace('goos:', '').trim();
			continue
		}

		if (line.startsWith('goarch:')) {
			metadata.goarch = line.replace('goarch:', '').trim();
			continue
		}

		if (line.startsWith('pkg:')) {
			metadata.pkg = line.replace('pkg:', '').trim();
			continue
		}
		if (line.startsWith('cpu:')) {
			metadata.cpu = line.replace('cpu:', '').trim();
			continue
		}
		// Skip "PASS" or "FAIL" lines
		if (line.startsWith('PASS') || line.startsWith('FAIL') || line.startsWith('ok')) {
			continue;
		}
		// Parse benchmark result lines
		if (line.startsWith('Benchmark')) {
			// Example: BenchmarkTest/1-16  	63453842	        19.34 ns/op	         1.000 size	       1 B/op	       1 allocs/op
			const parts = line.trim().split(/\s+/);

			const fullName = parts[0];
			const iterations = parseInt(parts[1].replace(/,/g, ''), 10);

			// Extract the base name and parameters from the benchmark name
			// Format is typically: BenchmarkName/param1/param2-N where N is GOMAXPROCS
			const nameMatch = fullName.match(/^(Benchmark[^/]+)\/(.*)-(.*)$/);
			const baseName = nameMatch ? nameMatch[1] : fullName;

			// Create a new benchmark result if not exists
			if (!benchmarkMap.has(baseName)) {
				benchmarkMap.set(baseName, {
					name: baseName,
					runs: []
				});
			}

			// Parse the metrics
			const run: BenchmarkRun = {
				iterations: iterations,
				metrics: [],
				params: new Map<string, string>()
			};

			// Process the remaining parts to extract the metrics
			for (let i = 2; i < parts.length; i += 2) {
				run.metrics?.push({
					name: parts[i + 1],
					value: parseFloat(parts[i])
				})
			}

			// Extract parameters if any (like "1" in BenchmarkTest/1-16)
			run.params.set("name", nameMatch?.[2])
			run.params.set("cpus", nameMatch?.[3])

			// Add this run to the appropriate benchmark
			benchmarkMap.get(baseName)?.runs.push(run);
		}
	}

	// Convert the map to an array
	const results = Array.from(benchmarkMap.values());

	return { metadata, results };
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "benchvis-vscode" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('benchvis-vscode.visualize-file', async () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
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

			// Log the parsed data for now
			console.log('Parsed benchmark data:', JSON.stringify(benchmarkData, (key, value) => {
				// Convert Map objects to regular objects for JSON serialization
				if (value instanceof Map) {
					return Object.fromEntries(value);
				}
				return value;
			}, 2));

			vscode.window.showInformationMessage(`Successfully parsed benchmark data with ${benchmarkData.results.length} benchmark(s)`);

			// TODO: Implement visualization of benchmark data

		} catch (error) {
			console.error(error);
			vscode.window.showErrorMessage(`Failed to parse benchmark file: ${error}`);
		}
	});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() { }
