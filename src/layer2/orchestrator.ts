import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { runCheckpoint1, ParsedFile, EXTENSION_TO_LANGUAGE } from './checkpoints/cp1_parser_init';
import { runCheckpoint2, EntityInfo, EntityResult } from './checkpoints/cp2_entity_extractor';
import { runCheckpoint3, ImportEdge, ImportResult } from './checkpoints/cp3_import_mapper';
import { runCheckpoint4, CallEdge, CallGraphResult } from './checkpoints/cp4_call_graph';
import { runCheckpoint5, Relationship, RelationshipResult } from './checkpoints/cp5_relationships';
import { runCheckpoint6, ComplexityInfo, ComplexityResult } from './checkpoints/cp6_complexity';
import { runCheckpoint7 } from './checkpoints/cp7_assemble_manifest';
import { runCheckpoint8 } from './checkpoints/cp8_notify';

/**
 * Run Layer 2 — AST Analysis pipeline.
 * Requires Layer 1 to have completed (reads .ail/layer1/meta-data.json).
 */
export async function runLayer2(extensionPath: string): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showErrorMessage('AIL: No workspace folder open!');
        return;
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;

    // ── Verify Layer 1 is complete ──
    const layer1ManifestPath = path.join(workspacePath, '.ail', 'layer1', 'meta-data.json');
    if (!fs.existsSync(layer1ManifestPath)) {
        vscode.window.showErrorMessage('AIL: Layer 1 must be completed first! Run Layer 1 before Layer 2.');
        return;
    }

    const layer1Manifest = JSON.parse(fs.readFileSync(layer1ManifestPath, 'utf-8'));

    // ── Create folder structure ──
    const ailRoot = path.join(workspacePath, '.ail');
    const layer2Dir = path.join(ailRoot, 'layer2');
    const analysisDir = path.join(layer2Dir, 'analysis');

    if (!fs.existsSync(layer2Dir)) { fs.mkdirSync(layer2Dir, { recursive: true }); }
    if (!fs.existsSync(analysisDir)) { fs.mkdirSync(analysisDir, { recursive: true }); }

    // ── Get the source file list from Layer 1 ──
    // Layer 1's file scan includes all files; we filter to source code files
    const scanPath = path.join(workspacePath, '.ail', 'layer1', 'analysis', 'file_scan.json');
    let sourceFiles: { relativePath: string; extension: string }[] = [];

    if (fs.existsSync(scanPath)) {
        const scanData = JSON.parse(fs.readFileSync(scanPath, 'utf-8'));
        sourceFiles = scanData.files || [];
    } else {
        // Fallback: use the extension counts from the manifest to know what languages exist
        vscode.window.showWarningMessage('AIL: Layer 1 file_scan.json not found, using manifest data.');
        return;
    }

    // ── Run checkpoints ──

    // CP1: Initialize parsers
    const parserResult = await runCheckpoint1(workspacePath, sourceFiles, extensionPath, analysisDir);

    // Iterative AST Streaming (to prevent WebAssembly OOM on huge repositories)
    let totalParsed = 0;
    const allEntities: EntityInfo[] = [];
    const entityByType: Record<string, number> = {};
    const entityByFile: Record<string, number> = {};

    const allImports: ImportEdge[] = [];
    const allCalls: CallEdge[] = [];
    const allRelationships: Relationship[] = [];
    const allFunctions: ComplexityInfo[] = [];

    vscode.window.showInformationMessage(`AIL Layer 2: AST Streaming starting for ${sourceFiles.length} files...`);

    for (let i = 0; i < sourceFiles.length; i++) {
        const file = sourceFiles[i];
        const lang = EXTENSION_TO_LANGUAGE[file.extension];
        if (!lang) { continue; }

        const parser = parserResult.languageParsers.get(lang);
        if (!parser) { continue; }

        const fullPath = path.join(workspacePath, file.relativePath);
        let sourceCode: string;
        try {
            sourceCode = fs.readFileSync(fullPath, 'utf-8');
        } catch {
            continue;
        }

        try {
            const tree = parser.parse(sourceCode);
            if (!tree) { continue; }

            const pf: ParsedFile = {
                relativePath: file.relativePath,
                language: lang,
                tree,
                sourceCode
            };

            // Stream thru extractors
            const fEntities = runCheckpoint2([pf], analysisDir, true).entities;
            allEntities.push(...fEntities);
            for (const e of fEntities) {
                entityByType[e.type] = (entityByType[e.type] || 0) + 1;
                entityByFile[e.file] = (entityByFile[e.file] || 0) + 1;
            }

            allImports.push(...runCheckpoint3([pf], workspacePath, analysisDir, true).imports);
            const callEdges = runCheckpoint4([pf], fEntities, { imports: [], totalEdges: 0, fileGraph: {}, externalDeps: [] }, analysisDir, true).edges;
            allCalls.push(...callEdges);
            allRelationships.push(...runCheckpoint5([pf], fEntities, analysisDir, true).relationships);
            allFunctions.push(...runCheckpoint6([pf], fEntities, analysisDir, true).functions);

            // FREES THE WEBASSEMBLY MEMORY FOR THIS AST TREE
            tree.delete();
            totalParsed++;

            if (totalParsed % 1000 === 0) {
                console.log(`AIL Layer 2 | Parsed ${totalParsed} / ${sourceFiles.length} ...`);
            }
        } catch (err) {
            console.error(`AIL Layer 2 Error parsing ${file.relativePath}:`, err);
        }
    }

    // Now write out the aggregated files that the UI needs

    // CP2 aggregated
    const entityResult: EntityResult = {
        entities: allEntities,
        totalCount: allEntities.length,
        byType: entityByType,
        byFile: entityByFile
    };
    fs.writeFileSync(path.join(analysisDir, 'entities.json'), JSON.stringify(entityResult, null, 2));

    // CP3 aggregated
    const fileGraph: Record<string, string[]> = {};
    const externalDepsSet = new Set<string>();
    for (const edge of allImports) {
        if (!fileGraph[edge.sourceFile]) { fileGraph[edge.sourceFile] = []; }
        if (edge.isExternal) { externalDepsSet.add(edge.rawSpecifier); }
        else if (!fileGraph[edge.sourceFile].includes(edge.targetFile)) {
            fileGraph[edge.sourceFile].push(edge.targetFile);
        }
    }
    const importResult: ImportResult = {
        imports: allImports, totalEdges: allImports.length,
        fileGraph, externalDeps: Array.from(externalDepsSet).sort()
    };
    fs.writeFileSync(path.join(analysisDir, 'imports.json'), JSON.stringify(importResult, null, 2));

    // CP4 aggregated
    const adjacency: Record<string, string[]> = {};
    const incomingCount: Record<string, number> = {};
    for (const edge of allCalls) {
        if (!adjacency[edge.caller]) { adjacency[edge.caller] = []; }
        if (!adjacency[edge.caller].includes(edge.callee)) { adjacency[edge.caller].push(edge.callee); }
        incomingCount[edge.callee] = (incomingCount[edge.callee] || 0) + 1;
    }
    const hotFunctions = Object.entries(incomingCount)
        .sort(([, a], [, b]) => b - a).slice(0, 20)
        .map(([name, count]) => ({ name, incomingCalls: count }));
    const callGraphResult: CallGraphResult = {
        edges: allCalls, totalEdges: allCalls.length, adjacency, hotFunctions
    };
    fs.writeFileSync(path.join(analysisDir, 'call_graph.json'), JSON.stringify(callGraphResult, null, 2));

    // CP5 aggregated
    const relByType: Record<string, number> = {};
    const extendsMap: Record<string, string> = {};
    for (const r of allRelationships) {
        relByType[r.type] = (relByType[r.type] || 0) + 1;
        if (r.type === 'extends') { extendsMap[r.source] = r.target; }
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
        if (chain.length > 0) { inheritanceChains[child] = chain; }
    }
    const relationshipResult: RelationshipResult = {
        relationships: allRelationships, totalCount: allRelationships.length,
        byType: relByType, inheritanceChains
    };
    fs.writeFileSync(path.join(analysisDir, 'relationships.json'), JSON.stringify(relationshipResult, null, 2));

    // CP6 aggregated
    allFunctions.sort((a, b) => b.cyclomatic - a.cyclomatic);
    const avgCyclomatic = allFunctions.length > 0 ? parseFloat((allFunctions.reduce((s, f) => s + f.cyclomatic, 0) / allFunctions.length).toFixed(1)) : 0;
    const avgNesting = allFunctions.length > 0 ? parseFloat((allFunctions.reduce((s, f) => s + f.nestingDepth, 0) / allFunctions.length).toFixed(1)) : 0;
    const complexFunctions = allFunctions.filter(f => f.isComplex);
    const complexityDistribution: Record<string, number> = { 'low (1-5)': 0, 'medium (6-10)': 0, 'high (11-20)': 0, 'very-high (21+)': 0 };
    for (const f of allFunctions) {
        if (f.cyclomatic <= 5) { complexityDistribution['low (1-5)']++; }
        else if (f.cyclomatic <= 10) { complexityDistribution['medium (6-10)']++; }
        else if (f.cyclomatic <= 20) { complexityDistribution['high (11-20)']++; }
        else { complexityDistribution['very-high (21+)']++; }
    }
    const complexityResult: ComplexityResult = {
        functions: allFunctions, totalFunctions: allFunctions.length, avgCyclomatic, avgNesting, complexFunctions, complexityDistribution
    };
    fs.writeFileSync(path.join(analysisDir, 'complexity.json'), JSON.stringify(complexityResult, null, 2));

    // CP7: Assemble manifest
    const manifest = runCheckpoint7(entityResult, importResult, callGraphResult, relationshipResult, complexityResult, layer2Dir);

    // CP8: Notify user
    runCheckpoint8(manifest);
}
