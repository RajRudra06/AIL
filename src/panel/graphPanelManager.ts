import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getGraphPanelHTML } from './graphUI';

export class GraphPanelManager {
    private static currentPanel: vscode.WebviewPanel | undefined;

    public static createOrShow(context: vscode.ExtensionContext, workspacePath: string) {
        const column = vscode.ViewColumn.Beside;

        if (GraphPanelManager.currentPanel) {
            GraphPanelManager.currentPanel.reveal(column);
            // Re-send data in case it changed
            GraphPanelManager.sendGraphData(workspacePath);
        } else {
            const panel = vscode.window.createWebviewPanel(
                'ailGraphView',
                'AIL — Knowledge Graph View',
                column,
                { enableScripts: true, retainContextWhenHidden: true }
            );

            GraphPanelManager.currentPanel = panel;

            // Handle messages from webview
            panel.webview.onDidReceiveMessage(
                message => {
                    if (message.command === 'jumpToCode' && message.file) {
                        const wsf = vscode.workspace.workspaceFolders;
                        if (!wsf) { return; }
                        const filePath = path.isAbsolute(message.file)
                            ? message.file
                            : path.join(wsf[0].uri.fsPath, message.file);
                        const uri = vscode.Uri.file(filePath);
                        const line = Math.max(0, (message.line || 1) - 1);
                        vscode.window.showTextDocument(uri, {
                            viewColumn: vscode.ViewColumn.One,
                            selection: new vscode.Range(line, 0, line, 0)
                        });
                    }
                },
                undefined,
                context.subscriptions
            );

            panel.onDidDispose(
                () => { GraphPanelManager.currentPanel = undefined; },
                null,
                context.subscriptions
            );

            // Set static HTML first, then send data
            panel.webview.html = getGraphPanelHTML();

            // Small delay to ensure webview is ready to receive messages
            setTimeout(() => {
                GraphPanelManager.sendGraphData(workspacePath);
            }, 500);
        }
    }

    private static sendGraphData(workspacePath: string) {
        if (!GraphPanelManager.currentPanel) { return; }

        const ailRoot = path.join(workspacePath, '.ail');
        let graphData = null;
        let summaryData = null;
        let couplingData = null;

        try {
            const graphPath = path.join(ailRoot, 'layer4', 'analysis', 'knowledge_graph.json');
            if (fs.existsSync(graphPath)) {
                graphData = JSON.parse(fs.readFileSync(graphPath, 'utf-8'));
            }
            const summaryPath = path.join(ailRoot, 'layer4', 'analysis', 'summary.json');
            if (fs.existsSync(summaryPath)) {
                summaryData = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
            }
            const couplingPath = path.join(ailRoot, 'layer3', 'analysis', 'co_change.json');
            if (fs.existsSync(couplingPath)) {
                couplingData = JSON.parse(fs.readFileSync(couplingPath, 'utf-8'));
            }
        } catch (err) {
            console.error('[AIL] Error reading graph data:', err);
        }

        // Send data to webview via postMessage — no template literal issues!
        GraphPanelManager.currentPanel.webview.postMessage({
            command: 'graphData',
            graph: graphData,
            coupling: couplingData,
            report: summaryData?.markdownReport || 'No architecture summary available. Run Layer 4.'
        });
    }
}
