import * as vscode from 'vscode';
import { getPanelHTML } from './panelUI';
import { runLayer1 } from '../layer1/orchestrator';

export class PanelManager {
    private static currentPanel: vscode.WebviewPanel | undefined;

    public static createOrShow(context: vscode.ExtensionContext) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If panel already exists, just reveal it
        if (PanelManager.currentPanel) {
            PanelManager.currentPanel.reveal(column);
            return;
        }

        // Create new panel
        const panel = vscode.window.createWebviewPanel(
            'ailDashboard',
            'AIL — Architectural Intelligence',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        panel.webview.html = getPanelHTML();

        // Handle messages from webview → extension
        panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'runLayer1':
                        runLayer1();
                        panel.webview.postMessage({ command: 'layerStatus', layer: 1, status: 'complete' });
                        break;// placeholder — replace with real analysis
                        break;

                    case 'runLayer2':
                        panel.webview.postMessage({ command: 'layerStatus', layer: 2, status: 'running' });
                        setTimeout(() => {
                            panel.webview.postMessage({ command: 'layerStatus', layer: 2, status: 'complete' });
                        }, 2000);
                        break;

                    case 'runLayer3':
                        panel.webview.postMessage({ command: 'layerStatus', layer: 3, status: 'running' });
                        setTimeout(() => {
                            panel.webview.postMessage({ command: 'layerStatus', layer: 3, status: 'complete' });
                        }, 2000);
                        break;

                    case 'runLayer4':
                        panel.webview.postMessage({ command: 'layerStatus', layer: 4, status: 'running' });
                        setTimeout(() => {
                            panel.webview.postMessage({ command: 'layerStatus', layer: 4, status: 'complete' });
                        }, 2000);
                        break;
                }
            },
            undefined,
            context.subscriptions
        );

        // Cleanup when panel is closed
        panel.onDidDispose(
            () => { PanelManager.currentPanel = undefined; },
            null,
            context.subscriptions
        );

        PanelManager.currentPanel = panel;
    }
}