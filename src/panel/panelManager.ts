import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getMissionControlHTML } from './missionControlUI';
import { runLayer1 } from '../layer1/orchestrator';
import { runLayer2 } from '../layer2/orchestrator';
import { GraphPanelManager } from '../layer2/frontend/GraphPanelManager';
import { StatsPanel } from '../layer1/StatsPanel';
import { Layer2StatsPanel } from '../layer2/Layer2StatsPanel';

export class PanelManager {
    private static currentPanel: vscode.WebviewPanel | undefined;

    public static createOrShow(context: vscode.ExtensionContext) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (PanelManager.currentPanel) {
            PanelManager.currentPanel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'ailMissionControl',
            'AIL — Mission Control',
            vscode.ViewColumn.One,
            {
                enableScripts:           true,
                retainContextWhenHidden: true
            }
        );

        panel.webview.html = getMissionControlHTML();

        panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {

                    // ── CHECK STATUS ──────────────────────────────
                    case 'checkStatus':
                        PanelManager.checkAndSendStatus(panel);
                        break;

                    // ── OPEN LAYER 1 STATS ────────────────────────
                    case 'openLayer1Stats':
                        StatsPanel.createOrShow();
                        break;

                    // ── LOAD GRAPHS ───────────────────────────────
                    case 'loadGraphs':
                        const workspacePath = vscode.workspace.workspaceFolders![0].uri.fsPath;
                        GraphPanelManager.createOrShow(workspacePath);
                        break;

                    // ── RUN LAYER 1 ───────────────────────────────
                    case 'runLayer1':
                        panel.webview.postMessage({ command: 'layerStatus', layer: 1, status: 'running' });
                        runLayer1();
                        panel.webview.postMessage({ command: 'layerStatus', layer: 1, status: 'complete' });
                        break;

                    // ── RUN LAYER 2 ───────────────────────────────
                    case 'runLayer2':
                        panel.webview.postMessage({ command: 'layerStatus', layer: 2, status: 'running' });
                        runLayer2(() => {
                            panel.webview.postMessage({ command: 'layerStatus', layer: 2, status: 'complete' });
                            const wp = vscode.workspace.workspaceFolders![0].uri.fsPath;
                            GraphPanelManager.createOrShow(wp);
                        });
                        break;
                    
                    case 'openLayer2Stats':
                        Layer2StatsPanel.createOrShow();
                        break;

                    // ── RUN LAYER 3 ───────────────────────────────
                    case 'runLayer3':
                        panel.webview.postMessage({ command: 'layerStatus', layer: 3, status: 'running' });
                        setTimeout(() => {
                            panel.webview.postMessage({ command: 'layerStatus', layer: 3, status: 'complete' });
                        }, 2000);
                        break;

                    // ── RUN LAYER 4 ───────────────────────────────
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

        panel.onDidDispose(
            () => { PanelManager.currentPanel = undefined; },
            null,
            context.subscriptions
        );

        PanelManager.currentPanel = panel;
    }

    private static checkAndSendStatus(panel: vscode.WebviewPanel): void {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            panel.webview.postMessage({
                command:      'statusResult',
                layer1Exists: false,
                layer2Exists: false
            });
            return;
        }

        const workspacePath = workspaceFolders[0].uri.fsPath;

        // check layer 1
        const layer1Path = path.join(workspacePath, '.ail', 'layer1', 'meta-data.json');
        const layer1Exists = fs.existsSync(layer1Path);

        // check layer 2
        const layer2Path = path.join(workspacePath, '.ail', 'layer2', 'graphs', 'function_call_graph.json');
        const layer2Exists = fs.existsSync(layer2Path);

        panel.webview.postMessage({
            command: 'statusResult',
            layer1Exists,
            layer2Exists
        });
    }
}