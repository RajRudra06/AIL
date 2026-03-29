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
            const fnName = fn.name || fn.entityName || '';
            const key = `${fn.file}::${fnName}`;
            const score = fn.cyclomaticComplexity || fn.cyclomatic || 1;
            if (fnName) {
                complexityMap.set(key, score);
            }
        }
    }

    // ── Structural signal from call graph degree ──
    const structuralDegreeMap = new Map<string, number>();
    for (const node of nodes) {
        if (node.type === 'function' || node.type === 'method') {
            structuralDegreeMap.set(node.id, 0);
        }
    }
    for (const edge of edges) {
        if (edge.type !== 'calls') {
            continue;
        }
        if (structuralDegreeMap.has(edge.source)) {
            structuralDegreeMap.set(edge.source, (structuralDegreeMap.get(edge.source) || 0) + edge.weight);
        }
        if (structuralDegreeMap.has(edge.target)) {
            structuralDegreeMap.set(edge.target, (structuralDegreeMap.get(edge.target) || 0) + edge.weight);
        }
    }

    // ── Compute Risk Priority Index (RPI) ──
    // Collect raw values for normalization
    const rawComplexities: number[] = [];
    const rawChurns: number[] = [];
    const rawCouplings: number[] = [];
    const rawStructural: number[] = [];

    for (const node of nodes) {
        if (node.type === 'function' || node.type === 'method') {
            const cKey = node.file ? `${node.file}::${node.name}` : node.id;
            const complexity = complexityMap.get(cKey)
                || complexityMap.get(node.id)
                || (typeof node.metadata.complexity === 'number' ? node.metadata.complexity : undefined)
                || Math.max(1, Math.round((structuralDegreeMap.get(node.id) || 0) * 0.75));
            const fileChurn = node.file ? (churnMap.get(node.file)?.churnScore || 0) : 0;
            const coupling = node.file ? (couplingMap.get(node.file) || 0) : 0;
            const structural = structuralDegreeMap.get(node.id) || 0;

            rawComplexities.push(complexity);
            rawChurns.push(fileChurn);
            rawCouplings.push(coupling);
            rawStructural.push(structural);
        }
    }

    // Absolute normalization using log scaling — produces meaningful scores
    // regardless of repo size or metric distribution.
    // Each metric is mapped to 0–1 using a saturation reference point:
    //   complexity: 15 = fully saturated (cyclomatic)
    //   churn:      500 = fully saturated (insertions + deletions across commits)
    //   coupling:   0.6 = fully saturated (co-change ratio)
    //   structural: 12 = fully saturated (in+out degree in call graph)
    const logNorm = (val: number, saturation: number): number => {
        if (val <= 0) return 0;
        // log1p(val) / log1p(saturation) gives a gentle curve that doesn't crush low values
        return Math.min(1, Math.log1p(val) / Math.log1p(saturation));
    };

    const rpiByNodeId = new Map<string, number>();

    for (const node of nodes) {
        if (node.type === 'function' || node.type === 'method') {
            const cKey = node.file ? `${node.file}::${node.name}` : node.id;
            const complexity = complexityMap.get(cKey)
                || complexityMap.get(node.id)
                || (typeof node.metadata.complexity === 'number' ? node.metadata.complexity : undefined)
                || Math.max(1, Math.round((structuralDegreeMap.get(node.id) || 0) * 0.75));
            const fileChurn = node.file ? (churnMap.get(node.file)?.churnScore || 0) : 0;
            const coupling = node.file ? (couplingMap.get(node.file) || 0) : 0;
            const structural = structuralDegreeMap.get(node.id) || 0;

            const normComplexity = logNorm(complexity, 15);
            const normChurn = logNorm(fileChurn, 500);
            const normCoupling = logNorm(coupling, 0.6);
            const normStructural = logNorm(structural, 12);

            // Weights: complexity dominates, churn close second, coupling & structural equal
            const rpi = parseFloat(((normComplexity * 0.30) + (normChurn * 0.30) + (normCoupling * 0.20) + (normStructural * 0.20)).toFixed(3));

            node.metadata.riskScore = rpi;
            node.metadata.complexity = complexity;
            node.metadata.fileChurn = fileChurn;
            node.metadata.coupling = coupling;
            node.metadata.structuralRisk = structural;
            rpiByNodeId.set(node.id, rpi);
        }
    }

    // Risk level thresholds — absolute, no percentile floors
    for (const node of nodes) {
        if (node.type === 'function' || node.type === 'method') {
            const rpi = rpiByNodeId.get(node.id) || 0;
            node.metadata.riskLevel = rpi >= 0.7
                ? 'critical'
                : rpi >= 0.4
                    ? 'high'
                    : rpi >= 0.15
                        ? 'medium'
                        : 'low';
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
