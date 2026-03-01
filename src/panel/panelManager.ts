import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getPanelHTML } from './panelUI';
import { runLayer1 } from '../layer1/orchestrator';
import { runLayer2 } from '../layer2/orchestrator';
import { runLayer3 } from '../layer3/orchestrator';
import { runLayer4 } from '../layer4/orchestrator';

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
            'ailDashboard',
            'AIL — Architectural Intelligence',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        panel.webview.html = getPanelHTML();

        panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'runLayer1':
                        panel.webview.postMessage({ command: 'layerStatus', layer: 1, status: 'running' });
                        try {
                            runLayer1();
                            panel.webview.postMessage({ command: 'layerStatus', layer: 1, status: 'complete' });
                        } catch (err) {
                            vscode.window.showErrorMessage(`AIL Layer 1 failed: ${err}`);
                            panel.webview.postMessage({ command: 'layerStatus', layer: 1, status: 'error' });
                        }
                        break;

                    case 'runLayer2':
                        panel.webview.postMessage({ command: 'layerStatus', layer: 2, status: 'running' });
                        runLayer2(context.extensionPath).then(() => {
                            panel.webview.postMessage({ command: 'layerStatus', layer: 2, status: 'complete' });
                        }).catch(err => {
                            vscode.window.showErrorMessage(`AIL Layer 2 failed: ${err}`);
                            panel.webview.postMessage({ command: 'layerStatus', layer: 2, status: 'error' });
                        });
                        break;

                    case 'runLayer3':
                        panel.webview.postMessage({ command: 'layerStatus', layer: 3, status: 'running' });
                        setTimeout(() => {
                            try {
                                runLayer3();
                                panel.webview.postMessage({ command: 'layerStatus', layer: 3, status: 'complete' });
                            } catch (err) {
                                vscode.window.showErrorMessage(`AIL Layer 3 failed: ${err}`);
                                panel.webview.postMessage({ command: 'layerStatus', layer: 3, status: 'error' });
                            }
                        }, 50);
                        break;

                    case 'runLayer4':
                        panel.webview.postMessage({ command: 'layerStatus', layer: 4, status: 'running' });
                        setTimeout(() => {
                            try {
                                runLayer4();
                                panel.webview.postMessage({ command: 'layerStatus', layer: 4, status: 'complete' });
                            } catch (err) {
                                vscode.window.showErrorMessage(`AIL Layer 4 failed: ${err}`);
                                panel.webview.postMessage({ command: 'layerStatus', layer: 4, status: 'error' });
                            }
                        }, 50);
                        break;

                    case 'requestData':
                        PanelManager.sendDashboardData(panel);
                        break;

                    case 'purgeData':
                        const wsf = vscode.workspace.workspaceFolders;
                        if (!wsf) { break; }
                        const ailRoot = path.join(wsf[0].uri.fsPath, '.ail');
                        if (fs.existsSync(ailRoot)) {
                            fs.rmSync(ailRoot, { recursive: true, force: true });
                        }
                        panel.webview.postMessage({ command: 'dashboardData', data: {} });
                        vscode.window.showInformationMessage('AIL Layer Cache Purged');
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

    /** Read all .ail/ JSON data and send to the webview */
    private static sendDashboardData(panel: vscode.WebviewPanel): void {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) { return; }

        const ailRoot = path.join(workspaceFolders[0].uri.fsPath, '.ail');
        const data: Record<string, unknown> = {};

        const tryRead = (key: string, filePath: string) => {
            try {
                if (fs.existsSync(filePath)) {
                    data[key] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                }
            } catch { /* skip */ }
        };

        // Layer 1
        tryRead('l1_manifest', path.join(ailRoot, 'layer1', 'meta-data.json'));
        // Layer 2
        tryRead('l2_entities', path.join(ailRoot, 'layer2', 'analysis', 'entities.json'));
        tryRead('l2_imports', path.join(ailRoot, 'layer2', 'analysis', 'imports.json'));
        tryRead('l2_callGraph', path.join(ailRoot, 'layer2', 'analysis', 'call_graph.json'));
        tryRead('l2_relationships', path.join(ailRoot, 'layer2', 'analysis', 'relationships.json'));
        tryRead('l2_complexity', path.join(ailRoot, 'layer2', 'analysis', 'complexity.json'));
        tryRead('l2_manifest', path.join(ailRoot, 'layer2', 'meta-data.json'));
        // Layer 3
        tryRead('l3_commits', path.join(ailRoot, 'layer3', 'analysis', 'commit_history.json'));
        tryRead('l3_contributors', path.join(ailRoot, 'layer3', 'analysis', 'contributors.json'));
        tryRead('l3_churn', path.join(ailRoot, 'layer3', 'analysis', 'file_churn.json'));
        tryRead('l3_manifest', path.join(ailRoot, 'layer3', 'meta-data.json'));
        // Layer 4
        tryRead('l4_graph', path.join(ailRoot, 'layer4', 'analysis', 'knowledge_graph.json'));
        tryRead('l4_summary', path.join(ailRoot, 'layer4', 'analysis', 'summary.json'));
        tryRead('l4_manifest', path.join(ailRoot, 'layer4', 'meta-data.json'));

        // Check which layers are complete
        data['layerStatus'] = {
            l1: fs.existsSync(path.join(ailRoot, 'layer1', 'meta-data.json')),
            l2: fs.existsSync(path.join(ailRoot, 'layer2', 'meta-data.json')),
            l3: fs.existsSync(path.join(ailRoot, 'layer3', 'meta-data.json')),
            l4: fs.existsSync(path.join(ailRoot, 'layer4', 'meta-data.json')),
        };

        panel.webview.postMessage({ command: 'dashboardData', data });
    }
}