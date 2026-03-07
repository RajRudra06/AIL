/**
 * Graph Panel HTML — static template.
 * All data is delivered AFTER load via window.addEventListener('message').
 * This avoids every class of template-literal injection bug.
 */
export function getGraphPanelHTML(): string {
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
    <title>AIL Knowledge Graph</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background-color: #1e1e1e;
            color: #d4d4d4;
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        /* Toolbar */
        .toolbar {
            background-color: #252526;
            border-bottom: 1px solid #3e3e42;
            padding: 12px 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
        }
        .title-group h1 { font-size: 16px; font-weight: 600; color: #fff; margin-bottom: 4px; }
        .title-group p { font-size: 12px; color: #858585; }
        .stats-group { display: flex; gap: 16px; align-items: center; }
        .stat-pill {
            background: #2d2d30;
            border: 1px solid #3e3e42;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 500;
            color: #d4d4d4;
        }

        /* View Mode Buttons */
        .view-modes { display: flex; gap: 6px; margin-left: 16px; }
        .view-btn {
            background: #2d2d30;
            border: 1px solid #3e3e42;
            color: #d4d4d4;
            padding: 4px 12px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s;
        }
        .view-btn:hover { background: #3e3e42; border-color: #555; }
        .view-btn.active { background: #0078d4; border-color: #0078d4; color: #fff; }

        /* Layout Toggle */
        .layout-toggle {
            display: flex;
            background: #1e1e1e;
            border: 1px solid #3e3e42;
            border-radius: 4px;
            overflow: hidden;
            margin-right: 12px;
        }
        .layout-opt {
            padding: 4px 14px;
            font-size: 11px;
            font-weight: 500;
            cursor: pointer;
            border: none;
            background: transparent;
            color: #858585;
            transition: all 0.15s;
        }
        .layout-opt:hover { color: #d4d4d4; }
        .layout-opt.active { background: #333; color: #fff; }

        /* Layout */
        .workspace { display: flex; flex: 1; overflow: hidden; }
        .sidebar {
            width: 320px;
            background-color: #252526;
            border-right: 1px solid #3e3e42;
            display: flex;
            flex-direction: column;
            overflow-y: auto;
            flex-shrink: 0;
            padding: 20px;
        }
        .section-title {
            font-size: 11px; font-weight: 700; text-transform: uppercase;
            letter-spacing: 0.5px; color: #858585; margin-bottom: 12px;
        }
        .report-box { font-size: 12.5px; line-height: 1.6; color: #cccccc; white-space: pre-wrap; }
        .graph-area { flex: 1; position: relative; background-color: #1e1e1e; }
        #graph-container { width: 100%; height: 100%; outline: none; }

        /* Node Detail Panel */
        .node-detail { display: none; margin-top: 20px; border-top: 1px solid #3e3e42; padding-top: 16px; }
        .node-detail.visible { display: block; }
        .node-name { font-size: 15px; font-weight: 700; color: #fff; margin-bottom: 4px; word-break: break-all; }
        .node-type-badge { display: inline-block; font-size: 10px; padding: 2px 8px; border-radius: 4px; font-weight: 600; margin-bottom: 12px; }
        .node-type-badge.fn { background: #2a4365; color: #90cdf4; }
        .node-type-badge.class { background: #553c9a; color: #d6bcfa; }
        .node-type-badge.file { background: #2B5B84; color: #90cdf4; }
        .node-type-badge.method { background: #63171b; color: #feb2b2; }
        .node-meta-row { font-size: 11px; color: #858585; margin-bottom: 4px; }
        .node-meta-row strong { color: #d4d4d4; }
        .edge-list-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #858585; margin-top: 14px; margin-bottom: 6px; }
        .edge-item { font-size: 12px; padding: 5px 8px; margin-bottom: 3px; background: #1e1e1e; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: background 0.1s; }
        .edge-item:hover { background: #2d2d30; }
        .edge-label { color: #cccccc; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .edge-type { font-size: 10px; color: #858585; flex-shrink: 0; margin-left: 8px; }
        .jump-btn { display: block; width: 100%; margin-top: 14px; padding: 8px; background: #0078d4; color: #fff; border: none; border-radius: 4px; font-size: 12px; font-weight: 600; cursor: pointer; text-align: center; transition: background 0.15s; }
        .jump-btn:hover { background: #0090f1; }
        .jump-btn:disabled { background: #3e3e42; color: #858585; cursor: not-allowed; }
        .loading { display: flex; align-items: center; justify-content: center; height: 100%; color: #858585; font-size: 14px; }
    </style>
</head>
<body>

    <div class="toolbar">
        <div class="title-group">
            <h1>Architectural Knowledge Graph</h1>
            <p>Interactive Codebase Visualization & Blast Radius</p>
        </div>
        <div class="stats-group">
            <div class="stat-pill" id="stat-nodes">Nodes: –</div>
            <div class="stat-pill" id="stat-edges">Edges: –</div>
            <div class="layout-toggle">
                <button class="layout-opt active" id="opt-graph" onclick="toggleLayout('graph')">Graph</button>
                <button class="layout-opt" id="opt-flow" onclick="toggleLayout('flowchart')">Flowchart</button>
            </div>
            <div class="view-modes">
                <button class="view-btn active" onclick="setView('overall', this)">Overall</button>
                <button class="view-btn" id="btn-entry-exit" onclick="setView('entry_exit', this)">Entry/Exit</button>
                <button class="view-btn" onclick="setView('risk_heatmap', this)">Risk Heatmap</button>
                <button class="view-btn" onclick="setView('coupling', this)">Coupling</button>
            </div>
        </div>
    </div>

    <div class="workspace">
        <div class="sidebar">
            <div class="section-title">AI Architecture Summary</div>
            <div class="report-box" id="report-content">Waiting for data...</div>

            <div class="node-detail" id="node-detail">
                <div class="node-name" id="detail-name"></div>
                <div class="node-type-badge" id="detail-type"></div>
                <div id="detail-meta"></div>
                <button class="jump-btn" id="detail-jump" disabled>Jump to Code</button>
                <div class="edge-list-title" id="calls-title">CALLS (0)</div>
                <div id="calls-list"></div>
                <div class="edge-list-title" id="calledby-title">CALLED BY (0)</div>
                <div id="calledby-list"></div>
            </div>
        </div>

        <div class="graph-area">
            <div id="graph-container">
                <div class="loading">Loading graph data...</div>
            </div>
        </div>
    </div>

    <script>
        var vscode = acquireVsCodeApi();
        var graphData = null;
        var couplingData = null;
        var network = null;
        var visNodes = null;
        var visEdges = null;
        var inDegree = {};
        var outDegree = {};
        var currentLayout = 'graph';

        var graphOptions = {
            interaction: { hover: true, navigationButtons: true, zoomView: true },
            physics: {
                solver: 'forceAtlas2Based',
                forceAtlas2Based: {
                    gravitationalConstant: -70,
                    centralGravity: 0.015,
                    springLength: 120,
                    springConstant: 0.08,
                    damping: 0.4
                }
            }
        };

        var flowchartOptions = {
            interaction: { hover: true, navigationButtons: true, zoomView: true },
            layout: {
                hierarchical: {
                    enabled: true,
                    direction: 'UD',
                    sortMethod: 'directed',
                    shakeTowards: 'roots',
                    levelSeparation: 100,
                    nodeSpacing: 150,
                    treeSpacing: 200
                }
            },
            physics: {
                hierarchicalRepulsion: {
                    avoidOverlap: 0.8,
                    nodeDistance: 150
                }
            }
        };

        var colors = {
            file:      { background: '#2B5B84', border: '#1A364E' },
            function:  { background: '#2A4365', border: '#1A293E' },
            class:     { background: '#553C9A', border: '#32235B' },
            method:    { background: '#63171B', border: '#360D0E' },
            module:    { background: '#744210', border: '#4A2A0A' },
            interface: { background: '#234E52', border: '#132A2C' }
        };

        function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

        // ── RECEIVE DATA VIA MESSAGE ──────────────────────
        window.addEventListener('message', function(event) {
            var msg = event.data;
            if (msg.command === 'graphData') {
                graphData = msg.graph;
                couplingData = msg.coupling || null;
                if (msg.report) {
                    document.getElementById('report-content').textContent = msg.report;
                }
                initGraph();
            }
        });

        function initGraph() {
            if (!graphData || !graphData.nodes || !graphData.edges) return;
            if (typeof vis === 'undefined') {
                setTimeout(initGraph, 300);
                return;
            }

            var stats = graphData.stats || { totalNodes: graphData.nodes.length, totalEdges: graphData.edges.length };
            document.getElementById('stat-nodes').textContent = 'Nodes: ' + stats.totalNodes;
            document.getElementById('stat-edges').textContent = 'Edges: ' + stats.totalEdges;

            // Compute degrees
            graphData.nodes.forEach(function(n) { inDegree[n.id] = 0; outDegree[n.id] = 0; });
            graphData.edges.forEach(function(e) {
                if (outDegree[e.source] !== undefined) outDegree[e.source]++;
                if (inDegree[e.target] !== undefined) inDegree[e.target]++;
            });

            visNodes = new vis.DataSet(graphData.nodes.map(function(n) {
                var c = colors[n.type] || { background: '#555', border: '#333' };
                var size = 15;
                var shape = 'dot';
                if (n.type === 'file') { shape = 'box'; size = undefined; }
                else if (n.metadata && n.metadata.complexity > 10) { size = 25; shape = 'star'; }
                return {
                    id: n.id,
                    label: n.name,
                    group: n.type,
                    title: 'Type: ' + n.type + (n.metadata && n.metadata.churnScore ? '\\nChurn: ' + n.metadata.churnScore : ''),
                    color: { background: c.background, border: c.border, highlight: { background: '#fff', border: c.border } },
                    font: { color: '#ffffff', size: 12, face: 'system-ui' },
                    shape: shape,
                    size: size
                };
            }));

            visEdges = new vis.DataSet(graphData.edges.map(function(e) {
                return {
                    from: e.source,
                    to: e.target,
                    label: e.type,
                    arrows: 'to',
                    font: { size: 10, align: 'horizontal', color: '#858585', face: 'system-ui' },
                    color: { color: '#3e3e42', highlight: '#0078d4' },
                    width: e.weight > 1 ? Math.min(e.weight, 4) : 1
                };
            }));

            var container = document.getElementById('graph-container');
            container.innerHTML = '';
            network = new vis.Network(container, { nodes: visNodes, edges: visEdges }, currentLayout === 'flowchart' ? flowchartOptions : graphOptions);

            // ── NODE CLICK HANDLER ──────────────────────────
            network.on('click', function(params) {
                var panel = document.getElementById('node-detail');
                if (!params.nodes.length) { panel.classList.remove('visible'); return; }

                var nodeId = params.nodes[0];
                var gNode = graphData.nodes.find(function(n) { return n.id === nodeId; });
                if (!gNode) return;

                document.getElementById('detail-name').textContent = gNode.name;
                var badge = document.getElementById('detail-type');
                badge.textContent = gNode.type;
                badge.className = 'node-type-badge ' + (gNode.type === 'function' ? 'fn' : gNode.type);

                var metaHtml = '';
                if (gNode.file) metaHtml += '<div class="node-meta-row"><strong>File:</strong> ' + esc(gNode.file) + '</div>';
                if (gNode.startLine) metaHtml += '<div class="node-meta-row"><strong>Line:</strong> ' + gNode.startLine + '</div>';
                if (gNode.metadata && gNode.metadata.complexity) metaHtml += '<div class="node-meta-row"><strong>Complexity:</strong> ' + gNode.metadata.complexity + '</div>';
                if (gNode.metadata && gNode.metadata.churnScore) metaHtml += '<div class="node-meta-row"><strong>Churn:</strong> ' + gNode.metadata.churnScore + '</div>';
                if (gNode.metadata && gNode.metadata.riskScore !== undefined) metaHtml += '<div class="node-meta-row"><strong>Risk:</strong> ' + (gNode.metadata.riskScore * 100).toFixed(0) + '%</div>';
                document.getElementById('detail-meta').innerHTML = metaHtml;

                var jumpBtn = document.getElementById('detail-jump');
                if (gNode.file) {
                    jumpBtn.disabled = false;
                    jumpBtn.onclick = function() { vscode.postMessage({ command: 'jumpToCode', file: gNode.file, line: gNode.startLine || 1 }); };
                } else {
                    jumpBtn.disabled = true;
                    jumpBtn.onclick = null;
                }

                // Outgoing calls
                var outEdges = graphData.edges.filter(function(e) { return e.source === nodeId; });
                document.getElementById('calls-title').textContent = 'CALLS (' + outEdges.length + ')';
                var callsList = document.getElementById('calls-list');
                callsList.innerHTML = outEdges.length ? outEdges.map(function(e) {
                    var t = graphData.nodes.find(function(n) { return n.id === e.target; });
                    return '<div class="edge-item" data-id="' + e.target + '"><span class="edge-label">' + esc(t ? t.name : e.target) + '</span><span class="edge-type">' + (e.type || 'calls') + '</span></div>';
                }).join('') : '<div style="font-size:11px;color:#555;padding:4px 8px;">No outgoing calls</div>';

                // Incoming calls
                var inEdges = graphData.edges.filter(function(e) { return e.target === nodeId; });
                document.getElementById('calledby-title').textContent = 'CALLED BY (' + inEdges.length + ')';
                var calledByList = document.getElementById('calledby-list');
                calledByList.innerHTML = inEdges.length ? inEdges.map(function(e) {
                    var s = graphData.nodes.find(function(n) { return n.id === e.source; });
                    return '<div class="edge-item" data-id="' + e.source + '"><span class="edge-label">' + esc(s ? s.name : e.source) + '</span><span class="edge-type">' + (e.type || 'calls') + '</span></div>';
                }).join('') : '<div style="font-size:11px;color:#555;padding:4px 8px;">No incoming calls</div>';

                // Click edge items to navigate
                panel.querySelectorAll('.edge-item').forEach(function(el) {
                    el.addEventListener('click', function() {
                        var id = el.getAttribute('data-id');
                        network.selectNodes([id]);
                        network.focus(id, { scale: 1.2, animation: true });
                    });
                });

                panel.classList.add('visible');
            });
        }

        // ── VIEW MODES ──────────────────────────────────────
        function setView(mode, btn) {
            document.querySelectorAll('.view-btn').forEach(function(b) { b.classList.remove('active'); });
            if (btn) btn.classList.add('active');
            if (!network || !visNodes || !visEdges || !graphData) return;

            var allNodes = visNodes.get();
            var allEdges = visEdges.get();

            if (mode === 'overall') {
                visNodes.update(graphData.nodes.map(function(n) {
                    var c = colors[n.type] || { background: '#555', border: '#333' };
                    return { id: n.id, color: { background: c.background, border: c.border, opacity: 1 }, font: { color: '#fff' }, borderWidth: 1 };
                }));
                visEdges.update(allEdges.map(function(e) { return { id: e.id, color: { color: '#3e3e42', opacity: 1 } }; }));
            } else if (mode === 'entry_exit') {
                visNodes.update(allNodes.map(function(n) {
                    var isEntry = inDegree[n.id] === 0 && outDegree[n.id] > 0;
                    var isExit = outDegree[n.id] === 0 && inDegree[n.id] > 0;
                    if (isEntry) return { id: n.id, color: { border: '#4CAF50', background: '#2E7D32', opacity: 1 }, font: { color: '#fff' }, borderWidth: 3 };
                    if (isExit) return { id: n.id, color: { border: '#F44336', background: '#C62828', opacity: 1 }, font: { color: '#fff' }, borderWidth: 3 };
                    return { id: n.id, color: { opacity: 0.1 }, font: { color: 'rgba(255,255,255,0.1)' }, borderWidth: 1 };
                }));
                visEdges.update(allEdges.map(function(e) { return { id: e.id, color: { opacity: 0.1 } }; }));
            } else if (mode === 'risk_heatmap') {
                visNodes.update(allNodes.map(function(n) {
                    var gNode = graphData.nodes.find(function(gn) { return gn.id === n.id; });
                    if (!gNode || !gNode.metadata || typeof gNode.metadata.riskScore !== 'number') {
                        return { id: n.id, color: { background: '#333', border: '#555', opacity: 0.4 }, font: { color: 'rgba(255,255,255,0.4)' }, borderWidth: 1 };
                    }
                    var rpi = gNode.metadata.riskScore;
                    var bg, border;
                    if (rpi >= 0.75) { bg = '#C62828'; border = '#F44336'; }
                    else if (rpi >= 0.5) { bg = '#E65100'; border = '#FF9800'; }
                    else if (rpi >= 0.25) { bg = '#F9A825'; border = '#FFEB3B'; }
                    else { bg = '#2E7D32'; border = '#4CAF50'; }
                    return { id: n.id, color: { background: bg, border: border, opacity: 1 }, font: { color: '#fff' }, borderWidth: 2, size: 15 + rpi * 30 };
                }));
                visEdges.update(allEdges.map(function(e) { return { id: e.id, color: { opacity: 0.15 } }; }));
            } else if (mode === 'coupling') {
                if (couplingData && couplingData.stronglyCoupled) {
                    var clusterColors = ['#E91E63', '#9C27B0', '#3F51B5', '#00BCD4', '#FF9800', '#795548'];
                    var clusterIdx = 0;
                    var fileColorMap = {};
                    couplingData.stronglyCoupled.slice(0, 15).forEach(function(p) {
                        var color = clusterColors[clusterIdx % clusterColors.length];
                        if (!fileColorMap[p.fileA]) fileColorMap[p.fileA] = color;
                        if (!fileColorMap[p.fileB]) fileColorMap[p.fileB] = color;
                        clusterIdx++;
                    });
                    visNodes.update(allNodes.map(function(n) {
                        var gNode = graphData.nodes.find(function(gn) { return gn.id === n.id; });
                        var file = gNode && gNode.file ? gNode.file : n.id.replace('file::', '');
                        if (fileColorMap[file]) {
                            return { id: n.id, color: { background: fileColorMap[file], border: '#fff', opacity: 1 }, font: { color: '#fff' }, borderWidth: 3 };
                        }
                        return { id: n.id, color: { opacity: 0.1 }, font: { color: 'rgba(255,255,255,0.1)' }, borderWidth: 1 };
                    }));
                }
                visEdges.update(allEdges.map(function(e) { return { id: e.id, color: { opacity: 0.1 } }; }));
            }
        }

        // ── LAYOUT TOGGLE ───────────────────────────────────
        function toggleLayout(mode) {
            if (mode === currentLayout || !graphData) return;
            currentLayout = mode;

            // Update toggle buttons
            document.getElementById('opt-graph').classList.toggle('active', mode === 'graph');
            document.getElementById('opt-flow').classList.toggle('active', mode === 'flowchart');

            // Hide Entry/Exit in flowchart mode (layout already shows flow)
            document.getElementById('btn-entry-exit').style.display = mode === 'flowchart' ? 'none' : '';

            // Reset view to overall
            document.querySelectorAll('.view-btn').forEach(function(b) { b.classList.remove('active'); });
            document.querySelector('.view-btn').classList.add('active');

            // Recreate network with new layout
            initGraph();
        }
    </script>
</body>
</html>`;
}
