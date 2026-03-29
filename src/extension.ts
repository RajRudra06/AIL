import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { PanelManager } from './panel/panelManager.js';

async function openPreferredView(context: vscode.ExtensionContext) {
    const wsf = vscode.workspace.workspaceFolders;
    if (!wsf || wsf.length === 0) {
        PanelManager.createOrShow(context);
        return;
    }

    const workspacePath = wsf[0].uri.fsPath;
    const ailRoot = path.join(workspacePath, '.ail');

    if (fs.existsSync(ailRoot)) {
        const { GraphPanelManager } = await import('./panel/graphPanelManager.js');
        GraphPanelManager.createOrShow(context, workspacePath);
        return;
    }

    PanelManager.createOrShow(context);
}

export function activate(context: vscode.ExtensionContext) {
    console.log('AIL Extension is now active!');

    const helloWorld = vscode.commands.registerCommand('ail-extension.helloWorld', async () => {
        await openPreferredView(context);
    });

    const runAIL = vscode.commands.registerCommand('ail-extension.runAIL', async () => {
        await openPreferredView(context);
    });

    const openDashboard = vscode.commands.registerCommand('ail-extension.openDashboard', async () => {
        PanelManager.createOrShow(context);
    });

    context.subscriptions.push(helloWorld, runAIL, openDashboard);
}

export function deactivate() { }