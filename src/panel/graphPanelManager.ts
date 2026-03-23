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

                        const highlightDecoration = vscode.window.createTextEditorDecorationType({
                            backgroundColor: 'rgba(255, 255, 0, 0.3)',
                            isWholeLine: true
                        });
                        
                        const range = new vscode.Range(line, 0, line, 0);
                        editor.setDecorations(highlightDecoration, [range]);
                        
                        setTimeout(() => {
                            highlightDecoration.dispose();
                        }, 1000);
                    } else if (message.command === 'explainFunction') {
                        try {
                            const context = await GraphPanelManager.getFunctionContext(workspacePath, message.nodeId, 3);
                            const response = await GraphPanelManager.callFunctionChatLLM(
                                `Explain this function to me: ${message.label}\n\nCode Context (Target + Transitive Dependencies Depth 3):\n${context.code}\n\nRepo Structure:\n${context.meta}`,
                                []
                            );
                            panel.webview.postMessage({ command: 'chatResponse', text: response });
                        } catch (err: any) {
                            console.error('[AIL] explainFunction error:', err);
                            panel.webview.postMessage({ command: 'chatResponse', text: `> **Error**: ${err.message || 'Unknown error occurred during explanation.'}` });
                        }
                    } else if (message.command === 'askFunctionChat') {
                        try {
                            const context = await GraphPanelManager.getFunctionContext(workspacePath, message.nodeId, 3);
                            const response = await GraphPanelManager.callFunctionChatLLM(message.query, message.history, context);
                            panel.webview.postMessage({ command: 'chatResponse', text: response });
                        } catch (err: any) {
                            console.error('[AIL] askFunctionChat error:', err);
                            panel.webview.postMessage({ command: 'chatResponse', text: `> **Error**: ${err.message || 'Failed to get response from AI.'}` });
                        }
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

        // Send initial data to webview so graph renders instantly
        GraphPanelManager.currentPanel.webview.postMessage({
            command: 'loadGraphData',
            data: {
                graph: graphData,
                coupling: couplingData,
            }
        });

        // Send loading message for the summary
        GraphPanelManager.currentPanel.webview.postMessage({
            command: 'updateSummary',
            report: '<LOADING>'
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

        const prompt = `You are an expert architecture AI agent.

Based on the raw data below, generate a purely English-based structural summary of the repository.

Raw Repo Data:
${rawStats}

You MUST output exactly 4 sections. Each section must start with a Markdown heading 3 (###) exactly as formatted below. Do NOT use long paragraphs. Instead, use highly concise, point-wise bulleted lists to make the information extremely scannable and structured. Bold important terms.

### 1. Codebase Overview
In 2-3 concise bullet points, explain what this codebase likely does, its primary languages, its scale, and its core modules.

### 2. Function Calls & Interactions
In 2-3 concise bullet points, summarize how the functions and entities interact, control flow, and execution model.

### 3. Repository Directory Structure
In 2-3 concise bullet points, summarize how the repository is organized and the structural grouping of the files.

### 4. Dashboard Properties Analysis
For each of the 5 primary Dashboard Properties (Risk Hotspots, Cyclomatic Complexity, File Churn, Blast Radius, Hidden Coupling), provide exactly ONE highly insightful bullet point explaining what it means for the maintainability of THIS specific project. Do NOT just list the raw stats.`;

        if (provider === 'groq' || provider === 'gemini') {
            let apiKey = config.get<string>('groqApiKey');
            if (apiKey && apiKey.trim() === '') apiKey = undefined;
            
            if (!apiKey) {
                const wsFolders = vscode.workspace.workspaceFolders;
                if (wsFolders && wsFolders.length > 0) {
                    const envPath = path.join(wsFolders[0].uri.fsPath, '.env');
                    try {
                        if (fs.existsSync(envPath)) {
                            const envContent = fs.readFileSync(envPath, 'utf8');
                            const match = envContent.match(/GROQ_API_KEY\s*=\s*['"]?([^'"\n\r]+)['"]?/);
                            if (match && match[1]) apiKey = match[1].trim();
                        }
                    } catch (e) { console.error("Could not read .env", e); }
                }
            }
            if (!apiKey || apiKey.trim() === '') {
                throw new Error('Groq API Key missing. Please set it in VSCode settings (ail.groqApiKey) or within a workspace .env file.');
            }

            const model = 'llama-3.3-70b-versatile';
            const url = "https://api.groq.com/openai/v1/chat/completions";
            const response = await fetch(url, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: model,
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
        } else {
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

    private static async getFunctionContext(workspacePath: string, rootId: string, maxDepth: number): Promise<{code: string, meta: string}> {
        const ailRoot = path.join(workspacePath, '.ail');
        const entitiesPath = path.join(ailRoot, 'layer2', 'analysis', 'entities.json');
        const callGraphPath = path.join(ailRoot, 'layer2', 'analysis', 'call_graph.json');
        
        if (!fs.existsSync(entitiesPath)) return { code: 'No entities found', meta: '' };

        const entitiesData = JSON.parse(fs.readFileSync(entitiesPath, 'utf-8'));
        const callGraphData = fs.existsSync(callGraphPath) ? JSON.parse(fs.readFileSync(callGraphPath, 'utf-8')) : { edges: [] };

        const codeBodies: string[] = [];
        const seenNodes = new Set<string>();
        const queue: { id: string, depth: number }[] = [{ id: rootId, depth: 0 }];

        while (queue.length > 0) {
            const { id, depth } = queue.shift()!;
            if (seenNodes.has(id) || depth > maxDepth) continue;
            seenNodes.add(id);

            const ent = (entitiesData.entities || []).find((e: any) => `${e.file}::${e.name}` === id);
            if (ent) {
                const absPath = path.join(workspacePath, ent.file);
                if (fs.existsSync(absPath)) {
                    const content = fs.readFileSync(absPath, 'utf-8').split('\n');
                    const body = content.slice(Math.max(0, ent.startLine - 1), ent.endLine).join('\n');
                    codeBodies.push(`--- FILE: ${ent.file} | ENTIY: ${ent.name} ---\n${body}\n`);
                }
            }

            const children = (callGraphData.edges || []).filter((e: any) => e.caller === id);
            children.forEach((c: any) => queue.push({ id: c.callee, depth: depth + 1 }));
        }

        const minifiedMeta = (entitiesData.entities || []).map((e: any) => `${e.file} -> ${e.name} (${e.type})`).join('\n');

        return { code: codeBodies.join('\n\n'), meta: minifiedMeta };
    }

    private static async callFunctionChatLLM(query: string, history: any[], context?: {code: string, meta: string}): Promise<string> {
        let apiKey: string | undefined;
        const wsf = vscode.workspace.workspaceFolders;
        if (wsf && wsf.length > 0) {
            const envPath = path.join(wsf[0].uri.fsPath, '.env');
            if (fs.existsSync(envPath)) {
                const envContent = fs.readFileSync(envPath, 'utf8');
                const match = envContent.match(/FUNC_CHAT_GROQ_API_KEY\s*=\s*['"]?([^'"\n\r]+)['"]?/);
                if (match && match[1]) apiKey = match[1].trim();
            }
        }
        if (!apiKey) apiKey = vscode.workspace.getConfiguration('ail').get<string>('groqApiKey');
        if (!apiKey) throw new Error('Groq API Key (Dedicated) missing in .env as FUNC_CHAT_GROQ_API_KEY');

        const systemPrompt = `You are AIL, an advanced architecture explorer. You specialize in explaining implementation details.
You are given the code of a target function AND the code of its transitive dependencies (up to depth 3).
You are also given a minified repository structure for context.

Goal: Provide a clear, technical, and concise explanation as per the user's request. 
Highlight how the function interacts with the dependencies provided in the context.

Repo Structure Context:
${context?.meta || ''}

Code Context:
${context?.code || ''}`;

        const model = 'llama-3.3-70b-versatile';
        const url = "https://api.groq.com/openai/v1/chat/completions";
        const messages = [
            { role: 'system', content: systemPrompt },
            ...history.slice(-6),
            { role: 'user', content: query }
        ];

        const response = await fetch(url, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({ model: model, messages: messages, temperature: 0.2 })
        });

        const data: any = await response.json();
        if (data.error) throw new Error(data.error.message);
        return data.choices[0].message.content;
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
