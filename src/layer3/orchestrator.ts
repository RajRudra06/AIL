import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { runCheckpoint1 } from './checkpoints/cp1_commit_history';
import { runCheckpoint2 } from './checkpoints/cp2_contributors';
import { runCheckpoint3 } from './checkpoints/cp3_file_churn';
import { runCheckpoint4 } from './checkpoints/cp4_assemble_manifest';
import { runCheckpoint5 } from './checkpoints/cp5_notify';

/**
 * Run Layer 3 — Git Intelligence pipeline.
 * Requires Layer 2 to have completed.
 */
export function runLayer3(): void {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showErrorMessage('AIL: No workspace folder open!');
        return;
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;

    // Verify Layer 2 is complete
    const layer2ManifestPath = path.join(workspacePath, '.ail', 'layer2', 'meta-data.json');
    if (!fs.existsSync(layer2ManifestPath)) {
        vscode.window.showErrorMessage('AIL: Layer 2 must be completed first!');
        return;
    }

    // Create folder structure
    const layer3Dir = path.join(workspacePath, '.ail', 'layer3');
    const analysisDir = path.join(layer3Dir, 'analysis');
    if (!fs.existsSync(layer3Dir)) { fs.mkdirSync(layer3Dir, { recursive: true }); }
    if (!fs.existsSync(analysisDir)) { fs.mkdirSync(analysisDir, { recursive: true }); }

    // Run checkpoints
    const commitResult = runCheckpoint1(workspacePath, analysisDir);
    const contribResult = runCheckpoint2(workspacePath, analysisDir);
    const churnResult = runCheckpoint3(workspacePath, analysisDir);
    const manifest = runCheckpoint4(commitResult, contribResult, churnResult, layer3Dir);
    runCheckpoint5(manifest);
}
