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

        // --- 1. Retrieve Setting configurations for Azure OpenAI ---
        const config = vscode.workspace.getConfiguration('ail');
        const endpoint = config.get<string>('azureOpenAiEndpoint');
        const apiKey = config.get<string>('azureOpenAiApiKey');
        const deployment = config.get<string>('azureOpenAiDeployment') || 'gpt-4o';
        const embedDeployment = config.get<string>('azureOpenAiEmbedDeployment') || 'text-embedding-3-small';

        if (!endpoint || !apiKey) {
            return "Please configure your Azure OpenAI Endpoint and API Key in VS Code Settings (ail.azureOpenAiEndpoint).";
        }

        // --- 2. Step 1: Embed User Query (MOCKED FOR SPEED/SAFETY DURING DEV) ---
        // Let's do a simple BM25 / keyword fallback for semantic search to guarantee
        // it works during the demo without waiting for massive embedding indexing.
        const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

        interface ScoredNode { id: string; text: string; score: number; }
        const scoredNodes: ScoredNode[] = [];

        for (const node of indexData.nodes) {
            let score = 0;
            const textLower = node.text.toLowerCase();
            for (const term of queryTerms) {
                if (textLower.includes(term)) { score += 1; }
                if (node.id.toLowerCase().includes(term)) { score += 3; } // Boost title match
            }
            if (score > 0) {
                scoredNodes.push({ id: node.id, text: node.text, score });
            }
        }

        // Take top 5 matching nodes
        scoredNodes.sort((a, b) => b.score - a.score);
        const topNodes = scoredNodes.slice(0, 5);

        if (topNodes.length === 0) {
            return "I couldn't find any relevant code nodes matching your query.";
        }

        // --- 3. Step 2: Graph Traversal (The "Graph" in GraphRAG) ---
        // Find edges connected to the top nodes
        const topNodeIds = new Set(topNodes.map(n => n.id));
        const relatedEdges = graphData.edges.filter((e: any) =>
            topNodeIds.has(e.source) || topNodeIds.has(e.target)
        );

        // --- 4. Prepare Context Payload ---
        let contextText = `--- RELEVANT CODE ENTITIES ---\n`;
        topNodes.forEach(n => { contextText += `\n[Node ID: ${n.id}]\n${n.text}\n`; });

        contextText += `\n--- KNOWN ARCHITECTURAL RELATIONSHIPS ---\n`;
        relatedEdges.forEach((e: any) => {
            if (e.source && e.target && e.type) {
                contextText += `${e.source} --[${e.type}]--> ${e.target}\n`;
            }
        });

        // --- 5. Ask Azure OpenAI LLM ---
        const systemPrompt = `You are AIL, an expert software architect AI. 
Use the provided Architectural Knowledge Graph context to answer the user's latest question accurately.
Do not guess. If the answer is not in the context, say so.

CONTEXT FOR CURRENT QUESTION:
${contextText}`;

        const apiMessages = [
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: query }
        ];

        const apiUrl = `${endpoint.replace(/\/+$/, '')}/openai/deployments/${deployment}/chat/completions?api-version=2024-02-01`;

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': apiKey
            },
            body: JSON.stringify({
                messages: apiMessages,
                temperature: 0.2,
                max_tokens: 1000
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error("Azure OpenAI Error:", errText);
            return `Azure OpenAI Error: ${response.status} ${response.statusText}`;
        }

        const data = await response.json() as any;
        return data.choices[0].message.content;

    } catch (err: any) {
        console.error("GraphRAG Error:", err);
        return `Internal Error during GraphRAG: ${err.message}`;
    }
}
