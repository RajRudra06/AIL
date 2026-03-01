# ail-extension README

This is the README for your extension "ail-extension". After writing up a brief description, we recommend including the following sections.

## Features

Describe specific features of your extension including screenshots of your extension in action. Image paths are relative to this README file.

For example if there is an image subfolder under your extension project workspace:

\!\[feature X\]\(images/feature-x.png\)

> Tip: Many popular extensions utilize animations. This is an excellent way to show off your extension! We recommend short, focused animations that are easy to follow.

## Requirements

If you have any requirements or dependencies, add a section describing those and how to install and configure them.

## Extension Settings

Include if your extension adds any VS Code settings through the `contributes.configuration` extension point.

For example:

This extension contributes the following settings:

* `myExtension.enable`: Enable/disable this extension.
* `myExtension.thing`: Set to `blah` to do something.

# AIL — Architectural Intelligence Layer

AIL is an advanced VS Code Extension designed to automatically ingest, parse, and analyze massive code repositories, outputting a highly structured, unified **Knowledge Graph** of the entire codebase architecture.

## How the Pipeline Works

The analysis pipeline processes the active VS Code workspace through 4 distinct layers:

### Layer 1: Repository Ingestion
Scans the filesystem, identifies languages, categorizes entry points, and provides high-level metrics of the workspace.

### Layer 2: Abstract Syntax Tree (AST) Extraction
Uses `web-tree-sitter` (via a batched, RAM-optimized streaming architecture) to parse every source file.
- **Extracts Entities:** Classes, interfaces, functions, methods.
- **Maps Imports:** Identifies all intra-file dependencies.
- **Builds Call Graphs:** Exactly traces which functions call which other functions.
- **Calculates Complexity:** Scores every function's cyclomatic complexity and nesting depth.

### Layer 3: Git Intelligence
Retrieves historical data directly via the CLI (`git log`, `git shortlog`).
- Computes **File Churn** (identifying "Hot" frequently changed files vs. "Stale" legacy files).
- Extracts contributors and recent commit timelines.

### Layer 4: Knowledge Graph Unification
Merges the structural code logic (L2) with the historical metrics (L3) using relative file paths as keys. The result is a unified graph where nodes not only link to their dependencies (Imports/Calls) but also carry vulnerability weights (Complexity/Churn).

---

## The Dashboard UI
AIL features a rich interactive webview containing:
- **Entities & Complexity Heatmaps:** Sortable lists of every element in the codebase.
- **Git Intel:** Hot file indicators and contributor histories.
- **Interactive Architecture Graph:** A physics-based `vis-network` topology map showing exactly how your modules, classes, and functions are physically wired together. 

---

## AI & LLM Integration Strategies

The primary goal of AIL is to compress a 27,000+ file repository into a highly rigid JSON map so an LLM can reason about global architecture without running out of tokens.

### The "AIL-Native" Advantage
**Why Semantic Relationships (Vector DBs) alone are insufficient:**
A standard Vector RAG setup embeds code fuzzily. If you ask about "login", it brings back strings containing "login". However, it has no concept of *topology*. 

AIL mathematically verifies through AST parsing that `File A` precisely calls `Function B`. Because AIL exports this exact **Call Graph** and **Relationships** map directly, adding another layer of fuzzy "semantic understanding" on top to discover relationships is entirely irrelevant and wasteful. The JSON *already is* the ground truth relationship map.

### Strategy A: Small Repos (< 100 Files)
**Direct Context Injection (Fastest, Cheapest):**
Since the output `knowledge_graph.json` is small, we skip all databases. The JSON is injected directly into the LLM system prompt. The LLM gets a complete, 10,000-foot view of every structural and historical dependency simultaneously.

### Strategy B: Massive Repos (> 100 Files)
**Graph-Augmented RAG (Azure AI Search):**
When the repository is too large for the context window, we utilize a Vector DB as a filter, not as an oracle. 
1. The AIL worker uploads the code snippets to Azure AI Search, attaching the AIL metrics (`complexity: 25`, `isHot: true`) as metadata tags on the embeddings.
2. The User asks a question in the chat.
3. The query searches the Vector DB, but the retrieval logic uses the AIL JSON to mathematically ensure the LLM receives the flagged snippet *alongside* its directly connected Call Graph dependencies, specifically boosting files marked as highly complex or heavily churned.

### Strategy C: The High-Speed Prototype (Local/Ollama)
For extremely fast, hackathon-style prototyping, skip the network latency.
- Run a background OS/Node thread directly in the extension.
- Load the AIL JSON into a standard application memory Dictionary (HashMap).
- Perform `O(1)` memory lookups against the function names.
- Send the curated JSON prompt to a local instance of Ollama (`localhost:11434`), streaming the answer directly back to the VS Code UI within milliseconds, never freezing the main Node.js UI thread.

## Known Issues

Calling out known issues can help limit users opening duplicate issues against your extension.

## Release Notes

Users appreciate release notes as you update your extension.

### 1.0.0

Initial release of ...

### 1.0.1

Fixed issue #.

### 1.1.0

Added features X, Y, and Z.

---

## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
* Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
* Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
