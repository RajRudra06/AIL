import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getGraphPanelHTML } from './graph/graphPanelHTML';

export class GraphPanelManager {
    public static currentPanel: GraphPanelManager | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _workspacePath: string;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(workspacePath: string): void {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // if panel already exists — reveal it
        if (GraphPanelManager.currentPanel) {
            GraphPanelManager.currentPanel._panel.reveal(column);
            GraphPanelManager.currentPanel._loadGraph();
            return;
        }

        // create new panel
        const panel = vscode.window.createWebviewPanel(
            'ailKnowledgeGraph',
            'AIL Knowledge Graph',
            column || vscode.ViewColumn.One,
            {
                enableScripts:          true,
                retainContextWhenHidden: true,
            }
        );

        GraphPanelManager.currentPanel = new GraphPanelManager(panel, workspacePath);
    }

    private constructor(panel: vscode.WebviewPanel, workspacePath: string) {
        this._panel         = panel;
        this._workspacePath = workspacePath;

        // set initial HTML
        this._panel.webview.html = getGraphPanelHTML();

        // load graph data
        this._loadGraph();

        // handle messages from webview
        this._panel.webview.onDidReceiveMessage(
            (message: any) => this._handleMessage(message),
            null,
            this._disposables
        );

        // handle panel close
        this._panel.onDidDispose(
            () => this.dispose(),
            null,
            this._disposables
        );
    }

    private _loadGraph(): void {
        const graphsDir = path.join(this._workspacePath, '.ail', 'layer2', 'graphs');

        // load all 4 graphs
        const graphs: Record<string, any> = {};
        const graphFiles = [
            'function_call_graph',
            'import_graph',
            'class_hierarchy_graph',
            'full_graph'
        ];

        for (const graphFile of graphFiles) {
            const filePath = path.join(graphsDir, `${graphFile}.json`);
            try {
                const content  = fs.readFileSync(filePath, 'utf-8');
                graphs[graphFile] = JSON.parse(content);
            } catch {
                graphs[graphFile] = { nodes: [], edges: [] };
            }
        }

        // load meta-data
        let metadata = {};
        try {
            const metaPath = path.join(this._workspacePath, '.ail', 'layer2', 'meta-data.json');
            metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        } catch { /* skip */ }

        // send to webview
        this._panel.webview.postMessage({
            type:     'LOAD_GRAPHS',
            graphs,
            metadata
        });
    }

    private _handleMessage(message: any): void {
        switch (message.type) {

            // user clicked a node — jump to file + line in editor
            case 'OPEN_FILE':
                const filePath = path.join(this._workspacePath, message.file);
                const line     = message.line || 1;

                vscode.workspace.openTextDocument(filePath).then(doc => {
                    vscode.window.showTextDocument(doc).then(editor => {
                        const position = new vscode.Position(line - 1, 0);
                        editor.selection = new vscode.Selection(position, position);
                        editor.revealRange(
                            new vscode.Range(position, position),
                            vscode.TextEditorRevealType.InCenter
                        );
                    });
                });
                break;

            case 'READY':
                // webview is ready — send graph data
                this._loadGraph();
                break;
        }
    }

    public dispose(): void {
        GraphPanelManager.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const d = this._disposables.pop();
            if (d) d.dispose();
        }
    }
}