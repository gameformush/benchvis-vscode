const esbuild = require("esbuild");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');
const wasmUiOnly = process.argv.includes('--wasm-ui-only');
const extensionOnly = process.argv.includes('--extension-only');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
			console.log('[watch] build finished');
		});
	},
};

async function buildExtension() {
	console.log('Building extension...');
	const ctx = await esbuild.context({
		entryPoints: [
			'src/extension.ts'
		],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/extension.js',
		external: ['vscode'],
		logLevel: 'silent',
		plugins: [
			esbuildProblemMatcherPlugin,
		],
	});
	
	if (watch) {
		await ctx.watch();
	} else {
		await ctx.rebuild();
		await ctx.dispose();
	}
	
	console.log('Extension build complete.');
}

async function buildWasmUi() {
	console.log('Building WASM UI module...');
	const ctx = await esbuild.context({
		entryPoints: [
			'src/wasm-ui/wasmVisualization.ts'
		],
		bundle: true,
		format: 'iife', // Change to immediately invoked function expression format
		globalName: 'WasmVis', // Export as a global variable
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'browser',
		outfile: 'dist/wasm-ui/wasmVisualization.js',
		logLevel: 'silent',
		plugins: [
			esbuildProblemMatcherPlugin,
		],
	});
	
	if (watch) {
		await ctx.watch();
	} else {
		await ctx.rebuild();
		await ctx.dispose();
	}
	
	console.log('WASM UI module build complete.');
}

async function main() {
	try {
		if (wasmUiOnly) {
			await buildWasmUi();
		} else if (extensionOnly) {
			await buildExtension();
		} else {
			// Build both by default
			if (watch) {
				// Start both builds in watch mode
				await Promise.all([buildExtension(), buildWasmUi()]);
			} else {
				// Build sequentially for clearer logs
				await buildExtension();
				await buildWasmUi();
			}
		}
	} catch (error) {
		console.error('Build failed:', error);
		process.exit(1);
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
