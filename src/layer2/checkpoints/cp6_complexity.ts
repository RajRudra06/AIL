import * as fs from 'fs';
import * as path from 'path';
import Parser, { SyntaxNode } from 'web-tree-sitter';
import { ParsedFile } from './cp1_parser_init';
import { EntityInfo } from './cp2_entity_extractor';

export interface ComplexityInfo {
    entityName: string;
    file: string;
    startLine: number;
    endLine: number;
    language: string;
    parentClass?: string;
    cyclomatic: number;
    nestingDepth: number;
    paramCount: number;
    lineCount: number;
    isComplex: boolean;
}

export interface ComplexityResult {
    functions: ComplexityInfo[];
    totalFunctions: number;
    avgCyclomatic: number;
    avgNesting: number;
    complexFunctions: ComplexityInfo[];
    complexityDistribution: Record<string, number>;
}

const BRANCHING_NODES = new Set([
    'if_statement', 'elif_clause', 'else_clause',
    'for_statement', 'for_in_statement', 'enhanced_for_statement',
    'while_statement', 'do_statement',
    'switch_case', 'case_clause',
    'catch_clause', 'except_clause',
    'ternary_expression', 'conditional_expression',
    'binary_expression',
]);

const NESTING_NODES = new Set([
    'if_statement',
    'for_statement', 'for_in_statement', 'enhanced_for_statement',
    'while_statement', 'do_statement',
    'switch_statement',
    'try_statement',
    'with_statement',
]);

/** Calculate cyclomatic complexity */
function calculateCyclomatic(node: SyntaxNode): number {
    let complexity = 1;

    function walk(n: SyntaxNode) {
        if (BRANCHING_NODES.has(n.type)) {
            if (n.type === 'binary_expression') {
                const opNode = n.children.find((c: SyntaxNode) =>
                    c.text === '&&' || c.text === '||' || c.text === 'and' || c.text === 'or'
                );
                if (opNode) {
                    complexity++;
                }
            } else {
                complexity++;
            }
        }

        for (const child of n.namedChildren) {
            walk(child);
        }
    }

    walk(node);
    return complexity;
}

/** Calculate max nesting depth */
function calculateNestingDepth(node: SyntaxNode): number {
    let maxDepth = 0;

    function walk(n: SyntaxNode, depth: number) {
        if (NESTING_NODES.has(n.type)) {
            depth++;
            if (depth > maxDepth) { maxDepth = depth; }
        }

        for (const child of n.namedChildren) {
            walk(child, depth);
        }
    }

    walk(node, 0);
    return maxDepth;
}

/** Find the AST node for a function entity */
function findFunctionNode(root: SyntaxNode, startLine: number, endLine: number): SyntaxNode | null {
    for (const child of root.namedChildren) {
        const cStart = child.startPosition.row + 1;
        const cEnd = child.endPosition.row + 1;

        if (cStart === startLine && cEnd === endLine) {
            return child;
        }
        if (cStart <= startLine && cEnd >= endLine) {
            const deeper = findFunctionNode(child, startLine, endLine);
            if (deeper) { return deeper; }
            return child;
        }
    }
    return null;
}

/**
 * CP6: Compute cyclomatic complexity and nesting depth for every function/method.
 */
export function runCheckpoint6(
    parsedFiles: ParsedFile[],
    entities: EntityInfo[],
    analysisDir: string,
    skipWrite = false
): ComplexityResult {

    const functions: ComplexityInfo[] = [];

    const fileMap = new Map<string, ParsedFile>();
    for (const pf of parsedFiles) {
        fileMap.set(pf.relativePath, pf);
    }

    for (const entity of entities) {
        if (entity.type !== 'function' && entity.type !== 'method') { continue; }

        const pf = fileMap.get(entity.file);
        if (!pf) { continue; }

        const funcNode = findFunctionNode(pf.tree.rootNode, entity.startLine, entity.endLine);
        if (!funcNode) { continue; }

        const cyclomatic = calculateCyclomatic(funcNode);
        const nestingDepth = calculateNestingDepth(funcNode);
        const lineCount = entity.endLine - entity.startLine + 1;
        const paramCount = entity.params?.length || 0;

        functions.push({
            entityName: entity.parentClass ? `${entity.parentClass}.${entity.name}` : entity.name,
            file: entity.file,
            startLine: entity.startLine,
            endLine: entity.endLine,
            language: entity.language,
            parentClass: entity.parentClass,
            cyclomatic,
            nestingDepth,
            paramCount,
            lineCount,
            isComplex: cyclomatic > 10,
        });
    }

    functions.sort((a, b) => b.cyclomatic - a.cyclomatic);

    const totalFunctions = functions.length;
    const avgCyclomatic = totalFunctions > 0
        ? parseFloat((functions.reduce((s, f) => s + f.cyclomatic, 0) / totalFunctions).toFixed(1))
        : 0;
    const avgNesting = totalFunctions > 0
        ? parseFloat((functions.reduce((s, f) => s + f.nestingDepth, 0) / totalFunctions).toFixed(1))
        : 0;

    const complexFunctions = functions.filter(f => f.isComplex);

    const complexityDistribution: Record<string, number> = {
        'low (1-5)': 0,
        'medium (6-10)': 0,
        'high (11-20)': 0,
        'very-high (21+)': 0,
    };
    for (const f of functions) {
        if (f.cyclomatic <= 5) { complexityDistribution['low (1-5)']++; }
        else if (f.cyclomatic <= 10) { complexityDistribution['medium (6-10)']++; }
        else if (f.cyclomatic <= 20) { complexityDistribution['high (11-20)']++; }
        else { complexityDistribution['very-high (21+)']++; }
    }

    const result: ComplexityResult = {
        functions,
        totalFunctions,
        avgCyclomatic,
        avgNesting,
        complexFunctions,
        complexityDistribution,
    };

    if (!skipWrite) {
        const outputPath = path.join(analysisDir, 'complexity.json');
        fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
        console.log(`AIL CP6 | ${totalFunctions} functions | avg complexity: ${avgCyclomatic} | ${complexFunctions.length} complex (>10)`);
    }

    return result;
}
