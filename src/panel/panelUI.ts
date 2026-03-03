export function getPanelHTML(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8"/>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https://unpkg.com; script-src 'unsafe-inline' 'unsafe-eval' https://unpkg.com; font-src https://unpkg.com; img-src 'self' data: https:;">
    <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: var(--vscode-font-family);
            font-size: 13px;
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            overflow-x: hidden;
        }

        /* ── Header ── */
        .header {
            padding: 16px 20px 0;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .header h1 {
            font-size: 16px;
            font-weight: 700;
            letter-spacing: -0.3px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .header h1 span { opacity: 0.5; font-weight: 400; font-size: 12px; }

        /* ── Tabs ── */
        .tabs {
            display: flex;
            gap: 0;
            margin-top: 12px;
        }
        .tab {
            padding: 8px 16px;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            border-bottom: 2px solid transparent;
            color: var(--vscode-descriptionForeground);
            transition: all 0.15s;
        }
        .tab:hover { color: var(--vscode-foreground); }
        .tab.active {
            color: var(--vscode-foreground);
            border-bottom-color: var(--vscode-focusBorder);
        }

        /* ── Content ── */
        .content { padding: 20px; }
        .view { display: none; }
        .view.active { display: block; }

        /* ── Pipeline cards ── */
        .pipeline-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
            margin-bottom: 16px;
        }
        .pipe-card {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 14px 16px;
            position: relative;
            overflow: hidden;
        }
        .pipe-card.complete { border-color: var(--vscode-charts-green); }
        .pipe-card.running { border-color: var(--vscode-charts-yellow); }
        .pipe-card .layer-num {
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 4px;
        }
        .pipe-card .layer-title {
            font-size: 13px;
            font-weight: 600;
            margin-bottom: 2px;
        }
        .pipe-card .layer-desc {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 10px;
        }
        .pipe-card .layer-status {
            font-size: 11px;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .pipe-card .layer-status .dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: var(--vscode-descriptionForeground);
        }
        .pipe-card.complete .dot { background: var(--vscode-charts-green); }
        .pipe-card.running .dot { background: var(--vscode-charts-yellow); animation: pulse 1s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

        .pipe-card button {
            position: absolute;
            top: 14px;
            right: 14px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            padding: 4px 12px;
            font-size: 11px;
            cursor: pointer;
        }
        .pipe-card button:hover { background: var(--vscode-button-hoverBackground); }
        .pipe-card button:disabled { opacity: 0.4; cursor: default; }

        .run-all-btn {
            width: 100%;
            padding: 10px;
            font-size: 12px;
            font-weight: 600;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 6px;
            cursor: pointer;
            margin-top: 6px;
        }
        .run-all-btn:hover { background: var(--vscode-button-hoverBackground); }

        /* ── Stats row ── */
        .stats-row {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 10px;
            margin-bottom: 20px;
        }
        .stat-card {
            background: var(--vscode-input-background);
            border-radius: 8px;
            padding: 12px 14px;
            text-align: center;
        }
        .stat-card .stat-val {
            font-size: 22px;
            font-weight: 700;
            color: var(--vscode-foreground);
        }
        .stat-card .stat-label {
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--vscode-descriptionForeground);
            margin-top: 2px;
        }

        /* ── Table ── */
        .data-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
        }
        .data-table th {
            text-align: left;
            padding: 8px 10px;
            font-weight: 600;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.3px;
            color: var(--vscode-descriptionForeground);
            border-bottom: 1px solid var(--vscode-panel-border);
            cursor: pointer;
        }
        .data-table th:hover { color: var(--vscode-foreground); }
        .data-table td {
            padding: 6px 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .data-table tr:hover { background: var(--vscode-list-hoverBackground); }

        .tag {
            display: inline-block;
            font-size: 10px;
            padding: 1px 6px;
            border-radius: 3px;
            font-weight: 600;
        }
        .tag.fn { background: #2a4365; color: #90cdf4; }
        .tag.class { background: #553c9a; color: #d6bcfa; }
        .tag.iface { background: #234e52; color: #81e6d9; }
        .tag.method { background: #63171b; color: #feb2b2; }
        .tag.hot { background: #c53030; color: #fff; }
        .tag.stale { background: #718096; color: #fff; }

        /* ── Complexity bars ── */
        .complexity-bar {
            height: 6px;
            border-radius: 3px;
            background: var(--vscode-panel-border);
            overflow: hidden;
        }
        .complexity-bar .fill {
            height: 100%;
            border-radius: 3px;
            transition: width 0.3s;
        }
        .fill.low { background: var(--vscode-charts-green); }
        .fill.med { background: var(--vscode-charts-yellow); }
        .fill.high { background: var(--vscode-charts-orange, #e07c3e); }
        .fill.vhigh { background: var(--vscode-charts-red, #d94040); }

        /* ── Search ── */
        .search-box {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid var(--vscode-input-border);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 4px;
            font-size: 12px;
            margin-bottom: 12px;
        }
        .search-box::placeholder { color: var(--vscode-input-placeholderForeground); }

        /* ── No data ── */
        .no-data {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            padding: 40px;
            text-align: center;
        }

        /* ── Scroll ── */
        .scroll-box { max-height: 500px; overflow-y: auto; }

        /* ── Commit list ── */
        .commit-item {
            padding: 8px 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            gap: 12px;
            align-items: flex-start;
        }
        .commit-item:hover { background: var(--vscode-list-hoverBackground); }
        .commit-hash {
            font-family: var(--vscode-editor-font-family);
            font-size: 11px;
            color: var(--vscode-textLink-foreground);
            flex-shrink: 0;
        }
        .commit-msg { font-size: 12px; flex: 1; }
        .commit-meta {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            flex-shrink: 0;
            text-align: right;
        }

        /* ── Section title ── */
        .section-title {
            font-size: 13px;
            font-weight: 600;
            margin-bottom: 10px;
            margin-top: 20px;
        }
        .section-title:first-child { margin-top: 0; }

        /* ── Graph Container ── */
        #graph-container {
            width: 100%;
            height: 600px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            background-color: var(--vscode-editor-background);
            margin-bottom: 20px;
        }

        /* ── Chat Assistant ── */
        .chat-container {
            display: flex;
            flex-direction: column;
            height: calc(100vh - 120px);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            background: var(--vscode-editor-background);
        }
        .chat-history {
            flex: 1;
            padding: 16px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .chat-bubble {
            max-width: 85%;
            padding: 10px 14px;
            border-radius: 6px;
            font-size: 13px;
            line-height: 1.5;
            white-space: pre-wrap;
        }
        .chat-bubble.user {
            align-self: flex-end;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .chat-bubble.ai {
            align-self: flex-start;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-panel-border);
        }
        .chat-input-area {
            display: flex;
            padding: 12px;
            border-top: 1px solid var(--vscode-panel-border);
            gap: 8px;
        }
        .chat-input {
            flex: 1;
            padding: 10px;
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            resize: none;
            font-family: var(--vscode-font-family);
        }
        .chat-send {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            padding: 0 16px;
            cursor: pointer;
            font-weight: 600;
        }
        .chat-send:hover { background: var(--vscode-button-hoverBackground); }
        .chat-disabled { opacity: 0.5; pointer-events: none; }
        
    </style>
</head>
<body>

<div class="header">
    <h1>AIL <span>Architectural Intelligence Layer</span></h1>
    <div class="tabs">
        <div class="tab active" onclick="switchTab('pipeline', this)">Pipeline</div>
        <div class="tab" onclick="switchTab('entities', this)">Entities</div>
        <div class="tab" onclick="switchTab('complexity', this)">Risk</div>
        <div class="tab" onclick="switchTab('git', this)">Git Intel</div>
        <div class="tab" onclick="switchTab('graph', this)">Graph</div>
        <div class="tab" onclick="switchTab('assistant', this)">Assistant ✨</div>
    </div>
</div>

<div class="content">
    <!-- ═══ PIPELINE TAB ═══ -->
    <div class="view active" id="view-pipeline">
        <div class="pipeline-grid">
            <div class="pipe-card" id="pipe-1">
                <div class="layer-num">Layer 1</div>
                <div class="layer-title">Repository Ingestion</div>
                <div class="layer-desc">Languages · Frameworks · Entry points · Metrics</div>
                <div class="layer-status"><div class="dot"></div><span id="pstatus-1">not started</span></div>
                <button id="pbtn-1" onclick="runPipeline(1)">Run</button>
            </div>
            <div class="pipe-card" id="pipe-2">
                <div class="layer-num">Layer 2</div>
                <div class="layer-title">AST Analysis</div>
                <div class="layer-desc">Entities · Call graph · Relationships · Complexity</div>
                <div class="layer-status"><div class="dot"></div><span id="pstatus-2">waiting</span></div>
                <button id="pbtn-2" onclick="runPipeline(2)" disabled>Run</button>
            </div>
            <div class="pipe-card" id="pipe-3">
                <div class="layer-num">Layer 3</div>
                <div class="layer-title">Git Intelligence</div>
                <div class="layer-desc">Commits · Contributors · File churn</div>
                <div class="layer-status"><div class="dot"></div><span id="pstatus-3">waiting</span></div>
                <button id="pbtn-3" onclick="runPipeline(3)" disabled>Run</button>
            </div>
            <div class="pipe-card" id="pipe-4">
                <div class="layer-num">Layer 4</div>
                <div class="layer-title">Knowledge Graph</div>
                <div class="layer-desc">Unified graph · Architecture summary</div>
                <div class="layer-status"><div class="dot"></div><span id="pstatus-4">waiting</span></div>
                <button id="pbtn-4" onclick="runPipeline(4)" disabled>Run</button>
            </div>
            <div class="pipe-card" id="pipe-5">
                <div class="layer-num">Layer 5</div>
                <div class="layer-title">GraphRAG Search</div>
                <div class="layer-desc">Semantic nodes · Edge traversal</div>
                <div class="layer-status"><div class="dot"></div><span id="pstatus-5">waiting</span></div>
                <button id="pbtn-5" onclick="runPipeline(5)" disabled>Run</button>
            </div>
        </div>
        <div style="display: flex; gap: 10px; margin-top: 6px;">
            <button class="run-all-btn" style="flex: 2;" onclick="runAllPipeline()">Run Full Pipeline</button>
            <button class="run-all-btn" style="flex: 1; background: var(--vscode-errorForeground);" onclick="purgeCache()">Purge Cache</button>
        </div>

        <div id="overview-stats" style="margin-top: 20px;"></div>
    </div>

    <!-- ═══ ENTITIES TAB ═══ -->
    <div class="view" id="view-entities">
        <input class="search-box" id="entity-search" placeholder="Search entities..." oninput="filterEntities()"/>
        <div id="entity-stats" class="stats-row"></div>
        <div class="scroll-box">
            <table class="data-table" id="entity-table">
                <thead><tr>
                    <th onclick="sortEntities('name')">Name</th>
                    <th onclick="sortEntities('type')">Type</th>
                    <th onclick="sortEntities('file')">File</th>
                    <th onclick="sortEntities('line')">Line</th>
                    <th>Exported</th>
                </tr></thead>
                <tbody id="entity-tbody"></tbody>
            </table>
        </div>
        <div class="no-data" id="entities-empty">Run Layer 2 to see entities</div>
    </div>

    <!-- ═══ RISK TAB ═══ -->
    <div class="view" id="view-complexity">
        <div id="complexity-stats" class="stats-row"></div>
        <div class="section-title">Risk Priority Index (RPI) Leaderboard</div>
        <div style="font-size: 11px; color: var(--vscode-descriptionForeground); margin-bottom: 10px;">RPI = 0.4 x complexity + 0.4 x churn + 0.2 x coupling. Higher = more dangerous.</div>
        <div class="scroll-box">
            <table class="data-table" id="complexity-table">
                <thead><tr>
                    <th>Function</th>
                    <th>File</th>
                    <th>RPI</th>
                    <th>Risk</th>
                    <th>Complexity</th>
                    <th>Churn</th>
                    <th>Visual</th>
                </tr></thead>
                <tbody id="complexity-tbody"></tbody>
            </table>
        </div>
        <div class="no-data" id="complexity-empty">Run Layers 1-4 to see risk analysis</div>
    </div>

    <!-- ═══ GIT TAB ═══ -->
    <div class="view" id="view-git">
        <div id="git-stats" class="stats-row"></div>
        <div class="section-title">Recent Commits</div>
        <div class="scroll-box" id="commit-list" style="max-height: 300px;"></div>
        <div class="section-title">Hot Files (Most Churned)</div>
        <div class="scroll-box">
            <table class="data-table" id="churn-table">
                <thead><tr>
                    <th>File</th>
                    <th>Commits</th>
                    <th>+/-</th>
                    <th>Status</th>
                </tr></thead>
                <tbody id="churn-tbody"></tbody>
            </table>
        </div>
        <div class="no-data" id="git-empty">Run Layer 3 to see git intelligence</div>
        <div class="section-title" style="margin-top: 20px;">Blast Radius</div>
        <div id="blast-radius-container" style="font-size: 12px;"></div>
        <div class="section-title" style="margin-top: 20px;">Tightly Coupled Files</div>
        <div id="coupling-container" style="font-size: 12px;"></div>
    </div>

    <!-- ═══ GRAPH TAB ═══ -->
    <div class="view" id="view-graph">
        <div id="graph-stats" class="stats-row"></div>
        <div style="display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap;">
            <button class="run-all-btn" style="margin-top:0;" onclick="setGraphView('overall')">Overall</button>
            <button class="run-all-btn" style="margin-top:0; background: var(--vscode-charts-purple);" onclick="setGraphView('entry_exit')">Entry / Exit</button>
            <button class="run-all-btn" style="margin-top:0; background: #c62828;" onclick="setGraphView('risk_heatmap')">Risk Heatmap</button>
            <button class="run-all-btn" style="margin-top:0; background: #1565c0;" onclick="setGraphView('coupling')">Coupling Clusters</button>
        </div>
        <div id="graph-container"></div>
        <div class="section-title">Node Context / Architecture Summary</div>
        <div id="arch-summary" style="white-space: pre-wrap; font-size: 12px; line-height: 1.6; padding: 12px; background: var(--vscode-input-background); border-radius: 6px; max-height: 500px; overflow-y: auto;"></div>
        <div class="no-data" id="graph-empty">Run Layer 4 to see the knowledge graph</div>
    </div>

    <!-- ═══ ASSISTANT TAB ═══ -->
    <div class="view" id="view-assistant">
        <div class="chat-container">
            <div class="chat-history" id="chat-history">
                <div class="chat-bubble ai">Hello! I am AIL, your architectural intelligence assistant. Ask me anything about this codebase and I will query the GraphRAG engine!</div>
            </div>
            <div class="chat-input-area" id="chat-controls">
                <textarea id="chat-input" class="chat-input" rows="2" placeholder="Ask about architecture, routing, or specific components..." onkeydown="handleChatKey(event)"></textarea>
                <button class="chat-send" onclick="sendChat()">Send</button>
            </div>
        </div>
    </div>
</div>

<script>
    const vscode = acquireVsCodeApi();
    let dashData = {};
    let entitySortField = 'name';
    let entitySortAsc = true;
    const pipeState = [null, 'idle', 'locked', 'locked', 'locked', 'locked'];

    function switchTab(name, target) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        if (target) {
            target.classList.add('active');
        } else if (typeof event !== 'undefined' && event && event.target) {
            event.target.classList.add('active');
        }
        document.getElementById('view-' + name).classList.add('active');
        if (name !== 'pipeline') { vscode.postMessage({ command: 'requestData' }); }
    }

    function runPipeline(n) {
        console.log('[AIL-UI] runPipeline called for layer', n, 'state:', pipeState[n]);
        if (pipeState[n] === 'running' || pipeState[n] === 'locked') {
            console.log('[AIL-UI] Blocked — state is', pipeState[n]);
            return;
        }
        pipeState[n] = 'running';
        updatePipeCard(n);
        console.log('[AIL-UI] posting message runLayer' + n);
        vscode.postMessage({ command: 'runLayer' + n });
    }

    function runAllPipeline() {
        console.log('[AIL-UI] runAllPipeline called');
        for (let i = 1; i <= 5; i++) {
            if (pipeState[i] !== 'locked') {
                pipeState[i] = 'idle';
                updatePipeCard(i);
            }
        }
        runPipeline(1);
    }

    function purgeCache() {
        console.log('[AIL-UI] purgeCache called');
        for (let i = 1; i <= 5; i++) {
            pipeState[i] = 'idle';
            updatePipeCard(i);
        }
        vscode.postMessage({ command: 'purgeData' });
    }

    function updatePipeCard(n) {
        const card = document.getElementById('pipe-' + n);
        const btn = document.getElementById('pbtn-' + n);
        const status = document.getElementById('pstatus-' + n);
        card.className = 'pipe-card ' + (pipeState[n] === 'complete' ? 'complete' : pipeState[n] === 'running' ? 'running' : '');
        btn.disabled = pipeState[n] === 'running' || pipeState[n] === 'locked';
        btn.textContent = pipeState[n] === 'complete' ? 'Re-run' : pipeState[n] === 'running' ? '...' : 'Run';
        status.textContent = pipeState[n] === 'complete' ? '✓ complete' : pipeState[n] === 'running' ? 'running...' : pipeState[n] === 'idle' ? 'ready' : 'waiting';
    }

    function markLayerComplete(n) {
        pipeState[n] = 'complete';
        updatePipeCard(n);
        if (n < 5) {
            pipeState[n + 1] = 'idle';
            updatePipeCard(n + 1);
        }
        // Auto-continue pipeline
        setTimeout(() => {
            for (let i = n + 1; i <= 5; i++) {
                if (pipeState[i] === 'idle') { runPipeline(i); return; }
            }
            // All done — refresh data
            vscode.postMessage({ command: 'requestData' });
        }, 300);
    }

    // ── Render functions ──
    function renderOverview() {
        const el = document.getElementById('overview-stats');
        const l1 = dashData.l1_manifest;
        const l2 = dashData.l2_manifest;
        const l3 = dashData.l3_manifest;
        const l4 = dashData.l4_manifest;
        if (!l1 && !l2) { el.innerHTML = ''; return; }

        let html = '<div class="stats-row">';
        if (l1) {
            const langs = l1.languages?.languages?.length || 0;
            const files = l1.metrics?.totalFiles || 0;
            html += statCard(files, 'Files') + statCard(langs, 'Languages');
        }
        if (l2?.summary) {
            html += statCard(l2.summary.totalEntities, 'Entities');
            html += statCard(l2.summary.totalCallEdges, 'Call Edges');
        }
        if (l3?.summary) {
            html += statCard(l3.summary.totalCommits, 'Commits');
            html += statCard(l3.summary.totalContributors, 'Contributors');
        }
        if (l4?.stats) {
            html += statCard(l4.stats.totalNodes, 'Graph Nodes');
            html += statCard(l4.stats.totalEdges, 'Graph Edges');
        }
        html += '</div>';
        el.innerHTML = html;
    }

    function statCard(val, label) {
        return '<div class="stat-card"><div class="stat-val">' + (val || 0) + '</div><div class="stat-label">' + label + '</div></div>';
    }

    function renderEntities() {
        const data = dashData.l2_entities;
        if (!data || !data.entities?.length) {
            document.getElementById('entities-empty').style.display = 'block';
            document.getElementById('entity-table').style.display = 'none';
            document.getElementById('entity-stats').innerHTML = '';
            return;
        }
        document.getElementById('entities-empty').style.display = 'none';
        document.getElementById('entity-table').style.display = '';

        const bt = data.byType || {};
        document.getElementById('entity-stats').innerHTML = '<div class="stats-row">'
            + Object.entries(bt).map(([t, c]) => statCard(c, t)).join('')
            + '</div>';

        renderEntityTable(data.entities);
    }

    function renderEntityTable(entities) {
        const search = (document.getElementById('entity-search')).value.toLowerCase();
        let filtered = entities.filter(e => {
            if (!search) return true;
            return e.name.toLowerCase().includes(search) || e.file.toLowerCase().includes(search) || e.type.includes(search);
        });

        filtered.sort((a, b) => {
            const va = a[entitySortField] || '';
            const vb = b[entitySortField] || '';
            const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb));
            return entitySortAsc ? cmp : -cmp;
        });

        const tbody = document.getElementById('entity-tbody');
        tbody.innerHTML = filtered.slice(0, 200).map(e => {
            const tagClass = e.type === 'function' ? 'fn' : e.type === 'class' ? 'class' : e.type === 'interface' ? 'iface' : 'method';
            return '<tr>'
                + '<td><strong>' + esc(e.name) + '</strong></td>'
                + '<td><span class="tag ' + tagClass + '">' + e.type + '</span></td>'
                + '<td>' + esc(e.file) + '</td>'
                + '<td>' + e.startLine + '</td>'
                + '<td>' + (e.exported ? '✓' : '') + '</td>'
                + '</tr>';
        }).join('');
    }

    function filterEntities() {
        if (dashData.l2_entities?.entities) renderEntityTable(dashData.l2_entities.entities);
    }

    let commitSortField = 'date';
    let commitSortAsc = false;
    function sortCommits(field) {
        if (commitSortField === field) commitSortAsc = !commitSortAsc;
        else { commitSortField = field; commitSortAsc = field === 'date' ? false : false; }
        if (dashData.l3_commits?.commits) renderGit();
    }

    function sortEntities(field) {
        if (entitySortField === field) entitySortAsc = !entitySortAsc;
        else { entitySortField = field; entitySortAsc = true; }
        if (dashData.l2_entities?.entities) renderEntityTable(dashData.l2_entities.entities);
    }

    function renderComplexity() {
        // Now renders RPI-based Risk leaderboard from graph data
        const graph = dashData.l4_graph;
        if (!graph || !graph.nodes) {
            // Fallback to old complexity data
            const data = dashData.l2_complexity;
            if (!data || !data.functions?.length) {
                document.getElementById('complexity-empty').style.display = 'block';
                document.getElementById('complexity-table').style.display = 'none';
                document.getElementById('complexity-stats').innerHTML = '';
                return;
            }
            document.getElementById('complexity-empty').style.display = 'none';
            document.getElementById('complexity-table').style.display = '';
            document.getElementById('complexity-stats').innerHTML =
                statCard(data.totalFunctions, 'Functions')
                + statCard(data.avgCyclomatic, 'Avg Complexity')
                + statCard(data.complexFunctions?.length || 0, 'Complex (>10)');
            const tbody = document.getElementById('complexity-tbody');
            tbody.innerHTML = data.functions.slice(0, 100).map(function(f) {
                const pct = Math.min(100, (f.cyclomatic / 25) * 100);
                const cls = f.cyclomatic <= 5 ? 'low' : f.cyclomatic <= 10 ? 'med' : 'high';
                return '<tr>'
                    + '<td><strong>' + esc(f.entityName) + '</strong></td>'
                    + '<td>' + esc(f.file) + '</td>'
                    + '<td>' + f.cyclomatic + '</td>'
                    + '<td>-</td><td>' + f.cyclomatic + '</td><td>0</td>'
                    + '<td style="min-width:80px"><div class="complexity-bar"><div class="fill ' + cls + '" style="width:' + pct + '%"></div></div></td>'
                    + '</tr>';
            }).join('');
            return;
        }

        // RPI-based Risk tab
        var riskNodes = graph.nodes.filter(function(n) {
            return (n.type === 'function' || n.type === 'method') && n.metadata && typeof n.metadata.riskScore === 'number';
        });
        riskNodes.sort(function(a, b) { return (b.metadata.riskScore || 0) - (a.metadata.riskScore || 0); });

        if (riskNodes.length === 0) {
            document.getElementById('complexity-empty').style.display = 'block';
            document.getElementById('complexity-table').style.display = 'none';
            document.getElementById('complexity-stats').innerHTML = '';
            return;
        }

        document.getElementById('complexity-empty').style.display = 'none';
        document.getElementById('complexity-table').style.display = '';

        var critical = riskNodes.filter(function(n) { return n.metadata.riskLevel === 'critical'; }).length;
        var high = riskNodes.filter(function(n) { return n.metadata.riskLevel === 'high'; }).length;
        var medium = riskNodes.filter(function(n) { return n.metadata.riskLevel === 'medium'; }).length;

        document.getElementById('complexity-stats').innerHTML =
            statCard(riskNodes.length, 'Scored Functions')
            + statCard(critical, 'Critical')
            + statCard(high, 'High Risk')
            + statCard(medium, 'Medium');

        var tbody = document.getElementById('complexity-tbody');
        tbody.innerHTML = riskNodes.slice(0, 100).map(function(n) {
            var rpi = n.metadata.riskScore || 0;
            var pct = Math.min(100, rpi * 100);
            var cls = rpi >= 0.75 ? 'vhigh' : rpi >= 0.5 ? 'high' : rpi >= 0.25 ? 'med' : 'low';
            var levelTag = '<span class="tag ' + (n.metadata.riskLevel === 'critical' ? 'hot' : n.metadata.riskLevel === 'high' ? 'hot' : n.metadata.riskLevel === 'medium' ? 'stale' : '') + '">' + (n.metadata.riskLevel || 'low').toUpperCase() + '</span>';
            return '<tr>'
                + '<td><strong>' + esc(n.name) + '</strong></td>'
                + '<td>' + esc(n.file || '') + '</td>'
                + '<td><strong>' + rpi.toFixed(3) + '</strong></td>'
                + '<td>' + levelTag + '</td>'
                + '<td>' + (n.metadata.complexity || 0) + '</td>'
                + '<td>' + (n.metadata.fileChurn || 0) + '</td>'
                + '<td style="min-width:80px"><div class="complexity-bar"><div class="fill ' + cls + '" style="width:' + pct + '%"></div></div></td>'
                + '</tr>';
        }).join('');
    }

    function renderGit() {
        const commits = dashData.l3_commits;
        const contribs = dashData.l3_contributors;
        const churn = dashData.l3_churn;

        if (!commits && !churn) {
            document.getElementById('git-empty').style.display = 'block';
            document.getElementById('commit-list').innerHTML = '';
            document.getElementById('churn-tbody').innerHTML = '';
            document.getElementById('git-stats').innerHTML = '';
            return;
        }
        document.getElementById('git-empty').style.display = 'none';

        // Stats
        document.getElementById('git-stats').innerHTML =
            statCard(commits?.totalCommits || 0, 'Commits')
            + statCard(contribs?.totalContributors || 0, 'Contributors')
            + statCard(churn?.hotFiles?.length || 0, 'Hot Files')
            + statCard(churn?.staleFiles?.length || 0, 'Stale Files');

        // Recent commits
        const cl = document.getElementById('commit-list');
        if (commits?.commits?.length) {
            
            let sortedCommits = [...commits.commits];
            sortedCommits.sort((a, b) => {
                let va, vb;
                if (commitSortField === 'date') {
                    va = new Date(a.date).getTime();
                    vb = new Date(b.date).getTime();
                } else if (commitSortField === 'impact') {
                    va = a.filesChanged || 0;
                    vb = b.filesChanged || 0;
                }
                const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb));
                return commitSortAsc ? cmp : -cmp; // Default desc
            });

            cl.innerHTML = sortedCommits.slice(0, 50).map(c => {
                const date = c.date ? new Date(c.date).toLocaleDateString() : '';
                return '<div class="commit-item">'
                    + '<span class="commit-hash">' + c.hash.slice(0, 7) + '</span>'
                    + '<span class="commit-msg">' + esc(c.message) + '</span>'
                    + '<span class="commit-meta">'
                        + esc(c.author) + '<br>'
                        + date + ' &bull; <span>' + (c.filesChanged || 0) + ' files</span> &bull; <span style="color: var(--vscode-charts-green)">+' + (c.insertions || 0) + '</span> <span style="color: var(--vscode-charts-red)">-' + (c.deletions || 0) + '</span>'
                    + '</span>'
                    + '</div>';
            }).join('');
        }

        // Churn table
        const ct = document.getElementById('churn-tbody');
        if (churn?.files?.length) {
            ct.innerHTML = churn.files.slice(0, 50).map(f => {
                const status = f.isHot ? '<span class="tag hot">HOT</span>' : f.isStale ? '<span class="tag stale">STALE</span>' : '';
                return '<tr>'
                    + '<td>' + esc(f.file) + '</td>'
                    + '<td>' + f.commits + '</td>'
                    + '<td style="color: var(--vscode-charts-green)">+' + f.insertions + '</td>'
                    + '<td>' + status + '</td>'
                    + '</tr>';
            }).join('');
        }

        // Blast radius section
        var blastContainer = document.getElementById('blast-radius-container');
        if (dashData.l3_blast && blastContainer) {
            var blast = dashData.l3_blast;
            var html = '<div style="padding: 10px; background: var(--vscode-input-background); border-radius: 6px;">';
            html += '<div style="margin-bottom:8px;"><strong>Average blast radius:</strong> ' + (blast.avgBlastRadius || 0) + ' files/commit</div>';
            if (blast.maxBlastRadius) {
                var max = blast.maxBlastRadius;
                html += '<div style="margin-bottom:8px;"><strong>Highest impact:</strong> ' + (max.hash || '').slice(0, 7) + ' by ' + esc(max.author || '') + '</div>';
                html += '<div style="color:#aaa;">' + (max.directCount || 0) + ' files changed, ' + (max.transitiveCount || 0) + ' downstream impacted</div>';
                if (max.message) html += '<div style="font-style:italic; color:#888; margin-top:4px;">"' + esc(max.message) + '"</div>';
            }
            if (blast.highImpactCommits && blast.highImpactCommits.length > 0) {
                html += '<div style="margin-top: 10px;"><strong>High-impact commits:</strong></div>';
                blast.highImpactCommits.slice(0, 5).forEach(function(c) {
                    html += '<div style="padding:4px 0; border-bottom:1px solid var(--vscode-panel-border);">';
                    html += '<span style="color:var(--vscode-charts-yellow);">' + (c.hash || '').slice(0, 7) + '</span> ';
                    html += esc(c.message || '') + ' - blast: ' + c.blastRadius + ' (' + c.directCount + ' direct + ' + c.transitiveCount + ' transitive)';
                    html += '</div>';
                });
            }
            html += '</div>';
            blastContainer.innerHTML = html;
        }

        // Coupling section
        var couplingContainer = document.getElementById('coupling-container');
        if (dashData.l3_coupling && couplingContainer) {
            var coupling = dashData.l3_coupling;
            if (coupling.stronglyCoupled && coupling.stronglyCoupled.length > 0) {
                var chtml = '<div style="padding: 10px; background: var(--vscode-input-background); border-radius: 6px;">';
                coupling.stronglyCoupled.slice(0, 10).forEach(function(p) {
                    var pct = (p.couplingStrength * 100).toFixed(0);
                    var color = p.couplingStrength > 0.8 ? 'var(--vscode-charts-red)' : p.couplingStrength > 0.5 ? 'var(--vscode-charts-yellow)' : 'var(--vscode-charts-green)';
                    chtml += '<div style="padding:6px 0; border-bottom:1px solid var(--vscode-panel-border); display:flex; justify-content:space-between;">';
                    chtml += '<span>' + esc(p.fileA) + ' &harr; ' + esc(p.fileB) + '</span>';
                    chtml += '<span style="color:' + color + '; font-weight:bold;">' + pct + '%</span>';
                    chtml += '</div>';
                });
                chtml += '</div>';
                couplingContainer.innerHTML = chtml;
            } else {
                couplingContainer.innerHTML = '<div style="color:#888; font-style:italic;">No strongly coupled file pairs detected.</div>';
            }
        }
    }

    let network = null;
    let visNodes = null;
    let visEdges = null;

    function renderGraph() {
        const graph = dashData.l4_graph;
        const summary = dashData.l4_summary;

        if (!graph && !summary) {
            document.getElementById('graph-empty').style.display = 'block';
            document.getElementById('graph-stats').innerHTML = '';
            document.getElementById('arch-summary').textContent = '';
            document.getElementById('graph-container').style.display = 'none';
            return;
        }
        document.getElementById('graph-empty').style.display = 'none';
        document.getElementById('graph-container').style.display = 'block';

        if (graph?.stats) {
            const s = graph.stats;
            document.getElementById('graph-stats').innerHTML =
                statCard(s.totalNodes, 'Nodes')
                + statCard(s.totalEdges, 'Edges')
                + Object.entries(s.nodesByType || {}).map(([t, c]) => statCard(c, t + 's')).join('');
        }

        if (summary?.markdownReport) {
            document.getElementById('arch-summary').textContent = summary.markdownReport;
        }

        if (graph?.nodes && graph?.edges) {
            // Compute in/out degrees for entry/exit views
            const inDegree = {};
            const outDegree = {};
            graph.nodes.forEach(n => { inDegree[n.id] = 0; outDegree[n.id] = 0; });
            graph.edges.forEach(e => {
                if(outDegree[e.source] !== undefined) outDegree[e.source]++;
                if(inDegree[e.target] !== undefined) inDegree[e.target]++;
            });

            // Render interactive graph
            const colors = {
                file: '#2B5B84',
                function: '#8B4513',
                class: '#4B0082',
                method: '#006400',
                module: '#A0522D',
                interface: '#2F4F4F'
            };

            if (!visNodes) visNodes = new vis.DataSet();
            if (!visEdges) visEdges = new vis.DataSet();

            visNodes.clear();
            const nodeIds = new Set();
            visNodes.add(graph.nodes.filter(n => {
                if (nodeIds.has(n.id)) return false;
                nodeIds.add(n.id);
                return true;
            }).map(n => ({
                id: n.id,
                label: esc(n.name),
                group: n.type,
                title: 'Type: ' + esc(n.type) + (n.metadata?.churnScore ? '<br>Churn: ' + esc(n.metadata.churnScore) : ''),
                color: { background: colors[n.type] || '#555', border: '#111' },
                font: { color: '#ffffff', size: 12 },
                shape: n.type === 'file' ? 'box' : 'dot',
                size: n.type === 'file' ? undefined : 15
            })));

            visEdges.clear();
            const edgeIds = new Set();
            visEdges.add(graph.edges.filter(e => {
                const id = e.source + '->' + e.target;
                if (edgeIds.has(id)) return false;
                edgeIds.add(id);
                return true;
            }).map(e => ({
                id: e.source + '->' + e.target,
                from: e.source,
                to: e.target,
                label: esc(e.type),
                arrows: 'to',
                font: { size: 10, align: 'horizontal', color: '#888' },
                color: { color: '#444', highlight: '#888' },
                width: e.weight > 1 ? Math.min(e.weight, 5) : 1
            })));

            // Redefine setGraphView globally
            window.setGraphView = function(mode) {
                // ... logic moved below ...
                applyGraphView(mode);
            };
            if (!network) {
                const container = document.getElementById('graph-container');
                const data = { nodes: visNodes, edges: visEdges };
                const options = {
                    interaction: { hover: true, navigationButtons: true, zoomView: true },
                    physics: {
                        solver: 'forceAtlas2Based',
                        forceAtlas2Based: {
                            gravitationalConstant: -50,
                            centralGravity: 0.01,
                            springLength: 100,
                            springConstant: 0.08
                        }
                    }
                };
                network = new vis.Network(container, data, options);

                network.on("click", function (params) {
                    if (params.nodes.length > 0) {
                        const nodeId = params.nodes[0];
                        const connectedNodes = network.getConnectedNodes(nodeId);
                        const connectedEdges = network.getConnectedEdges(nodeId);

                        const allNodes = visNodes.get();
                        const updateNodes = allNodes.map(n => {
                            if (n.id === nodeId || connectedNodes.includes(n.id)) {
                                return { id: n.id, color: { opacity: 1 }, font: { color: 'rgba(255,255,255,1)' } };
                            } else {
                                return { id: n.id, color: { opacity: 0.1 }, font: { color: 'rgba(255,255,255,0.1)' } };
                            }
                        });

                        const allEdges = visEdges.get();
                        const updateEdges = allEdges.map(e => {
                            if (connectedEdges.includes(e.id)) {
                                return { id: e.id, color: { opacity: 1 } };
                            } else {
                                return { id: e.id, color: { opacity: 0.1 } };
                            }
                        });

                        visNodes.update(updateNodes);
                        visEdges.update(updateEdges);

                        const nodeData = graph.nodes.find(n => n.id === nodeId);
                        if (nodeData) {
                            let detailHtml = '<h3>' + esc(nodeData.name) + '</h3>';
                            detailHtml += '<p><strong>Type:</strong> ' + esc(nodeData.type) + '</p>';
                            detailHtml += '<p><strong>File:</strong> ' + esc(nodeData.file) + '</p>';
                            if (nodeData.metadata) {
                                detailHtml += '<pre style="background:#1e1e1e; padding:8px; border-radius:4px; margin-top:8px;">' + esc(JSON.stringify(nodeData.metadata, null, 2)) + '</pre>';
                            }
                            document.getElementById('arch-summary').innerHTML = detailHtml;
                        }
                    } else {
                        const allNodes = visNodes.get().map(n => ({ id: n.id, color: { opacity: 1, border: '#111', background: colors[n.group] || '#555' }, font: { color: 'rgba(255,255,255,1)' }, borderWidth: 1 }));
                        const allEdges = visEdges.get().map(e => ({ id: e.id, color: { opacity: 1 } }));
                        visNodes.update(allNodes);
                        visEdges.update(allEdges);
                        if (summary?.markdownReport) {
                            document.getElementById('arch-summary').innerHTML = esc(summary.markdownReport).replace(new RegExp('\\n', 'g'), '<br>');
                        } else {
                            document.getElementById('arch-summary').innerHTML = 'Global architectural summary unavailable. Select a node to view its specific details.';
                        }
                    }
                });

                network.on("oncontext", function (params) {
                    params.event.preventDefault();
                    const nodeId = network.getNodeAt(params.pointer.DOM);
                    if (!nodeId) return;

                    const nodeData = graph.nodes.find(n => n.id === nodeId);
                    if (!nodeData) return;

                    let html = '<h3>Context: ' + esc(nodeData.name) + '</h3>';
                    const connectedEdges = graph.edges.filter(e => e.source === nodeId || e.target === nodeId);
                    const incoming = connectedEdges.filter(e => e.target === nodeId).map(e => esc(e.source));
                    const outgoing = connectedEdges.filter(e => e.source === nodeId).map(e => esc(e.target));

                    html += '<div style="margin-top:10px; padding:8px; background:#1e1e1e; border-radius:4px;">';
                    html += '<strong>Incoming Calls (' + incoming.length + '):</strong><br/> <span style="color:#aaa">' + (incoming.slice(0, 10).join('<br/>') || 'None') + ' ' + (incoming.length > 10 ? '...' : '') + '</span><br/><br/>';
                    html += '<strong>Outgoing Calls (' + outgoing.length + '):</strong><br/> <span style="color:#aaa">' + (outgoing.slice(0, 10).join('<br/>') || 'None') + ' ' + (outgoing.length > 10 ? '...' : '') + '</span>';
                    html += '</div>';

                    if (nodeData.type === 'file' && dashData.l3_churn?.files) {
                        const churnData = dashData.l3_churn.files.find(f => f.file === nodeData.file);
                        if (churnData) {
                            html += '<div style="margin-top:10px; padding:8px; background:#1e1e1e; border-radius:4px; border-left: 3px solid var(--vscode-charts-orange);">';
                            html += '<strong>Git History:</strong><br/>';
                            html += 'Commits: ' + churnData.commits + '<br/>';
                            html += 'Lines Added: <span style="color:var(--vscode-charts-green)">+' + churnData.insertions + '</span><br/>';
                            html += 'Lines Deleted: <span style="color:var(--vscode-charts-red)">-' + churnData.deletions + '</span><br/>';
                            html += 'Last Modified: <span style="color:#888">' + new Date(churnData.lastModified).toLocaleDateString() + '</span><br/>';
                            html += 'Status: ' + (churnData.isHot ? '<span class="tag hot">HOT</span>' : churnData.isStale ? '<span class="tag stale">STALE</span>' : '<span class="tag" style="background:#444">NORMAL</span>') + '<br/>';
                            html += '</div>';
                        }
                    }
                    document.getElementById('arch-summary').innerHTML = html;
                });
            }
        }
    }

    function applyGraphView(mode) {
        if (!network || !visNodes || !visEdges) return;
        const allNodes = visNodes.get();
        const allEdges = visEdges.get();
        const graph = dashData.l4_graph;
        if (!graph) return;

        // Compute in/out degrees for entry/exit views
        const inDegree = {};
        const outDegree = {};
        graph.nodes.forEach(n => { inDegree[n.id] = 0; outDegree[n.id] = 0; });
        graph.edges.forEach(e => {
            if(outDegree[e.source] !== undefined) outDegree[e.source]++;
            if(inDegree[e.target] !== undefined) inDegree[e.target]++;
        });

        if (mode === 'overall') {
            visNodes.update(allNodes.map(n => ({ id: n.id, color: { opacity: 1 }, font: { color: 'rgba(255,255,255,1)' } })));
            visEdges.update(allEdges.map(e => ({ id: e.id, color: { opacity: 1 } })));
        } else if (mode === 'entry_exit') {
            visNodes.update(allNodes.map(n => {
                const isEntry = inDegree[n.id] === 0 && outDegree[n.id] > 0;
                const isExit = outDegree[n.id] === 0 && inDegree[n.id] > 0;
                if (isEntry) return { id: n.id, color: { border: '#4CAF50', background: '#2E7D32', opacity: 1 }, font: { color: 'rgba(255,255,255,1)' }, borderWidth: 3 };
                if (isExit) return { id: n.id, color: { border: '#F44336', background: '#C62828', opacity: 1 }, font: { color: 'rgba(255,255,255,1)' }, borderWidth: 3 };
                return { id: n.id, color: { opacity: 0.1 }, font: { color: 'rgba(255,255,255,0.1)' }, borderWidth: 1 };
            }));
            visEdges.update(allEdges.map(e => ({ id: e.id, color: { opacity: 0.1 } })));
        } else if (mode === 'risk_heatmap') {
            visNodes.update(allNodes.map(n => {
                var gNode = graph.nodes.find(function(gn) { return gn.id === n.id; });
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
            visEdges.update(allEdges.map(e => ({ id: e.id, color: { opacity: 0.15 } })));
        } else if (mode === 'coupling') {
            if (dashData.l3_coupling && dashData.l3_coupling.stronglyCoupled) {
                var clusterColors = ['#E91E63', '#9C27B0', '#3F51B5', '#00BCD4', '#FF9800', '#795548'];
                var clusterIdx = 0;
                var fileColorMap = {};
                dashData.l3_coupling.stronglyCoupled.slice(0, 15).forEach(function(p) {
                    var color = clusterColors[clusterIdx % clusterColors.length];
                    if (!fileColorMap[p.fileA]) fileColorMap[p.fileA] = color;
                    if (!fileColorMap[p.fileB]) fileColorMap[p.fileB] = color;
                    clusterIdx++;
                });

                visNodes.update(allNodes.map(n => {
                    var gNode = graph.nodes.find(function(gn) { return gn.id === n.id; });
                    var file = gNode && gNode.file ? gNode.file : n.id.replace('file::', '');
                    if (fileColorMap[file]) {
                        return { id: n.id, color: { background: fileColorMap[file], border: '#fff', opacity: 1 }, font: { color: '#fff' }, borderWidth: 3 };
                    }
                    return { id: n.id, color: { opacity: 0.1 }, font: { color: 'rgba(255,255,255,0.1)' }, borderWidth: 1 };
                }));
            }
            visEdges.update(allEdges.map(e => ({ id: e.id, color: { opacity: 0.1 } })));
        }
    }

    // Define setGraphView globally
    window.setGraphView = function(mode) {
        applyGraphView(mode);
    };

    function esc(s) { var t = String(s || ''); t = t.replace(new RegExp('&', 'g'), '&amp;'); t = t.replace(new RegExp('<', 'g'), '&lt;'); t = t.replace(new RegExp('>', 'g'), '&gt;'); return t; }

// ── Chat functions ──
let chatContextHistory = [];

function handleChatKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChat();
    }
}

function sendChat() {
    const input = document.getElementById('chat-input');
    const query = input.value.trim();
    if (!query) return;

    appendChat('user', query);
    input.value = '';

    // Disable UI
    document.getElementById('chat-controls').classList.add('chat-disabled');

    // Send history to backend
    vscode.postMessage({ command: 'askGraphRAG', query: query, history: chatContextHistory });

    // Push user message to history AFTER sending, so backend just appends it to the end
    chatContextHistory.push({ role: 'user', content: query });
}

let currentAiBubble = null;
function appendChat(role, text) {
    const history = document.getElementById('chat-history');
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble ' + role;
    bubble.textContent = text;
    history.appendChild(bubble);
    history.scrollTop = history.scrollHeight;
    if (role === 'ai') currentAiBubble = bubble;
    return bubble;
}

// ── Message handling ──
window.addEventListener('message', e => {
    const msg = e.data;
    if (msg.command === 'chatResponse') {
        if (msg.text === '...') {
            appendChat('ai', 'Thinking (running GraphRAG query)...');
        } else {
            if (currentAiBubble) currentAiBubble.textContent = msg.text;
            // Add AI answer to history
            chatContextHistory.push({ role: 'assistant', content: msg.text });
            document.getElementById('chat-controls').classList.remove('chat-disabled');
        }
    }
    if (msg.command === 'layerStatus') {
        if (msg.status === 'complete') markLayerComplete(msg.layer);
        else if (msg.status === 'running') {
            pipeState[msg.layer] = 'running';
            updatePipeCard(msg.layer);
        }
    }
    if (msg.command === 'dashboardData') {
        dashData = msg.data || {};
        // Update pipeline cards from stored status
        const ls = dashData.layerStatus;
        if (ls) {
            if (ls.l1) { pipeState[1] = 'complete'; updatePipeCard(1); }
            if (ls.l2) { pipeState[2] = 'complete'; updatePipeCard(2); }
            if (ls.l3) { pipeState[3] = 'complete'; updatePipeCard(3); }
            if (ls.l4) { pipeState[4] = 'complete'; updatePipeCard(4); }
            if (ls.l5) { pipeState[5] = 'complete'; updatePipeCard(5); }
            // Unlock next
            for (let i = 1; i <= 5; i++) {
                if (pipeState[i] !== 'complete' && (i === 1 || pipeState[i - 1] === 'complete')) {
                    pipeState[i] = 'idle';
                    updatePipeCard(i);
                }
            }
        }
        renderOverview();
        renderEntities();
        renderComplexity();
        renderGit();
        renderGraph();
    }
});

// Request initial data
setTimeout(() => vscode.postMessage({ command: 'requestData' }), 100);
</script>
    </body>
    </html>`;
}