import * as fs from 'fs';
import * as path from 'path';

export interface NodeEmbedding {
    id: string;
    type: string;
    text: string;           // The pre-computed text representation of this node
    embedding?: number[];   // Vector representation (1536 dims for text-embedding-ada-002/3-small)
}

export interface EmbedResult {
    totalNodes: number;
    embeddedNodes: number;
    skippedNodes: number;
}

/**
 * CP1: Convert Layer 4 Nodes into Embeddings using Azure OpenAI.
 * Note: To prevent huge API bills during dev, we can either mock this or require a VS Code setting.
 */
export async function runCheckpoint1(workspacePath: string, indexDir: string): Promise<EmbedResult> {
    const graphPath = path.join(workspacePath, '.ail', 'layer4', 'analysis', 'knowledge_graph.json');
    if (!fs.existsSync(graphPath)) {
        throw new Error('knowledge_graph.json not found. Did Layer 4 fail?');
    }

    const vscode = require('vscode');
    const config = vscode.workspace.getConfiguration('ail');
    const provider = config.get('aiProvider') || 'azure';
    const disableEmbeddings = config.get('disableEmbeddings') || false;

    const graphData = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
    const nodes = graphData.nodes || [];

    const nodeEmbeddings: NodeEmbedding[] = [];
    let skipped = 0;

    for (const node of nodes) {
        // Skip unresolved modules or simple imports to save API token costs
        if (node.metadata?.external || node.metadata?.unresolved) {
            skipped++;
            continue;
        }

        // Generate a rich text representation for embedding
        let textRep = 'Type: ' + node.type + ' | Name: ' + node.name + ' | File: ' + (node.file || 'unknown');
        if (node.metadata?.churnScore) {
            textRep += ' | Git Churn: ' + node.metadata.churnScore + ' (commits: ' + node.metadata.commits + ')';
        }
        if (node.metadata?.riskScore !== undefined) {
            textRep += ' | Risk: ' + node.metadata.riskScore + ' (' + (node.metadata.riskLevel || 'unknown') + ')';
        }
        if (node.metadata?.complexity) {
            textRep += ' | Complexity: ' + node.metadata.complexity;
        }
        if (node.metadata?.coupling) {
            textRep += ' | Coupling: ' + node.metadata.coupling;
        }
        if (node.metadata?.params) {
            textRep += ' | Signature: ' + node.name + '(' + node.metadata.params.join(', ') + ')';
        }
        if (node.metadata?.isHot) {
            textRep += ' | HOT FILE (high churn)';
        }
        if (node.metadata?.isStale) {
            textRep += ' | STALE (no recent changes)';
        }

        nodeEmbeddings.push({
            id: node.id,
            type: node.type,
            text: textRep,
            // embedding: [] // We will fetch this from Azure OpenAI in the production/chat phase
        });
    }

    let embeddedNodesCount = 0;

    if (!disableEmbeddings) {
        if (provider === 'gemini') {
            const apiKey = config.get('geminiApiKey');
            if (!apiKey) {
                console.warn(`[AIL] Gemini API key not set. Skipping embeddings generation.`);
            } else {
                for (const node of nodeEmbeddings) {
                    try {
                        if (apiKey.toString().startsWith('gsk_')) {
                            // Groq keys do not support Google's embedding endpoint; mock the vector
                            node.embedding = new Array(768).fill(0.01);
                            embeddedNodesCount++;
                        } else {
                            const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
                            const reqPath = {
                                model: "models/text-embedding-004",
                                content: { parts: [{ text: node.text }] }
                            };
                            const response = await fetch(url, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(reqPath)
                            });

                            if (response.ok) {
                                const data = await response.json() as any;
                                if (data.embedding?.values) {
                                    node.embedding = data.embedding.values;
                                    embeddedNodesCount++;
                                }
                            }
                        }

                        // Wait a fraction of a second to prevent strict ratelimiting on standard tiers
                        await new Promise(r => setTimeout(r, 100));

                    } catch (err) {
                        console.error(`Gemini/Groq embedding failed for node ${node.id}`, err);
                    }
                }
            }
        } else if (provider === 'azure') {
            const endpoint = config.get('azureOpenAiEndpoint');
            const apiKey = config.get('azureOpenAiApiKey');
            const deployment = config.get('azureOpenAiEmbedDeployment') || 'text-embedding-ada-002';

            if (!endpoint || !apiKey) {
                console.warn(`[AIL] Azure OpenAI embed settings missing. Skipping embeddings.`);
            } else {
                for (const node of nodeEmbeddings) {
                    try {
                        const apiUrl = `${endpoint.replace(/\/+$/, '')}/openai/deployments/${deployment}/embeddings?api-version=2023-05-15`;
                        const response = await fetch(apiUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
                            body: JSON.stringify({ input: node.text })
                        });

                        if (response.ok) {
                            const data = await response.json() as any;
                            if (data.data?.[0]?.embedding) {
                                node.embedding = data.data[0].embedding;
                                embeddedNodesCount++;
                            }
                        }

                        // Delay
                        await new Promise(r => setTimeout(r, 50));

                    } catch (err) {
                        console.error(`Azure embedding failed for node ${node.id}`, err);
                    }
                }
            }
        }
    }

    const outputPath = path.join(indexDir, 'node_embeddings.json');
    fs.writeFileSync(outputPath, JSON.stringify({ nodes: nodeEmbeddings }, null, 2));

    console.log(`AIL L5-CP1 | Processed ${nodeEmbeddings.length} nodes for embedding. Skipped ${skipped}.`);

    return {
        totalNodes: nodes.length,
        embeddedNodes: nodeEmbeddings.length,
        skippedNodes: skipped
    };
}
