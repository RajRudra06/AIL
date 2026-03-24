import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getPanelHTML } from './panelUI';
import { runLayer1 } from '../layer1/orchestrator';
import { runLayer2 } from '../layer2/orchestrator';
import { runLayer3 } from '../layer3/orchestrator';
import { runLayer4 } from '../layer4/orchestrator';
import { runLayer5 } from '../layer5/orchestrator';
import { askQuestion } from '../layer5/rag/rag_engine';

import { ConfigUtils } from '../utils/configUtils';

/**
 * Ensure Gemini API key is configured.
 * This now uses ConfigUtils and avoids polluting global settings.
 */
async function ensureGeminiKey(): Promise<boolean> {
    const config = vscode.workspace.getConfiguration('ail');

    // Always use Gemini — set it silently (this triggers the Groq-proxy logic in Layer 5)
    await config.update('aiProvider', 'gemini', vscode.ConfigurationTarget.Global);
    
    const groqKey = ConfigUtils.getGroqApiKey('general');

    if (!groqKey) {
        console.warn("AIL: Groq API Key not found in .env, process.env, or settings.");
        // We return true but the subsequent LLM calls will handle the missing key error gracefully
    }
    
    return true;
}


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
    
    // Proactively initialize Gemini/Groq settings
    ensureGeminiKey();


        panel.webview.onDidReceiveMessage(
            async message => {
                console.log('[AIL-EXT] Received message from webview:', message.command);
                switch (message.command) {

                    case 'requestData':
                        PanelManager.sendDashboardData(panel);
                        break;

                    case 'useCurrentAnalysis':
                        // Just load existing .ail data and tell webview to show dashboard
                        await ensureGeminiKey();
                        PanelManager.sendDashboardData(panel);
                        panel.webview.postMessage({ command: 'showDashboard' });
                        break;


                    case 'runFreshAnalysis':
                        await PanelManager.handleRunAnalysis(panel, context);
                        break;

                    case 'askGraphRAG': {
                        const wsfRAG = vscode.workspace.workspaceFolders;
                        if (!wsfRAG) { break; }
                        panel.webview.postMessage({ command: 'chatResponse', text: '...' });
                        askQuestion(message.query, message.history || [], wsfRAG[0].uri.fsPath).then(answer => {
                            panel.webview.postMessage({ command: 'chatResponse', text: answer });
                        }).catch(err => {
                            panel.webview.postMessage({ command: 'chatResponse', text: `Error: ${err.message}` });
                        });
                        break;
                    }

                    case 'loadGraphs': {
                        const wsfGraph = vscode.workspace.workspaceFolders;
                        if (wsfGraph) {
                            import('./graphPanelManager.js').then(({ GraphPanelManager }) => {
                                GraphPanelManager.createOrShow(context, wsfGraph[0].uri.fsPath);
                            });
                        }
                        break;
                    }

                    case 'requestPurge': {
                        const selection = await vscode.window.showWarningMessage(
                            'All data gotten from the last active scan stored in the .ail folder will be deleted, affecting the dashboard data. Do you want to proceed?',
                            { modal: true },
                            'Yes'
                        );
                        
                        if (selection === 'Yes') {
                            // Failsafe check (Removed hardcoded key for security)
                            const config = vscode.workspace.getConfiguration('ail');
                            const groqKey = config.get<string>('groqApiKey');
                            if (!groqKey || groqKey.trim() === '') {
                                throw new Error('Groq API Key missing. Please set it in VSCode settings (ail.groqApiKey) or within a workspace .env file.');
                            }
                            const wsf = vscode.workspace.workspaceFolders;
                            if (wsf) {
                                const ailRoot = path.join(wsf[0].uri.fsPath, '.ail');
                                if (fs.existsSync(ailRoot)) {
                                    fs.rmSync(ailRoot, { recursive: true, force: true });
                                }
                                panel.webview.postMessage({ command: 'dashboardData', data: { ailExists: false } });
                                panel.webview.postMessage({ command: 'analysisCancelled' }); // Returns to landing
                                vscode.window.showInformationMessage('AIL: Analysis cache purged.');
                            }
                        }
                        break;
                    }
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

    /**
     * Purge .ail, ensure Gemini key, then run all 4 layers with status updates.
     */
    private static async handleRunAnalysis(
        panel: vscode.WebviewPanel,
        context: vscode.ExtensionContext
    ): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('AIL: No workspace folder open!');
            panel.webview.postMessage({ command: 'analysisCancelled' });
            return;
        }

        const workspacePath = workspaceFolders[0].uri.fsPath;
        const ailRoot = path.join(workspacePath, '.ail');

        // Always purge for fresh analysis
        if (fs.existsSync(ailRoot)) {
            fs.rmSync(ailRoot, { recursive: true, force: true });
        }

        // Ensure Gemini key (no-op if already set)
        await ensureGeminiKey();

        // Tell webview: analysis is starting now
        panel.webview.postMessage({ command: 'analysisStarted' });

        // Layer 1
        panel.webview.postMessage({ command: 'layerStatus', layer: 1, status: 'running' });
        try {
            runLayer1();
            panel.webview.postMessage({ command: 'layerStatus', layer: 1, status: 'complete' });
        } catch (err) {
            console.error('[AIL] Layer 1 failed:', err);
            panel.webview.postMessage({ command: 'layerStatus', layer: 1, status: 'error' });
            panel.webview.postMessage({ command: 'analysisCancelled' });
            return;
        }

        // Layer 2
        panel.webview.postMessage({ command: 'layerStatus', layer: 2, status: 'running' });
        try {
            await runLayer2(context.extensionPath);
            panel.webview.postMessage({ command: 'layerStatus', layer: 2, status: 'complete' });
        } catch (err) {
            console.error('[AIL] Layer 2 failed:', err);
            panel.webview.postMessage({ command: 'layerStatus', layer: 2, status: 'error' });
            panel.webview.postMessage({ command: 'analysisCancelled' });
            return;
        }

        // Layer 3
        panel.webview.postMessage({ command: 'layerStatus', layer: 3, status: 'running' });
        try {
            runLayer3();
            panel.webview.postMessage({ command: 'layerStatus', layer: 3, status: 'complete' });
        } catch (err) {
            console.error('[AIL] Layer 3 failed:', err);
            panel.webview.postMessage({ command: 'layerStatus', layer: 3, status: 'error' });
            panel.webview.postMessage({ command: 'analysisCancelled' });
            return;
        }

        // Layer 4
        panel.webview.postMessage({ command: 'layerStatus', layer: 4, status: 'running' });
        try {
            runLayer4();
            panel.webview.postMessage({ command: 'layerStatus', layer: 4, status: 'complete' });
        } catch (err) {
            console.error('[AIL] Layer 4 failed:', err);
            panel.webview.postMessage({ command: 'layerStatus', layer: 4, status: 'error' });
            panel.webview.postMessage({ command: 'analysisCancelled' });
            return;
        }

        // All done
        PanelManager.sendDashboardData(panel);
        panel.webview.postMessage({ command: 'showDashboard' });
    }

    /** Read all .ail/ JSON data and send to the webview */
    private static sendDashboardData(panel: vscode.WebviewPanel): void {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) { return; }

        const ailRoot = path.join(workspaceFolders[0].uri.fsPath, '.ail');
        const ailExists = fs.existsSync(ailRoot);
        const data: Record<string, unknown> = { ailExists };

        if (!ailExists) {
            panel.webview.postMessage({ command: 'dashboardData', data });
            return;
        }

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
        tryRead('l3_blast', path.join(ailRoot, 'layer3', 'analysis', 'blast_radius.json'));
        tryRead('l3_coupling', path.join(ailRoot, 'layer3', 'analysis', 'co_change.json'));
        tryRead('l3_manifest', path.join(ailRoot, 'layer3', 'meta-data.json'));
        // Layer 4
        tryRead('l4_graph', path.join(ailRoot, 'layer4', 'analysis', 'knowledge_graph.json'));
        tryRead('l4_summary', path.join(ailRoot, 'layer4', 'analysis', 'summary.json'));
        tryRead('l4_manifest', path.join(ailRoot, 'layer4', 'meta-data.json'));

        data['layerStatus'] = {
            l1: fs.existsSync(path.join(ailRoot, 'layer1', 'meta-data.json')),
            l2: fs.existsSync(path.join(ailRoot, 'layer2', 'meta-data.json')),
            l3: fs.existsSync(path.join(ailRoot, 'layer3', 'meta-data.json')),
            l4: fs.existsSync(path.join(ailRoot, 'layer4', 'meta-data.json')),
            l5: fs.existsSync(path.join(ailRoot, 'layer5', 'meta-data.json')),
        };

        panel.webview.postMessage({ command: 'dashboardData', data });
    }
}