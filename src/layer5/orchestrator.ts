import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { runCheckpoint1 } from './checkpoints/cp1_embed_nodes';
import { runCheckpoint2 } from './checkpoints/cp2_assemble_manifest';
import { runCheckpoint3 } from './checkpoints/cp3_notify';

/**
 * Run Layer 5 — GraphRAG (Semantic Architecture RAG) pipeline.
 * Requires Layer 4 Knowledge Graph to have completed.
 */
export async function runLayer5(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showErrorMessage('AIL: No workspace folder open!');
        return;
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;

    // Verify Layer 4 is complete
    const layer4ManifestPath = path.join(workspacePath, '.ail', 'layer4', 'meta-data.json');
    if (!fs.existsSync(layer4ManifestPath)) {
        vscode.window.showErrorMessage('AIL: Layer 4 Knowledge Graph must be generated first!');
        return;
    }

    // Create folder structure
    const layer5Dir = path.join(workspacePath, '.ail', 'layer5');
    const indexDir = path.join(layer5Dir, 'index');
    if (!fs.existsSync(layer5Dir)) { fs.mkdirSync(layer5Dir, { recursive: true }); }
    if (!fs.existsSync(indexDir)) { fs.mkdirSync(indexDir, { recursive: true }); }
    // Quiet log
    // vscode.window.showInformationMessage('AIL Layer 5: Starting Node Embedding...');

    // Run checkpoints (Async because API calls are involved)
    try {
        const embedResult = await runCheckpoint1(workspacePath, indexDir);
        const manifest = runCheckpoint2(embedResult, layer5Dir);
        runCheckpoint3(manifest);
    } catch (err: any) {
        vscode.window.showErrorMessage(`AIL Layer 5 Failed: ${err.message}`);
    }
}
