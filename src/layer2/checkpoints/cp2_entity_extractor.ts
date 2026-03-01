import * as fs from 'fs';
import * as path from 'path';
import Parser, { SyntaxNode } from 'web-tree-sitter';
import { ParsedFile } from './cp1_parser_init';

export interface EntityInfo {
    name: string;
    type: 'function' | 'class' | 'interface' | 'method' | 'variable' | 'type_alias' | 'enum';
    file: string;
    startLine: number;
    endLine: number;
    params?: string[];
    returnType?: string;
    exported: boolean;
    parentClass?: string;
    language: string;
}

export interface EntityResult {
    entities: EntityInfo[];
    totalCount: number;
    byType: Record<string, number>;
    byFile: Record<string, number>;
}

// ─── Tree-sitter node type queries per language ───

interface ExtractorSet {
    functions: string[];
    classes?: string[];
    interfaces?: string[];
    typeAliases?: string[];
    enums?: string[];
    methods?: string[];
    variables: string[];
}

const TS_JS_EXTRACTORS: ExtractorSet = {
    functions: ['function_declaration', 'arrow_function', 'generator_function_declaration'],
    classes: ['class_declaration'],
    interfaces: ['interface_declaration'],
    typeAliases: ['type_alias_declaration'],
    enums: ['enum_declaration'],
    methods: ['method_definition'],
    variables: ['lexical_declaration', 'variable_declaration'],
};

const PYTHON_EXTRACTORS: ExtractorSet = {
    functions: ['function_definition'],
    classes: ['class_definition'],
    variables: ['assignment'],
};

const JAVA_EXTRACTORS: ExtractorSet = {
    functions: ['method_declaration', 'constructor_declaration'],
    classes: ['class_declaration'],
    interfaces: ['interface_declaration'],
    enums: ['enum_declaration'],
    variables: ['field_declaration'],
};

const GO_EXTRACTORS: ExtractorSet = {
    functions: ['function_declaration', 'method_declaration'],
    interfaces: ['type_spec'],
    variables: ['var_declaration', 'const_declaration'],
};

function getExtractors(language: string): ExtractorSet {
    switch (language) {
        case 'TypeScript':
        case 'JavaScript': return TS_JS_EXTRACTORS;
        case 'Python': return PYTHON_EXTRACTORS;
        case 'Java': return JAVA_EXTRACTORS;
        case 'Go': return GO_EXTRACTORS;
        default: return TS_JS_EXTRACTORS;
    }
}

/** Extract the name of a tree-sitter node (language-aware) */
function getNodeName(node: SyntaxNode, language: string): string {
    const nameNode = node.childForFieldName('name');
    if (nameNode) { return nameNode.text; }

    if (node.type === 'arrow_function' && node.parent) {
        const parent = node.parent;
        if (parent.type === 'variable_declarator') {
            const varName = parent.childForFieldName('name');
            if (varName) { return varName.text; }
        }
    }

    if (node.type === 'assignment' && language === 'Python') {
        const left = node.childForFieldName('left');
        if (left) { return left.text; }
    }

    return '<anonymous>';
}

/** Check if a node is exported */
function isExported(node: SyntaxNode, language: string): boolean {
    if (language === 'Python') {
        const name = getNodeName(node, language);
        return !name.startsWith('_');
    }

    if (language === 'Java') {
        const modifiers = node.children.find((c: SyntaxNode) => c.type === 'modifiers');
        if (modifiers) {
            return modifiers.text.includes('public');
        }
        return false;
    }

    if (node.parent && node.parent.type === 'export_statement') {
        return true;
    }

    return false;
}

/** Extract function parameters */
function getParams(node: SyntaxNode, language: string): string[] {
    let paramsNode: SyntaxNode | null = null;

    if (language === 'Python') {
        paramsNode = node.childForFieldName('parameters');
    } else {
        paramsNode = node.childForFieldName('parameters')
            || node.children.find((c: SyntaxNode) => c.type === 'formal_parameters')
            || null;
    }

    if (!paramsNode) { return []; }

    return paramsNode.namedChildren
        .map((p: SyntaxNode) => p.text)
        .filter((t: string) => t !== 'self' && t !== 'cls');
}

/** Recursively walk AST and extract entities */
function walkTree(
    node: SyntaxNode,
    language: string,
    file: string,
    entities: EntityInfo[],
    parentClass?: string
): void {
    const extractors = getExtractors(language);

    // Functions
    if (extractors.functions.includes(node.type)) {
        const name = getNodeName(node, language);
        if (name !== '<anonymous>') {
            entities.push({
                name,
                type: parentClass ? 'method' : 'function',
                file,
                startLine: node.startPosition.row + 1,
                endLine: node.endPosition.row + 1,
                params: getParams(node, language),
                exported: isExported(node, language),
                language,
                ...(parentClass ? { parentClass } : {}),
            });
        }
    }

    // Classes
    if (extractors.classes?.includes(node.type)) {
        const name = getNodeName(node, language);
        entities.push({
            name,
            type: 'class',
            file,
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            exported: isExported(node, language),
            language,
        });

        const body = node.childForFieldName('body')
            || node.children.find((c: SyntaxNode) =>
                c.type === 'class_body' ||
                c.type === 'block' ||
                c.type === 'declaration_list'
            );
        if (body) {
            for (const child of body.namedChildren) {
                walkTree(child, language, file, entities, name);
            }
            return;
        }
    }

    // Interfaces
    if (extractors.interfaces?.includes(node.type)) {
        const name = getNodeName(node, language);
        if (name) {
            entities.push({
                name,
                type: 'interface',
                file,
                startLine: node.startPosition.row + 1,
                endLine: node.endPosition.row + 1,
                exported: isExported(node, language),
                language,
            });
        }
    }

    // Type aliases
    if (extractors.typeAliases?.includes(node.type)) {
        const name = getNodeName(node, language);
        entities.push({
            name,
            type: 'type_alias',
            file,
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            exported: isExported(node, language),
            language,
        });
    }

    // Enums
    if (extractors.enums?.includes(node.type)) {
        const name = getNodeName(node, language);
        entities.push({
            name,
            type: 'enum',
            file,
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            exported: isExported(node, language),
            language,
        });
    }

    // Methods
    if (extractors.methods?.includes(node.type) && parentClass) {
        const name = getNodeName(node, language);
        if (name !== '<anonymous>') {
            entities.push({
                name,
                type: 'method',
                file,
                startLine: node.startPosition.row + 1,
                endLine: node.endPosition.row + 1,
                params: getParams(node, language),
                exported: true,
                parentClass,
                language,
            });
        }
        return;
    }

    // Recurse
    for (const child of node.namedChildren) {
        walkTree(child, language, file, entities, parentClass);
    }
}

/**
 * CP2: Extract all entities (functions, classes, interfaces, etc.) from parsed ASTs.
 */
export function runCheckpoint2(
    parsedFiles: ParsedFile[],
    analysisDir: string,
    skipWrite = false
): EntityResult {

    const entities: EntityInfo[] = [];

    for (const pf of parsedFiles) {
        walkTree(pf.tree.rootNode, pf.language, pf.relativePath, entities);
    }

    const byType: Record<string, number> = {};
    for (const e of entities) {
        byType[e.type] = (byType[e.type] || 0) + 1;
    }

    const byFile: Record<string, number> = {};
    for (const e of entities) {
        byFile[e.file] = (byFile[e.file] || 0) + 1;
    }

    const result: EntityResult = {
        entities,
        totalCount: entities.length,
        byType,
        byFile,
    };

    if (!skipWrite) {
        const outputPath = path.join(analysisDir, 'entities.json');
        fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
        console.log(`AIL CP2 | ${entities.length} entities extracted | ${Object.keys(byType).map(k => `${k}: ${byType[k]}`).join(', ')}`);
    }

    return result;
}
