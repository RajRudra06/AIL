import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { runCheckpoint1 } from './checkpoints/cp1_build_graph';
import { runCheckpoint2 } from './checkpoints/cp2_generate_summary';
import { runCheckpoint3 } from './checkpoints/cp3_assemble_manifest';
import { runCheckpoint4 } from './checkpoints/cp4_notify';

/**
 * Run Layer 4 — Knowledge Graph + Summary pipeline.
 * Requires Layer 3 to have completed.
 */
export function runLayer4(): void {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showErrorMessage('AIL: No workspace folder open!');
        return;
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;

    // Verify Layer 3 is complete
    const layer3ManifestPath = path.join(workspacePath, '.ail', 'layer3', 'meta-data.json');
    if (!fs.existsSync(layer3ManifestPath)) {
        vscode.window.showErrorMessage('AIL: Layer 3 must be completed first!');
        return;
    }

    // Create folder structure
    const layer4Dir = path.join(workspacePath, '.ail', 'layer4');
    const analysisDir = path.join(layer4Dir, 'analysis');
    if (!fs.existsSync(layer4Dir)) { fs.mkdirSync(layer4Dir, { recursive: true }); }
    if (!fs.existsSync(analysisDir)) { fs.mkdirSync(analysisDir, { recursive: true }); }

    // Run checkpoints
    const graph = runCheckpoint1(workspacePath, analysisDir);
    const summary = runCheckpoint2(workspacePath, graph, analysisDir);
    const manifest = runCheckpoint3(graph, summary, layer4Dir);
    runCheckpoint4(manifest);
}
