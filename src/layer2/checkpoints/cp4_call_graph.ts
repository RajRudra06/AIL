import * as fs from 'fs';
import * as path from 'path';
import Parser, { SyntaxNode } from 'web-tree-sitter';
import { ParsedFile } from './cp1_parser_init';
import { EntityInfo } from './cp2_entity_extractor';
import { ImportResult } from './cp3_import_mapper';

export interface CallEdge {
    caller: string;
    callee: string;
    file: string;
    line: number;
    resolved: boolean;
}

export interface CallGraphResult {
    edges: CallEdge[];
    totalEdges: number;
    adjacency: Record<string, string[]>;
    hotFunctions: { name: string; incomingCalls: number }[];
}

/** Build a lookup: function/method name → qualified name(s) */
function buildEntityLookup(entities: EntityInfo[]): Map<string, string[]> {
    const lookup = new Map<string, string[]>();

    for (const e of entities) {
        if (e.type !== 'function' && e.type !== 'method') { continue; }

        const qualifiedName = e.parentClass
            ? `${e.file}::${e.parentClass}.${e.name}`
            : `${e.file}::${e.name}`;

        const existing = lookup.get(e.name) || [];
        existing.push(qualifiedName);
        lookup.set(e.name, existing);
    }

    return lookup;
}

/** Extract function calls from a function/method body */
function extractCallsFromNode(
    node: SyntaxNode,
    callerName: string,
    file: string,
    _language: string,
    entityLookup: Map<string, string[]>,
    edges: CallEdge[],
    seenCalls: Set<string>
): void {
    if (node.type === 'call_expression' || node.type === 'call') {
        const funcNode = node.childForFieldName('function')
            || node.childForFieldName('name')
            || node.children[0];

        if (funcNode) {
            let calleeName = '';

            if (funcNode.type === 'member_expression' || funcNode.type === 'attribute') {
                const property = funcNode.childForFieldName('property')
                    || funcNode.childForFieldName('attribute');
                const object = funcNode.childForFieldName('object');
                if (property && object) {
                    calleeName = `${object.text}.${property.text}`;
                } else if (property) {
                    calleeName = property.text;
                }
            } else if (funcNode.type === 'identifier') {
                calleeName = funcNode.text;
            } else if (funcNode.type === 'scoped_identifier') {
                calleeName = funcNode.text;
            } else {
                calleeName = funcNode.text;
            }

            if (!calleeName || calleeName.length > 100) { return; }
            const skipPatterns = ['console.log', 'console.error', 'console.warn',
                'print', 'parseInt', 'parseFloat', 'toString', 'valueOf',
                'JSON.stringify', 'JSON.parse', 'Object.keys', 'Object.values',
                'Array.isArray'];
            if (skipPatterns.some(p => calleeName.startsWith(p))) { return; }

            const edgeKey = `${callerName}→${calleeName}`;
            if (seenCalls.has(edgeKey)) { return; }
            seenCalls.add(edgeKey);

            const shortName = calleeName.split('.').pop() || calleeName;
            const resolved = entityLookup.has(shortName);

            edges.push({
                caller: callerName,
                callee: calleeName,
                file,
                line: node.startPosition.row + 1,
                resolved,
            });
        }
    }

    for (const child of node.namedChildren) {
        extractCallsFromNode(child, callerName, file, _language, entityLookup, edges, seenCalls);
    }
}

/** Find the AST node for an entity by line range */
function findEntityNode(root: SyntaxNode, startLine: number, endLine: number): SyntaxNode | null {
    for (const child of root.namedChildren) {
        const childStart = child.startPosition.row + 1;
        const childEnd = child.endPosition.row + 1;

        if (childStart === startLine && childEnd === endLine) {
            return child;
        }

        if (childStart <= startLine && childEnd >= endLine) {
            const deeper = findEntityNode(child, startLine, endLine);
            if (deeper) { return deeper; }
            return child;
        }
    }
    return null;
}

/**
 * CP4: Build call graph by analyzing function bodies for call expressions.
 */
export function runCheckpoint4(
    parsedFiles: ParsedFile[],
    entities: EntityInfo[],
    _importResult: ImportResult,
    analysisDir: string,
    skipWrite = false
): CallGraphResult {

    const entityLookup = buildEntityLookup(entities);
    const allEdges: CallEdge[] = [];

    const fileMap = new Map<string, ParsedFile>();
    for (const pf of parsedFiles) {
        fileMap.set(pf.relativePath, pf);
    }

    for (const entity of entities) {
        if (entity.type !== 'function' && entity.type !== 'method') { continue; }

        const pf = fileMap.get(entity.file);
        if (!pf) { continue; }

        const callerName = entity.parentClass
            ? `${entity.file}::${entity.parentClass}.${entity.name}`
            : `${entity.file}::${entity.name}`;

        const entityNode = findEntityNode(pf.tree.rootNode, entity.startLine, entity.endLine);
        if (!entityNode) { continue; }

        const body = entityNode.childForFieldName('body')
            || entityNode.children.find((c: SyntaxNode) =>
                c.type === 'statement_block' ||
                c.type === 'block' ||
                c.type === 'expression_statement'
            );

        if (body) {
            const seenCalls = new Set<string>();
            extractCallsFromNode(body, callerName, entity.file, entity.language, entityLookup, allEdges, seenCalls);
        }
    }

    const adjacency: Record<string, string[]> = {};
    for (const edge of allEdges) {
        if (!adjacency[edge.caller]) {
            adjacency[edge.caller] = [];
        }
        if (!adjacency[edge.caller].includes(edge.callee)) {
            adjacency[edge.caller].push(edge.callee);
        }
    }

    const incomingCount: Record<string, number> = {};
    for (const edge of allEdges) {
        const target = edge.callee;
        incomingCount[target] = (incomingCount[target] || 0) + 1;
    }
    const hotFunctions = Object.entries(incomingCount)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 20)
        .map(([name, count]) => ({ name, incomingCalls: count }));

    const result: CallGraphResult = {
        edges: allEdges,
        totalEdges: allEdges.length,
        adjacency,
        hotFunctions,
    };

    if (!skipWrite) {
        const outputPath = path.join(analysisDir, 'call_graph.json');
        fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

        const resolvedCount = allEdges.filter(e => e.resolved).length;
        console.log(`AIL CP4 | ${allEdges.length} call edges (${resolvedCount} resolved) | Top callee: ${hotFunctions[0]?.name || 'none'}`);
    }

    return result;
}
