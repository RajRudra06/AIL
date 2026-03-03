# AIL — Architecture & Contributor Guide

Welcome to the Architectural Intelligence Layer (AIL) codebase! This guide is designed to help new contributors understand how the extension works under the hood, how data flows through the pipeline, and how to extend it.

## 1. High-Level Concept

AIL is a VS Code extension that runs a multi-stage background analysis on the user's workspace, generating JSON artifacts at each step. These artifacts are eventually merged into a single Knowledge Graph (`knowledge_graph.json`) which powers both the React Dashboard and the AI Chatbot.

**Core Philosophy:** We do not use fuzzy Vector Databases for relationships. Instead, we use deterministic AST parsing (Layer 2) and Git history (Layer 3) to build a mathematical graph, which the LLM (Layer 5) traverses.

## 2. Directory Structure

The source code is located in the `src/` directory, divided cleanly into pipeline layers and UI.

```text
src/
├── extension.ts           # The main entry point (registers commands and Webview)
├── orchestrator.ts        # The master runner that triggers Layers 1-5 sequentially
├── layer1/                # Workspace Ingestion
├── layer2/                # AST Parsing (web-tree-sitter) & Complexity
├── layer3/                # Git Data (Commits, Churn, Blast Radius)
├── layer4/                # Graph Unification & RPI Scoring
├── layer5/                # AI Chat & GraphRAG Engine
└── panel/                 # The React/HTML Webview UI
```

All generated analysis data is saved to `.ail/` in the user's workspace root. **This folder is gitignored in the target workspace.**

## 3. The Checkpoint System

Each layer is composed of **Checkpoints**. A checkpoint is a single, isolated unit of work that reads input (from the workspace or a previous layer's JSON) and writes a specific output JSON file.

If you are adding a new feature, you will almost certainly be adding a new checkpoint.

### Example: How to add a new analysis metric (e.g., "Dependency Vulnerability Scanner")

1. **Pick a Layer**: Does it read raw files? (Layer 2). Does it read git? (Layer 3).
2. **Create the Checkpoint**: Add `cpX_vuln_scan.ts` in that layer's `checkpoints/` folder.
3. **Write the Function**: It should accept the `analysisDir` and output a JSON file.
   ```typescript
   export function runVulnScan(workspacePath: string, analysisDir: string) {
       // ... do work ...
       fs.writeFileSync(path.join(analysisDir, 'vuln_scan.json'), JSON.stringify(results));
   }
   ```
4. **Wire It Up**: Open that layer's `orchestrator.ts` and add your function to the execution chain.
5. **Merge It (Layer 4)**: Open `layer4/checkpoints/cp1_build_graph.ts`. Make it read your new `vuln_scan.json` and attach the data to the final `GraphNode` or `GraphEdge` metadata.
6. **Display It (UI)**: Open `panel/panelUI.ts` (or the respective frontend file) to render your new data in the Webview.

## 4. Deep Dive: Pipeline Layers

### Layer 1: Ingestion (`src/layer1/`)
Very fast. Recursively walks the workspace to count files, map sizes, and determine primary languages by extension. Outputs `manifest.json`.

### Layer 2: AST (`src/layer2/`)
The heaviest layer. We use `web-tree-sitter`.
*   **WASM Loading**: Because this runs in a node environment inside VS Code, Tree-Sitter is loaded via WASM in `cp1_init_parser.ts`.
*   **Streaming**: We process files in batches (chunking) to avoid V8 memory heap limits on large monorepos.
*   **Outputs**: `entities.json` (Classes, Functions), `imports.json` (Edges), and `complexity.json` (Cyclomatic scores).

### Layer 3: Git History (`src/layer3/`)
Discovers `.git` folders.
*   **Raw CLI**: We use `child_process.execSync` to run raw git commands for speed.
*   **Key Checkpoints**: 
    *   `cp3_file_churn.ts` (How often files change).
    *   `cp4_co_change.ts` (Files changing in the exact same commit).
    *   `cp5_blast_radius.ts` (Traces Layer 2's `imports.json` backwards to see who is impacted when a file changes).

### Layer 4: Unification (`src/layer4/`)
Merges L2 (Structure) and L3 (Git).
*   **The RPI**: Calculates the Risk Priority Index by weighting Complexity, Churn, and Coupling.
*   **Output**: `knowledge_graph.json`, the absolute ground truth of the system.

### Layer 5: GraphRAG (`src/layer5/`)
The LLM integration point.
*   `rag_engine.ts` intercepts user chat messages from the webview.
*   **Intent Classifier**: Uses regex to determine if the user needs *source code* (implementation intent), *git diffs* (commit intent), or just *metadata* (architectural intent).
*   Injects the targeted context and calls the Azure or Gemini API.

## 5. Webview Architecture (`src/panel/`)

The VS Code GUI is rendered using a Webview.
*   `panelManager.ts`: The backend bridge. It handles `vscode.postMessage` communication between the extension and the Webview (e.g., passing the JSON graph data to the frontend or handling "Open File" clicks).
*   `panelUI.ts`: The frontend HTML/JS payload. It contains the tab logic, tables, and the `vis-network` graph clustering logic.

## 6. Local Development & Debugging

1. **Install Dependencies**: `npm install`
2. **Compile**: `npm run watch` (Leaves a compiler running to catch TS errors).
3. **Launch Extension**: Press `F5` in VS Code. This opens a new "Extension Development Host" window.
4. **Run AIL**: In the new window, open a test project, hit `Cmd+Shift+P`, and run `Run AIL Analysis`.
5. **Debugging**: You can set breakpoints in the original VS Code window; they will trigger when the Extension Development Host executes that code.

**Note on Webview Debugging:** To inspect the frontend UI (HTML/CSS), press `Cmd+Shift+P` in the Extension Host window and select `Developer: Open Webview Developer Tools`.
