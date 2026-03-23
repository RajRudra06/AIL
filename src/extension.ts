import * as vscode from 'vscode';
import { PanelManager } from './panel/panelManager';

export function activate(context: vscode.ExtensionContext) {
    console.log('AIL Extension is now active!');

    const helloWorld = vscode.commands.registerCommand('ail-extension.helloWorld', () => {
        PanelManager.createOrShow(context);
    });

    const runAIL = vscode.commands.registerCommand('ail-extension.runAIL', () => {
        PanelManager.createOrShow(context);
    });

    context.subscriptions.push(helloWorld, runAIL);
}

export function deactivate() { }