import * as vscode from 'vscode';
import { PanelManager } from './panel/panelManager';

export function activate(context: vscode.ExtensionContext) {
    console.log('AIL Extension is now active!');

    const helloWorld = vscode.commands.registerCommand('ail-extension.helloWorld', () => {
        triggerAILPopup(context);
    });

    const runAIL = vscode.commands.registerCommand('ail-extension.runAIL', () => {
        triggerAILPopup(context);
    });

    context.subscriptions.push(helloWorld, runAIL);
}

function triggerAILPopup(context: vscode.ExtensionContext) {
    vscode.window.showInformationMessage(
        'AIL: Ready to analyze your workspace. Start analysis?',
        'Run AIL Analysis'
    ).then(selection => {
        if (selection === 'Run AIL Analysis') {
            PanelManager.createOrShow(context);
        }
    });
}

export function deactivate() {}