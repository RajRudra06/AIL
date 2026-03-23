import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { runCheckpoint1 } from './checkpoints/cp1_commit_history';
import { runCheckpoint2 } from './checkpoints/cp2_contributors';
import { runCheckpoint3 } from './checkpoints/cp3_file_churn';
import { runCheckpoint4 } from './checkpoints/cp4_co_change';
import { runCheckpoint5 } from './checkpoints/cp5_blast_radius';
import { runCheckpoint6 } from './checkpoints/cp4_assemble_manifest';
import { runCheckpoint7 } from './checkpoints/cp5_notify';

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

    // Find all .git repositories in the workspace (handling monorepos / nested submodules)
    function findGitDirs(dir: string, repos: string[] = []): string[] {
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    if (entry.name === '.git') {
                        repos.push(dir); // Add the parent folder of .git
                    } else if (entry.name !== 'node_modules' && entry.name !== '.ail' && entry.name !== 'dist' && entry.name !== 'build') {
                        findGitDirs(path.join(dir, entry.name), repos);
                    }
                }
            }
        } catch { /* ignore read errors */ }
        return repos;
    }

    const gitRepos = findGitDirs(workspacePath);
    if (gitRepos.length === 0) {
        vscode.window.showErrorMessage('AIL Layer 3: No .git repositories found in the workspace.');
        return;
    }

    console.log(`AIL L3 | Found ${gitRepos.length} Git repositories:`, gitRepos);

    // Run checkpoints, passing all discovered repositories
    const commitResult = runCheckpoint1(gitRepos, workspacePath, analysisDir);
    const contribResult = runCheckpoint2(gitRepos, workspacePath, analysisDir);
    const churnResult = runCheckpoint3(gitRepos, workspacePath, analysisDir);
    const coChangeResult = runCheckpoint4(gitRepos, workspacePath, analysisDir);
    const blastResult = runCheckpoint5(gitRepos, workspacePath, analysisDir);
    const manifest = runCheckpoint6(commitResult, contribResult, churnResult, coChangeResult, blastResult, layer3Dir);
    runCheckpoint7(manifest);
}
