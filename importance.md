# The "Importance" Metric (LLM Importance Scorer)

In the AIL architecture, the **Importance Score** is a specific LLM-driven metric calculated in Layer 4 (`src/layer4/checkpoints/cp2_score_importance.ts`). Its primary purpose is to identify the most critical functions, classes, and entry points in a codebase so they can be prominently highlighted in the AIL User Interface and prioritized by the Hybrid GraphRAG engine.

The pipeline operates asynchronously (fire-and-forget) via the L4 orchestrator, allowing the UI to render the initial graph while the LLM score resolves and hot-reloads the state in the background.

---

## Under the Hood: The Two-Phase Pipeline

To prevent blowing up the LLM's token context and to keep analysis fast and deterministic, AIL uses a two-phase funnel to compute importance.

### Phase 1: Deterministic Heuristic Filtering
Before consulting the LLM, AIL performs a mathematical pass over the graph (`selectCandidates()`) to compute a combined heuristic score based on the **Import Degree** and the node's **Risk Priority Index (RPI)**.

```typescript
function computeImportDegree(graphData: KnowledgeGraphResult): Map<string, number> {
    const degree = new Map<string, number>();
    for (const edge of graphData.edges) {
        if (edge.type === 'imports' || edge.type === 'calls') {
            degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
        }
    }
    return degree;
}

// Inside selectCandidates():
const scored = graphData.nodes
    .filter(n => n.type !== 'module') // Exclude raw file modules
    .map(n => {
        const deg = degree.get(n.id) || 0;
        const rpi = (n.metadata?.riskScore as number) || 0;
        
        // 50/50 split between structural dependency vs. historical risk
        const combined = deg * 0.5 + rpi * 0.5;
        return { node: n, score: combined };
    });

scored.sort((a, b) => b.score - a.score);
// Cap at top 30 to limit LLM context size
const candidates = scored.slice(0, 30).map(s => s.node);
```

### Phase 2: Structured LLM Adjudication
The top 30 deterministic candidates are then serialized into a highly constrained prompt. Rather than feeding raw source code, AIL feeds structural metadata.

```typescript
// Inside buildPrompt():
const parts = [
    `${i + 1}. id="${n.id}"`,
    `type=${n.type}`,
    `name="${n.name}"`,
    `file="${path.basename(n.file)}"`
];
if (meta?.riskScore) parts.push(`rpi=${meta.riskScore}`);
if (meta?.complexity) parts.push(`complexity=${meta.complexity}`);
if (meta?.commits) parts.push(`commits=${meta.commits}`);
```
The LLM is explicitly instructed:
> *"Rate each one from 1 to 10 on 'how important is this entity as an entry point for understanding this codebase overall?' Base your rating on: how central it is (high import-degree = more important), how risky it is (high rpi = more important to review), and its type (orchestrators > helpers, classes > small utility functions)."*

To ensure pipeline stability, AIL rigorously enforces JSON coercion and uses a **25,000ms timeout** (`scoreWithTimeout()`). If the LLM throws, hangs, or hallucinates bad JSON, AIL gracefully degrades to leaving the graph unscored rather than blocking the developer.

```typescript
// Strict parsing and bounds checking
const parsed = JSON.parse(arrayMatch[0]) as any[];
return parsed
    .filter(item => typeof item.id === 'string' && typeof item.importanceScore === 'number')
    .map(item => ({
        id: item.id,
        importanceScore: Math.min(10, Math.max(1, Math.round(item.importanceScore)))
    }));
```

---

## Downstream Application of Importance

### 1. Presentation Layer (`src/panel/panelUI.ts`)
The 1-10 integer score is injected back into the abstract syntax tree's JSON under `node.metadata.importanceScore`. When rendering the visual Knowledge Graph network, the user interface sizes the nodes and attaches prominence landmarks dynamically based on this score. This immediately steers the user's attention to the codebase's critical path.

```typescript
// UI Scaling logic approximation
const score = n.metadata?.importanceScore || 0; // If unscored, treat as 0
if (score > 7) {
    // Render as a massive prominent node
    html += `<b>LLM Importance:</b> ${score}/10<br/>`;
}
```

### 2. GraphRAG Boost Factor (`src/layer5/rag/rag_engine.ts`)
The Importance Score doesn't just look pretty—it fundamentally alters the LLM context retrieval. During a RAG vector search, the TF-IDF text relevance score is actually multiplied by the nodes static LLM Importance Score:

```typescript
// Feature 2: Re-ranking with LLM Importance
// Multiply the base TF-IDF score by the LLM's 1-10 importance rating
const importance = (node.rawNode?.metadata?.importanceScore as number) || 1;
const boostedScore = score * (1 + (importance * 0.1));
```
*(As seen in Layer 5 RAG index querying, lines 161-165)*

This means if two nodes sound similarly helpful to answer a prompt, the node that was previously rated an `8/10` architectural entry-point will completely overpower a `2/10` utility script, significantly improving the intelligence of AIL's answers.
