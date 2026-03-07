export function getPanelHTML(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https://unpkg.com; script-src 'unsafe-inline' 'unsafe-eval' https://unpkg.com; font-src https://unpkg.com; img-src 'self' data: https:;">
    <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
    <title>AIL Mission Control</title>
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
            padding:       20px 32px;
            display:       flex;
            justify-content: space-between;
            align-items:   center;
        }

        #header h1 {
            font-size:   20px;
            font-weight: 700;
            color:       #ffffff;
            letter-spacing: -0.5px;
        }

        #header p {
            font-size:  12px;
            color:      #858585;
            margin-top: 4px;
        }

        /* ── MAIN LAYOUT ────────────────────────────────── */
        .workspace {
            display: flex;
            flex: 1;
            overflow: hidden;
        }

        .sidebar {
            width: 380px;
            background: #1e1e1e;
            border-right: 1px solid #3e3e42;
            display: flex;
            flex-direction: column;
            overflow-y: auto;
            padding: 24px;
            gap: 16px;
            flex-shrink: 0;
        }

        .dashboard {
            flex: 1;
            padding: 24px;
            overflow-y: auto;
            display: grid;
            grid-template-columns: 1fr 1fr;
            grid-auto-rows: min-content;
            gap: 20px;
            background: #1e1e1e;
        }

        /* ── CARD COMPONENTS ────────────────────────────── */
        .card {
            background:    #252526;
            border:        1px solid #3e3e42;
            border-radius: 10px;
            padding:       20px;
            display:       flex;
            gap:           16px;
        }

        .card.summary-card { align-items: center; }

        .card-icon {
            font-size:   24px;
            width:       44px;
            height:      44px;
            display:     flex;
            align-items: center;
            justify-content: center;
            border-radius: 10px;
            flex-shrink: 0;
        }
        .card-icon.blue   { background: rgba(74, 158, 255, 0.1); }
        .card-icon.green  { background: rgba(81, 207, 102, 0.1); }

        .card-body { flex: 1; min-width: 0; }
        .card-title { font-size: 14px; font-weight: 600; color: #ffffff; margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between; }
        .card-desc { font-size: 11px; color: #858585; line-height: 1.4; }

        .status-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; margin-right: 6px; }
        .status-dot.green  { background: #51CF66; }
        .status-dot.yellow { background: #FFD43B; }
        .status-dot.grey   { background: #555; }

        /* Buttons */
        .btn {
            background:    #0078d4;
            border:        none;
            color:         #ffffff;
            padding:       6px 14px;
            border-radius: 4px;
            font-size:     12px;
            font-weight:   500;
            cursor:        pointer;
            white-space:   nowrap;
            transition:    background 0.15s;
        }
        .btn:hover { background: #0090f1; }
        .btn.outline { background: transparent; border: 1px solid #3e3e42; color: #d4d4d4; }
        .btn.outline:hover { background: #3e3e42; }
        .btn:disabled { background: #3e3e42; color: #858585; cursor: not-allowed; border: none; }

        /* ── SUMMARY STATS GRIDS ────────────────────────── */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
            margin-top: 14px;
        }
        .stat-box {
            background: #1e1e1e;
            border: 1px solid #3e3e42;
            border-radius: 6px;
            padding: 10px;
            text-align: center;
        }
        .stat-val { font-size: 18px; font-weight: 700; color: #fff; line-height: 1; }
        .stat-label { font-size: 10px; color: #858585; text-transform: uppercase; margin-top: 4px; }

        /* ── PIPELINE LIST ──────────────────────────────── */
        .pipeline-list {
            background: #252526;
            border: 1px solid #3e3e42;
            border-radius: 10px;
            padding: 20px;
        }
        
        .layer-row {
            display: flex;
            align-items: center;
            padding: 12px 0;
            border-bottom: 1px solid #2d2d30;
            gap: 12px;
        }
        .layer-row:last-child { border-bottom: none; }
        .layer-info { flex: 1; min-width: 0; }
        .layer-name { font-size: 12.5px; font-weight: 600; color: #d4d4d4; }
        .layer-state { font-size: 11px; color: #555; width: 90px; text-align: right; margin-right: 8px;}
        .layer-state.complete { color: #51CF66; }
        .layer-state.running  { color: #FFD43B; }

        /* ── DATA TABLES ────────────────────────────────── */
        .data-panel {
            background: #252526;
            border: 1px solid #3e3e42;
            border-radius: 10px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            max-height: 400px;
        }

        /* ── CHAT AGENT ─────────────────────────────────── */
        .chat-bubble { max-width: 85%; padding: 10px 14px; border-radius: 8px; font-size: 12.5px; line-height: 1.5; white-space: pre-wrap; }
        .chat-bubble.ai { background: #2d2d30; align-self: flex-start; color: #d4d4d4; }
        .chat-bubble.user { background: #0078d4; align-self: flex-end; color: #fff; }
        .chat-disabled { opacity: 0.5; pointer-events: none; }
        .chat-input { flex: 1; background: #1e1e1e; border: 1px solid #3e3e42; color: #d4d4d4; padding: 10px 12px; border-radius: 6px; font-size: 12px; outline: none; }
        .chat-input:focus { border-color: #0078d4; }

        .data-header {
            padding: 16px 20px;
            border-bottom: 1px solid #3e3e42;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #252526;
        }

        .data-title { font-size: 13px; font-weight: 600; color: #fff; }
        
        .scroll-area {
            overflow-y: auto;
            flex: 1;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
        }
        th {
            text-align: left;
            padding: 8px 16px;
            font-weight: 600;
            font-size: 10px;
            text-transform: uppercase;
            color: #858585;
            border-bottom: 1px solid #3e3e42;
            position: sticky;
            top: 0;
            background: #252526;
            z-index: 10;
        }
        td {
            padding: 8px 16px;
            border-bottom: 1px solid #2d2d30;
            color: #cccccc;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 200px;
        }
        tr:hover td { background: rgba(255,255,255,0.02); }

        .tag {
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 4px;
            font-weight: 600;
        }
        .tag.hot { background: #63171b; color: #ffb1b1; }
        .tag.fn { background: #1a365d; color: #90cdf4; }
        
        .empty-state {
            padding: 40px;
            text-align: center;
            color: #858585;
            font-style: italic;
            font-size: 12px;
        }
        
    </style>
</head>
<body>

<div id="header">
    <div class="title-group">
        <h1>⚡ AIL Mission Control</h1>
        <p>Architectural Intelligence Layer — Active Workspace</p>
    </div>
    <div class="actions">
        <button class="btn outline" style="margin-right: 8px;" onclick="purgeCache()">Purge Cache</button>
        <button class="btn" onclick="runAllPipeline()">Run Full Analysis</button>
    </div>
</div>

<div class="workspace">
    <!-- LEFT SIDEBAR: Pipeline & Graph Access -->
    <div class="sidebar">

        <!-- Graph Access Card -->
        <div class="card summary-card" style="border-color: #1f3a1f;">
            <div class="card-icon green">🕸️</div>
            <div class="card-body">
                <div class="card-title">Knowledge Graph</div>
                <div class="card-desc">Interactive dependency viz</div>
            </div>
            <button class="btn" style="background:#1f7a4f; color:#fff;" id="btn-load-graphs" onclick="handleLoadGraphs()" disabled>Open View</button>
        </div>

        <!-- Pipeline Execution Card -->
        <div class="pipeline-list">
            <div class="card-title" style="margin-bottom: 16px;">Analysis Pipeline</div>
            
            <div class="layer-row">
                <div class="layer-info">
                    <div class="layer-name">L1: Repository</div>
                </div>
                <div class="layer-state" id="state-1">not started</div>
                <button class="btn outline" id="btn-layer1" onclick="runPipeline(1)">Run</button>
            </div>
            
            <div class="layer-row">
                <div class="layer-info">
                    <div class="layer-name">L2: Entities (AST)</div>
                </div>
                <div class="layer-state" id="state-2">waiting</div>
                <button class="btn outline" id="btn-layer2" onclick="runPipeline(2)">Run</button>
            </div>
            
            <div class="layer-row">
                <div class="layer-info">
                    <div class="layer-name">L3: Git Intel</div>
                </div>
                <div class="layer-state" id="state-3">waiting</div>
                <button class="btn outline" id="btn-layer3" onclick="runPipeline(3)">Run</button>
            </div>
            
            <div class="layer-row">
                <div class="layer-info">
                    <div class="layer-name">L4: Graph Building</div>
                </div>
                <div class="layer-state" id="state-4">waiting</div>
                <button class="btn outline" id="btn-layer4" onclick="runPipeline(4)">Run</button>
            </div>
        </div>

    </div>

    <!-- RIGHT MAIN: Data Grid -->
    <div class="dashboard">

        <!-- Overview Stats -->
        <div class="card" style="grid-column: span 2; display: block;">
            <div class="card-title"><span id="stats-title">Repository Overview</span><span class="status-dot grey" id="stats-dot"></span></div>
            <div id="overview-stats" class="stats-grid" style="grid-template-columns: repeat(4, 1fr);">
                <div class="empty-state" style="grid-column: span 4; padding: 20px;">Run Layer 1 to see stats</div>
            </div>
        </div>

        <!-- Complexity Table -->
        <div class="data-panel">
            <div class="data-header">
                <div class="data-title">Cyclomatic Complexity</div>
            </div>
            <div class="scroll-area" id="complexity-container">
                <div class="empty-state">Run Layer 2 for metrics</div>
            </div>
        </div>

        <!-- Git Churn Table -->
        <div class="data-panel">
            <div class="data-header">
                <div class="data-title">Highest Churn Files</div>
            </div>
            <div class="scroll-area" id="churn-container">
                <div class="empty-state">Run Layer 3 for git data</div>
            </div>
        </div>

        <!-- Entities Table -->
        <div class="data-panel" style="grid-column: span 2; max-height: 500px;">
            <div class="data-header">
                <div class="data-title">Detected Code Entities</div>
            </div>
            <div class="scroll-area" id="entities-container">
                <div class="empty-state">Run Layer 2 for entities</div>
            </div>
        </div>

        <!-- Chat Interface -->
        <div class="data-panel" style="grid-column: span 2; max-height: 500px; height: 380px; display: flex;">
            <div class="data-header">
                <div class="data-title">🤖 Architecture GraphRAG Agent</div>
            </div>
            <div class="scroll-area" id="chat-history" style="padding: 16px; display: flex; flex-direction: column; gap: 12px;">
                <div class="chat-bubble ai">Hello! I'm your Architectural Intelligence Agent. Ask me anything about the codebase.</div>
            </div>
            <div id="chat-controls" style="padding: 12px 16px; border-top: 1px solid #3e3e42; background: #252526; display: flex; gap: 8px; flex-shrink: 0;">
                <input type="text" id="chat-input" class="chat-input" placeholder="Ask about architecture, blast radius, specific functions..." onkeypress="handleChatKey(event)"/>
                <button class="btn" onclick="sendChat()">Send</button>
            </div>
        </div>

    </div>
</div>

<script>
    const vscode = acquireVsCodeApi();
    let dashData = {};
    const pipeState = [null, 'idle', 'locked', 'locked', 'locked'];

    function runPipeline(n) {
        if (pipeState[n] === 'running' || pipeState[n] === 'locked') return;
        pipeState[n] = 'running';
        updatePipeRow(n);
        vscode.postMessage({ command: 'runLayer' + n });
    }

    function runAllPipeline() {
        for (let i = 1; i <= 4; i++) {
            if (pipeState[i] !== 'locked') pipeState[i] = 'idle';
        }
        runPipeline(1);
    }

    function handleLoadGraphs() {
        vscode.postMessage({ command: 'loadGraphs' });
    }

    function purgeCache() {
        for (let i = 1; i <= 4; i++) { pipeState[i] = 'idle'; }
        updatePipeRow(1); updatePipeRow(2); updatePipeRow(3); updatePipeRow(4);
        vscode.postMessage({ command: 'purgeData' });
    }

    function updatePipeRow(n) {
        const stateEl = document.getElementById('state-' + n);
        const btnEl = document.getElementById('btn-layer' + n);
        
        if (pipeState[n] === 'running') {
            stateEl.textContent = '⏳ running';
            stateEl.className   = 'layer-state running';
            btnEl.textContent   = '...';
            btnEl.className     = 'btn outline';
            btnEl.disabled      = true;
        } else if (pipeState[n] === 'complete') {
            stateEl.textContent = '✓ complete';
            stateEl.className   = 'layer-state complete';
            btnEl.textContent   = 'Re-run';
            btnEl.className     = 'btn outline';
            btnEl.disabled      = false;
        } else if (pipeState[n] === 'idle') {
            stateEl.textContent = 'ready';
            stateEl.className   = 'layer-state';
            btnEl.textContent   = 'Run';
            btnEl.className     = 'btn'; // Highlight next available
            btnEl.disabled      = false;
        } else {
            stateEl.textContent = 'waiting';
            stateEl.className   = 'layer-state';
            btnEl.textContent   = 'Run';
            btnEl.className     = 'btn outline';
            btnEl.disabled      = true;
        }
    }

    // ── DATA RENDERING ────────────────────────────────────
    function statBox(val, label) {
        return '<div class="stat-box"><div class="stat-val">' + (val || 0) + '</div><div class="stat-label">' + label + '</div></div>';
    }
    function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    function renderDashboard() {
        const l1 = dashData.l1_manifest;
        const l2 = dashData.l2_manifest;
        const l2e = dashData.l2_entities;
        const l2c = dashData.l2_complexity;
        const l3c = dashData.l3_churn;
        const l4 = dashData.l4_manifest;

        // 1. Overview Stats
        const os = document.getElementById('overview-stats');
        if (l1) {
            document.getElementById('stats-dot').className = 'status-dot green';
            let html = '';
            html += statBox(l1.metrics?.totalFiles || 0, 'Files');
            if (l2?.summary) {
                html += statBox(l2.summary.totalEntities, 'Entities');
                html += statBox(l2.summary.totalCallEdges, 'Call Edges');
            }
            if (l3c) html += statBox(l3c.hotFiles?.length || 0, 'Hot Files');
            os.innerHTML = html;
        } else {
            document.getElementById('stats-dot').className = 'status-dot grey';
            os.innerHTML = '<div class="empty-state" style="grid-column: span 4; padding: 20px;">Run Layer 1 analysis for project stats</div>';
        }

        // 2. Graph Button unlock
        document.getElementById('btn-load-graphs').disabled = !l4;

        // 3. Complexity Table
        const cxContainer = document.getElementById('complexity-container');
        if (l2c && l2c.functions?.length) {
            let cxHtml = '<table><thead><tr><th>Function</th><th>File</th><th>Cyclomatic</th></tr></thead><tbody>';
            l2c.functions.slice(0, 15).forEach(f => {
                cxHtml += '<tr><td><strong>' + esc(f.entityName) + '</strong></td><td>' + esc(f.file.split(/[\\\\/]/).pop()) + '</td><td style="color:' + (f.cyclomatic > 10 ? '#FFD43B' : '#51CF66') + ';">' + f.cyclomatic + '</td></tr>';
            });
            cxHtml += '</tbody></table>';
            cxContainer.innerHTML = cxHtml;
        }

        // 4. Git Churn Table
        const chContainer = document.getElementById('churn-container');
        if (l3c && l3c.files?.length) {
            let chHtml = '<table><thead><tr><th>File</th><th>Commits</th><th>Status</th></tr></thead><tbody>';
            l3c.files.slice(0, 15).forEach(f => {
                const tag = f.isHot ? '<span class="tag hot">HOT</span>' : '';
                chHtml += '<tr><td>' + esc(f.file.split(/[\\\\/]/).pop()) + '</td><td>' + f.commits + '</td><td>' + tag + '</td></tr>';
            });
            chHtml += '</tbody></table>';
            chContainer.innerHTML = chHtml;
        }

        // 5. Entities Table
        const etContainer = document.getElementById('entities-container');
        if (l2e && l2e.entities?.length) {
            let etHtml = '<table><thead><tr><th>Entity Name</th><th>Type</th><th>File</th><th>Loc</th></tr></thead><tbody>';
            l2e.entities.slice(0, 30).forEach(e => {
                etHtml += '<tr><td><strong>' + esc(e.name) + '</strong></td><td><span class="tag fn">' + e.type + '</span></td><td>' + esc(e.file.split(/[\\\\/]/).pop()) + '</td><td>L' + e.startLine + '</td></tr>';
            });
            etHtml += '</tbody></table>';
            etContainer.innerHTML = etHtml;
        }
    }

    // ── CHAT LOGIC ────────────────────────────────────────
    let chatContextHistory = [];
    function handleChatKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }
    
    function sendChat() {
        const input = document.getElementById('chat-input');
        const query = input.value.trim();
        if (!query) return;
        appendChat('user', query);
        input.value = '';
        document.getElementById('chat-controls').classList.add('chat-disabled');
        vscode.postMessage({ command: 'askGraphRAG', query: query, history: chatContextHistory });
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

    // ── MESSAGES FROM EXTENSION ──────────────────────────
    window.addEventListener('message', e => {
        const msg = e.data;
        if (msg.command === 'chatResponse') {
            if (msg.text === '...') {
                appendChat('ai', 'Thinking (running GraphRAG query)...');
            } else {
                if (currentAiBubble) currentAiBubble.textContent = msg.text;
                chatContextHistory.push({ role: 'assistant', content: msg.text });
                document.getElementById('chat-controls').classList.remove('chat-disabled');
            }
        }
        if (msg.command === 'layerStatus') {
            if (msg.status === 'complete') {
                pipeState[msg.layer] = 'complete';
                if (msg.layer < 4) pipeState[msg.layer + 1] = 'idle';
                setTimeout(() => vscode.postMessage({ command: 'requestData' }), 100);
            } else if (msg.status === 'running') {
                pipeState[msg.layer] = 'running';
            }
            updatePipeRow(1); updatePipeRow(2); updatePipeRow(3); updatePipeRow(4);
        }
        
        if (msg.command === 'dashboardData') {
            dashData = msg.data || {};
            const ls = dashData.layerStatus;
            if (ls) {
                if (ls.l1) pipeState[1] = 'complete';
                if (ls.l2) pipeState[2] = 'complete';
                if (ls.l3) pipeState[3] = 'complete';
                if (ls.l4) pipeState[4] = 'complete';
                for (let i = 1; i <= 4; i++) {
                    if (pipeState[i] !== 'complete' && (i === 1 || pipeState[i-1] === 'complete')) {
                        pipeState[i] = 'idle';
                    }
                }
                updatePipeRow(1); updatePipeRow(2); updatePipeRow(3); updatePipeRow(4);
            }
            renderDashboard();
        }
    });

    // Request initial data
    setTimeout(() => vscode.postMessage({ command: 'requestData' }), 100);
</script>
</body>
</html>`;
}