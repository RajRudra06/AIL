import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export interface ChatMessage { role: 'user' | 'assistant'; content: string; }

export async function askQuestion(query: string, history: ChatMessage[], workspacePath: string): Promise<string> {
    const layer5Dir = path.join(workspacePath, '.ail', 'layer5');
    const indexFile = path.join(layer5Dir, 'index', 'node_embeddings.json');
    const graphFile = path.join(workspacePath, '.ail', 'layer4', 'analysis', 'knowledge_graph.json');
    const summaryFile = path.join(workspacePath, '.ail', 'layer4', 'analysis', 'summary.json');

    if (!fs.existsSync(graphFile)) {
        return "Error: Knowledge Graph not found. Please run the pipeline first (Layers 1-4).";
    }

    try {
        const graphData = JSON.parse(fs.readFileSync(graphFile, 'utf8'));
        const config = vscode.workspace.getConfiguration('ail');
        const provider = config.get<'azure' | 'gemini'>('aiProvider') || 'azure';

        // Build a robust search context from multiple sources
        let contextText = '';

        // --- 1. Search graph nodes ---
        const queryLower = query.toLowerCase();
        const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 2);

        // Try node index first, fall back to raw graph nodes
        let searchableNodes: { id: string; text: string }[] = [];
        if (fs.existsSync(indexFile)) {
            const indexData = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
            searchableNodes = (indexData.nodes || []).map((n: any) => ({ id: n.id, text: n.text }));
        } else {
            // Build text from raw graph nodes
            searchableNodes = (graphData.nodes || []).map((n: any) => ({
                id: n.id,
                text: 'Type: ' + n.type + ' | Name: ' + n.name + ' | File: ' + (n.file || 'N/A')
                    + (n.metadata?.riskScore ? ' | Risk: ' + n.metadata.riskScore + ' (' + n.metadata.riskLevel + ')' : '')
                    + (n.metadata?.complexity ? ' | Complexity: ' + n.metadata.complexity : '')
                    + (n.metadata?.churnScore ? ' | Churn: ' + n.metadata.churnScore : '')
            }));
        }

        interface ScoredItem { id: string; text: string; score: number; }
        const scoredNodes: ScoredItem[] = [];
        for (const node of searchableNodes) {
            let score = 0;
            const textLower = node.text.toLowerCase();
            const idLower = node.id.toLowerCase();
            for (const term of queryTerms) {
                if (textLower.includes(term)) { score += 1; }
                if (idLower.includes(term)) { score += 3; }
            }
            // Exact name match bonus
            if (idLower.includes(queryLower)) { score += 10; }
            if (score > 0) { scoredNodes.push({ id: node.id, text: node.text, score }); }
        }
        scoredNodes.sort((a, b) => b.score - a.score);
        const topNodes = scoredNodes.slice(0, 5);

        if (topNodes.length > 0) {
            contextText += '--- RELEVANT CODE ENTITIES ---\n';
            topNodes.forEach(n => { contextText += '\n[' + n.id + ']\n' + n.text + '\n'; });

            // Add related edges
            const topNodeIds = new Set(topNodes.map(n => n.id));
            const relatedEdges = graphData.edges.filter((e: any) => topNodeIds.has(e.source) || topNodeIds.has(e.target));
            if (relatedEdges.length > 0) {
                contextText += '\n--- ARCHITECTURAL RELATIONSHIPS ---\n';
                relatedEdges.slice(0, 20).forEach((e: any) => {
                    contextText += e.source + ' --[' + e.type + ']--> ' + e.target + '\n';
                });
            }
        }

        // --- 2. Search git commits ---
        const commitsFile = path.join(workspacePath, '.ail', 'layer3', 'analysis', 'commit_history.json');
        if (fs.existsSync(commitsFile)) {
            const commitData = JSON.parse(fs.readFileSync(commitsFile, 'utf8'));
            const commits = commitData.commits || [];

            // Score commits by query relevance
            const scoredCommits: { commit: any; score: number }[] = [];
            for (const c of commits) {
                let score = 0;
                const msgLower = (c.message || '').toLowerCase();
                const hashLower = (c.hash || '').toLowerCase();
                const authorLower = (c.author || '').toLowerCase();
                for (const term of queryTerms) {
                    if (msgLower.includes(term)) { score += 2; }
                    if (hashLower.includes(term) || hashLower.startsWith(term)) { score += 10; }
                    if (authorLower.includes(term)) { score += 3; }
                }
                if (score > 0) { scoredCommits.push({ commit: c, score }); }
            }
            scoredCommits.sort((a, b) => b.score - a.score);

            if (scoredCommits.length > 0) {
                contextText += '\n--- MATCHING GIT COMMITS ---\n';
                for (const sc of scoredCommits.slice(0, 5)) {
                    const c = sc.commit;
                    contextText += 'Commit ' + c.hash + ' by ' + c.author + ' on ' + c.date + '\n';
                    contextText += '  Message: ' + c.message + '\n';
                    contextText += '  Files changed: ' + (c.filesChanged || 0) + ' | +' + (c.insertions || 0) + ' -' + (c.deletions || 0) + '\n';
                }
            }
        }

        // --- 3. Search blast radius data ---
        const blastFile = path.join(workspacePath, '.ail', 'layer3', 'analysis', 'blast_radius.json');
        if (fs.existsSync(blastFile)) {
            const blastData = JSON.parse(fs.readFileSync(blastFile, 'utf8'));
            // Find matching blast radius by commit hash
            const matchingBlast = (blastData.commits || []).filter((c: any) => {
                const hashLower = (c.hash || '').toLowerCase();
                return queryTerms.some(t => hashLower.includes(t) || hashLower.startsWith(t));
            });
            if (matchingBlast.length > 0) {
                contextText += '\n--- BLAST RADIUS DATA ---\n';
                for (const b of matchingBlast.slice(0, 3)) {
                    contextText += 'Commit ' + b.hash + ': ' + b.directCount + ' files directly changed, ' + b.transitiveCount + ' downstream impacted\n';
                    contextText += '  Direct files: ' + (b.directFiles || []).join(', ') + '\n';
                    if (b.transitiveFiles && b.transitiveFiles.length > 0) {
                        contextText += '  Impacted downstream: ' + b.transitiveFiles.slice(0, 10).join(', ') + '\n';
                    }
                }
            }
        }

        // --- 4. Search coupling data ---
        const couplingFile = path.join(workspacePath, '.ail', 'layer3', 'analysis', 'co_change.json');
        if (fs.existsSync(couplingFile)) {
            const couplingData = JSON.parse(fs.readFileSync(couplingFile, 'utf8'));
            const matchingPairs = (couplingData.stronglyCoupled || []).filter((p: any) => {
                return queryTerms.some(t => p.fileA.toLowerCase().includes(t) || p.fileB.toLowerCase().includes(t));
            });
            if (matchingPairs.length > 0) {
                contextText += '\n--- CO-CHANGE COUPLING ---\n';
                for (const p of matchingPairs.slice(0, 5)) {
                    contextText += p.fileA + ' <-> ' + p.fileB + ' (' + (p.couplingStrength * 100).toFixed(0) + '% co-change rate)\n';
                }
            }
        }

        // --- 5. Always include architecture summary as baseline context ---
        if (fs.existsSync(summaryFile)) {
            const summaryData = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
            contextText += '\n--- ARCHITECTURE OVERVIEW ---\n';
            contextText += summaryData.overview + '\n';
            if (summaryData.riskHotspots && summaryData.riskHotspots.length > 0) {
                contextText += '\nTop Risk Hotspots:\n';
                for (const h of summaryData.riskHotspots.slice(0, 5)) {
                    contextText += '  [' + h.level.toUpperCase() + '] ' + h.name + ' in ' + h.file + ' (RPI: ' + h.riskScore + ')\n';
                }
            }
            if (summaryData.coupledPairs && summaryData.coupledPairs.length > 0) {
                contextText += '\nTightly Coupled:\n';
                for (const p of summaryData.coupledPairs.slice(0, 3)) {
                    contextText += '  ' + p.fileA + ' <-> ' + p.fileB + ' (' + (p.strength * 100).toFixed(0) + '%)\n';
                }
            }
        }

        // --- 6. If absolutely nothing matched, provide graph stats ---
        if (contextText.trim().length === 0) {
            contextText = 'No specific matches found for the query. Here is the project overview:\n';
            contextText += 'Graph: ' + (graphData.stats?.totalNodes || 0) + ' nodes, ' + (graphData.stats?.totalEdges || 0) + ' edges\n';
            const nodeTypes = graphData.stats?.nodesByType || {};
            contextText += 'Node types: ' + Object.entries(nodeTypes).map(([k, v]) => v + ' ' + k + 's').join(', ') + '\n';
        }

        // --- Build the LLM prompt ---
        const systemPrompt = 'You are AIL, an expert software architect AI assistant. '
            + 'You have deep knowledge of the codebase from analyzing its architecture, git history, risk metrics, and dependency graph. '
            + 'Use the provided context to answer the user\'s question accurately and helpfully. '
            + 'When discussing risk, explain WHY something is risky (complexity + churn + coupling). '
            + 'When discussing commits, describe their impact on the codebase. '
            + 'If the answer is not in the context, say so honestly but suggest what data might help.\n\n'
            + 'CONTEXT:\n' + contextText;

        const recentHistory = history.slice(-6);

        if (provider === 'gemini') {
            return await askGemini(query, systemPrompt, recentHistory, config);
        } else {
            return await askAzure(query, systemPrompt, recentHistory, config);
        }

    } catch (err: any) {
        console.error("GraphRAG Error:", err);
        return 'Internal Error during GraphRAG: ' + (err.message || err);
    }
}

async function askAzure(query: string, systemPrompt: string, history: ChatMessage[], config: vscode.WorkspaceConfiguration): Promise<string> {
    const endpoint = config.get<string>('azureOpenAiEndpoint');
    const apiKey = config.get<string>('azureOpenAiApiKey');
    const deployment = config.get<string>('azureOpenAiDeployment') || 'gpt-4o';

    if (!endpoint || !apiKey) { return "Please configure Azure OpenAI settings."; }

    const apiUrl = endpoint.replace(/\/+$/, '') + '/openai/deployments/' + deployment + '/chat/completions?api-version=2024-02-01';
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
        body: JSON.stringify({
            messages: [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: query }],
            temperature: 0.2,
            max_tokens: 4000
        })
    });

    if (!response.ok) { return 'Azure OpenAI Error: ' + response.status + ' ' + response.statusText; }
    const data = await response.json() as any;
    return data.choices[0].message.content;
}

async function askGemini(query: string, systemPrompt: string, history: ChatMessage[], config: vscode.WorkspaceConfiguration): Promise<string> {
    const apiKey = config.get<string>('geminiApiKey');
    if (!apiKey) { return "Please configure 'ail.geminiApiKey' in settings."; }

    const model = config.get<string>('geminiModel') || 'gemini-2.0-flash';
    const apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + apiKey;

    // Map roles: VS Code Chat uses 'user'/'assistant', Gemini uses 'user'/'model'
    const contents = history.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
    }));

    const payload = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [...contents, { role: 'user', parts: [{ text: query }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 8192 }
    };

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const err = await response.json() as any;
        return 'Gemini API Error: ' + (err.error?.message || response.statusText);
    }

    const data = await response.json() as any;
    return data.candidates[0].content.parts[0].text;
}
