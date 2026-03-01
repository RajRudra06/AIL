const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

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

/**
 * Plugin to copy WASM files (tree-sitter runtime + language grammars) into dist/grammars/
 * @type {import('esbuild').Plugin}
 */
const copyWasmPlugin = {
	name: 'copy-wasm-files',

	setup(build) {
		build.onEnd(() => {
			const grammarsDir = path.join(__dirname, 'dist', 'grammars');
			if (!fs.existsSync(grammarsDir)) {
				fs.mkdirSync(grammarsDir, { recursive: true });
			}

			// Copy web-tree-sitter WASM runtime
			const treeSitterWasm = path.join(__dirname, 'node_modules', 'web-tree-sitter', 'tree-sitter.wasm');
			if (fs.existsSync(treeSitterWasm)) {
				fs.copyFileSync(treeSitterWasm, path.join(grammarsDir, 'tree-sitter.wasm'));
			}

			// Copy all language grammar WASM files
			const wasmsDir = path.join(__dirname, 'node_modules', 'tree-sitter-wasms', 'out');
			if (fs.existsSync(wasmsDir)) {
				const wasmFiles = fs.readdirSync(wasmsDir).filter(f => f.endsWith('.wasm'));
				for (const file of wasmFiles) {
					fs.copyFileSync(path.join(wasmsDir, file), path.join(grammarsDir, file));
				}
				console.log(`[wasm] Copied ${wasmFiles.length} grammar files to dist/grammars/`);
			}
		});
	},
};

async function main() {
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
		external: ['vscode', 'web-tree-sitter'],
		logLevel: 'silent',
		plugins: [
			copyWasmPlugin,
			esbuildProblemMatcherPlugin,
		],
	});
	if (watch) {
		await ctx.watch();
	} else {
		await ctx.rebuild();
		await ctx.dispose();
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
