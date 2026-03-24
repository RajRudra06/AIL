import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { execSync } from 'child_process';

export interface ChatMessage { role: 'user' | 'assistant'; content: string; }

// ── Intent Classification ──────────────────────────────────────────────────
// These patterns detect when the user is asking about implementation logic,
// not just architectural/metadata facts. Only these queries trigger code injection.
const IMPL_INTENT_PATTERNS = [
    /\bhow\s+(does|do|is|are|can|would)\b/i,
    /\bwhat\s+(does|do|is|are)\s+.+\s+(do|return|use|mean)\b/i,
    /\bexplain\s+(the\s+)?(logic|code|implementation|function|method|class)/i,
    /\bshow\s+(me\s+)?(the\s+)?(code|implementation|source|logic)/i,
    /\bimplementation\b/i,
    /\bwhat\s+(logic|algorithm)/i,
    /\bhow\s+(it|this|that)\s+works?\b/i,
    /\bwhat\s+changed\b/i,
    /\bwhat\s+(did|does)\s+.+(commit|change|add|remove|fix)\b/i,
];

const GIT_DIFF_PATTERNS = [
    /\bwhat\s+changed\b/i,
    /\bcommit\s+[a-f0-9]{4,}/i,
    /[a-f0-9]{7,}\s*(changed|introduced|added|removed|fixed)/i,
    /\bdiff\b/i,
    /\bwhat\s+(did|does)\s+.+(commit|change|add|remove|fix)\b/i,
];

function detectIntent(query: string): { wantsCode: boolean; wantsDiff: boolean } {
    return {
        wantsCode: IMPL_INTENT_PATTERNS.some(p => p.test(query)),
        wantsDiff: GIT_DIFF_PATTERNS.some(p => p.test(query)),
    };
}

// ── Code Snippet Fetcher ───────────────────────────────────────────────────
function fetchCodeSnippet(
    workspacePath: string,
    filePath: string,
    startLine: number | undefined,
    endLine: number | undefined,
    maxLines: number = 50
): string | null {
    try {
        const absPath = path.isAbsolute(filePath)
            ? filePath
            : path.join(workspacePath, filePath);

        if (!fs.existsSync(absPath)) { return null; }

        const lines = fs.readFileSync(absPath, 'utf8').split('\n');
        const start = Math.max(0, (startLine ?? 1) - 1);
        const end = Math.min(lines.length - 1, (endLine ?? start + maxLines) - 1 + 5);
        const excerptLines = lines.slice(start, Math.min(end + 1, start + maxLines));

        return `// ${path.relative(workspacePath, absPath)} (lines ${start + 1}–${start + excerptLines.length})\n` + excerptLines.join('\n');
    } catch {
        return null;
    }
}

// ── Git Diff Fetcher ───────────────────────────────────────────────────────
function fetchGitDiff(workspacePath: string, commitHash: string): string | null {
    try {
        // Run git show with stat + truncated patch
        const stat = execSync(`git show ${commitHash} --stat --format="Author: %an <%ae>%nDate: %aI%nMessage: %s"`, {
            cwd: workspacePath,
            encoding: 'utf-8',
            timeout: 5000
        });

        // Get a truncated diff — only first 150 lines of the patch to avoid token explosion
        let patch = '';
        try {
            const rawPatch = execSync(`git show ${commitHash} --format="" -p`, {
                cwd: workspacePath,
                encoding: 'utf-8',
                timeout: 5000,
                maxBuffer: 1 * 1024 * 1024
            });
            const patchLines = rawPatch.split('\n');
            patch = patchLines.slice(0, 150).join('\n');
            if (patchLines.length > 150) {
                patch += `\n... [${patchLines.length - 150} more lines truncated] ...`;
            }
        } catch { /* stat-only fallback is fine */ }

        return stat + (patch ? '\n\n' + patch : '');
    } catch {
        return null;
    }
}

// ── Extract commit hash from query ────────────────────────────────────────
function extractCommitHash(query: string): string | null {
    const m = query.match(/\b([a-f0-9]{7,40})\b/i);
    return m ? m[1] : null;
}

// ── Main RAG Query Function ───────────────────────────────────────────────
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

        const { wantsCode, wantsDiff } = detectIntent(query);

        let contextText = '';

        // --- 1. Search graph nodes ---
        const queryLower = query.toLowerCase();
        const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 2);

        let searchableNodes: { id: string; text: string; rawNode?: any }[] = [];
        if (fs.existsSync(indexFile)) {
            const indexData = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
            // Keep a reference to the raw graph node for line numbers
            searchableNodes = (indexData.nodes || []).map((n: any) => {
                const raw = graphData.nodes.find((gn: any) => gn.id === n.id);
                return { id: n.id, text: n.text, rawNode: raw };
            });
        } else {
            searchableNodes = (graphData.nodes || []).map((n: any) => ({
                id: n.id,
                rawNode: n,
                text: 'Type: ' + n.type + ' | Name: ' + n.name + ' | File: ' + (n.file || 'N/A')
                    + (n.metadata?.riskScore ? ' | Risk: ' + n.metadata.riskScore + ' (' + n.metadata.riskLevel + ')' : '')
                    + (n.metadata?.complexity ? ' | Complexity: ' + n.metadata.complexity : '')
                    + (n.metadata?.churnScore ? ' | Churn: ' + n.metadata.churnScore : '')
            }));
        }

        interface ScoredItem { id: string; text: string; score: number; rawNode?: any; }
        const scoredNodes: ScoredItem[] = [];
        for (const node of searchableNodes) {
            let score = 0;
            const textLower = node.text.toLowerCase();
            const idLower = node.id.toLowerCase();
            for (const term of queryTerms) {
                if (textLower.includes(term)) { score += 1; }
                if (idLower.includes(term)) { score += 3; }
            }
            if (idLower.includes(queryLower)) { score += 10; }
            if (score > 0) { scoredNodes.push({ id: node.id, text: node.text, score, rawNode: node.rawNode }); }
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

            // ── HYBRID: Inject code snippets only when intent warrants it ──
            if (wantsCode) {
                // 1. Run git grep to quickly locate actual implementation contents mapping the search
                const grepMatchedFiles = new Set<string>();
                try {
                    // Filter out short terms to prevent matching everything
                    const meaningfulTerms = queryTerms.filter(t => t.length > 3);
                    if (meaningfulTerms.length > 0) {
                        // Bounded grep - finding up to 10 files that match the terms
                        const grepRegex = meaningfulTerms.join('|');
                        const rawGrep = execSync(`git grep -Il "${grepRegex}" || true`, {
                            cwd: workspacePath,
                            encoding: 'utf-8',
                            timeout: 2000
                        });
                        
                        const matchedLines = rawGrep.split('\n').filter(l => l.trim().length > 0).slice(0, 10);
                        matchedLines.forEach(l => grepMatchedFiles.add(path.resolve(workspacePath, l)));
                    }
                } catch (e) {
                    // git grep timeout/fail fallback silently
                }

                // Boost nodes that map to the exact grepped files
                const candidateNodes = [...topNodes];
                if (grepMatchedFiles.size > 0) {
                     const boostedNodes = searchableNodes.filter(n => {
                        const file = n.rawNode?.file;
                        if (!file) return false;
                        const absPath = path.resolve(workspacePath, file);
                        return grepMatchedFiles.has(absPath) && !candidateNodes.find(cn => cn.id === n.id);
                     }).slice(0, 3);
                     
                     boostedNodes.forEach(bn => candidateNodes.unshift({ id: bn.id, text: bn.text, score: 99, rawNode: bn.rawNode }));
                }

                const snippetChunks: string[] = [];
                for (const n of candidateNodes.slice(0, 3)) {
                    const raw = n.rawNode;
                    if (!raw || !raw.file || raw.type === 'module') { continue; }
                    const snippet = fetchCodeSnippet(
                        workspacePath,
                        raw.file,
                        raw.metadata?.startLine as number | undefined,
                        raw.metadata?.endLine as number | undefined
                    );
                    if (snippet) { snippetChunks.push(snippet); }
                }
                if (snippetChunks.length > 0) {
                    contextText += '\n--- SOURCE CODE EXCERPTS ---\n';
                    contextText += '(Fetched on-demand for implementation-level queries)\n\n';
                    contextText += snippetChunks.join('\n\n---\n\n');
                    contextText += '\n';
                }
            }
        }

        // --- 2. Search git commits ---
        const commitsFile = path.join(workspacePath, '.ail', 'layer3', 'analysis', 'commit_history.json');
        let topCommitHash: string | null = null;

        if (fs.existsSync(commitsFile)) {
            const commitData = JSON.parse(fs.readFileSync(commitsFile, 'utf8'));
            const commits = commitData.commits || [];

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
                topCommitHash = scoredCommits[0].commit.hash;
            }
        }

        // ── HYBRID: Inject git diff only when intent warrants it ──
        if (wantsDiff) {
            const hashFromQuery = extractCommitHash(query);
            const hashToFetch = hashFromQuery ?? topCommitHash;
            if (hashToFetch) {
                const gitRepos = [workspacePath]; // can be extended for multi-repo
                let diffText: string | null = null;
                for (const repo of gitRepos) {
                    diffText = fetchGitDiff(repo, hashToFetch);
                    if (diffText) { break; }
                }
                if (diffText) {
                    contextText += '\n--- COMMIT DIFF (git show) ---\n';
                    contextText += 'Commit: ' + hashToFetch + '\n';
                    contextText += diffText + '\n';
                }
            }
        }

        // --- 3. Search blast radius data ---
        const blastFile = path.join(workspacePath, '.ail', 'layer3', 'analysis', 'blast_radius.json');
        if (fs.existsSync(blastFile)) {
            const blastData = JSON.parse(fs.readFileSync(blastFile, 'utf8'));
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

        // --- 5. Always include architecture and project metadata as baseline context ---
        const layer1File = path.join(workspacePath, '.ail', 'layer1', 'meta-data.json');
        if (fs.existsSync(layer1File)) {
            const l1Data = JSON.parse(fs.readFileSync(layer1File, 'utf8'));
            contextText += '\n--- PROJECT PROFILE (LAYER 1) ---\n';
            contextText += `Total Source Files: ${l1Data.metrics?.totalFiles || 0}\n`;
            contextText += `Total Lines of Code: ${l1Data.metrics?.totalLines?.toLocaleString() || 0}\n`;
            contextText += `Primary Language: ${l1Data.languages?.primary || 'Unknown'}\n`;
            if (l1Data.frameworks?.frameworks?.length > 0) {
                contextText += `Frameworks/Tech Stack: ${l1Data.frameworks.frameworks.map((f:any) => f.name).join(', ')}\n`;
            }
            if (l1Data.entryPoints?.primaryEntry) {
                contextText += `Main Entry Point: ${l1Data.entryPoints.primaryEntry}\n`;
            }
        }

        const layer2File = path.join(workspacePath, '.ail', 'layer2', 'meta-data.json');
        if (fs.existsSync(layer2File)) {
            const l2Data = JSON.parse(fs.readFileSync(layer2File, 'utf8'));
            contextText += '\n--- CODEBASE STRUCTURE (LAYER 2) ---\n';
            contextText += `Total Structural Entities (Functions/Classes/Methods): ${l2Data.summary?.totalEntities || 0}\n`;
            if (l2Data.summary?.complexFunctionCount > 0) {
                contextText += `Highly Complex Functions Needing Refactoring: ${l2Data.summary.complexFunctionCount}\n`;
            }
        }

        if (fs.existsSync(summaryFile)) {
            const summaryData = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
            contextText += '\n--- ARCHITECTURE OVERVIEW (LAYER 4) ---\n';
            contextText += (summaryData.overview || 'No high-level overview generated.') + '\n';
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

        // --- 6. Fallback ---
        if (contextText.trim().length === 0) {
            contextText = 'No specific matches found for the query. Here is the project overview:\n';
            contextText += 'Graph: ' + (graphData.stats?.totalNodes || 0) + ' nodes, ' + (graphData.stats?.totalEdges || 0) + ' edges\n';
            const nodeTypes = graphData.stats?.nodesByType || {};
            contextText += 'Node types: ' + Object.entries(nodeTypes).map(([k, v]) => v + ' ' + k + 's').join(', ') + '\n';
        }

        // --- Build LLM prompt ---
        const modeNote = wantsCode
            ? 'SOURCE CODE EXCERPTS are included — explain the implementation precisely. '
            : wantsDiff
                ? 'A GIT DIFF is included — describe what logic changed and why it matters. '
                : 'Answer from architectural context only — no code injection needed for this query. ';

        const systemPrompt = 'You are AIL, an expert software architect AI assistant. '
            + 'You have deep knowledge of the codebase from analyzing its architecture, git history, risk metrics, and dependency graph. '
            + modeNote
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

import { ConfigUtils } from '../../utils/configUtils';

async function askGemini(query: string, systemPrompt: string, history: ChatMessage[], config: vscode.WorkspaceConfiguration): Promise<string> {
    const apiKey = ConfigUtils.getGroqApiKey('general');

    if (!apiKey) {
        return "Error: Groq API Key missing. Please check your .env file or VSCode settings.";
    }

    // Use Groq's OpenAI-compatible endpoint with Llama 3.3
    const model = 'llama-3.3-70b-versatile';
    const apiUrl = 'https://api.groq.com/openai/v1/chat/completions';


    const messages = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: query }
    ];

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: model,
            messages: messages,
            temperature: 0.2,
            max_tokens: 6000
        })
    });

    if (!response.ok) {
        const err = await response.json() as any;
        return 'Groq API Error: ' + (err.error?.message || response.statusText);
    }

    const data = await response.json() as any;
    return data.choices[0].message.content;
}
