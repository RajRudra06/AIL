import * as fs from 'fs';
import * as path from 'path';
import type * as TreeSitter from 'web-tree-sitter';
type SyntaxNode = TreeSitter.SyntaxNode;

// Runtime: web-tree-sitter CJS default export is the Parser class itself
const WTS: typeof import('web-tree-sitter') = require('web-tree-sitter');

// Map language names (from Layer 1) to tree-sitter grammar WASM filenames
const LANGUAGE_TO_GRAMMAR: Record<string, string> = {
    'Python': 'tree-sitter-python.wasm',
    'JavaScript': 'tree-sitter-javascript.wasm',
    'TypeScript': 'tree-sitter-typescript.wasm',
    'Java': 'tree-sitter-java.wasm',
    'Go': 'tree-sitter-go.wasm',
    'Rust': 'tree-sitter-rust.wasm',
    'C++': 'tree-sitter-cpp.wasm',
    'C': 'tree-sitter-c.wasm',
    'C#': 'tree-sitter-c_sharp.wasm',
    'Ruby': 'tree-sitter-ruby.wasm',
    'PHP': 'tree-sitter-php.wasm',
    'Swift': 'tree-sitter-swift.wasm',
    'Kotlin': 'tree-sitter-kotlin.wasm',
};

// Map file extensions to language names for lookup
export const EXTENSION_TO_LANGUAGE: Record<string, string> = {
    '.py': 'Python',
    '.js': 'JavaScript',
    '.jsx': 'JavaScript',
    '.ts': 'TypeScript',
    '.tsx': 'TypeScript',
    '.java': 'Java',
    '.go': 'Go',
    '.rs': 'Rust',
    '.cpp': 'C++',
    '.c': 'C',
    '.cs': 'C#',
    '.rb': 'Ruby',
    '.php': 'PHP',
    '.swift': 'Swift',
    '.kt': 'Kotlin',
};

export interface ParsedFile {
    relativePath: string;
    language: string;
    tree: TreeSitter.Tree;
    sourceCode: string;
}

export interface ParserInitResult {
    parsedFiles: ParsedFile[];
    parseErrors: { file: string; error: string }[];
    languageParsers: Map<string, TreeSitter>;
}

/**
 * CP1: Initialize tree-sitter parsers and parse all source files into ASTs.
 * Reads the file list from Layer 1's scanResult.
 */
export async function runCheckpoint1(
    workspacePath: string,
    sourceFiles: { relativePath: string; extension: string }[],
    extensionPath: string,
    analysisDir: string
): Promise<ParserInitResult> {

    // Diagnostic info
    const diag: Record<string, unknown> = {};
    const vscode = require('vscode');

    // Initialize tree-sitter WASM
    const wasmPath = path.join(extensionPath, 'dist', 'grammars', 'tree-sitter.wasm');

    const wtsAny = WTS as any;
    diag['wts_keys'] = Object.keys(WTS);
    diag['wts_parser_type'] = typeof WTS;
    diag['wts_language_type'] = typeof wtsAny.Language;
    diag['wts_default_type'] = typeof wtsAny.default;
    diag['wasm_path_exists'] = fs.existsSync(wasmPath);
    diag['wasm_path'] = wasmPath;
    diag['source_files_count'] = sourceFiles.length;
    diag['source_file_extensions'] = [...new Set(sourceFiles.map(f => f.extension))];
    diag['source_files_sample'] = sourceFiles.slice(0, 10).map(f => f.relativePath);

    // Handle both CJS module shapes
    const ParserClass: any = wtsAny.default || WTS;
    diag['parser_class_type'] = typeof ParserClass;
    diag['parser_init_type'] = typeof ParserClass.init;

    try {
        await ParserClass.init({
            locateFile: () => wasmPath
        });
        diag['init_success'] = true;
    } catch (err) {
        diag['init_success'] = false;
        diag['init_error'] = String(err);
    }

    const LanguageClass: any = wtsAny.Language || (wtsAny.default && wtsAny.default.Language) || ParserClass.Language;
    diag['language_class_type'] = typeof LanguageClass;

    // Load grammar for each detected language
    const grammarsDir = path.join(extensionPath, 'dist', 'grammars');
    const languageParsers = new Map<string, any>();
    const loadedLanguages = new Set<string>();


    // Determine which languages we need
    // Determine which languages we need
    diag['load_errors'] = {};
    const matchedLanguages: Record<string, number> = {};
    for (const file of sourceFiles) {
        const lang = EXTENSION_TO_LANGUAGE[file.extension];
        if (lang) {
            matchedLanguages[lang] = (matchedLanguages[lang] || 0) + 1;
            if (!loadedLanguages.has(lang)) {
                const grammarFile = LANGUAGE_TO_GRAMMAR[lang];
                if (grammarFile) {
                    const grammarPath = path.join(grammarsDir, grammarFile);
                    if (fs.existsSync(grammarPath)) {
                        try {
                            const grammarWasm = fs.readFileSync(grammarPath);
                            const language = await LanguageClass.load(grammarWasm);
                            const parser = new ParserClass();
                            parser.setLanguage(language);
                            languageParsers.set(lang, parser);
                            loadedLanguages.add(lang);
                            console.log('AIL CP1 | Loaded grammar for:', lang);
                        } catch (err) {
                            (diag['load_errors'] as any)[lang] = err instanceof Error ? err.stack : String(err);
                            console.error(`AIL CP1 | Failed to load grammar for ${lang}:`, err);
                        }
                    } else {
                        (diag['load_errors'] as any)[lang] = 'WASM file not found at ' + grammarPath;
                    }
                } else {
                    (diag['load_errors'] as any)[lang] = 'No grammar mapping for ' + lang;
                }
            }
        }
    }
    diag['matched_languages'] = matchedLanguages;

    // Save summary
    diag['languagesLoaded'] = Array.from(loadedLanguages);

    const summary = {
        languagesLoaded: Array.from(loadedLanguages),
        matchedLanguages
    };

    const outputPath = path.join(analysisDir, 'parser_init.json');
    fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));

    // Write debug diagnostics
    const debugPath = path.join(analysisDir, '_debug.json');
    fs.writeFileSync(debugPath, JSON.stringify(diag, null, 2));

    // Show diagnostic notification
    vscode.window.showWarningMessage(
        `AIL CP1 Init: ${sourceFiles.length} files detected, ${loadedLanguages.size} grammars loaded`
    );

    return { parsedFiles: [], parseErrors: [], languageParsers };
}
