import * as fs from 'fs';
import * as path from 'path';

export interface GraphNode {
    id: string;
    type: 'file' | 'function' | 'class' | 'interface' | 'method' | 'variable' | 'module';
    name: string;
    file?: string;
    metadata: Record<string, unknown>;
}

export interface GraphEdge {
    source: string;
    target: string;
    type: 'imports' | 'calls' | 'extends' | 'implements' | 'contains' | 'decorates';
    weight: number;
}

export interface KnowledgeGraphResult {
    nodes: GraphNode[];
    edges: GraphEdge[];
    stats: {
        totalNodes: number;
        totalEdges: number;
        nodesByType: Record<string, number>;
        edgesByType: Record<string, number>;
    };
}

/**
 * CP1: Build a unified knowledge graph from all previous layer outputs.
 */
export function runCheckpoint1(workspacePath: string, analysisDir: string): KnowledgeGraphResult {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const nodeIds = new Set<string>();

    // ── Load Layer 2 data ──
    const l2Dir = path.join(workspacePath, '.ail', 'layer2', 'analysis');

    // Entities → nodes
    const entitiesPath = path.join(l2Dir, 'entities.json');
    if (fs.existsSync(entitiesPath)) {
        const entityData = JSON.parse(fs.readFileSync(entitiesPath, 'utf-8'));
        const entities = entityData.entities || [];

        // Create file nodes
        const fileSet = new Set<string>();
        for (const e of entities) {
            fileSet.add(e.file);
        }
        for (const file of fileSet) {
            const id = `file::${file}`;
            if (!nodeIds.has(id)) {
                nodes.push({ id, type: 'file', name: path.basename(file), file, metadata: {} });
                nodeIds.add(id);
            }
        }

        // Create entity nodes + contains edges
        for (const e of entities) {
            const entityId = e.parentClass
                ? `${e.file}::${e.parentClass}.${e.name}`
                : `${e.file}::${e.name}`;

            if (!nodeIds.has(entityId)) {
                nodes.push({
                    id: entityId,
                    type: e.type,
                    name: e.name,
                    file: e.file,
                    metadata: {
                        startLine: e.startLine,
                        endLine: e.endLine,
                        exported: e.exported,
                        params: e.params,
                        language: e.language,
                    },
                });
                nodeIds.add(entityId);
            }

            // File contains entity
            edges.push({
                source: `file::${e.file}`,
                target: entityId,
                type: 'contains',
                weight: 1,
            });
        }
    }

    // Imports → edges
    const importsPath = path.join(l2Dir, 'imports.json');
    if (fs.existsSync(importsPath)) {
        const importData = JSON.parse(fs.readFileSync(importsPath, 'utf-8'));
        for (const imp of importData.imports || []) {
            const sourceId = `file::${imp.sourceFile}`;
            if (!nodeIds.has(sourceId)) {
                nodes.push({ id: sourceId, type: 'file', name: path.basename(imp.sourceFile), file: imp.sourceFile, metadata: {} });
                nodeIds.add(sourceId);
            }

            if (!imp.isExternal) {
                const targetId = `file::${imp.targetFile}`;

                // Ensure target file node exists
                if (!nodeIds.has(targetId)) {
                    nodes.push({ id: targetId, type: 'file', name: path.basename(imp.targetFile), file: imp.targetFile, metadata: {} });
                    nodeIds.add(targetId);
                }

                edges.push({
                    source: sourceId,
                    target: targetId,
                    type: 'imports',
                    weight: imp.importNames.length,
                });
            } else {
                // External module node
                const moduleId = `module::${imp.rawSpecifier}`;
                if (!nodeIds.has(moduleId)) {
                    nodes.push({ id: moduleId, type: 'module', name: imp.rawSpecifier, metadata: { external: true } });
                    nodeIds.add(moduleId);
                }
                edges.push({
                    source: `file::${imp.sourceFile}`,
                    target: moduleId,
                    type: 'imports',
                    weight: 1,
                });
            }
        }
    }

    // Call graph → edges
    const callGraphPath = path.join(l2Dir, 'call_graph.json');
    if (fs.existsSync(callGraphPath)) {
        const callData = JSON.parse(fs.readFileSync(callGraphPath, 'utf-8'));
        for (const edge of callData.edges || []) {
            if (!nodeIds.has(edge.caller)) {
                nodes.push({ id: edge.caller, type: 'function', name: edge.caller.split('::').pop(), metadata: { unresolved: true } });
                nodeIds.add(edge.caller);
            }
            if (!nodeIds.has(edge.callee)) {
                nodes.push({ id: edge.callee, type: 'function', name: edge.callee.split('::').pop() || edge.callee, metadata: { unresolved: true } });
                nodeIds.add(edge.callee);
            }
            edges.push({
                source: edge.caller,
                target: edge.callee,
                type: 'calls',
                weight: 1,
            });
        }
    }

    // Relationships → edges
    const relsPath = path.join(l2Dir, 'relationships.json');
    if (fs.existsSync(relsPath)) {
        const relData = JSON.parse(fs.readFileSync(relsPath, 'utf-8'));
        for (const rel of relData.relationships || []) {
            edges.push({
                source: rel.source,
                target: rel.target,
                type: rel.type as GraphEdge['type'],
                weight: 1,
            });
        }
    }

    // ── Load Layer 3 data (enrich file nodes with churn) ──
    const churnPath = path.join(workspacePath, '.ail', 'layer3', 'analysis', 'file_churn.json');
    const churnMap = new Map<string, { churnScore: number; commits: number; isHot: boolean; isStale: boolean }>();
    if (fs.existsSync(churnPath)) {
        const churnData = JSON.parse(fs.readFileSync(churnPath, 'utf-8'));
        for (const f of churnData.files || []) {
            churnMap.set(f.file, { churnScore: f.churnScore, commits: f.commits, isHot: f.isHot, isStale: f.isStale });
        }

        for (const node of nodes) {
            if (node.type === 'file' && node.file) {
                const churn = churnMap.get(node.file);
                if (churn) {
                    node.metadata.churnScore = churn.churnScore;
                    node.metadata.commits = churn.commits;
                    node.metadata.isHot = churn.isHot;
                    node.metadata.isStale = churn.isStale;
                }
            }
        }
    }

    // ── Load Layer 3 co-change coupling data ──
    const coChangePath = path.join(workspacePath, '.ail', 'layer3', 'analysis', 'co_change.json');
    const couplingMap = new Map<string, number>(); // file → max coupling strength
    if (fs.existsSync(coChangePath)) {
        const coChangeData = JSON.parse(fs.readFileSync(coChangePath, 'utf-8'));
        for (const pair of coChangeData.pairs || []) {
            const existing = couplingMap.get(pair.fileA) || 0;
            couplingMap.set(pair.fileA, Math.max(existing, pair.couplingStrength));
            const existingB = couplingMap.get(pair.fileB) || 0;
            couplingMap.set(pair.fileB, Math.max(existingB, pair.couplingStrength));
        }
    }

    // ── Load Layer 2 complexity data for RPI ──
    const complexityPath = path.join(workspacePath, '.ail', 'layer2', 'analysis', 'complexity.json');
    const complexityMap = new Map<string, number>(); // "file::name" → cyclomatic complexity
    if (fs.existsSync(complexityPath)) {
        const complexityData = JSON.parse(fs.readFileSync(complexityPath, 'utf-8'));
        for (const fn of complexityData.functions || []) {
            const key = `${fn.file}::${fn.name}`;
            complexityMap.set(key, fn.cyclomaticComplexity || 1);
        }
    }

    // ── Compute Risk Priority Index (RPI) ──
    // Collect raw values for normalization
    const rawComplexities: number[] = [];
    const rawChurns: number[] = [];
    const rawCouplings: number[] = [];

    for (const node of nodes) {
        if (node.type === 'function' || node.type === 'method') {
            const cKey = node.file ? `${node.file}::${node.name}` : node.id;
            const complexity = complexityMap.get(cKey) || complexityMap.get(node.id) || 1;
            const fileChurn = node.file ? (churnMap.get(node.file)?.churnScore || 0) : 0;
            const coupling = node.file ? (couplingMap.get(node.file) || 0) : 0;

            rawComplexities.push(complexity);
            rawChurns.push(fileChurn);
            rawCouplings.push(coupling);
        }
    }

    // Min-max normalization helpers
    const normalize = (val: number, arr: number[], baselineMax: number): number => {
        const min = Math.min(...arr);
        const max = Math.max(...arr);
        if (max === min) {
            // Fallback: If all values are the same, use an absolute scale against a baseline max
            return Math.min(1, val / baselineMax);
        }
        return (val - min) / (max - min);
    };

    for (const node of nodes) {
        if (node.type === 'function' || node.type === 'method') {
            const cKey = node.file ? `${node.file}::${node.name}` : node.id;
            const complexity = complexityMap.get(cKey) || complexityMap.get(node.id) || 1;
            const fileChurn = node.file ? (churnMap.get(node.file)?.churnScore || 0) : 0;
            const coupling = node.file ? (couplingMap.get(node.file) || 0) : 0;

            // Complexity baseline 10, Churn 5, Coupling 0.5
            const normComplexity = normalize(complexity, rawComplexities, 10);
            const normChurn = normalize(fileChurn, rawChurns, 5);
            const normCoupling = normalize(coupling, rawCouplings, 0.5);

            const rpi = parseFloat(((normComplexity * 0.4) + (normChurn * 0.4) + (normCoupling * 0.2)).toFixed(3));

            node.metadata.riskScore = rpi;
            node.metadata.riskLevel = rpi >= 0.75 ? 'critical' : rpi >= 0.5 ? 'high' : rpi >= 0.25 ? 'medium' : 'low';
            node.metadata.complexity = complexity;
            node.metadata.fileChurn = fileChurn;
            node.metadata.coupling = coupling;
        }
    }

    // Stats
    const nodesByType: Record<string, number> = {};
    for (const n of nodes) { nodesByType[n.type] = (nodesByType[n.type] || 0) + 1; }
    const edgesByType: Record<string, number> = {};
    for (const e of edges) { edgesByType[e.type] = (edgesByType[e.type] || 0) + 1; }

    const result: KnowledgeGraphResult = {
        nodes,
        edges,
        stats: {
            totalNodes: nodes.length,
            totalEdges: edges.length,
            nodesByType,
            edgesByType,
        },
    };

    const outputPath = path.join(analysisDir, 'knowledge_graph.json');
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

    console.log(`AIL L4-CP1 | Graph: ${nodes.length} nodes, ${edges.length} edges`);
    return result;
}
