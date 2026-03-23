import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

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
                async message => {
                    if (message.command === 'jumpToCode' && message.file) {
                        const wsf = vscode.workspace.workspaceFolders;
                        if (!wsf) { return; }
                        const filePath = path.isAbsolute(message.file)
                            ? message.file
                            : path.join(wsf[0].uri.fsPath, message.file);
                        const uri = vscode.Uri.file(filePath);
                        const line = Math.max(0, (message.line || 1) - 1);
                        
                        const editor = await vscode.window.showTextDocument(uri, {
                            viewColumn: vscode.ViewColumn.Beside,
                            preserveFocus: true,
                            selection: new vscode.Range(line, 0, line, 0)
                        });

                        // Highlight the specific line for 1 second as requested
                        const highlightDecoration = vscode.window.createTextEditorDecorationType({
                            backgroundColor: 'rgba(255, 255, 0, 0.3)', // Temporary yellow flash
                            isWholeLine: true
                        });
                        
                        const range = new vscode.Range(line, 0, line, 0);
                        editor.setDecorations(highlightDecoration, [range]);
                        
                        setTimeout(() => {
                            highlightDecoration.dispose();
                        }, 1000);
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

            // Set static HTML pointing to our React bundle
            panel.webview.html = GraphPanelManager.getHtmlForWebview(panel.webview, context.extensionUri);

            // Small delay to ensure webview is ready to receive messages
            setTimeout(() => {
                GraphPanelManager.sendGraphData(workspacePath);
            }, 500);
        }
    }

    private static getHtmlForWebview(webview: vscode.Webview, extensionUri: vscode.Uri): string {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview.css'));
        
        // Use a nonce to whitelist which scripts can be run
        const nonce = getNonce();

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <!--
                    Use a content security policy to only allow loading images from https or from our extension directory,
                    and only allow scripts that have a specific nonce.
                -->
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>AIL Architecture Explorer</title>
                <link rel="stylesheet" href="${styleUri}">
                <style>
                    html, body, #root { margin: 0; padding: 0; min-height: 100vh; width: 100vw; background-color: #1e1e1e;}
                </style>
            </head>
            <body>
                <div id="root"></div>
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
    }

    private static sendGraphData(workspacePath: string) {
        if (!GraphPanelManager.currentPanel) { return; }

        const ailRoot = path.join(workspacePath, '.ail');
        let graphData = null;
        let summaryData: any = null;
        let couplingData = null;

        try {
            const entitiesPath = path.join(ailRoot, 'layer2', 'analysis', 'entities.json');
            const callGraphPath = path.join(ailRoot, 'layer2', 'analysis', 'call_graph.json');
            
            if (fs.existsSync(entitiesPath) && fs.existsSync(callGraphPath)) {
                // Parse layer 2 metadata for precise caller -> callee mappings
                const entitiesData = JSON.parse(fs.readFileSync(entitiesPath, 'utf-8'));
                const callGraphData = JSON.parse(fs.readFileSync(callGraphPath, 'utf-8'));
                
                const mappedNodes = (entitiesData.entities || []).map((ent: any) => ({
                    id: `${ent.file}::${ent.name}`,
                    name: ent.name,
                    type: ent.type || 'function',
                    file: ent.file,
                    startLine: ent.startLine,
                    endLine: ent.endLine,
                    language: ent.language
                }));
                
                const mappedEdges = (callGraphData.edges || []).map((edge: any) => ({
                    source: edge.caller, 
                    target: edge.callee, 
                    type: 'calls',
                    file: edge.file,
                    line: edge.line
                }));

                graphData = {
                    nodes: mappedNodes,
                    edges: mappedEdges
                };
            } else {
                // Fallback to Layer 4 if Layer 2 is unavailable
                const graphPath = path.join(ailRoot, 'layer4', 'analysis', 'knowledge_graph.json');
                if (fs.existsSync(graphPath)) {
                    graphData = JSON.parse(fs.readFileSync(graphPath, 'utf-8'));
                }
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

        // Send initial data to webview so graph renders instantly with a loading message for the summary
        GraphPanelManager.currentPanel.webview.postMessage({
            command: 'loadGraphData',
            data: {
                graph: graphData,
                coupling: couplingData,
                report: '> **Generating English Architectural Summary via LLM...**\n\nPlease wait while your chosen AI Provider analyzes the structure.'
            }
        });

        // Fire and forget LLM summary generation
        if (summaryData) {
            GraphPanelManager.generateLLMSummary(summaryData).then(llmSummary => {
                if (GraphPanelManager.currentPanel) {
                    GraphPanelManager.currentPanel.webview.postMessage({
                        command: 'loadGraphData',
                        data: {
                            graph: graphData,
                            coupling: couplingData,
                            report: llmSummary
                        }
                    });
                }
            }).catch(e => {
                if (GraphPanelManager.currentPanel) {
                    GraphPanelManager.currentPanel.webview.postMessage({
                        command: 'loadGraphData',
                        data: {
                            graph: graphData,
                            coupling: couplingData,
                            report: `> **LLM Summary Failed**\n\nCould not generate the English summary. Check your API Keys in settings.\n\nError: ${e.message}\n\nFalling back to default overview:\n\n${summaryData.overview}`
                        }
                    });
                }
            });
        }
    }

    private static async generateLLMSummary(summary: any): Promise<string> {
        const config = vscode.workspace.getConfiguration('ail');
        const provider = config.get<string>('aiProvider') || 'gemini';
        
        const rawStats = `
        Project Overview: ${summary.overview || 'N/A'}
        Files: ${summary.fileCount || 0}
        Entities: ${summary.entityCount || 0}
        Languages: ${Object.keys(summary.languages || {}).join(', ')}
        Core Modules: ${(summary.coreModules || []).map((m:any) => m.name).slice(0, 5).join(', ')}
        High Risk Files: ${(summary.riskHotspots || []).filter((r:any)=>r.level==='high').length}
        `;

        const prompt = `You are an expert software architect AI. The user is looking at an architectural node graph of their codebase. They want a purely English-based summary of this system, without markdown tables or lists. 
Based on these raw stats:\n${rawStats}\n
Write a concise, highly insightful, 3-4 paragraph English summary explaining what this codebase likely does, its dominant languages, its architectural heart (core modules), and its overall health. Use a professional, slightly analytical tone. Make it visually beautiful to read (bolding key terms). DO NOT output any raw tables or bullet point lists.`;

        if (provider === 'gemini') {
            const apiKey = config.get<string>('geminiApiKey');
            const model = config.get<string>('geminiModel') || 'gemini-2.0-flash';
            if (!apiKey) throw new Error('Gemini API Key missing');

            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.3 }
                })
            });
            const data: any = await response.json();
            if (data.error) throw new Error(data.error.message);
            return data.candidates[0].content.parts[0].text;
        } else {
            // Azure OpenAI
            const endpoint = config.get<string>('azureOpenAiEndpoint');
            const apiKey = config.get<string>('azureOpenAiApiKey');
            const deploy = config.get<string>('azureOpenAiDeployment');
            if (!endpoint || !apiKey) throw new Error('Azure Settings missing');

            const url = `${endpoint.replace(/\/$/, '')}/openai/deployments/${deploy}/chat/completions?api-version=2024-02-15-preview`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
                body: JSON.stringify({
                    messages: [
                        { role: 'system', content: 'You are an architecture summarizing agent.' },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.3
                })
            });
            const data: any = await response.json();
            if (data.error) throw new Error(data.error.message);
            return data.choices[0].message.content;
        }
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
