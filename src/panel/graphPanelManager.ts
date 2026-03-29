import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigUtils } from '../utils/configUtils';

export class GraphPanelManager {
    private static currentPanel: vscode.WebviewPanel | undefined;

    private static getAiConfigSummary(): { provider: 'azure' | 'gemini' | 'ollama'; model: string; configured: boolean } {
        const config = vscode.workspace.getConfiguration('ail');
        const provider = (config.get<'azure' | 'gemini' | 'ollama'>('aiProvider') || 'azure');

        if (provider === 'gemini') {
            const model = config.get<string>('geminiModel') || 'gemini-2.0-flash';
            const configured = Boolean(ConfigUtils.getGeminiApiKey());
            return { provider, model, configured };
        }

        if (provider === 'ollama') {
            const model = config.get<string>('ollamaModel') || 'qwen3.5:4b';
            const configured = Boolean(config.get<string>('ollamaBaseUrl') || 'http://localhost:11434');
            return { provider, model, configured };
        }

        const model = config.get<string>('azureOpenAiDeployment') || 'gpt-4o';
        const configured = Boolean(config.get<string>('azureOpenAiEndpoint') && config.get<string>('azureOpenAiApiKey'));
        return { provider: 'azure', model, configured };
    }

    private static async sendAiConfig(panel: vscode.WebviewPanel): Promise<void> {
        panel.webview.postMessage({
            command: 'aiConfig',
            data: GraphPanelManager.getAiConfigSummary(),
        });
    }

    private static async pickModelForProvider(provider: 'azure' | 'gemini' | 'ollama', forcePick = false): Promise<void> {
        const config = vscode.workspace.getConfiguration('ail');
        const target = vscode.ConfigurationTarget.Workspace;

        if (provider === 'azure') {
            const current = config.get<string>('azureOpenAiDeployment') || 'gpt-4o';
            const options = ['gpt-4o', 'gpt-4.1', 'gpt-4.1-mini', 'o4-mini', 'o3-mini', current]
                .filter((v, i, arr) => arr.indexOf(v) === i)
                .map(v => ({ label: v, value: v }));

            const pick = await vscode.window.showQuickPick(options, {
                title: 'AIL: Select Azure Deployment Model',
                placeHolder: `Current: ${current}`,
                ignoreFocusOut: true,
            });

            if (pick) {
                await config.update('azureOpenAiDeployment', pick.value, target);
            } else if (forcePick) {
                await config.update('azureOpenAiDeployment', current, target);
            }
            return;
        }

        if (provider === 'gemini') {
            const current = config.get<string>('geminiModel') || 'gemini-2.0-flash';
            const seen = new Set<string>();
            const discovered: Array<{ label: string; value: string; description?: string }> = [];

            const geminiKey = ConfigUtils.getGeminiApiKey();
            if (geminiKey) {
                for (const apiVersion of ['v1beta', 'v1alpha']) {
                    let pageToken: string | undefined;
                    try {
                        do {
                            const url = new URL(`https://generativelanguage.googleapis.com/${apiVersion}/models`);
                            url.searchParams.set('key', geminiKey);
                            url.searchParams.set('pageSize', '1000');
                            if (pageToken) { url.searchParams.set('pageToken', pageToken); }

                            const res = await fetch(url.toString(), { method: 'GET' });
                            if (!res.ok) { break; }

                            const payload = await res.json() as any;
                            for (const m of (Array.isArray(payload.models) ? payload.models : [])) {
                                if (!Array.isArray(m.supportedGenerationMethods) || !m.supportedGenerationMethods.includes('generateContent')) { continue; }
                                const fullName = String(m.name || '');
                                const shortName = fullName.startsWith('models/') ? fullName.slice('models/'.length) : fullName;
                                if (shortName && !seen.has(shortName)) {
                                    seen.add(shortName);
                                    discovered.push({
                                        label: shortName,
                                        value: shortName,
                                        description: shortName === current ? 'current' : (m.displayName || undefined),
                                    });
                                }
                            }
                            pageToken = payload.nextPageToken;
                        } while (pageToken);
                    } catch {
                        // version may not be available
                    }
                }
            }

            // Ensure current model is always visible
            if (!seen.has(current)) {
                discovered.unshift({ label: current, value: current, description: 'current' });
            }

            // Add custom entry option
            discovered.push({ label: 'Custom model...', value: '__custom__', description: 'Type any Gemini model name' });

            const pick = await vscode.window.showQuickPick(discovered, {
                title: 'AIL: Select Gemini Model',
                placeHolder: discovered.length <= 2 ? `Current: ${current} (API key missing — set credentials to fetch full list)` : `Current: ${current}`,
                ignoreFocusOut: true,
            });

            if (pick) {
                if (pick.value === '__custom__') {
                    const custom = await vscode.window.showInputBox({
                        title: 'Custom Gemini Model',
                        prompt: 'Enter Gemini model name (e.g. gemini-3-flash-preview)',
                        value: current,
                        ignoreFocusOut: true,
                        validateInput: (v: string) => v.trim().length === 0 ? 'Model name is required.' : null,
                    });
                    if (custom && custom.trim()) {
                        await config.update('geminiModel', custom.trim(), target);
                    }
                } else {
                    await config.update('geminiModel', pick.value, target);
                }
            } else if (forcePick) {
                await config.update('geminiModel', current, target);
            }
            return;
        }

        const baseUrl = (config.get<string>('ollamaBaseUrl') || 'http://localhost:11434').replace(/\/+$/, '');
        const current = config.get<string>('ollamaModel') || 'qwen3.5:4b';
        let modelNames: string[] = [];
        try {
            const res = await fetch(`${baseUrl}/api/tags`, { method: 'GET' });
            if (res.ok) {
                const payload = await res.json() as any;
                modelNames = (Array.isArray(payload.models) ? payload.models : [])
                    .map((m: any) => String(m?.name || '').trim())
                    .filter((name: string) => name.length > 0);
            }
        } catch {
            // Fall back to common local choices.
        }

        const options = [...modelNames, current, 'qwen3.5:4b', 'llama3.2:latest']
            .filter((v, i, arr) => v && arr.indexOf(v) === i)
            .map(v => ({ label: v, value: v }));

        const pick = await vscode.window.showQuickPick(options, {
            title: 'AIL: Select Ollama Model',
            placeHolder: `Current: ${current}${modelNames.length === 0 ? ' (live model list unavailable)' : ''}`,
            ignoreFocusOut: true,
        });

        if (pick) {
            await config.update('ollamaModel', pick.value, target);
        } else if (forcePick) {
            await config.update('ollamaModel', current, target);
        }
    }

    private static async editCredentialsForProvider(provider: 'azure' | 'gemini' | 'ollama'): Promise<void> {
        const config = vscode.workspace.getConfiguration('ail');
        const target = vscode.ConfigurationTarget.Workspace;

        if (provider === 'azure') {
            const endpoint = await vscode.window.showInputBox({
                title: 'AIL: Azure OpenAI Endpoint',
                prompt: 'Example: https://my-resource.openai.azure.com',
                value: config.get<string>('azureOpenAiEndpoint') || '',
                ignoreFocusOut: true,
            });
            if (endpoint !== undefined) {
                await config.update('azureOpenAiEndpoint', endpoint.trim(), target);
            }

            const apiKey = await vscode.window.showInputBox({
                title: 'AIL: Azure OpenAI API Key',
                prompt: 'Paste API key (stored in workspace settings)',
                value: config.get<string>('azureOpenAiApiKey') || '',
                password: true,
                ignoreFocusOut: true,
            });
            if (apiKey !== undefined) {
                await config.update('azureOpenAiApiKey', apiKey.trim(), target);
            }
            return;
        }

        if (provider === 'gemini') {
            const key = await vscode.window.showInputBox({
                title: 'AIL: Gemini API Key',
                prompt: 'Optional if provided in .env as GEMINI_API_KEY/GOOGLE_API_KEY',
                value: config.get<string>('geminiApiKey') || '',
                password: true,
                ignoreFocusOut: true,
            });
            if (key !== undefined) {
                await config.update('geminiApiKey', key.trim(), target);
            }
            return;
        }

        const baseUrl = await vscode.window.showInputBox({
            title: 'AIL: Ollama Base URL',
            prompt: 'Example: http://localhost:11434',
            value: config.get<string>('ollamaBaseUrl') || 'http://localhost:11434',
            ignoreFocusOut: true,
        });
        if (baseUrl !== undefined) {
            await config.update('ollamaBaseUrl', baseUrl.trim() || 'http://localhost:11434', target);
        }
    }

    private static async openAiSettingsWizard(panel: vscode.WebviewPanel): Promise<void> {
        const config = vscode.workspace.getConfiguration('ail');
        const target = vscode.ConfigurationTarget.Workspace;

        let provider = config.get<'azure' | 'gemini' | 'ollama'>('aiProvider') || 'azure';
        const modelByProvider = {
            azure: config.get<string>('azureOpenAiDeployment') || 'gpt-4o',
            gemini: config.get<string>('geminiModel') || 'gemini-2.0-flash',
            ollama: config.get<string>('ollamaModel') || 'qwen3.5:4b',
        };

        const action = await vscode.window.showQuickPick([
            { label: 'Change Provider', value: 'provider' as const, description: `Current: ${provider}` },
            { label: 'Change Model', value: 'model' as const, description: `Current: ${modelByProvider[provider]}` },
            { label: 'Edit Credentials / Endpoint', value: 'credentials' as const, description: `For ${provider}` },
            { label: 'Open AIL Settings JSON', value: 'open' as const },
        ], {
            title: 'AIL: AI Settings',
            placeHolder: 'Choose what to update',
            ignoreFocusOut: true,
        });

        if (!action) {
            return;
        }

        if (action.value === 'open') {
            await vscode.commands.executeCommand('workbench.action.openSettingsJson', '@ext:ail-extension ail.');
            return;
        }

        if (action.value === 'provider') {
            const providerPick = await vscode.window.showQuickPick([
                { label: 'Azure OpenAI', value: 'azure' as const },
                { label: 'Google Gemini', value: 'gemini' as const },
                { label: 'Ollama (Local)', value: 'ollama' as const },
            ], {
                title: 'AIL: Select AI Provider',
                placeHolder: `Current: ${provider}`,
                ignoreFocusOut: true,
            });

            if (!providerPick) {
                return;
            }

            provider = providerPick.value;
            await config.update('aiProvider', provider, target);

            // Provider switch always triggers model repick.
            await GraphPanelManager.pickModelForProvider(provider, true);

            const configureNow = await vscode.window.showQuickPick([
                { label: 'Yes, edit credentials now', value: 'yes' as const },
                { label: 'Skip for now', value: 'no' as const },
            ], {
                title: 'AIL: Update Credentials?',
                placeHolder: `Provider changed to ${provider}`,
                ignoreFocusOut: true,
            });

            if (configureNow?.value === 'yes') {
                await GraphPanelManager.editCredentialsForProvider(provider);
            }
        } else if (action.value === 'model') {
            await GraphPanelManager.pickModelForProvider(provider, false);
        } else if (action.value === 'credentials') {
            await GraphPanelManager.editCredentialsForProvider(provider);
        }

        const summary = GraphPanelManager.getAiConfigSummary();
        panel.webview.postMessage({ command: 'aiConfigUpdated', data: summary });
        vscode.window.showInformationMessage(`AIL: AI settings updated (${summary.provider} / ${summary.model}).`);
    }

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
                    } else if (message.command === 'getAiConfig') {
                        await GraphPanelManager.sendAiConfig(panel);
                    } else if (message.command === 'openDashboard') {
                        await vscode.commands.executeCommand('ail-extension.openDashboard');
                    } else if (message.command === 'openAiSettings') {
                        await GraphPanelManager.openAiSettingsWizard(panel);
                    } else if (message.command === 'openGraphInBrowser') {
                        await GraphPanelManager.exportGraphHtmlToBrowser(workspacePath);
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

        private static async exportGraphHtmlToBrowser(workspacePath: string): Promise<void> {
                try {
                        const graphPath = path.join(workspacePath, '.ail', 'layer4', 'analysis', 'knowledge_graph.json');
                        if (!fs.existsSync(graphPath)) {
                                vscode.window.showWarningMessage('AIL: No knowledge graph found. Run analysis first.');
                                return;
                        }

                        const rawGraph = JSON.parse(fs.readFileSync(graphPath, 'utf-8'));
                        const graph = GraphPanelManager.pruneGraphForWebview(rawGraph, 2000, 9000);

                        const normalizedNodesById = new Map<string, any>();
                        for (const n of (graph.nodes || [])) {
                            const id = String(n?.id || '').trim();
                            if (!id) { continue; }
                            const normalized = {
                                id,
                                name: String(n?.name || id),
                                type: String(n?.type || 'unknown'),
                                file: String(n?.file || ''),
                                risk: typeof n?.metadata?.riskScore === 'number' ? n.metadata.riskScore : 0,
                            };

                            const prev = normalizedNodesById.get(id);
                            if (!prev || normalized.risk > prev.risk) {
                                normalizedNodesById.set(id, normalized);
                            }
                        }
                        const nodes = Array.from(normalizedNodesById.values());
                        const nodeIdSet = new Set(nodes.map((n: any) => n.id));

                        const seenLinkKeys = new Set<string>();
                        const links = (graph.edges || [])
                            .map((e: any) => ({
                                source: String(e?.source || '').trim(),
                                target: String(e?.target || '').trim(),
                                type: String(e?.type || 'edge'),
                                weight: typeof e?.weight === 'number' ? e.weight : 1,
                            }))
                            .filter((e: any) => {
                                if (!e.source || !e.target) { return false; }
                                if (!nodeIdSet.has(e.source) || !nodeIdSet.has(e.target)) { return false; }
                                if (e.source === e.target) { return false; }
                                const key = `${e.source}->${e.target}::${e.type}`;
                                if (seenLinkKeys.has(key)) { return false; }
                                seenLinkKeys.add(key);
                                return true;
                            });

                        const html = `<!doctype html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>AIL Graph Explorer</title>
    <style>
        html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #070809; color: #eceff2; font-family: 'IBM Plex Sans', system-ui, sans-serif; overflow: hidden; }
        canvas { position: fixed; inset: 0; }

        #dom-overlay { position: fixed; inset: 0; pointer-events: none; z-index: 5; overflow: hidden; }
        .node-label { position: absolute; pointer-events: auto; font-size: 10px; color: #d5e3f0; background: rgba(12,16,22,0.82); border: 1px solid rgba(195,203,211,0.18); border-radius: 5px; padding: 2px 7px; white-space: nowrap; cursor: pointer; user-select: none; backdrop-filter: blur(4px); }
        .node-label:hover { border-color: rgba(94,200,255,0.5); color: #fff; }
        .node-label.search-match { border-color: #5ec8ff; color: #fff; }
        .node-label.focused { border-color: #b38cff; color: #fff; }
        .node-label.neighbor { border-color: rgba(98,224,193,0.5); color: #e9fff8; }

        #hud { position: fixed; top: 12px; left: 12px; z-index: 20; padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(195,203,211,0.24); background: rgba(18,22,27,0.7); backdrop-filter: blur(10px); pointer-events: none; }
        #hud .title { font-weight: 700; font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: #dce2e9; }
        #hud .meta { margin-top: 4px; font-size: 11px; color: #9ea8b2; }
        #status { margin-top: 8px; font-size: 11px; color: #b8c1cb; max-width: 360px; }
        #fps { position: fixed; bottom: 4px; left: 50%; transform: translateX(-50%); z-index: 20; font-size: 9px; color: #4a5568; font-family: monospace; pointer-events: none; }

        /* Detail panel - shows on click */
        #detail { position: fixed; top: 12px; right: 12px; z-index: 30; width: min(340px, 30vw); max-height: calc(100vh - 24px); overflow-y: auto; padding: 14px; border-radius: 10px; border: 1px solid rgba(195,203,211,0.24); background: rgba(14,18,23,0.92); backdrop-filter: blur(14px); box-shadow: 0 8px 32px rgba(0,0,0,0.5); display: none; }
        #detail .d-title { font-weight: 700; font-size: 14px; color: #fff; margin-bottom: 2px; word-break: break-all; }
        #detail .d-file { font-size: 11px; color: #8a9bac; margin-bottom: 10px; word-break: break-all; }
        #detail .d-row { display: flex; justify-content: space-between; font-size: 11px; color: #aeb7c1; margin-top: 4px; }
        #detail .d-row .v { color: #e4e9ee; font-weight: 600; }
        #detail .d-section { margin-top: 12px; font-size: 10px; text-transform: uppercase; font-weight: 700; color: #7b8a99; letter-spacing: 0.06em; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 8px; }
        #detail .d-conn { font-size: 11px; color: #b8c5d3; padding: 4px 8px; margin-top: 3px; border-radius: 5px; cursor: pointer; border: 1px solid transparent; transition: all 0.15s; display: flex; justify-content: space-between; align-items: center; }
        #detail .d-conn:hover { background: rgba(94,200,255,0.08); border-color: rgba(94,200,255,0.3); color: #fff; }
        #detail .d-conn .d-arrow { font-size: 9px; color: #5e7a94; }
        #detail .d-close { position: absolute; top: 10px; right: 12px; cursor: pointer; color: #6b7a8a; font-size: 16px; border: none; background: none; }
        #detail .d-close:hover { color: #fff; }
        .risk-bar-sm { height: 3px; border-radius: 2px; background: rgba(255,255,255,0.06); margin-top: 6px; overflow: hidden; }
        .risk-bar-sm-fill { height: 100%; border-radius: 2px; }

        .search-container { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 20; width: 300px; display: flex; gap: 8px; pointer-events: auto; }
        .search-input { flex: 1; background: rgba(18,22,27,0.8); border: 1px solid rgba(195,203,211,0.3); border-radius: 8px; padding: 6px 12px; color: #fff; font-size: 12px; outline: none; transition: border-color 0.2s; }
        .search-input:focus { border-color: #5ec8ff; }
        .search-count { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); font-size: 10px; color: #5ec8ff; pointer-events: none; }

        .ctrl { position: fixed; bottom: 12px; left: 12px; z-index: 20; padding: 10px; border-radius: 10px; border: 1px solid rgba(195,203,211,0.18); background: rgba(18,22,27,0.72); backdrop-filter: blur(10px); width: 220px; pointer-events: auto; }
        .ctrl-row { margin-top: 6px; }
        .ctrl-lbl { font-size: 9px; text-transform: uppercase; color: #7b8a99; display: flex; justify-content: space-between; margin-bottom: 2px; }
        .ctrl-in { width: 100%; height: 3px; -webkit-appearance: none; background: rgba(255,255,255,0.08); border-radius: 2px; outline: none; }
        .ctrl-in::-webkit-slider-thumb { -webkit-appearance: none; width: 8px; height: 8px; background: #5ec8ff; border-radius: 50%; cursor: pointer; }

        .legend { position: fixed; bottom: 12px; right: 12px; z-index: 20; display: flex; gap: 10px; font-size: 9px; color: #6b7a8a; background: rgba(18,22,27,0.5); padding: 3px 8px; border-radius: 14px; }
        .legend-item { display: flex; align-items: center; gap: 3px; }
        .legend-dot { width: 5px; height: 5px; border-radius: 50%; }
    </style>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
</head>
<body>
    <canvas id="galaxy"></canvas>
    <div id="dom-overlay"></div>

    <div id="hud">
        <div class="title">AIL Graph Explorer</div>
        <div class="meta" id="hud-meta">Nodes: ${nodes.length} · Edges: ${links.length}</div>
        <div id="status">Loading...</div>
    </div>
    <div id="fps"></div>

    <div id="detail">
        <button class="d-close" id="detail-close">&times;</button>
        <div id="detail-body"></div>
    </div>

    <div class="search-container">
        <input type="text" id="search-input" class="search-input" placeholder="Search nodes..." />
        <div id="search-count" class="search-count"></div>
    </div>

    <div class="ctrl">
        <div style="font-size:9px; font-weight:700; text-transform:uppercase; color:#8a9bac; margin-bottom:4px;">Controls</div>
        <div class="ctrl-row">
            <div class="ctrl-lbl"><span>Point Scale</span><span id="lbl-ps">1.0</span></div>
            <input type="range" id="in-ps" class="ctrl-in" min="0.3" max="3" step="0.1" value="1.0" />
        </div>
        <div class="ctrl-row">
            <div class="ctrl-lbl"><span>Label Range</span><span id="lbl-lr">140</span></div>
            <input type="range" id="in-lr" class="ctrl-in" min="30" max="500" step="10" value="140" />
        </div>
        <div class="ctrl-row">
            <div class="ctrl-lbl"><span>Edge Opacity</span><span id="lbl-eo">0.07</span></div>
            <input type="range" id="in-eo" class="ctrl-in" min="0.01" max="0.4" step="0.01" value="0.07" />
        </div>
        <div style="margin-top:8px; font-size:8px; color:#4a5568;">scroll=zoom · drag=orbit · click=inspect · R=reset · Esc=close</div>
    </div>

    <div class="legend">
        <div class="legend-item"><span class="legend-dot" style="background:#f2f4f6"></span>func</div>
        <div class="legend-item"><span class="legend-dot" style="background:#cfd5dc"></span>method</div>
        <div class="legend-item"><span class="legend-dot" style="background:#8f9aa6"></span>class</div>
        <div class="legend-item"><span class="legend-dot" style="background:#aab2bb"></span>file</div>
    </div>

    <script>
    (function() {
        'use strict';
        const G = ${JSON.stringify({ nodes, links })};
        const N = G.nodes, L = G.links;
        const nodeCount = N.length;
        const statusEl = document.getElementById('status');
        const fpsEl = document.getElementById('fps');
        const overlay = document.getElementById('dom-overlay');
        const detailEl = document.getElementById('detail');
        const detailBody = document.getElementById('detail-body');
        const setStatus = (m) => { if (statusEl) statusEl.textContent = m; };

        // --- Adjacency index for neighbor queries ---
        const idToIdx = new Map();
        N.forEach((n, i) => { idToIdx.set(n.id, i); });
        const degree = new Uint16Array(nodeCount);
        const neighbors = new Array(nodeCount); // Set<number> per node
        for (let i = 0; i < nodeCount; i++) neighbors[i] = new Set();
        const linkIdx = [];
        L.forEach(l => {
            const si = idToIdx.get(l.source), ti = idToIdx.get(l.target);
            if (si === undefined || ti === undefined) return;
            linkIdx.push([si, ti, l.weight || 1, l.type || 'calls']);
            degree[si]++; degree[ti]++;
            neighbors[si].add(ti);
            neighbors[ti].add(si);
        });

        // --- Colors ---
        const typeHex = { file: 0xaab2bb, function: 0xf2f4f6, method: 0xcfd5dc, class: 0x8f9aa6, module: 0x6e7a87, unknown: 0x7f8790 };
        const getHex = (t) => typeHex[t] || 0x7f8790;

        // --- Node sizes by degree (log-scaled) ---
        const sizes = new Float32Array(nodeCount);
        let maxDeg = 1;
        for (let i = 0; i < nodeCount; i++) if (degree[i] > maxDeg) maxDeg = degree[i];
        for (let i = 0; i < nodeCount; i++) {
            sizes[i] = 1.5 + Math.log2(1 + degree[i]) / Math.log2(1 + maxDeg) * 4;
        }

        // --- Force layout ---
        const pos = new Float32Array(nodeCount * 3);
        const vel = new Float32Array(nodeCount * 3);
        const rad = Math.sqrt(nodeCount) * 16;
        for (let i = 0; i < nodeCount; i++) {
            const phi = Math.acos(1 - 2 * (i + 0.5) / nodeCount);
            const theta = Math.PI * (1 + Math.sqrt(5)) * i;
            const s = N[i].type === 'file' ? 1.4 : 1;
            pos[i*3]   = rad * Math.sin(phi) * Math.cos(theta) * s;
            pos[i*3+1] = rad * Math.sin(phi) * Math.sin(theta) * s;
            pos[i*3+2] = rad * Math.cos(phi) * s;
        }
        setStatus('Computing layout...');
        const linkDist = 60, dt = 0.3, decay = 0.92;
        for (let iter = 0; iter < 200; iter++) {
            for (let i = 0; i < nodeCount; i++) {
                for (let j = i + 1; j < nodeCount; j++) {
                    const dx = pos[j*3]-pos[i*3], dy = pos[j*3+1]-pos[i*3+1], dz = pos[j*3+2]-pos[i*3+2];
                    const f = -180 / (dx*dx + dy*dy + dz*dz + 1);
                    vel[i*3]+=dx*f; vel[i*3+1]+=dy*f; vel[i*3+2]+=dz*f;
                    vel[j*3]-=dx*f; vel[j*3+1]-=dy*f; vel[j*3+2]-=dz*f;
                }
            }
            for (const [si, ti] of linkIdx) {
                const dx=pos[ti*3]-pos[si*3], dy=pos[ti*3+1]-pos[si*3+1], dz=pos[ti*3+2]-pos[si*3+2];
                const d=Math.sqrt(dx*dx+dy*dy+dz*dz)+0.1;
                const f=(d-linkDist)*0.004;
                vel[si*3]+=dx/d*f; vel[si*3+1]+=dy/d*f; vel[si*3+2]+=dz/d*f;
                vel[ti*3]-=dx/d*f; vel[ti*3+1]-=dy/d*f; vel[ti*3+2]-=dz/d*f;
            }
            for (let i = 0; i < nodeCount*3; i++) { pos[i]+=vel[i]*dt; vel[i]*=decay; }
        }

        // --- THREE.js ---
        const canvas = document.getElementById('galaxy');
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0x070809, 1);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 50000);
        camera.position.set(0, 0, rad * 2.5);

        const controls = new THREE.OrbitControls(camera, canvas);
        controls.enableDamping = true;
        controls.dampingFactor = 0.12;
        controls.zoomSpeed = 1.4;
        controls.minDistance = 5;
        controls.maxDistance = rad * 10;

        // Nodes: THREE.Points with per-vertex size
        const pointGeo = new THREE.BufferGeometry();
        pointGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const colors = new Float32Array(nodeCount * 3);
        const baseColors = new Float32Array(nodeCount * 3);
        N.forEach((n, i) => {
            const c = new THREE.Color(getHex(n.type));
            baseColors[i*3]=c.r; baseColors[i*3+1]=c.g; baseColors[i*3+2]=c.b;
            colors[i*3]=c.r; colors[i*3+1]=c.g; colors[i*3+2]=c.b;
        });
        pointGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        pointGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        // Custom shader for per-vertex size
        let sizeScale = 1.0;
        const pointMat = new THREE.ShaderMaterial({
            uniforms: { sizeScale: { value: 1.0 } },
            vertexShader: \`
                attribute float size;
                attribute vec3 color;
                varying vec3 vColor;
                uniform float sizeScale;
                void main() {
                    vColor = color;
                    vec4 mv = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = size * sizeScale * (300.0 / -mv.z);
                    gl_PointSize = clamp(gl_PointSize, 1.0, 40.0);
                    gl_Position = projectionMatrix * mv;
                }
            \`,
            fragmentShader: \`
                varying vec3 vColor;
                void main() {
                    float d = length(gl_PointCoord - vec2(0.5));
                    if (d > 0.5) discard;
                    float alpha = smoothstep(0.5, 0.3, d);
                    gl_FragColor = vec4(vColor, alpha * 0.9);
                }
            \`,
            transparent: true,
            depthWrite: false,
        });
        const points = new THREE.Points(pointGeo, pointMat);
        scene.add(points);

        // Edges: LineSegments
        const edgePos = new Float32Array(linkIdx.length * 6);
        const edgeColors = new Float32Array(linkIdx.length * 6);
        const edgeBaseAlpha = 0.07;
        linkIdx.forEach(([si, ti], i) => {
            edgePos[i*6]=pos[si*3]; edgePos[i*6+1]=pos[si*3+1]; edgePos[i*6+2]=pos[si*3+2];
            edgePos[i*6+3]=pos[ti*3]; edgePos[i*6+4]=pos[ti*3+1]; edgePos[i*6+5]=pos[ti*3+2];
            for (let k=0;k<6;k++) edgeColors[i*6+k]=0.6;
        });
        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute('position', new THREE.BufferAttribute(edgePos, 3));
        lineGeo.setAttribute('color', new THREE.BufferAttribute(edgeColors, 3));
        const lineMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: edgeBaseAlpha, depthWrite: false });
        const lines = new THREE.LineSegments(lineGeo, lineMat);
        scene.add(lines);

        // --- Interaction state ---
        const raycaster = new THREE.Raycaster();
        raycaster.params.Points.threshold = 2.5;
        const mouse = new THREE.Vector2(9999, 9999);
        let hoveredIdx = -1, focusedIdx = -1;
        let searchQuery = '';
        let labelRange = 140;
        let highlightedNeighbors = new Set();

        function highlightNode(idx) {
            focusedIdx = idx;
            highlightedNeighbors = idx >= 0 ? neighbors[idx] : new Set();

            // Update point colors: dim non-neighbors, brighten neighbors
            for (let i = 0; i < nodeCount; i++) {
                if (idx < 0) {
                    colors[i*3]=baseColors[i*3]; colors[i*3+1]=baseColors[i*3+1]; colors[i*3+2]=baseColors[i*3+2];
                } else if (i === idx) {
                    colors[i*3]=1; colors[i*3+1]=1; colors[i*3+2]=1;
                } else if (highlightedNeighbors.has(i)) {
                    colors[i*3]=0.38; colors[i*3+1]=0.88; colors[i*3+2]=0.76; // #62e0c1
                } else {
                    colors[i*3]=baseColors[i*3]*0.2; colors[i*3+1]=baseColors[i*3+1]*0.2; colors[i*3+2]=baseColors[i*3+2]*0.2;
                }
            }
            pointGeo.attributes.color.needsUpdate = true;

            // Update edge colors: brighten connected edges
            for (let i = 0; i < linkIdx.length; i++) {
                const [si, ti] = linkIdx[i];
                const connected = idx >= 0 && (si === idx || ti === idx);
                const v = connected ? 0.95 : 0.6;
                for (let k=0;k<6;k++) edgeColors[i*6+k]=v;
            }
            lineGeo.attributes.color.needsUpdate = true;
            lineMat.opacity = idx >= 0 ? 0.25 : edgeBaseAlpha;
        }

        // --- Detail panel ---
        function showDetail(idx) {
            const n = N[idx];
            const r = n.risk || 0;
            const nbrs = [...neighbors[idx]].map(ni => N[ni]).sort((a,b)=>(b.risk||0)-(a.risk||0));
            const outgoing = linkIdx.filter(l => l[0]===idx).map(l => ({idx:l[1], type:l[3]}));
            const incoming = linkIdx.filter(l => l[1]===idx).map(l => ({idx:l[0], type:l[3]}));
            const riskColor = r > 7 ? '#ff7070' : r > 4 ? '#ff9f5f' : r > 1 ? '#ffc66d' : '#62e0c1';

            let html = '<div class="d-title">' + (n.name||n.id) + '</div>';
            html += '<div class="d-file">' + (n.file||'') + '</div>';
            html += '<div class="d-row"><span>Type</span><span class="v">' + n.type + '</span></div>';
            html += '<div class="d-row"><span>Connections</span><span class="v">' + degree[idx] + '</span></div>';
            html += '<div class="d-row"><span>Risk Score</span><span class="v" style="color:'+riskColor+'">' + r.toFixed(1) + '</span></div>';
            html += '<div class="risk-bar-sm"><div class="risk-bar-sm-fill" style="width:'+Math.min(100,r/10*100)+'%;background:'+riskColor+'"></div></div>';

            if (outgoing.length > 0) {
                html += '<div class="d-section">Calls (' + outgoing.length + ')</div>';
                outgoing.slice(0,20).forEach(o => {
                    html += '<div class="d-conn" data-idx="'+o.idx+'"><span>' + (N[o.idx].name||N[o.idx].id) + '</span><span class="d-arrow">' + o.type + ' &rarr;</span></div>';
                });
            }
            if (incoming.length > 0) {
                html += '<div class="d-section">Called by (' + incoming.length + ')</div>';
                incoming.slice(0,20).forEach(o => {
                    html += '<div class="d-conn" data-idx="'+o.idx+'"><span>' + (N[o.idx].name||N[o.idx].id) + '</span><span class="d-arrow">&larr; ' + o.type + '</span></div>';
                });
            }

            detailBody.innerHTML = html;
            detailEl.style.display = 'block';

            // Click connection -> navigate to that node
            detailBody.querySelectorAll('.d-conn').forEach(el => {
                el.addEventListener('click', () => {
                    const ni = parseInt(el.dataset.idx);
                    if (!isNaN(ni)) { focusOnNode(ni); showDetail(ni); highlightNode(ni); }
                });
            });
        }

        document.getElementById('detail-close').addEventListener('click', () => {
            detailEl.style.display = 'none';
            highlightNode(-1);
        });

        // --- DOM LABELS ---
        const labelPool = [];
        const POOL = Math.min(100, nodeCount);
        for (let i = 0; i < POOL; i++) {
            const el = document.createElement('div');
            el.className = 'node-label';
            el.style.display = 'none';
            overlay.appendChild(el);
            labelPool.push({ el, nodeIdx: -1 });
        }

        const tmpV = new THREE.Vector3();
        function updateLabels() {
            const w2 = window.innerWidth/2, h2 = window.innerHeight/2;
            const camPos = camera.position;
            const scored = [];
            for (let i = 0; i < nodeCount; i++) {
                tmpV.set(pos[i*3], pos[i*3+1], pos[i*3+2]);
                const dist = camPos.distanceTo(tmpV);
                const isRelevant = i === focusedIdx || i === hoveredIdx || highlightedNeighbors.has(i);
                if (dist > labelRange && !isRelevant) continue;
                tmpV.project(camera);
                const sx = tmpV.x*w2+w2, sy = -tmpV.y*h2+h2;
                if (tmpV.z > 1 || sx < -80 || sx > window.innerWidth+80 || sy < -40 || sy > window.innerHeight+40) continue;
                const isMatch = searchQuery && (N[i].name?.toLowerCase().includes(searchQuery) || N[i].file?.toLowerCase().includes(searchQuery));
                scored.push({ i, dist, sx, sy, isMatch, pri: (i===focusedIdx?4:0) + (i===hoveredIdx?3:0) + (highlightedNeighbors.has(i)?2:0) + (isMatch?1:0) });
            }
            scored.sort((a,b) => b.pri - a.pri || a.dist - b.dist);
            const used = Math.min(scored.length, POOL);
            for (let j = 0; j < used; j++) {
                const s = scored[j], lbl = labelPool[j];
                lbl.nodeIdx = s.i;
                lbl.el.style.display = 'block';
                lbl.el.style.left = s.sx + 'px';
                lbl.el.style.top = s.sy + 'px';
                lbl.el.textContent = N[s.i].name || N[s.i].id;
                lbl.el.className = 'node-label' + (s.i===focusedIdx?' focused':'') + (highlightedNeighbors.has(s.i)?' neighbor':'') + (s.isMatch?' search-match':'');
            }
            for (let j = used; j < POOL; j++) { labelPool[j].el.style.display='none'; labelPool[j].nodeIdx=-1; }
        }

        overlay.addEventListener('click', (e) => {
            const lbl = e.target.closest('.node-label');
            if (!lbl) return;
            const p = labelPool.find(p => p.el === lbl);
            if (!p || p.nodeIdx < 0) return;
            focusOnNode(p.nodeIdx);
            highlightNode(p.nodeIdx);
            showDetail(p.nodeIdx);
        });

        function focusOnNode(idx) {
            const tx=pos[idx*3], ty=pos[idx*3+1], tz=pos[idx*3+2];
            const start = { x:camera.position.x, y:camera.position.y, z:camera.position.z };
            const dist = Math.max(30, sizes[idx] * 8);
            const end = { x: tx+dist*0.4, y: ty+dist*0.3, z: tz+dist*0.8 };
            const tgt = { x:tx, y:ty, z:tz };
            let t = 0;
            const anim = () => {
                t += 0.03;
                if (t > 1) t = 1;
                const e = t*t*(3-2*t);
                camera.position.set(start.x+(end.x-start.x)*e, start.y+(end.y-start.y)*e, start.z+(end.z-start.z)*e);
                controls.target.set(
                    controls.target.x+(tgt.x-controls.target.x)*e*0.6,
                    controls.target.y+(tgt.y-controls.target.y)*e*0.6,
                    controls.target.z+(tgt.z-controls.target.z)*e*0.6
                );
                if (t < 1) requestAnimationFrame(anim);
            };
            anim();
        }

        // --- Input ---
        canvas.addEventListener('mousemove', (e) => {
            mouse.x = (e.clientX/window.innerWidth)*2-1;
            mouse.y = -(e.clientY/window.innerHeight)*2+1;
        });
        canvas.addEventListener('click', () => {
            raycaster.setFromCamera(mouse, camera);
            const hits = raycaster.intersectObject(points);
            if (hits.length > 0) {
                const idx = hits[0].index;
                focusOnNode(idx);
                highlightNode(idx);
                showDetail(idx);
            }
        });
        window.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return;
            if (e.key.toLowerCase() === 'r') {
                highlightNode(-1);
                detailEl.style.display = 'none';
                camera.position.set(0,0,rad*2.5);
                controls.target.set(0,0,0);
            }
            if (e.key === 'Escape') {
                highlightNode(-1);
                detailEl.style.display = 'none';
            }
        });
        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth/window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });

        // --- Controls ---
        document.getElementById('in-ps').addEventListener('input', (e) => {
            sizeScale = parseFloat(e.target.value);
            pointMat.uniforms.sizeScale.value = sizeScale;
            document.getElementById('lbl-ps').textContent = sizeScale.toFixed(1);
        });
        document.getElementById('in-lr').addEventListener('input', (e) => {
            labelRange = parseFloat(e.target.value);
            document.getElementById('lbl-lr').textContent = e.target.value;
        });
        document.getElementById('in-eo').addEventListener('input', (e) => {
            lineMat.opacity = parseFloat(e.target.value);
            document.getElementById('lbl-eo').textContent = e.target.value;
        });
        document.getElementById('search-input').addEventListener('input', (e) => {
            searchQuery = e.target.value.toLowerCase();
            if (searchQuery) {
                const matches = N.filter(n => n.name?.toLowerCase().includes(searchQuery) || n.file?.toLowerCase().includes(searchQuery));
                document.getElementById('search-count').textContent = matches.length + ' found';
                N.forEach((n, i) => {
                    const m = n.name?.toLowerCase().includes(searchQuery) || n.file?.toLowerCase().includes(searchQuery);
                    const c = m ? new THREE.Color(0x5ec8ff) : new THREE.Color(getHex(n.type));
                    baseColors[i*3]=c.r; baseColors[i*3+1]=c.g; baseColors[i*3+2]=c.b;
                    colors[i*3]=c.r; colors[i*3+1]=c.g; colors[i*3+2]=c.b;
                });
            } else {
                document.getElementById('search-count').textContent = '';
                N.forEach((n, i) => {
                    const c = new THREE.Color(getHex(n.type));
                    baseColors[i*3]=c.r; baseColors[i*3+1]=c.g; baseColors[i*3+2]=c.b;
                    colors[i*3]=c.r; colors[i*3+1]=c.g; colors[i*3+2]=c.b;
                });
            }
            pointGeo.attributes.color.needsUpdate = true;
        });

        // --- Render loop ---
        let fc = 0, lastT = performance.now();
        function animate() {
            requestAnimationFrame(animate);
            controls.update();

            raycaster.setFromCamera(mouse, camera);
            const hits = raycaster.intersectObject(points);
            const newH = hits.length > 0 ? hits[0].index : -1;
            if (newH !== hoveredIdx) {
                hoveredIdx = newH;
                canvas.style.cursor = hoveredIdx >= 0 ? 'pointer' : 'default';
            }

            if (fc % 3 === 0) updateLabels();
            renderer.render(scene, camera);

            fc++;
            const now = performance.now();
            if (now - lastT >= 1000) {
                fpsEl.textContent = fc + ' fps';
                fc = 0; lastT = now;
            }
        }
        setStatus('Ready. Click any node to inspect. Scroll to zoom, drag to orbit.');
        animate();
    })();
    </script>
</body>
</html>`;

                        const htmlPath = path.join(workspacePath, '.ail', 'layer4', 'analysis', 'graph_explorer.html');
                        fs.writeFileSync(htmlPath, html, 'utf-8');
                        await vscode.env.openExternal(vscode.Uri.file(htmlPath));
                        vscode.window.showInformationMessage('AIL: Opened browser graph explorer (WebGL).');
                } catch (err: any) {
                        console.error('[AIL] Failed to export browser graph:', err);
                        vscode.window.showErrorMessage(`AIL: Could not export browser graph. ${err?.message || ''}`.trim());
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

                // Merge layer4 risk scores into the nodes
                const l4GraphPath = path.join(ailRoot, 'layer4', 'analysis', 'knowledge_graph.json');
                if (fs.existsSync(l4GraphPath)) {
                    try {
                        const l4Graph = JSON.parse(fs.readFileSync(l4GraphPath, 'utf-8'));
                        const riskByNodeId = new Map<string, any>();
                        for (const n of (l4Graph.nodes || [])) {
                            if (n.metadata?.riskScore !== undefined) {
                                riskByNodeId.set(n.id, n.metadata);
                            }
                        }
                        for (const node of nodesWithImportance) {
                            const riskMeta = riskByNodeId.get(node.id);
                            if (riskMeta) {
                                node.metadata.riskScore = riskMeta.riskScore;
                                node.metadata.riskLevel = riskMeta.riskLevel;
                                node.metadata.fileChurn = riskMeta.fileChurn;
                                node.metadata.coupling = riskMeta.coupling;
                                node.metadata.structuralRisk = riskMeta.structuralRisk;
                            }
                        }
                    } catch (e) {
                        console.warn('[AIL] Could not merge layer4 risk data:', e);
                    }
                }

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
        await GraphPanelManager.sendAiConfig(GraphPanelManager.currentPanel);

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
                    void GraphPanelManager.sendAiConfig(GraphPanelManager.currentPanel);
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
                    void GraphPanelManager.sendAiConfig(GraphPanelManager.currentPanel);
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
