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

let hasPromptedGeminiKeyThisSession = false;
let promptedModelProviderThisSession: 'azure' | 'gemini' | 'ollama' | undefined;

const GEMINI_MODEL_PRESETS = [
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-pro'
];

interface GeminiModelOption {
    label: string;
    description?: string;
    detail?: string;
}

const AZURE_CHAT_DEPLOYMENT_PRESETS = [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4.1',
    'gpt-4.1-mini'
];

const AZURE_EMBED_DEPLOYMENT_PRESETS = [
    'text-embedding-3-small',
    'text-embedding-3-large',
    'text-embedding-ada-002'
];

async function promptForGeminiModel(config: vscode.WorkspaceConfiguration): Promise<void> {
    const currentModel = config.get<string>('geminiModel') || 'gemini-2.0-flash';

    const fetchGeminiModels = async (apiKey: string): Promise<GeminiModelOption[]> => {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, { method: 'GET' });
        if (!response.ok) {
            throw new Error(`Gemini model discovery failed (${response.status})`);
        }

        const payload = await response.json() as any;
        const models = Array.isArray(payload.models) ? payload.models : [];

        return models
            .filter((m: any) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
            .map((m: any) => {
                const fullName = String(m.name || '');
                const shortName = fullName.startsWith('models/') ? fullName.slice('models/'.length) : fullName;
                return {
                    label: shortName,
                    description: m.displayName || 'Gemini model',
                    detail: m.description || undefined
                } as GeminiModelOption;
            })
            .filter((m: GeminiModelOption) => m.label.length > 0)
            .sort((a: GeminiModelOption, b: GeminiModelOption) => a.label.localeCompare(b.label));
    };

    const options = new Map<string, GeminiModelOption>();
    for (const preset of GEMINI_MODEL_PRESETS) {
        options.set(preset, {
            label: preset,
            description: preset === currentModel ? 'current (preset)' : 'preset'
        });
    }

    const geminiKey = ConfigUtils.getGeminiApiKey();
    if (geminiKey) {
        try {
            const discovered = await fetchGeminiModels(geminiKey);
            for (const model of discovered) {
                options.set(model.label, {
                    ...model,
                    description: model.label === currentModel ? 'current' : model.description
                });
            }
        } catch (err: any) {
            vscode.window.showWarningMessage(`Could not fetch Gemini model list. Using presets. ${err?.message || ''}`.trim());
        }
    }

    const selection = await vscode.window.showQuickPick(
        [
            ...Array.from(options.values()),
            { label: 'Custom model...', description: 'Enter a custom Gemini model name' }
        ],
        {
            title: 'Select Gemini Model',
            placeHolder: `Current: ${currentModel}`,
            ignoreFocusOut: true
        }
    );

    if (!selection) {
        return;
    }

    if (selection.label === 'Custom model...') {
        const customModel = await vscode.window.showInputBox({
            title: 'Custom Gemini Model',
            prompt: 'Enter Gemini model name (example: gemini-2.0-flash)',
            value: currentModel,
            ignoreFocusOut: true,
            validateInput: (value: string) => value.trim().length === 0 ? 'Model name is required.' : null
        });

        if (customModel && customModel.trim() !== '') {
            await config.update('geminiModel', customModel.trim(), vscode.ConfigurationTarget.Workspace);
        }
        return;
    }

    await config.update('geminiModel', selection.label, vscode.ConfigurationTarget.Workspace);
}

async function promptForAzureDeployments(config: vscode.WorkspaceConfiguration): Promise<void> {
    const currentChat = config.get<string>('azureOpenAiDeployment') || 'gpt-4o';
    const currentEmbed = config.get<string>('azureOpenAiEmbedDeployment') || 'text-embedding-3-small';

    const chatSelection = await vscode.window.showQuickPick(
        [
            ...AZURE_CHAT_DEPLOYMENT_PRESETS.map(model => ({ label: model, description: model === currentChat ? 'current' : undefined })),
            { label: 'Custom deployment...', description: 'Enter your Azure chat deployment name' }
        ],
        {
            title: 'Select Azure Chat Deployment',
            placeHolder: `Current: ${currentChat}`,
            ignoreFocusOut: true
        }
    );

    if (chatSelection) {
        if (chatSelection.label === 'Custom deployment...') {
            const customChat = await vscode.window.showInputBox({
                title: 'Custom Azure Chat Deployment',
                prompt: 'Enter Azure OpenAI chat deployment name',
                value: currentChat,
                ignoreFocusOut: true,
                validateInput: (value: string) => value.trim().length === 0 ? 'Deployment name is required.' : null
            });

            if (customChat && customChat.trim() !== '') {
                await config.update('azureOpenAiDeployment', customChat.trim(), vscode.ConfigurationTarget.Workspace);
            }
        } else {
            await config.update('azureOpenAiDeployment', chatSelection.label, vscode.ConfigurationTarget.Workspace);
        }
    }

    const embedSelection = await vscode.window.showQuickPick(
        [
            ...AZURE_EMBED_DEPLOYMENT_PRESETS.map(model => ({ label: model, description: model === currentEmbed ? 'current' : undefined })),
            { label: 'Custom embedding deployment...', description: 'Enter your Azure embedding deployment name' },
            { label: 'Keep current', description: `No change (${currentEmbed})` }
        ],
        {
            title: 'Select Azure Embedding Deployment',
            placeHolder: `Current: ${currentEmbed}`,
            ignoreFocusOut: true
        }
    );

    if (!embedSelection || embedSelection.label === 'Keep current') {
        return;
    }

    if (embedSelection.label === 'Custom embedding deployment...') {
        const customEmbed = await vscode.window.showInputBox({
            title: 'Custom Azure Embedding Deployment',
            prompt: 'Enter Azure OpenAI embedding deployment name',
            value: currentEmbed,
            ignoreFocusOut: true,
            validateInput: (value: string) => value.trim().length === 0 ? 'Deployment name is required.' : null
        });

        if (customEmbed && customEmbed.trim() !== '') {
            await config.update('azureOpenAiEmbedDeployment', customEmbed.trim(), vscode.ConfigurationTarget.Workspace);
        }
        return;
    }

    await config.update('azureOpenAiEmbedDeployment', embedSelection.label, vscode.ConfigurationTarget.Workspace);
}

async function promptForOllamaModel(config: vscode.WorkspaceConfiguration): Promise<void> {
    const baseUrl = (config.get<string>('ollamaBaseUrl') || 'http://localhost:11434').replace(/\/+$/, '');
    const currentModel = config.get<string>('ollamaModel') || 'qwen3.5:4b';

    const options: Array<{ label: string; description?: string }> = [];
    try {
        const response = await fetch(`${baseUrl}/api/tags`, { method: 'GET' });
        if (response.ok) {
            const payload = await response.json() as any;
            const models = Array.isArray(payload.models) ? payload.models : [];
            models.forEach((m: any) => {
                const modelName = String(m.name || '').trim();
                if (modelName.length > 0) {
                    options.push({
                        label: modelName,
                        description: modelName === currentModel ? 'current (local)' : 'local model'
                    });
                }
            });
        }
    } catch {
        // If ollama is unavailable, we'll still allow manual entry.
    }

    if (!options.find(o => o.label === currentModel)) {
        options.unshift({ label: currentModel, description: 'current' });
    }

    const selection = await vscode.window.showQuickPick(
        [
            ...options,
            { label: 'Custom model...', description: 'Type any Ollama model tag' }
        ],
        {
            title: 'Select Ollama Model',
            placeHolder: `Current: ${currentModel} (Base URL: ${baseUrl})`,
            ignoreFocusOut: true
        }
    );

    if (!selection) {
        return;
    }

    if (selection.label === 'Custom model...') {
        const customModel = await vscode.window.showInputBox({
            title: 'Custom Ollama Model',
            prompt: 'Enter Ollama model tag (example: qwen3.5:4b)',
            value: currentModel,
            ignoreFocusOut: true,
            validateInput: (value: string) => value.trim().length === 0 ? 'Model name is required.' : null
        });

        if (customModel && customModel.trim() !== '') {
            await config.update('ollamaModel', customModel.trim(), vscode.ConfigurationTarget.Workspace);
        }
        return;
    }

    await config.update('ollamaModel', selection.label, vscode.ConfigurationTarget.Workspace);
}

async function ensureProviderModelSelection(forcePrompt = false): Promise<void> {
    const config = vscode.workspace.getConfiguration('ail');
    const provider = config.get<'azure' | 'gemini' | 'ollama'>('aiProvider') || 'azure';

    if (!forcePrompt && promptedModelProviderThisSession === provider) {
        return;
    }

    if (!forcePrompt) {
        if (provider === 'gemini') {
            const existingGeminiModel = config.get<string>('geminiModel');
            if (existingGeminiModel && existingGeminiModel.trim() !== '') {
                promptedModelProviderThisSession = provider;
                return;
            }
        } else if (provider === 'azure') {
            const existingAzureChat = config.get<string>('azureOpenAiDeployment');
            if (existingAzureChat && existingAzureChat.trim() !== '') {
                promptedModelProviderThisSession = provider;
                return;
            }
        } else {
            const existingOllamaModel = config.get<string>('ollamaModel');
            if (existingOllamaModel && existingOllamaModel.trim() !== '') {
                promptedModelProviderThisSession = provider;
                return;
            }
        }
    }

    promptedModelProviderThisSession = provider;

    if (provider === 'gemini') {
        await promptForGeminiModel(config);
    } else if (provider === 'azure') {
        await promptForAzureDeployments(config);
    } else {
        await promptForOllamaModel(config);
    }
}

/**
 * Validate provider-specific key requirements without forcing provider choice.
 */
async function ensureGeminiKey(): Promise<boolean> {
    const config = vscode.workspace.getConfiguration('ail');

    const provider = config.get<'azure' | 'gemini' | 'ollama'>('aiProvider') || 'azure';
    if (provider !== 'gemini') {
        return true;
    }

    const geminiKey = ConfigUtils.getGeminiApiKey();
    if (geminiKey) {
        return true;
    }

    if (!hasPromptedGeminiKeyThisSession) {
        hasPromptedGeminiKeyThisSession = true;

        const action = await vscode.window.showWarningMessage(
            'Gemini API key is missing. Enter a local key for this demo?',
            'Enter Key',
            'Open Settings',
            'Skip'
        );

        if (action === 'Enter Key') {
            const enteredKey = await vscode.window.showInputBox({
                title: 'Gemini API Key (Local Demo)',
                prompt: 'Paste your Gemini API key. It will be stored in workspace setting ail.geminiApiKey.',
                password: true,
                ignoreFocusOut: true,
                validateInput: (value: string) => {
                    if (!value || value.trim().length < 10) {
                        return 'Please enter a valid Gemini API key.';
                    }
                    return null;
                }
            });

            if (enteredKey && enteredKey.trim() !== '') {
                await config.update('geminiApiKey', enteredKey.trim(), vscode.ConfigurationTarget.Workspace);
                vscode.window.showInformationMessage('Gemini API key saved to workspace settings.');
                return true;
            }
        } else if (action === 'Open Settings') {
            await vscode.commands.executeCommand('workbench.action.openSettings', 'ail.geminiApiKey');
        }
    }

    console.warn('AIL: Gemini API key not found. Set GEMINI_API_KEY in .env or ail.geminiApiKey in settings.');

    return false;
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


        panel.webview.onDidReceiveMessage(
            async message => {
                console.log('[AIL-EXT] Received message from webview:', message.command);
                switch (message.command) {

                    case 'requestData':
                        PanelManager.sendDashboardData(panel);
                        break;

                    case 'selectModel':
                        await ensureProviderModelSelection(true);
                        panel.webview.postMessage({ command: 'modelSelectionUpdated' });
                        break;

                    case 'useCurrentAnalysis':
                        // Just load existing .ail data and tell webview to show dashboard
                        await ensureProviderModelSelection();
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
                            // Failsafe check (Uses ConfigUtils for sole truth)
                            const provider = vscode.workspace.getConfiguration('ail').get<'azure' | 'gemini' | 'ollama'>('aiProvider') || 'azure';
                            if (provider === 'gemini') {
                                const geminiKey = ConfigUtils.getGeminiApiKey();
                                if (!geminiKey) {
                                    throw new Error('Gemini API key missing. Set GEMINI_API_KEY in .env or configure ail.geminiApiKey.');
                                }
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

        // Validate provider-specific key requirements (no-op for Azure)
        const provider = vscode.workspace.getConfiguration('ail').get<'azure' | 'gemini' | 'ollama'>('aiProvider') || 'azure';
        await ensureProviderModelSelection();
        const hasProviderKey = await ensureGeminiKey();
        if (provider === 'gemini' && !hasProviderKey) {
            vscode.window.showWarningMessage('Analysis cancelled: Gemini provider selected but no key is configured.');
            panel.webview.postMessage({ command: 'analysisCancelled' });
            return;
        }

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