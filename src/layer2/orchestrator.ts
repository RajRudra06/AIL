import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import { GraphPanelManager } from './frontend/GraphPanelManager';

export function runLayer2(onComplete?: () => void): void {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showErrorMessage('AIL: No workspace folder open!');
        return;
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;
    const scriptPath = '/Users/rudrarajpurohit/Desktop/AIL/ail-extension/src/layer2/backend/orchestrator.py';
    const pythonPath = '/Users/rudrarajpurohit/Desktop/AIL/ail-extension/src/layer2/backend/backend_venv/bin/python3';

    const output = vscode.window.createOutputChannel('AIL Layer 2');
    output.show();
    output.appendLine('AIL Layer 2 | Starting...');

    const python = cp.spawn(pythonPath, [scriptPath, workspacePath]);

    python.stdout.on('data', (data: Buffer) => {
        output.appendLine(data.toString().trim());
    });

    python.stderr.on('data', (data: Buffer) => {
        output.appendLine(`ERROR: ${data.toString().trim()}`);
    });

    python.on('close', (code: number) => {
        if (code === 0) {
            output.appendLine('AIL Layer 2 | DONE');
            if (onComplete) onComplete();
        } else {
            vscode.window.showErrorMessage(`AIL Layer 2 failed. Check AIL Layer 2 output panel.`);
        }
    });

    python.on('error', (err: Error) => {
        vscode.window.showErrorMessage(`AIL Layer 2: Failed to start Python — ${err.message}`);
        output.appendLine(`ERROR: ${err.message}`);
    });
}
