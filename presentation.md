# 🚀 AIL: The Architectural Intelligence Layer
## *Demo Script & Presentation Guide*

---

## 🎬 Introduction (0:00 - 0:45)
**Visual: Open VS Code with AIL Dashboard visible.**

"Welcome to a demonstration of AIL—the Architectural Intelligence Layer. 

In modern engineering, we’re drowning in 'Context Fragmentation.' We have the code (the AST), and we have the history (Git). But we rarely have a system that mathematically links the two to reveal the *true* risk profile of a codebase.

AIL doesn't just 'read' code; it understands the topology of your architecture. Let's dive in."

---

## 🏗️ Phase 1: Structural Intelligence (Layer 2)
**Visual: Hover over the 'Entities' and 'Imports' sections in the dashboard.**

"It starts with Layer 2: **Structural Intelligence**. 

Standard extensions often fail on large monorepos due to memory limits. AIL uses a **RAM-Optimized Streaming Parser**. By leveraging Tree-Sitter WASM, we process files in batches, extracting Classes, Interfaces, and Functions without bloating the IDE.

But we go further—we map these into a **Directed Call Graph**. We know exactly what calls what, with zero 'fuzzy' guessing."

---

## 🔄 Phase 2: Evolutionary Intelligence (Layer 3)
**Visual: Scroll to the 'Churn' and 'Blast Radius' charts.**

"Next is Layer 3: **Evolutionary Intelligence**. 

Code isn't static; it evolves. AIL analyzes your Git history across multiple roots to find **Co-Change Coupling**. 

If File A and File B always change in the same commit, they are structurally locked, even if they never import each other. AIL calculates the **Transitive Blast Radius**, showing you how a single line change in your Core module can propagate risk across 50 dependent files."

---

## ⚡ Phase 3: The Risk Priority Index (Layer 4)
**Visual: Highlight the 'RPI' scores in the node table.**

"This all culminates in the **Unification Layer**. 

We’ve created a proprietary metric called the **Risk Priority Index (RPI)**. It's a weighted calculation of:
- **Complexity** (from the AST)
- **Churn** (from Git volatility)
- **Coupling** (from co-change logic)

AIL highlights your 'Hotspots'—the danger zones where complex code is changing frequently. This is where your bugs are hiding."

---

## 🤖 Phase 4: Hybrid GraphRAG Engine (Layer 5)
**Visual: Open the AIL Chat Sidebar and type a query like "What's the risk in the orchestrator?"**

"Finally, we have the **Hybrid GraphRAG Engine**. 

Unlike standard AI search that uses 'fuzzy' vector matching, AIL RAG is **topological**. 
- It understands your intent.
- It pulls the context 'neighborhood' (calling/called nodes).
- It fetches implementation snippets on-demand directly from disk.

You aren't just talking to an LLM; you're talking to a mathematically verified Knowledge Graph of your own codebase."

---

## 🏁 Conclusion
**Visual: Show the 'Run AIL Analysis' command in the command palette.**

"AIL transforms your workspace from a collection of files into an intelligent, queryable graph. Deterministic, scalable, and built for builders.

Thank you for watching."

---

### 💡 Pro-Tips for the Video
1. **Pacing**: Pause for 2 seconds when switching between visual tabs to let the viewer see the UI.
2. **Zoom**: Use `Cmd + +` in VS Code to make the text/graphs readable for the recording.
3. **The 'Money Shot'**: Make sure to click a node in the graph UI to show the 'Jump to Code' feature—it always wows the audience.
