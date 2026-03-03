import * as vscode from 'vscode';
import { PanelManager } from './panel/panelManager';

export function activate(context: vscode.ExtensionContext) {
    console.log('AIL Extension is now active!');

    const helloWorld = vscode.commands.registerCommand('ail-extension.helloWorld', () => {
        triggerMissionControl(context);
    });

    const runAIL = vscode.commands.registerCommand('ail-extension.runAIL', () => {
        triggerMissionControl(context);
    });

    context.subscriptions.push(helloWorld, runAIL);
}

function triggerMissionControl(context: vscode.ExtensionContext) {
    vscode.window.showInformationMessage(
        'AIL: Open Mission Control?',
        'Open Mission Control'
    ).then(selection => {
        if (selection === 'Open Mission Control') {
            PanelManager.createOrShow(context);
        }
    });
}

export function deactivate() {}