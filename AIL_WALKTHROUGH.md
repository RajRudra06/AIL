# AIL — Deep Technical Deep Dive

AIL (Architectural Intelligence Layer) is a deterministic analysis engine designed to solve the "context fragmentation" problem in large-scale software engineering. It bridges the gap between static code structure (AST) and historical evolution (Git).

## 1. Structural Intelligence: The Streaming AST Parser (Layer 2)

**Why it works**: A naive approach to parsing a thousand-file monorepo would exhaust the Node.js memory heap. AIL uses a **RAM-Optimized Streaming Architecture**.

- **Batched Processing**: We use a generator-based visitor pattern that processes files in batches of 50.
- **Tree-Sitter Querying**: Instead of traversing the entire AST manually, we use Tree-Sitter S-expressions (queries) to extract only relevant "Intelligence Nodes" (Classes, Interfaces, Functions) and their signatures.
- **Semantic Call Mapping**: For every function call identified, AIL attempts to resolve the call target by cross-referencing the `imports.json` map generated in the same pass. This transforms a flat list of files into a **Directed Call Graph**.

## 2. Evolutionary Intelligence: Multi-Repo Git Processing (Layer 3)

**Why it works**: Large projects are often monorepos with multiple `.git` roots. AIL performs a recursive discovery to find all roots and normalizes their paths relative to the workspace.

### Co-Change Coupling Algorithm
How do we identify "hidden" architectural bounds? 
1. **Commit Windowing**: We analyze the last 300 commits per repository.
2. **Matrix Generation**: For every commit touching between 2 and 30 files, we increment a co-change counter for every unique pair of files `(A, B)`.
3. **Strength Calculation**: 
   `Strength = CoChanges(A, B) / max(TotalCommits(A), TotalCommits(B))`
   A score > 0.8 reveals a "logical lock"—even if the files don't import each other, they are structurally dependent.

### Transitive Blast Radius Intelligence
We calculate the "true" impact of a change using **Recursive Dependency Slicing**:
1. **Reverse Import Mapping**: We invert the Layer 2 import graph to map `File (Target) -> List of Files (Source)`.
2. **Impact Propagation**: For every file in a commit, we perform a Depth-First Search (DFS) on the reverse import map to identify all downstream dependents.
3. **The Result**: A commit touching 1 file in the "Core" module might have a blast radius of 50 files if that core module is a dependency hub.

## 3. The Unification Layer: RPI Calculation (Layer 4)

**Why it works**: AIL solves the "So What?" problem by quantifying risk. Every node in the graph is assigned a **Risk Priority Index (RPI)**.

`RPI = (Complexity * 0.4) + (Churn * 0.4) + (Coupling * 0.2)`

- **Complexity (L2)**: Higher cyclomatic complexity suggests harder-to-maintain logic.
- **Churn (L3)**: High volatility indicates frequent bug fixes or requirement shifts.
- **Coupling (L3)**: Tightly coupled nodes propagate errors easily.
- **The Hotspot Detector**: By merging these three metrics, AIL highlights the "Danger Zones" where complex code is changing frequently—the top candidates for immediate refactoring.

## 4. Hybrid GraphRAG Engine (Layer 5)

**Why it works**: Standard Vector RAG is "semantically fuzzy" (it matches similar words). AIL RAG is **topological**.

- **Intent-Gated Injection**: We use a local regex classifier to decide whether to fetch code. If the user asks *"What's the risk here?"*, we stay in metadata mode (fast). If they ask *"How does X work?"*, we trigger the **Implementation Fetcher**.
- **Topological Anchors**: AIL finds the "matched nodes" and then pulls their **1-degree neighbors** from the graph. This provides the LLM with the *Contextual Neighborhood* (what calls this? what is called by this?) which is mathematically verified ground truth.
- **On-Demand Snippets**: Instead of indexing every line of code into a Vector DB, we use the `startLine` and `endLine` metadata to "go back to disk" and read the exact source code on-the-fly. This keeps the RAG index tiny while providing perfect implementation context.
