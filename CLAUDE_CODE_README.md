# Claude Code README for AIL

This document is a quick handoff for anyone using Claude Code on this repository.

## What Is This?

AIL (Architectural Intelligence Layer) is a VS Code extension that scans a codebase, builds a multi-layer architectural model, and presents an interactive graph + AI assistant experience.

The project has two major parts:
- Extension host logic in `src/` (pipeline orchestration, checkpoints, panel managers, provider routing).
- Webview frontend in `src/webview/` (graph UI, summary/chat panels, interaction controls).

Core pipeline flow:
1. Layer 1: workspace ingestion and language/framework detection
2. Layer 2: AST extraction, entities/imports/call graph/complexity
3. Layer 3: git intelligence (churn, co-change, blast radius)
4. Layer 4: assembled knowledge graph + risk scoring
5. Layer 5: embeddings + RAG runtime

## What's Working

### Product behavior
- Graph-first launch path for the extension UI.
- Function/directory/sequence/overall graph modes in webview.
- Expand/collapse behavior for function nodes is stabilized versus earlier relayout jitter.
- Visibility modes are available for function view:
  - connected nodes
  - connected core (>= 3 edges)
  - show all
- Side-by-side separation of disconnected components in function layout.
- Summary + function chat routes support multiple providers (Azure, Gemini, Ollama).
- Browser export action exists (Expand to HTML).
- Browser export now includes:
  - a dashboard panel (counts/types/top-risk list)
  - WebGL-capability checks
  - 2D fallback canvas when 3D renderer fails

### Technical quality
- Pruning for large graph payloads before rendering.
- Webview readiness/ACK handshake to reduce startup race conditions.
- Layout fallback paths for dense graphs.
- Risk scoring in Layer 4 has structural signals and percentile thresholds.

## What We Expect (Current Expectations)

### Immediate functional expectations
- No stray/floating edges should appear in sequence/directory views after edge sanitization.
- Browser export should render a readable graph (not a black/empty page), and always show the dashboard panel.
- Large graph browser view should use large-graph behavior (2D force mode in current implementation) and remain navigable.

### Known active risk to verify
- Very dense graphs can still visually clump in browser view depending on data distribution and simulation state.
- If clumping persists, expected next enhancement is deterministic seeded initial positions by connected component before simulation.

### Validation checklist for Claude Code runs
1. Run/watch build and confirm no new TypeScript errors in touched files.
2. Open webview graph and verify:
   - function mode expand/collapse still stable
   - sequence and directory views do not show orphan/floating artifacts
3. Use Expand to HTML and verify:
   - dashboard appears (top-right)
   - status text indicates renderer mode
   - graph is visible and interactive
4. Spot-check risk hotspot distribution in Layer 4 summary output.

## Expected Contribution Style

When using Claude Code on this repo:
- Prefer small, focused patches.
- Preserve existing public behavior unless explicitly changing UX.
- Validate touched files with error checks after edits.
- Do not revert unrelated dirty-worktree changes.
- Keep notes explicit when a fix is partial versus fully validated.

## Suggested Next Milestones

1. Browser graph deterministic initialization for ultra-dense repos.
2. Optional browser-side controls for force strength, link distance, and node-size presets.
3. Dedicated browser dashboard mode (not only exported snapshot) backed by extension-host APIs.
4. Add regression tests for graph edge sanitization and view-mode filtering.
