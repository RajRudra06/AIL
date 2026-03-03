# AIL — Deep Technical Walkthrough

AIL (Architectural Intelligence Layer) is a multi-stage analysis engine that transforms raw source code and git history into a high-fidelity Knowledge Graph used for automated risk assessment and architectural RAG.

## The Deterministic Analysis Pipeline

### Layer 1: Workspace Ingestion
The entry point of the pipeline. It performs a recursive scan of the workspace to:
- Identify primary languages (TypeScript, JavaScript, etc.).
- Categorize files by type (Source, Test, Config, Asset).
- Determine entry points by analyzing `package.json` roots and standard directory structures.

### Layer 2: AST & Semantic Analysis
This is the core "structural" layer. To handle large repositories without crashing VS Code:
- **Streaming Parser**: Uses `web-tree-sitter` in a batched stream to minimize RAM pressure.
- **Entity Extraction**: Identifies Classes, Interfaces, Functions, and Methods.
- **Dependency Mapping**:
  - **Imports**: Direct file-to-file links.
  - **Call Graphs**: Performs static analysis to trace function calls (e.g., `Function A` in `File 1` calls `Method B` in `File 2`).
- **Complexity Metrics**: Calculates Cyclomatic Complexity (count of decision points) and Nesting Depth for every function.

### Layer 3: Git & Blast Radius Intelligence
Extracts historical evolution data directly from the Git CLI.
- **Recursive Git Search**: Finds every `.git` folder in the workspace (supporting monorepos).
- **File Churn**: Quantifies volatility by counting commit frequency per file.
- **Co-Change Coupling**: Analyzes the "co-occurrence" of file changes. If `File A` and `File B` change together in 80% of commits, they are architecturally bound.
- **Commit Blast Radius**:
  - **Direct Impact**: The files explicitly touched by a commit.
  - **Transitive Impact**: Uses the Layer 2 import graph to calculate which downstream files are "at risk" because they depend on the changed files.

### Layer 4: Knowledge Graph Unification & RPI
Merges Layer 2 (Structure) and Layer 3 (History) into a single JSON graph.
- **The RPI Formula**: Every node is assigned a Risk Priority Index (RPI) from 0 to 1:
  - `Risk = (Complexity * 0.4) + (Churn * 0.4) + (Coupling * 0.2)`
  - This identifies "Hotspots": code that is complex, frequently changed, and highly coupled.
- **Summary Generation**: Runs a final pass to identify top-N hotspots and architectural anomalies.

---

## Layer 5: Hybrid Code-Aware RAG

The Assistant does not just perform fuzzy search; it performs "topological retrieval."

### 1. The Intent Gate
When you chat, AIL runs your prompt through a regex-based **Intent Classifier**:
- **Metadata Intent**: Questions about risk, history, or counts. (Returns metadata only).
- **Implementation Intent**: Questions like "how does this work?" or "explain the logic." (Triggers code injection).
- **Commit Intent**: Questions referencing hashes or changes. (Triggers live `git show`).

### 2. Localized Neighborhood Retrieval
AIL finds the "Anchor Nodes" matching your query, then crawls the graph edges:
- **Forward Slicing**: "What does this node call?"
- **Backward Slicing**: "Who calls this node?"
- This provides the LLM with the architectural context (the neighborhood) of the code.

### 3. On-Demand Implementation Fetching
If "Implementation Intent" is detected:
- AIL uses the `startLine` and `endLine` from Layer 2 to read the exact lines from disk.
- It injects these snippets (capped at 50 lines) into the context.
- Result: The LLM can explain exactly *how* a function works without having indexed the whole codebase into a vector DB.

---

## Interactive Dashboard Tabs

1. **Pipeline**: Real-time analysis orchestrator.
2. **Entities**: Sortable inventory of the codebase.
3. **Risk**: RPI-based leaderboard for refactoring.
4. **Git Intel**: Volunteer metrics and co-change rates.
5. **Graph**: Interactive physics-based topology map.
   - **Impact Mode**: See transitive dependency chains.
   - **Risk Mode**: Color nodes by RPI (Green -> Red).
6. **Assistant**: The final GraphRAG interface.
