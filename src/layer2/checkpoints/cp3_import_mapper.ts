import * as fs from 'fs';
import * as path from 'path';
import Parser from 'web-tree-sitter';
import { ParsedFile } from './cp1_parser_init';

export interface ImportEdge {
    sourceFile: string;   // file that imports
    targetFile: string;   // file being imported (resolved path or module name)
    importNames: string[]; // what is imported (named imports, or ['*'] for star)
    rawSpecifier: string;  // original import string e.g. './utils' or 'express'
    isExternal: boolean;  // true if it's an npm/pip package, not a local file
}

export interface ImportResult {
    imports: ImportEdge[];
    totalEdges: number;
    fileGraph: Record<string, string[]>;   // adjacency list: file → [imported files]
    externalDeps: string[];                   // unique external module names
}

/** Resolve a relative import specifier to a workspace-relative path */
function resolveImport(specifier: string, sourceFile: string, workspacePath: string): { resolved: string; isExternal: boolean } {
    // External module (no ./ or ../)
    if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
        return { resolved: specifier, isExternal: true };
    }

    // Relative import — resolve against source file's directory
    const sourceDir = path.dirname(path.join(workspacePath, sourceFile));
    let resolved = path.resolve(sourceDir, specifier);

    // Try common extensions if no extension given
    const ext = path.extname(resolved);
    if (!ext) {
        const tryExts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go'];
        for (const tryExt of tryExts) {
            if (fs.existsSync(resolved + tryExt)) {
                resolved = resolved + tryExt;
                break;
            }
            // Also try index files
            const indexPath = path.join(resolved, `index${tryExt}`);
            if (fs.existsSync(indexPath)) {
                resolved = indexPath;
                break;
            }
        }
    }

    const relativePath = path.relative(workspacePath, resolved).replace(/\\/g, '/');
    return { resolved: relativePath, isExternal: false };
}

/** Extract imports from TS/JS AST */
function extractTSJSImports(tree: Parser.Tree, sourceFile: string, workspacePath: string): ImportEdge[] {
    const edges: ImportEdge[] = [];
    const root = tree.rootNode;

    for (const node of root.namedChildren) {
        // import ... from '...'
        if (node.type === 'import_statement') {
            const sourceNode = node.childForFieldName('source')
                || node.children.find(c => c.type === 'string');
            if (!sourceNode) { continue; }

            const rawSpecifier = sourceNode.text.replace(/['"]/g, '');
            const { resolved, isExternal } = resolveImport(rawSpecifier, sourceFile, workspacePath);

            // Extract named imports
            const importNames: string[] = [];
            const importClause = node.children.find(c =>
                c.type === 'import_clause' || c.type === 'named_imports'
            );
            if (importClause) {
                // Walk deeper for named imports
                const namedImports = importClause.descendantsOfType('import_specifier');
                for (const spec of namedImports) {
                    const name = spec.childForFieldName('name') || spec;
                    importNames.push(name.text);
                }
                // Default import
                const defaultImport = importClause.children.find(c => c.type === 'identifier');
                if (defaultImport) {
                    importNames.push(defaultImport.text);
                }
                // Namespace import
                const nsImport = importClause.descendantsOfType('namespace_import');
                if (nsImport.length > 0) {
                    importNames.push('*');
                }
            }

            if (importNames.length === 0) { importNames.push('*'); }

            edges.push({
                sourceFile,
                targetFile: resolved,
                importNames,
                rawSpecifier,
                isExternal,
            });
        }

        // require('...')
        if (node.type === 'lexical_declaration' || node.type === 'variable_declaration') {
            const calls = node.descendantsOfType('call_expression');
            for (const call of calls) {
                const fn = call.childForFieldName('function');
                if (fn && fn.text === 'require') {
                    const args = call.childForFieldName('arguments');
                    if (args && args.namedChildren.length > 0) {
                        const rawSpecifier = args.namedChildren[0].text.replace(/['"]/g, '');
                        const { resolved, isExternal } = resolveImport(rawSpecifier, sourceFile, workspacePath);
                        edges.push({
                            sourceFile,
                            targetFile: resolved,
                            importNames: ['*'],
                            rawSpecifier,
                            isExternal,
                        });
                    }
                }
            }
        }
    }

    return edges;
}

/** Extract imports from Python AST */
function extractPythonImports(tree: Parser.Tree, sourceFile: string, workspacePath: string): ImportEdge[] {
    const edges: ImportEdge[] = [];
    const root = tree.rootNode;

    for (const node of root.namedChildren) {
        if (node.type === 'import_statement') {
            // import foo, import foo.bar
            const names = node.descendantsOfType('dotted_name');
            for (const name of names) {
                const rawSpecifier = name.text;
                edges.push({
                    sourceFile,
                    targetFile: rawSpecifier,
                    importNames: ['*'],
                    rawSpecifier,
                    isExternal: true,  // Python module resolution is complex; treat as external
                });
            }
        }

        if (node.type === 'import_from_statement') {
            // from foo import bar, baz
            const moduleName = node.childForFieldName('module_name')
                || node.children.find(c => c.type === 'dotted_name' || c.type === 'relative_import');
            const rawSpecifier = moduleName?.text || '';

            const importNames: string[] = [];
            const nameNodes = node.descendantsOfType('dotted_name')
                .filter(n => n !== moduleName);
            for (const n of nameNodes) {
                importNames.push(n.text);
            }
            // Also check for plain identifiers in import list
            for (const child of node.namedChildren) {
                if (child.type === 'dotted_name' && child !== moduleName) {
                    if (!importNames.includes(child.text)) {
                        importNames.push(child.text);
                    }
                }
            }
            if (importNames.length === 0) { importNames.push('*'); }

            const isRelative = rawSpecifier.startsWith('.');
            const { resolved, isExternal } = isRelative
                ? resolveImport(rawSpecifier, sourceFile, workspacePath)
                : { resolved: rawSpecifier, isExternal: true };

            edges.push({
                sourceFile,
                targetFile: resolved,
                importNames,
                rawSpecifier,
                isExternal,
            });
        }
    }

    return edges;
}

/** Extract imports from Java AST */
function extractJavaImports(tree: Parser.Tree, sourceFile: string): ImportEdge[] {
    const edges: ImportEdge[] = [];
    const root = tree.rootNode;

    for (const node of root.namedChildren) {
        if (node.type === 'import_declaration') {
            const rawSpecifier = node.children
                .filter(c => c.type === 'scoped_identifier' || c.type === 'identifier')
                .map(c => c.text)
                .join('');

            edges.push({
                sourceFile,
                targetFile: rawSpecifier,
                importNames: [rawSpecifier.split('.').pop() || '*'],
                rawSpecifier,
                isExternal: true,  // Java packages are always "external" in our model
            });
        }
    }

    return edges;
}

/**
 * CP3: Extract import/dependency relationships from all parsed files.
 */
export function runCheckpoint3(
    parsedFiles: ParsedFile[],
    workspacePath: string,
    analysisDir: string,
    skipWrite = false
): ImportResult {

    const allImports: ImportEdge[] = [];

    for (const pf of parsedFiles) {
        let edges: ImportEdge[] = [];

        switch (pf.language) {
            case 'TypeScript':
            case 'JavaScript':
                edges = extractTSJSImports(pf.tree, pf.relativePath, workspacePath);
                break;
            case 'Python':
                edges = extractPythonImports(pf.tree, pf.relativePath, workspacePath);
                break;
            case 'Java':
                edges = extractJavaImports(pf.tree, pf.relativePath);
                break;
            // Go, Rust etc. can be added later
        }

        allImports.push(...edges);
    }

    // Build adjacency list (local files only)
    const fileGraph: Record<string, string[]> = {};
    const externalDepsSet = new Set<string>();

    for (const edge of allImports) {
        if (!fileGraph[edge.sourceFile]) {
            fileGraph[edge.sourceFile] = [];
        }

        if (edge.isExternal) {
            externalDepsSet.add(edge.rawSpecifier);
        } else {
            if (!fileGraph[edge.sourceFile].includes(edge.targetFile)) {
                fileGraph[edge.sourceFile].push(edge.targetFile);
            }
        }
    }

    const result: ImportResult = {
        imports: allImports,
        totalEdges: allImports.length,
        fileGraph,
        externalDeps: Array.from(externalDepsSet).sort(),
    };

    if (!skipWrite) {
        const outputPath = path.join(analysisDir, 'imports.json');
        fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

        const localEdges = allImports.filter(e => !e.isExternal).length;
        console.log(`AIL CP3 | ${allImports.length} import edges (${localEdges} local, ${externalDepsSet.size} external deps)`);
    }

    return result;
}
