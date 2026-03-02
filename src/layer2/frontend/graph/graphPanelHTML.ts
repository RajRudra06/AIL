export function getGraphPanelHTML(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AIL Knowledge Graph</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            background:     #1e1e1e;
            color:          #d4d4d4;
            font-family:    -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            height:         100vh;
            overflow:       hidden;
            display:        flex;
            flex-direction: column;
        }

        /* ── HEADER ─────────────────────────────────────── */
        #header {
            background:    #252526;
            border-bottom: 1px solid #3e3e42;
            padding:       10px 16px;
            display:       flex;
            align-items:   center;
            gap:           12px;
            flex-shrink:   0;
        }

        #header h1 {
            font-size:    14px;
            font-weight:  600;
            color:        #ffffff;
            margin-right: auto;
        }

        .view-btn {
            background:    #3e3e42;
            border:        1px solid #555;
            color:         #d4d4d4;
            padding:       5px 12px;
            border-radius: 4px;
            font-size:     12px;
            cursor:        pointer;
            transition:    all 0.15s;
        }
        .view-btn:hover  { background: #4e4e52; color: #fff; }
        .view-btn.active { background: #0078d4; border-color: #0078d4; color: #fff; }

        /* ── STATS ──────────────────────────────────────── */
        #stats-bar {
            background:  #2d2d30;
            padding:     5px 16px;
            display:     flex;
            gap:         20px;
            font-size:   11px;
            color:       #858585;
            flex-shrink: 0;
        }
        .stat-item span { color: #d4d4d4; font-weight: 600; }

        /* ── MAIN ───────────────────────────────────────── */
        #main {
            display:  flex;
            flex:     1;
            overflow: hidden;
        }

        /* ── GRAPH ──────────────────────────────────────── */
        #graph-container {
            flex:       1;
            overflow:   hidden;
            position:   relative;
            background: #1e1e1e;
        }

        #graph-svg { width: 100%; height: 100%; }

        /* node boxes */
        .node-box {
            rx:     8;
            ry:     8;
            cursor: pointer;
            filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));
            transition: all 0.15s;
        }

        .node-group:hover .node-box {
            filter: drop-shadow(0 4px 12px rgba(74,158,255,0.4));
        }

        .node-label {
            font-size:   11px;
            font-family: 'SF Mono', 'Fira Code', monospace;
            fill:        #ffffff;
            pointer-events: none;
            dominant-baseline: middle;
            text-anchor: middle;
        }

        .node-meta {
            font-size:  9px;
            fill:       rgba(255,255,255,0.5);
            pointer-events: none;
            dominant-baseline: middle;
            text-anchor: middle;
        }

        .collapse-btn {
            cursor:      pointer;
            font-size:   9px;
            fill:        rgba(255,255,255,0.7);
            font-family: monospace;
        }

        .collapse-circle {
            fill:   rgba(255,255,255,0.1);
            stroke: rgba(255,255,255,0.3);
            cursor: pointer;
        }
        .collapse-circle:hover { fill: rgba(255,255,255,0.2); }

        /* edges */
        .edge-line {
            fill:            none;
            stroke:          #4A9EFF;
            stroke-width:    1.5;
            stroke-opacity:  0.6;
            marker-end:      url(#arrowhead);
        }

        .edge-line.imports  { stroke: #51CF66; }
        .edge-line.inherits { stroke: #FF6B6B; }

        /* ── EMPTY / LOADING ────────────────────────────── */
        #loading {
            position:  absolute;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            color:     #858585;
            font-size: 13px;
        }

        #hint {
            position:   absolute;
            bottom:     16px;
            left:       16px;
            font-size:  11px;
            color:      #555;
        }

        /* ── LEGEND ─────────────────────────────────────── */
        #legend {
            position:      absolute;
            bottom:        16px;
            right:         300px;
            background:    rgba(37,37,38,0.95);
            border:        1px solid #3e3e42;
            border-radius: 6px;
            padding:       8px 12px;
            font-size:     11px;
            display:       flex;
            gap:           12px;
        }

        .legend-item { display: flex; align-items: center; gap: 5px; color: #858585; }
        .legend-dot  { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }

        /* ── SIDEBAR ─────────────────────────────────────── */
        #sidebar {
            width:          280px;
            background:     #252526;
            border-left:    1px solid #3e3e42;
            display:        flex;
            flex-direction: column;
            overflow:       hidden;
            flex-shrink:    0;
        }

        #sidebar-title {
            padding:       10px 12px;
            font-size:     12px;
            font-weight:   600;
            color:         #cccccc;
            border-bottom: 1px solid #3e3e42;
            background:    #2d2d30;
        }

        #node-detail {
            padding:    12px;
            flex:       1;
            overflow-y: auto;
            font-size:  12px;
        }

        .detail-row {
            display:       flex;
            gap:           8px;
            margin-bottom: 8px;
            align-items:   flex-start;
        }
        .detail-label { color: #858585; min-width: 80px; flex-shrink: 0; font-size: 11px; }
        .detail-value { color: #d4d4d4; word-break: break-all; font-size: 11px; }
        .detail-value.link { color: #4A9EFF; cursor: pointer; }
        .detail-value.link:hover { text-decoration: underline; }

        #jump-btn {
            margin:        8px 12px 12px;
            background:    #0078d4;
            border:        none;
            color:         white;
            padding:       7px 12px;
            border-radius: 4px;
            cursor:        pointer;
            font-size:     12px;
            width:         calc(100% - 24px);
        }
        #jump-btn:hover { background: #0090f1; }
        #jump-btn.hidden { display: none; }

        #insights {
            border-top: 1px solid #3e3e42;
            padding:    10px 12px;
            font-size:  11px;
            max-height: 220px;
            overflow-y: auto;
        }

        #insights h3 {
            font-size:      10px;
            color:          #858585;
            margin-bottom:  8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .insight-row {
            padding:       4px 8px;
            margin-bottom: 3px;
            border-radius: 3px;
            background:    #2d2d30;
            cursor:        pointer;
        }
        .insight-row:hover { background: #3e3e42; }
        .insight-name { color: #d4d4d4; font-weight: 600; }
        .insight-file { color: #858585; font-size: 10px; margin-top: 1px; }

        #empty-hint {
            color:      #555;
            font-size:  12px;
            text-align: center;
            margin-top: 40px;
        }

        /* ── TOOLTIP ─────────────────────────────────────── */
        #tooltip {
            position:       fixed;
            background:     #252526;
            border:         1px solid #3e3e42;
            border-radius:  4px;
            padding:        8px 10px;
            font-size:      11px;
            pointer-events: none;
            display:        none;
            z-index:        999;
            max-width:      220px;
            line-height:    1.5;
        }
    </style>
</head>
<body>

<!-- HEADER -->
<div id="header">
    <h1>⚡ AIL Knowledge Graph</h1>
    <div id="view-switcher">
        <button class="view-btn active" data-view="function_call_graph">Function Calls</button>
        <button class="view-btn"        data-view="import_graph">Imports</button>
        <button class="view-btn"        data-view="class_hierarchy_graph">Class Hierarchy</button>
        <button class="view-btn"        data-view="full_graph">Full Graph</button>
    </div>
</div>

<!-- STATS -->
<div id="stats-bar">
    <div class="stat-item">Nodes: <span id="stat-nodes">0</span></div>
    <div class="stat-item">Edges: <span id="stat-edges">0</span></div>
    <div class="stat-item">Files: <span id="stat-files">0</span></div>
    <div class="stat-item">Functions: <span id="stat-functions">0</span></div>
    <div class="stat-item">Orphans: <span id="stat-orphans">0</span></div>
    <div class="stat-item">Circular Deps: <span id="stat-circular">0</span></div>
</div>

<!-- MAIN -->
<div id="main">

    <!-- GRAPH -->
    <div id="graph-container">
        <div id="loading">Loading graph...</div>
        <svg id="graph-svg"></svg>
        <div id="hint">Scroll to zoom · Drag to pan · Click node to expand/collapse</div>
        <div id="legend">
            <div class="legend-item"><div class="legend-dot" style="background:#4A9EFF"></div>Function</div>
            <div class="legend-item"><div class="legend-dot" style="background:#FF6B6B"></div>Class</div>
            <div class="legend-item"><div class="legend-dot" style="background:#51CF66"></div>File</div>
            <div class="legend-item"><div class="legend-dot" style="background:#FFD43B"></div>Variable</div>
        </div>
    </div>

    <!-- SIDEBAR -->
    <div id="sidebar">
        <div id="sidebar-title">Node Details</div>
        <div id="node-detail">
            <div id="empty-hint">Click a node to see details</div>
        </div>
        <button id="jump-btn" class="hidden">→ Jump to code</button>
        <div id="insights">
            <h3>Top Called Functions</h3>
            <div id="top-called-list"></div>
        </div>
    </div>

</div>

<!-- TOOLTIP -->
<div id="tooltip"></div>

<script>
// ================================================================
// STATE
// ================================================================
const vscode    = acquireVsCodeApi();
let allGraphs   = null;
let metadata    = null;
let currentView = 'function_call_graph';
let selectedNode = null;

// collapsed node ids — set
const collapsedNodes = new Set();

// ================================================================
// MESSAGE FROM EXTENSION
// ================================================================
window.addEventListener('message', event => {
    const msg = event.data;
    if (msg.type === 'LOAD_GRAPHS') {
        allGraphs = msg.graphs;
        metadata  = msg.metadata;
        document.getElementById('loading').style.display = 'none';
        updateStats();
        updateInsights();
        renderGraph(currentView);
    }
});

vscode.postMessage({ type: 'READY' });

// ================================================================
// VIEW SWITCHER
// ================================================================
document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentView = btn.dataset.view;
        collapsedNodes.clear();
        renderGraph(currentView);
    });
});

// ================================================================
// STATS
// ================================================================
function updateStats() {
    if (!metadata?.summary) return;
    const s = metadata.summary;
    document.getElementById('stat-nodes').textContent     = s.total_nodes     || 0;
    document.getElementById('stat-edges').textContent     = s.total_edges     || 0;
    document.getElementById('stat-files').textContent     = s.total_files     || 0;
    document.getElementById('stat-functions').textContent = s.total_functions || 0;
    const ins = metadata.insights || {};
    document.getElementById('stat-orphans').textContent  = ins.orphan_count       || 0;
    document.getElementById('stat-circular').textContent = ins.circular_dep_count || 0;
}

// ================================================================
// INSIGHTS
// ================================================================
function updateInsights() {
    if (!metadata?.insights) return;
    const list = document.getElementById('top-called-list');
    list.innerHTML = '';
    (metadata.insights.top_called_functions || []).slice(0, 6).forEach(fn => {
        const row = document.createElement('div');
        row.className = 'insight-row';
        row.innerHTML = \`
            <div class="insight-name">\${fn.name} <span style="color:#858585">(\${fn.call_count}x)</span></div>
            <div class="insight-file">\${fn.file}</div>
        \`;
        list.appendChild(row);
    });
}

// ================================================================
// COLORS
// ================================================================
function nodeColor(type, complexity) {
    if (type === 'function') {
        if (!complexity || complexity < 3)  return '#2d6a9f';
        if (complexity < 5)                 return '#1f7a4f';
        if (complexity < 8)                 return '#7a5c1f';
        return '#7a2020';
    }
    if (type === 'class')           return '#6B3FA0';
    if (type === 'file')            return '#1f5c3a';
    if (type === 'global_variable') return '#7a6b1f';
    return '#3e3e42';
}

function nodeBorder(type, complexity) {
    if (type === 'function') {
        if (!complexity || complexity < 3)  return '#4A9EFF';
        if (complexity < 5)                 return '#51CF66';
        if (complexity < 8)                 return '#FFD43B';
        return '#FF6B6B';
    }
    if (type === 'class')           return '#c084fc';
    if (type === 'file')            return '#51CF66';
    if (type === 'global_variable') return '#FFD43B';
    return '#555';
}

// ================================================================
// BUILD TREE STRUCTURE FROM GRAPH
// ================================================================
function buildTree(graph) {
    const nodeMap  = {};
    const children = {};
    const hasParent = new Set();

    graph.nodes.forEach(n => {
        nodeMap[n.id]  = n;
        children[n.id] = [];
    });

    graph.edges.forEach(e => {
        if (children[e.from] !== undefined && nodeMap[e.to]) {
            children[e.from].push(e.to);
            hasParent.add(e.to);
        }
    });

    // roots = nodes with no parent
    const roots = graph.nodes.filter(n => !hasParent.has(n.id));

    // if no roots fallback to all nodes as roots
    const rootList = roots.length > 0 ? roots : graph.nodes.slice(0, 1);

    function buildNode(id, depth, visited) {
        if (visited.has(id)) return null;
        visited.add(id);
        const node = nodeMap[id];
        if (!node) return null;

        const childIds   = children[id] || [];
        const isCollapsed = collapsedNodes.has(id);

        return {
            id,
            node,
            depth,
            collapsed: isCollapsed,
            children:  isCollapsed ? [] : childIds.map(cid => buildNode(cid, depth + 1, new Set(visited))).filter(Boolean),
            childCount: childIds.length
        };
    }

    return rootList.map(r => buildNode(r.id, 0, new Set()));
}

// ================================================================
// LAYOUT — TOP DOWN HIERARCHICAL
// ================================================================
const NODE_W  = 160;
const NODE_H  = 44;
const GAP_X   = 24;
const GAP_Y   = 80;

function layoutTree(roots) {
    const positions = {};
    let globalX = 0;

    function measure(treeNode) {
        if (!treeNode) return 0;
        if (treeNode.children.length === 0) {
            treeNode.width = NODE_W + GAP_X;
            return treeNode.width;
        }
        let total = 0;
        treeNode.children.forEach(c => { total += measure(c); });
        treeNode.width = Math.max(total, NODE_W + GAP_X);
        return treeNode.width;
    }

    function assign(treeNode, offsetX, depth) {
        if (!treeNode) return;
        const cx = offsetX + treeNode.width / 2;
        const cy = depth * (NODE_H + GAP_Y) + 60;
        positions[treeNode.id] = { x: cx, y: cy, treeNode };

        let childX = offsetX;
        treeNode.children.forEach(c => {
            assign(c, childX, depth + 1);
            childX += c.width;
        });
    }

    roots.forEach(root => {
        if (!root) return;
        measure(root);
        assign(root, globalX, 0);
        globalX += root.width + GAP_X * 2;
    });

    return positions;
}

// ================================================================
// RENDER GRAPH
// ================================================================
function renderGraph(view) {
    if (!allGraphs) return;

    const graph = allGraphs[view] || { nodes: [], edges: [] };
    const svg   = d3.select('#graph-svg');
    svg.selectAll('*').remove();

    const W = document.getElementById('graph-container').clientWidth;
    const H = document.getElementById('graph-container').clientHeight;

    // defs — arrowhead
    const defs = svg.append('defs');
    defs.append('marker')
        .attr('id',           'arrowhead')
        .attr('viewBox',      '0 -5 10 10')
        .attr('refX',         10)
        .attr('refY',         0)
        .attr('markerWidth',  6)
        .attr('markerHeight', 6)
        .attr('orient',       'auto')
        .append('path')
        .attr('d',    'M0,-5L10,0L0,5')
        .attr('fill', '#4A9EFF')
        .attr('opacity', 0.7);

    if (graph.nodes.length === 0) {
        svg.append('text')
            .attr('x', W / 2).attr('y', H / 2)
            .attr('text-anchor', 'middle')
            .attr('fill', '#555').attr('font-size', '13px')
            .text('No data for this view');
        return;
    }

    // zoom + pan
    const zoom = d3.zoom().scaleExtent([0.1, 3]).on('zoom', e => g.attr('transform', e.transform));
    svg.call(zoom);
    const g = svg.append('g');

    // build tree and layout
    const roots     = buildTree(graph);
    const positions = layoutTree(roots);

    // collect visible edges
    const visibleIds = new Set(Object.keys(positions));
    const visibleEdges = graph.edges.filter(e => visibleIds.has(e.from) && visibleIds.has(e.to));

    // ── DRAW EDGES ──────────────────────────────────────────
    const edgeGroup = g.append('g').attr('class', 'edges');

    visibleEdges.forEach(edge => {
        const src = positions[edge.from];
        const tgt = positions[edge.to];
        if (!src || !tgt) return;

        const x1 = src.x;
        const y1 = src.y + NODE_H / 2;
        const x2 = tgt.x;
        const y2 = tgt.y - NODE_H / 2;

        // bezier curve for smooth flow
        const midY = (y1 + y2) / 2;
        const path = \`M\${x1},\${y1} C\${x1},\${midY} \${x2},\${midY} \${x2},\${y2}\`;

        edgeGroup.append('path')
            .attr('d',            path)
            .attr('class',        \`edge-line \${edge.type}\`)
            .attr('stroke-width', Math.min(1 + (edge.call_count || 1) * 0.3, 3));
    });

    // ── DRAW NODES ──────────────────────────────────────────
    const nodeGroup = g.append('g').attr('class', 'nodes');

    Object.entries(positions).forEach(([id, pos]) => {
        const { treeNode } = pos;
        const node         = treeNode.node;
        const hasChildren  = treeNode.childCount > 0;
        const isCollapsed  = treeNode.collapsed;

        const grp = nodeGroup.append('g')
            .attr('class',     'node-group')
            .attr('transform', \`translate(\${pos.x - NODE_W/2}, \${pos.y - NODE_H/2})\`)
            .style('cursor', 'pointer');

        // box background
        grp.append('rect')
            .attr('class',  'node-box')
            .attr('width',  NODE_W)
            .attr('height', NODE_H)
            .attr('rx',     8)
            .attr('ry',     8)
            .attr('fill',   nodeColor(node.type, node.complexity))
            .attr('stroke', nodeBorder(node.type, node.complexity))
            .attr('stroke-width', selectedNode?.id === id ? 2.5 : 1.5);

        // function name
        const displayName = node.name.length > 18 ? node.name.slice(0, 18) + '…' : node.name;
        grp.append('text')
            .attr('class', 'node-label')
            .attr('x', NODE_W / 2)
            .attr('y', hasChildren ? NODE_H / 2 - 6 : NODE_H / 2)
            .text(displayName);

        // file meta
        if (node.file) {
            const shortFile = node.file.split('/').pop();
            grp.append('text')
                .attr('class', 'node-meta')
                .attr('x', NODE_W / 2)
                .attr('y', NODE_H / 2 + 9)
                .text(shortFile);
        }

        // collapse / expand button
        if (hasChildren) {
            const btnX = NODE_W - 14;
            const btnY = 14;

            grp.append('circle')
                .attr('class',  'collapse-circle')
                .attr('cx',     btnX)
                .attr('cy',     btnY)
                .attr('r',      9);

            grp.append('text')
                .attr('class',          'collapse-btn')
                .attr('x',              btnX)
                .attr('y',              btnY + 1)
                .attr('text-anchor',    'middle')
                .attr('dominant-baseline', 'middle')
                .text(isCollapsed ? \`+\${treeNode.childCount}\` : '−');
        }

        // tooltip
        const tooltip = document.getElementById('tooltip');
        grp.on('mouseover', (event) => {
            tooltip.style.display = 'block';
            tooltip.innerHTML = \`
                <strong style="color:#fff">\${node.name}</strong><br>
                <span style="color:#858585">\${node.type}</span>
                \${node.complexity ? \` · complexity <strong style="color:\${nodeBorder(node.type, node.complexity)}">\${node.complexity}</strong>\` : ''}
                \${node.file ? \`<br><span style="color:#858585;font-size:10px">\${node.file}</span>\` : ''}
                \${node.loc   ? \`<br>\${node.loc} lines\` : ''}
            \`;
        })
        .on('mousemove', (event) => {
            tooltip.style.left = (event.clientX + 12) + 'px';
            tooltip.style.top  = (event.clientY - 8)  + 'px';
        })
        .on('mouseout', () => { tooltip.style.display = 'none'; });

        // click handler
        grp.on('click', (event) => {
            event.stopPropagation();

            // toggle collapse
            if (hasChildren) {
                if (collapsedNodes.has(id)) {
                    collapsedNodes.delete(id);
                } else {
                    collapsedNodes.add(id);
                }
                renderGraph(currentView);
            }

            // show details
            selectedNode = node;
            showDetail(node);

            // jump to file for leaf nodes or all nodes on click
            if (!hasChildren && node.file) {
                vscode.postMessage({
                    type: 'OPEN_FILE',
                    file: node.file,
                    line: node.line_start || 1
                });
            }
        });
    });

    // initial zoom to fit
    const allX = Object.values(positions).map(p => p.x);
    const allY = Object.values(positions).map(p => p.y);
    if (allX.length > 0) {
        const minX   = Math.min(...allX) - NODE_W;
        const maxX   = Math.max(...allX) + NODE_W;
        const minY   = Math.min(...allY) - NODE_H;
        const maxY   = Math.max(...allY) + NODE_H;
        const treeW  = maxX - minX;
        const treeH  = maxY - minY;
        const scale  = Math.min(W / treeW, H / treeH, 1) * 0.85;
        const tx     = (W - treeW * scale) / 2 - minX * scale;
        const ty     = (H - treeH * scale) / 2 - minY * scale;
        svg.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
    }
}

// ================================================================
// NODE DETAIL SIDEBAR
// ================================================================
function showDetail(node) {
    const detail = document.getElementById('node-detail');
    detail.innerHTML = '';

    const rows = [
        { label: 'Name',       value: node.name },
        { label: 'Type',       value: node.type },
        { label: 'File',       value: node.file,        link: true },
        { label: 'Lines',      value: node.line_start ? \`\${node.line_start} – \${node.line_end || node.line_start}\` : null },
        { label: 'LOC',        value: node.loc },
        { label: 'Complexity', value: node.complexity,  color: node.complexity ? nodeBorder('function', node.complexity) : null },
        { label: 'Async',      value: node.is_async === true ? 'yes' : null },
        { label: 'Class',      value: node.parent_class },
        { label: 'Params',     value: (node.parameters || []).length ? node.parameters.join(', ') : null },
        { label: 'Methods',    value: (node.methods || []).length    ? node.methods.join(', ')    : null },
        { label: 'Inherits',   value: (node.inherits || []).length   ? node.inherits.join(', ')   : null },
        { label: 'Language',   value: node.language },
    ];

    rows.forEach(row => {
        if (row.value === null || row.value === undefined || row.value === '') return;
        const div   = document.createElement('div');
        div.className = 'detail-row';
        const lbl   = document.createElement('div');
        lbl.className   = 'detail-label';
        lbl.textContent = row.label;
        const val   = document.createElement('div');
        val.className   = row.link ? 'detail-value link' : 'detail-value';
        val.textContent = String(row.value);
        if (row.color) val.style.color = row.color;
        if (row.link && node.file) {
            val.addEventListener('click', () => {
                vscode.postMessage({ type: 'OPEN_FILE', file: node.file, line: node.line_start || 1 });
            });
        }
        div.appendChild(lbl);
        div.appendChild(val);
        detail.appendChild(div);
    });

    // jump button
    const btn = document.getElementById('jump-btn');
    if (node.file && node.line_start) {
        btn.classList.remove('hidden');
        btn.onclick = () => {
            vscode.postMessage({ type: 'OPEN_FILE', file: node.file, line: node.line_start });
        };
    } else {
        btn.classList.add('hidden');
    }
}

// click background → deselect
document.getElementById('graph-svg').addEventListener('click', () => {
    selectedNode = null;
    document.getElementById('node-detail').innerHTML = '<div id="empty-hint">Click a node to see details</div>';
    document.getElementById('jump-btn').classList.add('hidden');
});
</script>
</body>
</html>`;
}
// ```

// ---

// Compile and test. You should see:
// ```
// → top-down flow diagram with rounded boxes
// → click any node with children → collapses, shows +N count
// → click again → expands back
// → click leaf node → opens file + shows details
// → bezier curve arrows flowing top to bottom
// → complexity color coded boxes (blue → green → yellow → red)