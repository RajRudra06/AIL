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
            grid-template-columns: 1fr 1fr;
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
        
    </style>
</head>
<body>

<div class="header">
    <h1>AIL <span>Architectural Intelligence Layer</span></h1>
    <div class="tabs">
        <div class="tab active" onclick="switchTab('pipeline', this)">Pipeline</div>
        <div class="tab" onclick="switchTab('entities', this)">Entities</div>
        <div class="tab" onclick="switchTab('complexity', this)">Complexity</div>
        <div class="tab" onclick="switchTab('git', this)">Git Intel</div>
        <div class="tab" onclick="switchTab('graph', this)">Graph</div>
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

    <!-- ═══ COMPLEXITY TAB ═══ -->
    <div class="view" id="view-complexity">
        <div id="complexity-stats" class="stats-row"></div>
        <div class="section-title">Functions by Complexity</div>
        <div class="scroll-box">
            <table class="data-table" id="complexity-table">
                <thead><tr>
                    <th>Function</th>
                    <th>File</th>
                    <th>Cyclomatic</th>
                    <th>Nesting</th>
                    <th>Lines</th>
                    <th>Visual</th>
                </tr></thead>
                <tbody id="complexity-tbody"></tbody>
            </table>
        </div>
        <div class="no-data" id="complexity-empty">Run Layer 2 to see complexity</div>
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
    </div>

    <!-- ═══ GRAPH TAB ═══ -->
    <div class="view" id="view-graph">
        <div id="graph-stats" class="stats-row"></div>
        <div id="graph-container"></div>
        <div class="section-title">Architecture Summary</div>
        <div id="arch-summary" style="white-space: pre-wrap; font-size: 12px; line-height: 1.6; padding: 12px; background: var(--vscode-input-background); border-radius: 6px; max-height: 500px; overflow-y: auto;"></div>
        <div class="no-data" id="graph-empty">Run Layer 4 to see the knowledge graph</div>
    </div>
</div>

<script>
    const vscode = acquireVsCodeApi();
    let dashData = {};
    let entitySortField = 'name';
    let entitySortAsc = true;
    const pipeState = [null, 'idle', 'locked', 'locked', 'locked'];

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
        if (pipeState[n] === 'running' || pipeState[n] === 'locked') return;
        pipeState[n] = 'running';
        updatePipeCard(n);
        vscode.postMessage({ command: 'runLayer' + n });
    }

    function runAllPipeline() {
        // Reset states to idle (if not locked) to force a full run
        for (let i = 1; i <= 4; i++) {
            if (pipeState[i] !== 'locked') {
                pipeState[i] = 'idle';
                updatePipeCard(i);
            }
        }
        runPipeline(1);
    }

    function purgeCache() {
        // Reset all states locally
        for (let i = 1; i <= 4; i++) {
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
        if (n < 4) {
            pipeState[n + 1] = 'idle';
            updatePipeCard(n + 1);
        }
        // Auto-continue pipeline
        setTimeout(() => {
            for (let i = n + 1; i <= 4; i++) {
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

    function sortEntities(field) {
        if (entitySortField === field) entitySortAsc = !entitySortAsc;
        else { entitySortField = field; entitySortAsc = true; }
        if (dashData.l2_entities?.entities) renderEntityTable(dashData.l2_entities.entities);
    }

    function renderComplexity() {
        const data = dashData.l2_complexity;
        if (!data || !data.functions?.length) {
            document.getElementById('complexity-empty').style.display = 'block';
            document.getElementById('complexity-table').style.display = 'none';
            document.getElementById('complexity-stats').innerHTML = '';
            return;
        }
        document.getElementById('complexity-empty').style.display = 'none';
        document.getElementById('complexity-table').style.display = '';

        const dist = data.complexityDistribution || {};
        document.getElementById('complexity-stats').innerHTML =
            statCard(data.totalFunctions, 'Functions')
            + statCard(data.avgCyclomatic, 'Avg Complexity')
            + statCard(data.avgNesting, 'Avg Nesting')
            + statCard(data.complexFunctions?.length || 0, 'Complex (>10)');

        const tbody = document.getElementById('complexity-tbody');
        tbody.innerHTML = data.functions.slice(0, 100).map(f => {
            const pct = Math.min(100, (f.cyclomatic / 25) * 100);
            const cls = f.cyclomatic <= 5 ? 'low' : f.cyclomatic <= 10 ? 'med' : f.cyclomatic <= 20 ? 'high' : 'vhigh';
            return '<tr>'
                + '<td><strong>' + esc(f.entityName) + '</strong></td>'
                + '<td>' + esc(f.file) + '</td>'
                + '<td>' + f.cyclomatic + '</td>'
                + '<td>' + f.nestingDepth + '</td>'
                + '<td>' + f.lineCount + '</td>'
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
            cl.innerHTML = commits.commits.slice(0, 50).map(c => {
                const date = c.date ? new Date(c.date).toLocaleDateString() : '';
                return '<div class="commit-item">'
                    + '<span class="commit-hash">' + c.hash.slice(0, 7) + '</span>'
                    + '<span class="commit-msg">' + esc(c.message) + '</span>'
                    + '<span class="commit-meta">' + esc(c.author) + '<br>' + date + '</span>'
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
    }

    let network = null;

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
            // Render interactive graph
            const colors = {
                file: '#2B5B84',
                function: '#8B4513',
                class: '#4B0082',
                method: '#006400',
                module: '#A0522D',
                interface: '#2F4F4F'
            };

            const visNodes = new vis.DataSet(graph.nodes.map(n => ({
                id: n.id,
                label: esc(n.name),
                group: n.type,
                title: 'Type: ' + esc(n.type) + (n.metadata?.churnScore ? '<br>Churn: ' + esc(n.metadata.churnScore) : ''),
                color: { background: colors[n.type] || '#555', border: '#111' },
                font: { color: '#ffffff', size: 12 },
                shape: n.type === 'file' ? 'box' : 'dot',
                size: n.type === 'file' ? undefined : 15
            })));

            const visEdges = new vis.DataSet(graph.edges.map(e => ({
                from: e.source,
                to: e.target,
                label: esc(e.type),
                arrows: 'to',
                font: { size: 10, align: 'horizontal', color: '#888' },
                color: { color: '#444', highlight: '#888' },
                width: e.weight > 1 ? Math.min(e.weight, 5) : 1
            })));

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
            } else {
                network.setData({ nodes: visNodes, edges: visEdges });
            }
        }
    }

    function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    // ── Message handling ──
    window.addEventListener('message', e => {
        const msg = e.data;
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
                // Unlock next
                for (let i = 1; i <= 4; i++) {
                    if (pipeState[i] !== 'complete' && (i === 1 || pipeState[i-1] === 'complete')) {
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