# PayMyBills Changelog

## [Latest Update] - Graph Reliability + Repository Highlights

### Added
- **Repository Highlights Panel** inside Mission Control dashboard:
  - Risk snapshot (critical/high hotspots)
  - Latest commit signal
  - Top blast-radius event
  - High-churn file cue
  - Strong coupling alert
  - Contributor ownership signal
- **Graph Delivery ACK Telemetry** between graph webview and extension host for observable handoff debugging.

### Changed
- **Graph transport for large repos** now sends a ranked/capped graph payload before posting to webview.
- **Graph init lifecycle** now uses ready handshake + bounded retry pull model to avoid startup race conditions.

### Fixed
- Fixed Gitea-scale graph loading deadlocks where panel stayed in "Loading Architecture...".
- Added dense-graph layout fallback to prevent Dagre lockups during render.
- Fixed node count display logic to correctly show available graph node totals.

## [Latest Update] - Merging AILv2 Vis-Network Engine into React Frontend

### Added
- **AILv2 Force-Directed Physics Engine ( vis.js ) Integration**: Created `src/webview/VisGraph.tsx` to natively mount our continuous 2-dimensional physics renderer inside the React Webview.
- **LLM Importance Stringency Slider**: Integrated the dynamic slider directly into `App.tsx`'s toolbar. When the `Overall Graph` mode is selected, the LLM Importance slider dynamically loads (from 1 to 10), allowing real-time culling of the knowledge graph purely based on AIL's `cp2_score_importance.ts` metadata, just like our original implementation!
- **Interactive Double-Click Telemetry**: Wired up `vis-network`'s node selection system back into VS Code's extension host, ensuring that jumping directly into source logic still works flawlessly from our graph layer.

### Changed
- **`App.tsx` Graph UI Switcher**: Re-wired the UI component lifecycle renderer. The `Function Graph` and `Directory Graph` tabs continue utilizing Rudra's rigid hierarchical DAG rendering logic (`@xyflow/react` + `dagre`), while the `Overall Graph` tab instantly swaps into our interactive `vis-network` implementation.
- **Rolled Back `layoutUtils.ts` overrides**: Reverted the temporary 2D matrix algorithm we injected previously, restoring Dagre's native single column rank algorithm on independent Nodes so the Function & Directory views behave identically to how they did when originally built.

### Fixed
- Fixed the rigid "pancake stack" mapping logic when observing massive interconnected graphs by offloading the rendering engine to `forceAtlas2Based` physics in `VisGraph.tsx`. Nodes are dispersed seamlessly leveraging our god-object architecture.

---

## [Update 2] - Swimlanes, Sequence Diagrams, Neon Palette & Global Chatbot

### Added
- **Sequence Diagram View**: 4th tab that topologically sorts all callable functions into execution order and renders them as a strict vertical call-chain with amber `calls` edge labels.
- **Neon Architectural Color Palette**: Nodes are now colored by their architectural lane identity:
  - 🖥 **Electric Blue** (`#38bdf8`) — View / UI Layer
  - ⚙ **Soft Violet** (`#a78bfa`) — Controller / Business Logic  
  - 🗄 **Neon Emerald** (`#34d399`) — Utility / Data / I-O

### Changed
- **Function Graph → Horizontal Swimlanes**: Abolished importance-based top-25 filtering. Now loads ALL callable functions with ALL edges into three horizontal architectural lanes (View → Logic → Utility, left-to-right).
- **Global Chatbot Sidebar**: The AI Explainer panel now persists across view tab switches. Clicking a node in any view (Function, Directory, Sequence, Overall) opens the same persistent sidebar without destroying your conversation history.
- **Directory Graph**: Cleaned up stale `graphMode` comparisons that caused TypeScript errors and ensured the relationship/independent dropdown only appears for directory views.
