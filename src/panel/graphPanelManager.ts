import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigUtils } from '../utils/configUtils';

export class GraphPanelManager {
    private static currentPanel: vscode.WebviewPanel | undefined;

    private static async resolveOllamaModel(baseUrl: string, configuredModel: string): Promise<string> {
        try {
            const response = await fetch(`${baseUrl}/api/tags`, { method: 'GET' });
            if (!response.ok) {
                return configuredModel;
            }

            const payload = await response.json() as any;
            const models = Array.isArray(payload.models) ? payload.models : [];
            const modelNames = models
                .map((m: any) => String(m?.name || '').trim())
                .filter((name: string) => name.length > 0);

            if (modelNames.includes(configuredModel)) {
                return configuredModel;
            }

            return modelNames[0] || configuredModel;
        } catch {
            return configuredModel;
        }
    }

    private static pruneGraphForWebview(rawGraph: any, maxNodes = 1200, maxEdges = 6000): any {
        if (!rawGraph || !Array.isArray(rawGraph.nodes) || !Array.isArray(rawGraph.edges)) {
            return rawGraph;
        }

        const originalNodeCount = rawGraph.nodes.length;
        const originalEdgeCount = rawGraph.edges.length;

        if (originalNodeCount <= maxNodes && originalEdgeCount <= maxEdges) {
            return {
                ...rawGraph,
                stats: {
                    ...(rawGraph.stats || {}),
                    totalNodes: originalNodeCount,
                    totalEdges: originalEdgeCount,
                    renderedNodes: originalNodeCount,
                    renderedEdges: originalEdgeCount,
                    wasPruned: false,
                }
            };
        }

        const degree: Record<string, number> = {};
        for (const edge of rawGraph.edges) {
            const source = String(edge.source || '');
            const target = String(edge.target || '');
            if (!source || !target) { continue; }
            degree[source] = (degree[source] || 0) + 1;
            degree[target] = (degree[target] || 0) + 1;
        }

        const nodeScore = (node: any) => {
            const structural = degree[node.id] || 0;
            const importance = typeof node.metadata?.importanceScore === 'number' ? node.metadata.importanceScore : 0;
            const complexity = typeof node.metadata?.complexity === 'number' ? node.metadata.complexity : 0;
            return (structural * 2) + importance + (complexity * 0.3);
        };

        const scoreById = new Map<string, number>();
        for (const node of rawGraph.nodes) {
            scoreById.set(node.id, nodeScore(node));
        }

        const selectedNodes = [...rawGraph.nodes]
            .sort((a: any, b: any) => nodeScore(b) - nodeScore(a))
            .slice(0, maxNodes);

        const selectedIds = new Set(selectedNodes.map((n: any) => n.id));

        const edgeScore = (edge: any) => {
            const srcScore = scoreById.get(edge.source) || 0;
            const dstScore = scoreById.get(edge.target) || 0;
            return srcScore + dstScore;
        };

        const selectedEdges = rawGraph.edges
            .filter((e: any) => selectedIds.has(e.source) && selectedIds.has(e.target))
            .sort((a: any, b: any) => edgeScore(b) - edgeScore(a))
            .slice(0, maxEdges);

        return {
            ...rawGraph,
            nodes: selectedNodes,
            edges: selectedEdges,
            stats: {
                ...(rawGraph.stats || {}),
                totalNodes: originalNodeCount,
                totalEdges: originalEdgeCount,
                renderedNodes: selectedNodes.length,
                renderedEdges: selectedEdges.length,
                wasPruned: true,
            }
        };
    }


    public static createOrShow(context: vscode.ExtensionContext, workspacePath: string) {
        const column = vscode.ViewColumn.Beside;

        if (GraphPanelManager.currentPanel) {
            GraphPanelManager.currentPanel.reveal(column);
            // Re-send data in case it changed
            GraphPanelManager.sendGraphData(GraphPanelManager.currentPanel!, workspacePath);
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
                    } else if (message.command === 'getGraph') {
                        await GraphPanelManager.sendGraphData(panel, workspacePath);
                    } else if (message.command === 'graphWebviewReady') {
                        await GraphPanelManager.sendGraphData(panel, workspacePath);
                    } else if (message.command === 'graphDataAck') {
                        console.log(`[AIL] Graph webview ACK received → nodes: ${message.nodes || 0}, edges: ${message.edges || 0}`);
                    } else if (message.command === 'getRepoMetadata') {
                        await GraphPanelManager.sendRepoMetadata(panel, workspacePath);
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
                    } else if (message.command === 'explainMultipleFunctions') {
                        try {
                            const context = await GraphPanelManager.getMultipleFunctionsContext(workspacePath, message.nodes);
                            const response = await GraphPanelManager.callFunctionChatLLM(
                                `What do these ${message.nodes.length} functions achieve as a unit?\n\nCode Context:\n${context.code}\n\nRepo Structure:\n${context.meta}`,
                                []
                            );
                            panel.webview.postMessage({ command: 'chatResponse', text: response });
                        } catch (err: any) {
                            console.error('[AIL] explainMultipleFunctions error:', err);
                            panel.webview.postMessage({ command: 'chatResponse', text: `> **Error**: ${err.message || 'Failed to analyze selection.'}` });
                        }
                    } else if (message.command === 'askMultipleFunctionsChat') {
                        try {
                            const context = await GraphPanelManager.getMultipleFunctionsContext(workspacePath, message.nodes);
                            const response = await GraphPanelManager.callFunctionChatLLM(message.query, message.history, context);
                            panel.webview.postMessage({ command: 'chatResponse', text: response });
                        } catch (err: any) {
                            console.error('[AIL] askMultipleFunctionsChat error:', err);
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

            setTimeout(() => {
                GraphPanelManager.sendGraphData(panel, workspacePath);
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
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' https://unpkg.com 'unsafe-eval'; img-src 'self' data: https:;">
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

    private static async sendRepoMetadata(panel: vscode.WebviewPanel, workspacePath: string) {
        try {
            const ailRoot = path.join(workspacePath, '.ail');
            const metaPath = path.join(ailRoot, 'layer1', 'meta-data.json');
            
            if (fs.existsSync(metaPath)) {
                const metaData = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
                panel.webview.postMessage({ command: 'repoMetadata', data: metaData });
            } else {
                panel.webview.postMessage({ command: 'repoMetadata', data: null });
            }
        } catch (err) {
            console.error('[AIL] sendRepoMetadata error:', err);
            panel.webview.postMessage({ command: 'repoMetadata', data: null });
        }
    }

    private static async sendGraphData(panel: vscode.WebviewPanel, workspacePath: string) {
        if (!GraphPanelManager.currentPanel) { return; }

        const ailRoot = path.join(workspacePath, '.ail');
        let graphData = null;
        let summaryData: any = null;
        let couplingData = null;
        let layer1Meta: any = null;
        let churnData: any = null;
        let dashboardOverview: any = null;

        try {
            const entitiesPath = path.join(ailRoot, 'layer2', 'analysis', 'entities.json');
            const callGraphPath = path.join(ailRoot, 'layer2', 'analysis', 'call_graph.json');
            const complexityPath = path.join(ailRoot, 'layer2', 'analysis', 'complexity.json');
            const churnPath = path.join(ailRoot, 'layer3', 'analysis', 'file_churn.json');
            
            if (fs.existsSync(entitiesPath) && fs.existsSync(callGraphPath)) {
                // Parse layer 2 metadata for precise caller -> callee mappings
                const entitiesData = JSON.parse(fs.readFileSync(entitiesPath, 'utf-8'));
                const callGraphData = JSON.parse(fs.readFileSync(callGraphPath, 'utf-8'));

                const complexityData = fs.existsSync(complexityPath)
                    ? JSON.parse(fs.readFileSync(complexityPath, 'utf-8'))
                    : { functions: [] };
                const churnData = fs.existsSync(churnPath)
                    ? JSON.parse(fs.readFileSync(churnPath, 'utf-8'))
                    : { files: [] };

                const complexityByEntity = new Map<string, any>();
                for (const fn of (complexityData.functions || [])) {
                    const entityKey = `${fn.file}::${fn.entityName}`;
                    complexityByEntity.set(entityKey, fn);
                }

                const churnByFile = new Map<string, any>();
                for (const fileChurn of (churnData.files || [])) {
                    churnByFile.set(fileChurn.file, fileChurn);
                }
                
                const mappedNodes = (entitiesData.entities || []).map((ent: any) => {
                    const entityKey = `${ent.file}::${ent.name}`;
                    const complexityInfo = complexityByEntity.get(entityKey);
                    const churnInfo = churnByFile.get(ent.file);

                    return {
                    id: `${ent.file}::${ent.name}`,
                    name: ent.name,
                    type: ent.type || 'function',
                    file: ent.file,
                    startLine: ent.startLine,
                    endLine: ent.endLine,
                    language: ent.language,
                    metadata: {
                        complexity: complexityInfo?.cyclomatic,
                        nestingDepth: complexityInfo?.nestingDepth,
                        churnScore: churnInfo?.churnScore,
                        commits: churnInfo?.commits,
                        isHot: churnInfo?.isHot,
                        isStale: churnInfo?.isStale,
                        lineCount: complexityInfo?.lineCount
                    }
                    };
                });

                const nodeById = new Map<string, any>();
                const nodeIdsByShortName = new Map<string, string[]>();
                for (const node of mappedNodes) {
                    nodeById.set(node.id, node);
                    const shortName = String(node.name || '').trim();
                    if (!shortName) { continue; }
                    const existing = nodeIdsByShortName.get(shortName) || [];
                    existing.push(node.id);
                    nodeIdsByShortName.set(shortName, existing);
                }

                const resolveCalleeId = (edge: any): string | undefined => {
                    const rawCallee = String(edge.callee || '').trim();
                    if (!rawCallee) {
                        return undefined;
                    }

                    // Already qualified from parser (file::symbol)
                    if (rawCallee.includes('::') && nodeById.has(rawCallee)) {
                        return rawCallee;
                    }

                    // Method or dotted call: foo.bar -> resolve by last segment
                    const shortName = rawCallee.split('.').pop() || rawCallee;
                    const candidates = nodeIdsByShortName.get(shortName) || [];
                    if (candidates.length === 0) {
                        return undefined;
                    }

                    // Prefer same-file callee if available
                    const sameFile = candidates.find(id => id.startsWith(`${edge.file}::`));
                    if (sameFile) {
                        return sameFile;
                    }

                    // Otherwise pick deterministic first candidate
                    return candidates[0];
                };
                
                const mappedEdges = (callGraphData.edges || [])
                    .map((edge: any) => {
                        const sourceId = String(edge.caller || '').trim();
                        const targetId = resolveCalleeId(edge);
                        if (!sourceId || !targetId || !nodeById.has(sourceId) || !nodeById.has(targetId)) {
                            return null;
                        }

                        return {
                            source: sourceId,
                            target: targetId,
                            type: 'calls',
                            file: edge.file,
                            line: edge.line
                        };
                    })
                    .filter((edge: any) => edge !== null);

                const incomingCounts: Record<string, number> = {};
                const outgoingCounts: Record<string, number> = {};
                for (const edge of mappedEdges) {
                    incomingCounts[edge.target] = (incomingCounts[edge.target] || 0) + 1;
                    outgoingCounts[edge.source] = (outgoingCounts[edge.source] || 0) + 1;
                }

                const scoreImportance = (node: any): number => {
                    const incoming = incomingCounts[node.id] || 0;
                    const outgoing = outgoingCounts[node.id] || 0;
                    const complexity = typeof node.metadata?.complexity === 'number' ? node.metadata.complexity : 0;
                    const churnScore = typeof node.metadata?.churnScore === 'number' ? node.metadata.churnScore : 0;
                    const isHotBonus = node.metadata?.isHot ? 2 : 0;
                    const structural = (outgoing * 2) + incoming;
                    const score = structural + (complexity * 0.6) + (Math.log10(churnScore + 1) * 2) + isHotBonus;
                    return Math.max(1, Math.min(10, Math.round(score)));
                };

                const nodesWithImportance = mappedNodes.map((node: any) => ({
                    ...node,
                    metadata: {
                        ...node.metadata,
                        importanceScore: scoreImportance(node)
                    }
                }));

                graphData = {
                    nodes: nodesWithImportance,
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

            const layer1MetaPath = path.join(ailRoot, 'layer1', 'meta-data.json');
            if (fs.existsSync(layer1MetaPath)) {
                layer1Meta = JSON.parse(fs.readFileSync(layer1MetaPath, 'utf-8'));
            }

            const churnPathL3 = path.join(ailRoot, 'layer3', 'analysis', 'file_churn.json');
            if (fs.existsSync(churnPathL3)) {
                churnData = JSON.parse(fs.readFileSync(churnPathL3, 'utf-8'));
            }

            dashboardOverview = {
                projectName: path.basename(workspacePath),
                primaryLanguage: layer1Meta?.primaryLanguage || 'Unknown',
                totalFiles: layer1Meta?.metrics?.totalFiles || 0,
                totalLines: layer1Meta?.metrics?.totalLines || 0,
                frameworks: (layer1Meta?.frameworks?.frameworks || []).map((f: any) => f.name).slice(0, 6),
                riskHotspots: (summaryData?.riskHotspots || []).length,
                criticalRisk: (summaryData?.riskHotspots || []).filter((r: any) => r.level === 'critical').length,
                highRisk: (summaryData?.riskHotspots || []).filter((r: any) => r.level === 'high').length,
                hotFiles: (churnData?.hotFiles || []).length,
                strongCouplingPairs: (couplingData?.stronglyCoupled || []).length,
                avgBlastRadius: summaryData?.blastRadius?.avgBlastRadius || 0,
            };
        } catch (err) {
            console.error('[AIL] Error reading graph data:', err);
        }

        const graphForWebview = graphData
            ? GraphPanelManager.pruneGraphForWebview(graphData)
            : null;

        console.log(
            `[AIL] Graph payload → nodes: ${graphForWebview?.nodes?.length || 0} / ${graphData?.nodes?.length || 0}, ` +
            `edges: ${graphForWebview?.edges?.length || 0} / ${graphData?.edges?.length || 0}`
        );

        // Send initial data to webview so graph renders instantly
        GraphPanelManager.currentPanel.webview.postMessage({
            command: 'loadGraphData',
            data: {
                graph: graphForWebview,
                coupling: couplingData,
                overview: dashboardOverview,
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
                            graph: graphForWebview,
                            coupling: couplingData,
                            overview: dashboardOverview,
                            report: llmSummary
                        }
                    });
                }
            }).catch(e => {
                if (GraphPanelManager.currentPanel) {
                    GraphPanelManager.currentPanel.webview.postMessage({
                        command: 'loadGraphData',
                        data: {
                            graph: graphForWebview,
                            coupling: couplingData,
                            overview: dashboardOverview,
                            report: `> **LLM Summary Failed**\n\nCould not generate the English summary. Check your API Keys in settings.\n\nError: ${e.message}\n\nFalling back to default overview:\n\n${summaryData.overview}`
                        }
                    });
                }
            });
        }
    }
    private static async generateLLMSummary(summary: any): Promise<string> {
        const config = vscode.workspace.getConfiguration('ail');
        const provider = config.get<'azure' | 'gemini' | 'ollama'>('aiProvider') || 'azure';
        
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

        if (provider === 'gemini') {
            const apiKey = ConfigUtils.getGeminiApiKey();
            if (!apiKey) {
                throw new Error('Gemini API key missing. Set GEMINI_API_KEY in .env or configure ail.geminiApiKey.');
            }

            const model = config.get<string>('geminiModel') || 'gemini-2.0-flash';
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemInstruction: {
                        parts: [{ text: 'You are an architecture summarizing agent.' }]
                    },
                    contents: [
                        { role: 'user', parts: [{ text: prompt }] }
                    ],
                    generationConfig: {
                        temperature: 0.3,
                        maxOutputTokens: 3000
                    }
                })
            });

            const data: any = await response.json();
            if (!response.ok || data.error) {
                throw new Error(data.error?.message || response.statusText);
            }

            const content = (data.candidates?.[0]?.content?.parts || [])
                .map((p: any) => p.text || '')
                .join('')
                .trim();
            return content || 'No summary returned by Gemini.';
        } else if (provider === 'ollama') {
            const baseUrl = (config.get<string>('ollamaBaseUrl') || 'http://localhost:11434').replace(/\/+$/, '');
            const configuredModel = config.get<string>('ollamaModel') || 'qwen3.5:4b';
            const model = await GraphPanelManager.resolveOllamaModel(baseUrl, configuredModel);
            const url = `${baseUrl}/api/chat`;

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: 'system', content: 'You are an architecture summarizing agent.' },
                        { role: 'user', content: prompt }
                    ],
                    stream: false,
                    options: {
                        temperature: 0.3
                    }
                })
            });

            const data: any = await response.json();
            if (!response.ok || data.error) {
                throw new Error(data.error?.message || response.statusText);
            }

            const content = data?.message?.content;
            return (typeof content === 'string' && content.trim().length > 0)
                ? content.trim()
                : 'No summary returned by Ollama.';
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

    private static async getMultipleFunctionsContext(workspacePath: string, nodeInfos: { id: string, file: string, label: string }[]): Promise<{code: string, meta: string}> {
        const ailRoot = path.join(workspacePath, '.ail');
        const entitiesPath = path.join(ailRoot, 'layer2', 'analysis', 'entities.json');
        
        if (!fs.existsSync(entitiesPath)) return { code: 'No entities found', meta: '' };
        const entitiesData = JSON.parse(fs.readFileSync(entitiesPath, 'utf-8'));

        const codeBodies: string[] = [];

        for (const info of nodeInfos) {
            const ent = (entitiesData.entities || []).find((e: any) => `${e.file}::${e.name}` === info.id);
            if (ent) {
                const absPath = path.join(workspacePath, ent.file);
                if (fs.existsSync(absPath)) {
                    const content = fs.readFileSync(absPath, 'utf-8').split('\n');
                    const body = content.slice(Math.max(0, ent.startLine - 1), ent.endLine).join('\n');
                    
                    const params = Array.isArray(ent.params) ? ent.params.join(', ') : 'none';
                    const metadata = ent.metadata ? JSON.stringify(ent.metadata) : '{}';

                    codeBodies.push(`--- FILE: ${ent.file} | ENTITY: ${ent.name} ---
Parameters: (${params})
Metadata: ${metadata}
Code:
${body}\n`);
                }
            }
        }


        const minifiedMeta = (entitiesData.entities || [])
            .slice(0, 100) // Limit to first 100 entities to avoid context overflow
            .map((e: any) => `${e.file} -> ${e.name} (${e.type})`)
            .join('\n');
        return { code: codeBodies.join('\n\n'), meta: minifiedMeta };

    }


    private static async callFunctionChatLLM(query: string, history: any[], context?: {code: string, meta: string}): Promise<string> {
        const config = vscode.workspace.getConfiguration('ail');
        const provider = config.get<'azure' | 'gemini' | 'ollama'>('aiProvider') || 'azure';

        const systemPrompt = `You are AIL, an advanced architecture explorer. You specialize in explaining implementation details.
You are given the code of a target function AND the code of its transitive dependencies (up to depth 3).
You are also given a minified repository structure for context.

Goal: Provide a clear, technical, and concise explanation as per the user's request. 
Highlight how the function interacts with the dependencies provided in the context.

Repo Structure Context:
${context?.meta || ''}

Code Context:
${context?.code || ''}`;

        if (provider === 'gemini') {
            const apiKey = ConfigUtils.getGeminiApiKey();
            if (!apiKey) {
                throw new Error('Gemini API key missing. Set GEMINI_API_KEY in .env or configure ail.geminiApiKey.');
            }

            const model = config.get<string>('geminiModel') || 'gemini-2.0-flash';
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const contents = [
                ...history.slice(-6).map((msg: any) => ({
                    role: msg.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: String(msg.content || '') }]
                })),
                { role: 'user', parts: [{ text: query }] }
            ];

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: systemPrompt }] },
                    contents,
                    generationConfig: {
                        temperature: 0.2,
                        maxOutputTokens: 3000
                    }
                })
            });

            const data: any = await response.json();
            if (!response.ok || data.error) {
                throw new Error(data.error?.message || response.statusText);
            }

            const content = (data.candidates?.[0]?.content?.parts || [])
                .map((p: any) => p.text || '')
                .join('')
                .trim();
            return content || 'No response returned by Gemini.';
        }

        if (provider === 'ollama') {
            const baseUrl = (config.get<string>('ollamaBaseUrl') || 'http://localhost:11434').replace(/\/+$/, '');
            const configuredModel = config.get<string>('ollamaModel') || 'qwen3.5:4b';
            const model = await GraphPanelManager.resolveOllamaModel(baseUrl, configuredModel);
            const url = `${baseUrl}/api/chat`;

            const messages = [
                { role: 'system', content: systemPrompt },
                ...history.slice(-6).map((msg: any) => ({
                    role: msg.role === 'assistant' ? 'assistant' : 'user',
                    content: String(msg.content || '')
                })),
                { role: 'user', content: query }
            ];

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model,
                    messages,
                    stream: false,
                    options: {
                        temperature: 0.2
                    }
                })
            });

            const data: any = await response.json();
            if (!response.ok || data.error) {
                throw new Error(data.error?.message || response.statusText);
            }

            const content = data?.message?.content;
            return (typeof content === 'string' && content.trim().length > 0)
                ? content.trim()
                : 'No response returned by Ollama.';
        }

        const apiKey = ConfigUtils.getGroqApiKey('func');
        if (!apiKey) {
            throw new Error('Groq API key missing for function chat. Set FUNC_CHAT_GROQ_API_KEY or GROQ_API_KEY in .env.');
        }

        const model = 'llama-3.3-70b-versatile';
        const url = 'https://api.groq.com/openai/v1/chat/completions';
        const messages = [
            { role: 'system', content: systemPrompt },
            ...history.slice(-6),
            { role: 'user', content: query }
        ];

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({ model, messages, temperature: 0.2 })
        });

        const data: any = await response.json();
        if (!response.ok || data.error) {
            throw new Error(data.error?.message || response.statusText);
        }
        return data.choices?.[0]?.message?.content || 'No response returned by Groq.';
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
