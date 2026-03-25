# Change Log

All notable changes to the "ail-extension" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Added
- Repository Highlights strip in Mission Control dashboard to surface key moments from risk hotspots, latest commits, blast radius, coupling, churn, and contributor ownership.
- Graph webview delivery acknowledgement (`graphDataAck`) for end-to-end diagnostics.

### Changed
- Graph data sent to webview is now pruned for large repositories before posting (top-ranked nodes/edges only) to prevent oversized payload failures.
- Graph initialization now includes a webview-ready handshake and bounded retry requests (`graphWebviewReady`, `getGraph`) to avoid message race conditions.

### Fixed
- Resolved large-repo graph loading stalls in Gitea-scale codebases by adding a fast grid layout fallback when graph density exceeds safe Dagre thresholds.
- Improved graph loading UX with explicit load error messaging instead of indefinite "Loading Architecture..." states.
- Corrected node count visibility in the graph toolbar (`Showing X of Y nodes`).