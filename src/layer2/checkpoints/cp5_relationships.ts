import * as fs from 'fs';
import * as path from 'path';
import Parser, { SyntaxNode } from 'web-tree-sitter';
import { ParsedFile } from './cp1_parser_init';
import { EntityInfo } from './cp2_entity_extractor';

export interface Relationship {
    type: 'extends' | 'implements' | 'composes' | 'decorates';
    source: string;
    target: string;
    file: string;
    line: number;
    language: string;
}

export interface RelationshipResult {
    relationships: Relationship[];
    totalCount: number;
    byType: Record<string, number>;
    inheritanceChains: Record<string, string[]>;
}

/** Extract inheritance and implementation from TS/JS AST */
function extractTSJSRelationships(tree: Parser.Tree, file: string): Relationship[] {
    const rels: Relationship[] = [];

    function walk(node: SyntaxNode) {
        if (node.type === 'class_declaration') {
            const className = node.childForFieldName('name')?.text || '';

            const heritage = node.children.find((c: SyntaxNode) => c.type === 'class_heritage');
            if (heritage) {
                const extendsClause = heritage.descendantsOfType('extends_clause');
                for (const ext of extendsClause) {
                    const target = ext.namedChildren[0]?.text;
                    if (target) {
                        rels.push({
                            type: 'extends', source: className, target, file,
                            line: ext.startPosition.row + 1, language: 'TypeScript',
                        });
                    }
                }

                const implClause = heritage.descendantsOfType('implements_clause');
                for (const impl of implClause) {
                    for (const child of impl.namedChildren) {
                        if (child.text) {
                            rels.push({
                                type: 'implements', source: className, target: child.text, file,
                                line: impl.startPosition.row + 1, language: 'TypeScript',
                            });
                        }
                    }
                }
            }

            const directExtends = node.children.find((c: SyntaxNode) => c.type === 'extends_clause');
            if (directExtends) {
                const target = directExtends.namedChildren[0]?.text;
                if (target) {
                    rels.push({
                        type: 'extends', source: className, target, file,
                        line: directExtends.startPosition.row + 1, language: 'TypeScript',
                    });
                }
            }
        }

        if (node.type === 'decorator') {
            const decoratorName = node.namedChildren[0]?.text || '';
            const nextSibling = node.nextNamedSibling;
            if (nextSibling) {
                const entityName = nextSibling.childForFieldName('name')?.text || '';
                if (decoratorName && entityName) {
                    rels.push({
                        type: 'decorates', source: decoratorName, target: entityName, file,
                        line: node.startPosition.row + 1, language: 'TypeScript',
                    });
                }
            }
        }

        for (const child of node.namedChildren) {
            walk(child);
        }
    }

    walk(tree.rootNode);
    return rels;
}

/** Extract inheritance from Python AST */
function extractPythonRelationships(tree: Parser.Tree, file: string): Relationship[] {
    const rels: Relationship[] = [];

    function walk(node: SyntaxNode) {
        if (node.type === 'class_definition') {
            const className = node.childForFieldName('name')?.text || '';
            const superclasses = node.childForFieldName('superclasses')
                || node.children.find((c: SyntaxNode) => c.type === 'argument_list');

            if (superclasses) {
                for (const arg of superclasses.namedChildren) {
                    const parentName = arg.text;
                    if (parentName && parentName !== 'object') {
                        rels.push({
                            type: 'extends', source: className, target: parentName, file,
                            line: node.startPosition.row + 1, language: 'Python',
                        });
                    }
                }
            }
        }

        if (node.type === 'decorated_definition') {
            const decorators = node.descendantsOfType('decorator');
            const definition = node.namedChildren.find((c: SyntaxNode) =>
                c.type === 'function_definition' || c.type === 'class_definition'
            );
            if (definition) {
                const entityName = definition.childForFieldName('name')?.text || '';
                for (const dec of decorators) {
                    const decName = dec.namedChildren[0]?.text || '';
                    if (decName && entityName) {
                        rels.push({
                            type: 'decorates', source: decName, target: entityName, file,
                            line: dec.startPosition.row + 1, language: 'Python',
                        });
                    }
                }
            }
        }

        for (const child of node.namedChildren) {
            walk(child);
        }
    }

    walk(tree.rootNode);
    return rels;
}

/** Extract inheritance from Java AST */
function extractJavaRelationships(tree: Parser.Tree, file: string): Relationship[] {
    const rels: Relationship[] = [];

    function walk(node: SyntaxNode) {
        if (node.type === 'class_declaration') {
            const className = node.childForFieldName('name')?.text || '';

            const superclass = node.childForFieldName('superclass');
            if (superclass) {
                rels.push({
                    type: 'extends', source: className, target: superclass.text, file,
                    line: node.startPosition.row + 1, language: 'Java',
                });
            }

            const interfaces = node.childForFieldName('interfaces');
            if (interfaces) {
                for (const iface of interfaces.namedChildren) {
                    if (iface.type === 'type_list') {
                        for (const t of iface.namedChildren) {
                            rels.push({
                                type: 'implements', source: className, target: t.text, file,
                                line: node.startPosition.row + 1, language: 'Java',
                            });
                        }
                    } else {
                        rels.push({
                            type: 'implements', source: className, target: iface.text, file,
                            line: node.startPosition.row + 1, language: 'Java',
                        });
                    }
                }
            }
        }

        for (const child of node.namedChildren) {
            walk(child);
        }
    }

    walk(tree.rootNode);
    return rels;
}

/**
 * CP5: Map structural relationships (inheritance, implementation, composition, decorators).
 */
export function runCheckpoint5(
    parsedFiles: ParsedFile[],
    _entities: EntityInfo[],
    analysisDir: string,
    skipWrite = false
): RelationshipResult {

    const allRelationships: Relationship[] = [];

    for (const pf of parsedFiles) {
        switch (pf.language) {
            case 'TypeScript':
            case 'JavaScript':
                allRelationships.push(...extractTSJSRelationships(pf.tree, pf.relativePath));
                break;
            case 'Python':
                allRelationships.push(...extractPythonRelationships(pf.tree, pf.relativePath));
                break;
            case 'Java':
                allRelationships.push(...extractJavaRelationships(pf.tree, pf.relativePath));
                break;
        }
    }

    const byType: Record<string, number> = {};
    for (const r of allRelationships) {
        byType[r.type] = (byType[r.type] || 0) + 1;
    }

    const extendsMap: Record<string, string> = {};
    for (const r of allRelationships) {
        if (r.type === 'extends') {
            extendsMap[r.source] = r.target;
        }
    }
    const inheritanceChains: Record<string, string[]> = {};
    for (const child of Object.keys(extendsMap)) {
        const chain: string[] = [];
        let current = child;
        const visited = new Set<string>();
        while (extendsMap[current] && !visited.has(current)) {
            visited.add(current);
            current = extendsMap[current];
            chain.push(current);
        }
        if (chain.length > 0) {
            inheritanceChains[child] = chain;
        }
    }

    const result: RelationshipResult = {
        relationships: allRelationships,
        totalCount: allRelationships.length,
        byType,
        inheritanceChains,
    };

    if (!skipWrite) {
        const outputPath = path.join(analysisDir, 'relationships.json');
        fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
        console.log(`AIL CP5 | ${allRelationships.length} relationships | ${Object.entries(byType).map(([k, v]) => `${k}: ${v}`).join(', ')}`);
    }

    return result;
}
