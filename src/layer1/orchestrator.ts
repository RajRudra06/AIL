import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { runCheckpoint1  } from './checkpoints/cp1_workspace';
import { runCheckpoint2  } from './checkpoints/cp2_filescanner';
import { runCheckpoint3  } from './checkpoints/cp3_language_detector';
import { runCheckpoint4  } from './checkpoints/cp4_framework_scanner';
import { runCheckpoint5  } from './checkpoints/cp5_entrypoint_finder';
import { runCheckpoint6  } from './checkpoints/cp6_metrics';
import { runCheckpoint7  } from './checkpoints/cp7_execution_model';
import { runCheckpoint8  } from './checkpoints/cp8_dependency_manifest';
import { runCheckpoint9  } from './checkpoints/cp9_dependency_depth';
import { runCheckpoint10 } from './checkpoints/cp10_assemble_manifest';
import { runCheckpoint11 } from './checkpoints/cp11_notify';

export function runLayer1(): void {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showErrorMessage('AIL: No workspace folder open!');
        return;
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;

    const ailRoot     = path.join(workspacePath, '.ail');
    const layer1Dir   = path.join(ailRoot, 'layer1');
    const analysisDir = path.join(layer1Dir, 'analysis');

    if (!fs.existsSync(ailRoot))     { fs.mkdirSync(ailRoot); }
    if (!fs.existsSync(layer1Dir))   { fs.mkdirSync(layer1Dir); }
    if (!fs.existsSync(analysisDir)) { fs.mkdirSync(analysisDir); }

    runCheckpoint1(workspacePath, analysisDir);
    const scanResult    = runCheckpoint2(workspacePath, analysisDir);
    const langResult    = runCheckpoint3(scanResult,              analysisDir);
    const fwResult      = runCheckpoint4(workspacePath, langResult,            analysisDir);
    const epResult      = runCheckpoint5(workspacePath, langResult, fwResult,  analysisDir);
    const metricsResult = runCheckpoint6(workspacePath, scanResult,            analysisDir);
    const execModel     = runCheckpoint7(fwResult, epResult, workspacePath,    analysisDir);
    const depManifest   = runCheckpoint8(workspacePath,                        analysisDir);
    const depDepth      = runCheckpoint9(depManifest,                          analysisDir);
    const manifest      = runCheckpoint10(workspacePath, scanResult, langResult, fwResult, epResult, metricsResult, execModel, depManifest, depDepth, layer1Dir);
    runCheckpoint11(manifest);
}