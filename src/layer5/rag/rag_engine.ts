import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export interface ChatMessage { role: 'user' | 'assistant'; content: string; }

export async function askQuestion(query: string, history: ChatMessage[], workspacePath: string): Promise<string> {
    const layer5Dir = path.join(workspacePath, '.ail', 'layer5');
    const indexFile = path.join(layer5Dir, 'index', 'node_embeddings.json');
    const graphFile = path.join(workspacePath, '.ail', 'layer4', 'analysis', 'knowledge_graph.json');

    if (!fs.existsSync(indexFile) || !fs.existsSync(graphFile)) {
        return "Error: Layer 5 index or Knowledge Graph not found. Please run the pipeline first.";
    }

    try {
        const indexData = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
        const graphData = JSON.parse(fs.readFileSync(graphFile, 'utf8'));

        const config = vscode.workspace.getConfiguration('ail');
        const provider = config.get<'azure' | 'gemini'>('aiProvider') || 'azure';

        // --- 1. BM25 / Keyword Retrieval ---
        const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
        interface ScoredNode { id: string; text: string; score: number; }
        const scoredNodes: ScoredNode[] = [];

        for (const node of indexData.nodes) {
            let score = 0;
            const textLower = node.text.toLowerCase();
            for (const term of queryTerms) {
                if (textLower.includes(term)) { score += 1; }
                if (node.id.toLowerCase().includes(term)) { score += 3; }
            }
            if (score > 0) { scoredNodes.push({ id: node.id, text: node.text, score }); }
        }

        scoredNodes.sort((a, b) => b.score - a.score);
        const topNodes = scoredNodes.slice(0, 5);
        if (topNodes.length === 0) { return "I couldn't find any relevant code nodes matching your query."; }

        const topNodeIds = new Set(topNodes.map(n => n.id));
        const relatedEdges = graphData.edges.filter((e: any) => topNodeIds.has(e.source) || topNodeIds.has(e.target));

        let contextText = `--- RELEVANT CODE ENTITIES ---\n`;
        topNodes.forEach(n => { contextText += `\n[Node ID: ${n.id}]\n${n.text}\n`; });
        contextText += `\n--- KNOWN ARCHITECTURAL RELATIONSHIPS ---\n`;
        relatedEdges.forEach((e: any) => {
            if (e.source && e.target && e.type) { contextText += `${e.source} --[${e.type}]--> ${e.target}\n`; }
        });

        const systemPrompt = `You are AIL, an expert software architect AI. 
Use the provided Architectural Knowledge Graph context to answer the user's latest question accurately.
Do not guess. If the answer is not in the context, say so.

CONTEXT FOR CURRENT QUESTION:
${contextText}`;

        const recentHistory = history.slice(-6);

        if (provider === 'gemini') {
            return await askGemini(query, systemPrompt, recentHistory, config);
        } else {
            return await askAzure(query, systemPrompt, recentHistory, config);
        }

    } catch (err: any) {
        console.error("GraphRAG Error:", err);
        return `Internal Error during GraphRAG: ${err.message}`;
    }
}

async function askAzure(query: string, systemPrompt: string, history: ChatMessage[], config: vscode.WorkspaceConfiguration): Promise<string> {
    const endpoint = config.get<string>('azureOpenAiEndpoint');
    const apiKey = config.get<string>('azureOpenAiApiKey');
    const deployment = config.get<string>('azureOpenAiDeployment') || 'gpt-4o';

    if (!endpoint || !apiKey) { return "Please configure Azure OpenAI settings."; }

    const apiUrl = `${endpoint.replace(/\/+$/, '')}/openai/deployments/${deployment}/chat/completions?api-version=2024-02-01`;
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
        body: JSON.stringify({
            messages: [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: query }],
            temperature: 0.2,
            max_tokens: 1000
        })
    });

    if (!response.ok) { return `Azure OpenAI Error: ${response.status} ${response.statusText}`; }
    const data = await response.json() as any;
    return data.choices[0].message.content;
}

async function askGemini(query: string, systemPrompt: string, history: ChatMessage[], config: vscode.WorkspaceConfiguration): Promise<string> {
    const apiKey = config.get<string>('geminiApiKey');
    if (!apiKey) { return "Please configure 'ail.geminiApiKey' in settings."; }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    // Map roles: VS Code Chat uses 'user'/'assistant', Gemini uses 'user'/'model'
    const contents = history.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
    }));

    // Add system prompt as a user message at the start or use system_instruction if supported
    const payload = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [...contents, { role: 'user', parts: [{ text: query }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1000 }
    };

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const err = await response.json() as any;
        return `Gemini API Error: ${err.error?.message || response.statusText}`;
    }

    const data = await response.json() as any;
    return data.candidates[0].content.parts[0].text;
}
