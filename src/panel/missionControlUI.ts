export function getMissionControlHTML(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
            padding:       24px 32px;
        }

        #header h1 {
            font-size:   22px;
            font-weight: 700;
            color:       #ffffff;
            letter-spacing: -0.5px;
        }

        #header p {
            font-size:  13px;
            color:      #858585;
            margin-top: 4px;
        }

        /* ── MAIN ───────────────────────────────────────── */
        #main {
            flex:       1;
            padding:    32px;
            overflow-y: auto;
            display:    flex;
            flex-direction: column;
            gap:        16px;
        }

        /* ── CARD ───────────────────────────────────────── */
        .card {
            background:    #252526;
            border:        1px solid #3e3e42;
            border-radius: 10px;
            padding:       24px;
            display:       flex;
            align-items:   center;
            gap:           20px;
            transition:    border-color 0.2s;
        }

        .card:hover { border-color: #555; }

        .card-icon {
            font-size:   28px;
            width:       52px;
            height:      52px;
            display:     flex;
            align-items: center;
            justify-content: center;
            border-radius: 10px;
            flex-shrink: 0;
        }

        .card-icon.blue   { background: rgba(74, 158, 255, 0.1); }
        .card-icon.green  { background: rgba(81, 207, 102, 0.1); }
        .card-icon.purple { background: rgba(192, 132, 252, 0.1); }

        .card-body {
            flex: 1;
        }

        .card-title {
            font-size:   15px;
            font-weight: 600;
            color:       #ffffff;
            margin-bottom: 4px;
        }

        .card-desc {
            font-size: 12px;
            color:     #858585;
            line-height: 1.5;
        }

        .card-status {
            font-size:   11px;
            margin-top:  6px;
            display:     flex;
            align-items: center;
            gap:         6px;
        }

        .status-dot {
            width:         7px;
            height:        7px;
            border-radius: 50%;
            flex-shrink:   0;
        }

        .status-dot.green  { background: #51CF66; }
        .status-dot.yellow { background: #FFD43B; }
        .status-dot.grey   { background: #555; }

        .card-btn {
            background:    #0078d4;
            border:        none;
            color:         #ffffff;
            padding:       9px 20px;
            border-radius: 6px;
            font-size:     13px;
            font-weight:   500;
            cursor:        pointer;
            white-space:   nowrap;
            transition:    background 0.15s;
            flex-shrink:   0;
        }

        .card-btn:hover    { background: #0090f1; }
        .card-btn.disabled {
            background: #3e3e42;
            color:      #666;
            cursor:     not-allowed;
        }

        .card-btn.green-btn { background: #1f7a4f; }
        .card-btn.green-btn:hover { background: #26a066; }

        /* ── DIVIDER ────────────────────────────────────── */
        .divider {
            border:     none;
            border-top: 1px solid #3e3e42;
            margin:     8px 0;
        }

        /* ── RUN PIPELINE CARD ──────────────────────────── */
        #pipeline-card {
            background:    #252526;
            border:        1px solid #3e3e42;
            border-radius: 10px;
            padding:       24px;
        }

        #pipeline-title {
            font-size:     15px;
            font-weight:   600;
            color:         #ffffff;
            margin-bottom: 16px;
            display:       flex;
            align-items:   center;
            gap:           8px;
        }

        .layer-row {
            display:       flex;
            align-items:   center;
            gap:           16px;
            padding:       12px 0;
            border-bottom: 1px solid #2d2d30;
        }

        .layer-row:last-child { border-bottom: none; }

        .layer-info { flex: 1; }

        .layer-name {
            font-size:   13px;
            font-weight: 600;
            color:       #d4d4d4;
        }

        .layer-tags {
            font-size:  11px;
            color:      #858585;
            margin-top: 3px;
        }

        .layer-state {
            font-size: 11px;
            color:     #555;
            min-width: 120px;
        }

        .layer-state.complete { color: #51CF66; }
        .layer-state.running  { color: #FFD43B; }

        .layer-run-btn {
            background:    #2d2d30;
            border:        1px solid #3e3e42;
            color:         #d4d4d4;
            padding:       6px 16px;
            border-radius: 5px;
            font-size:     12px;
            cursor:        pointer;
            transition:    all 0.15s;
            white-space:   nowrap;
        }

        .layer-run-btn:hover {
            background:   #3e3e42;
            border-color: #555;
        }

        .layer-run-btn.active {
            background:   #0078d4;
            border-color: #0078d4;
            color:        #fff;
        }
    </style>
</head>
<body>

<!-- HEADER -->
<div id="header">
    <h1>⚡ AIL Mission Control</h1>
    <p>Architectural Intelligence Layer — Analysis Pipeline</p>
</div>

<!-- MAIN -->
<div id="main">

    <!-- CARD 1 — Layer 1 Stats -->
    <div class="card">
        <div class="card-icon blue">📊</div>
        <div class="card-body">
            <div class="card-title">Layer 1 — Repository Stats</div>
            <div class="card-desc">Languages · Frameworks · Entry points · Metrics · Dependencies</div>
            <div class="card-status" id="layer1-status">
                <div class="status-dot grey" id="layer1-dot"></div>
                <span id="layer1-status-text">Checking...</span>
            </div>
        </div>
        <button class="card-btn disabled" id="layer1-btn" onclick="handleLayer1Stats()">
            View Stats
        </button>
    </div>

    <!-- CARD 2 — Load Graphs -->
<!-- CARD 2 — Load Graphs -->
<div class="card">
    <div class="card-icon green">🕸️</div>
    <div class="card-body">
        <div class="card-title">Layer 2 — Knowledge Graph</div>
        <div class="card-desc">Function calls · Import graph · Class hierarchy · Complexity</div>
        <div class="card-status" id="layer2-status">
            <div class="status-dot grey" id="layer2-dot"></div>
            <span id="layer2-status-text">Checking...</span>
        </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px;flex-shrink:0">
        <button class="card-btn disabled" id="layer2-btn" onclick="handleLoadGraphs()">
            Load Graphs
        </button>
        <button class="card-btn disabled" id="layer2-stats-btn" onclick="handleLayer2Stats()" style="background:#1f3a1f;border:1px solid #51CF66;color:#51CF66">
            View Stats
        </button>
    </div>
</div>

    <hr class="divider">

    <!-- CARD 3 — Run Pipeline -->
    <div id="pipeline-card">
        <div id="pipeline-title">🚀 Run Analysis Pipeline</div>

        <!-- Layer 1 -->
        <div class="layer-row">
            <div class="layer-info">
                <div class="layer-name">Layer 1 — Repository Ingestion</div>
                <div class="layer-tags">Languages · Frameworks · Entry points · Metrics</div>
            </div>
            <div class="layer-state" id="state-1">not started</div>
            <button class="layer-run-btn active" id="btn-layer1" onclick="handleRunLayer1()">Run</button>
        </div>

        <!-- Layer 2 -->
        <div class="layer-row">
            <div class="layer-info">
                <div class="layer-name">Layer 2 — AST Analysis</div>
                <div class="layer-tags">Entities · Call graph · Relationships · Complexity</div>
            </div>
            <div class="layer-state" id="state-2">waiting for Layer 1</div>
            <button class="layer-run-btn" id="btn-layer2" onclick="handleRunLayer2()">Run</button>
        </div>

        <!-- Layer 3 -->
        <div class="layer-row">
            <div class="layer-info">
                <div class="layer-name">Layer 3 — Git Intelligence</div>
                <div class="layer-tags">Commits · Structural diff · ADRs · Archaeology</div>
            </div>
            <div class="layer-state" id="state-3">waiting for Layer 2</div>
            <button class="layer-run-btn" id="btn-layer3" onclick="handleRunLayer3()">Run</button>
        </div>

        <!-- Layer 4 -->
        <div class="layer-row">
            <div class="layer-info">
                <div class="layer-name">Layer 4 — Agentic Reasoning</div>
                <div class="layer-tags">Knowledge graph · Chat agent · Blast radius</div>
            </div>
            <div class="layer-state" id="state-4">waiting for Layer 3</div>
            <button class="layer-run-btn" id="btn-layer4" onclick="handleRunLayer4()">Run</button>
        </div>

    </div>

</div>

<script>
    const vscode = acquireVsCodeApi();

    // ── CHECK FILE STATUS ON LOAD ────────────────────────
    window.addEventListener('load', () => {
        vscode.postMessage({ command: 'checkStatus' });
    });

    // ── RECEIVE MESSAGES FROM EXTENSION ─────────────────
    window.addEventListener('message', event => {
        const msg = event.data;

        switch (msg.command) {

            case 'statusResult':
                updateLayer1Status(msg.layer1Exists);
                updateLayer2Status(msg.layer2Exists);
                break;

            case 'layerStatus':
                updateLayerState(msg.layer, msg.status);
                break;
        }
    });

    // ── STATUS UPDATERS ──────────────────────────────────
    function updateLayer1Status(exists) {
        const dot  = document.getElementById('layer1-dot');
        const text = document.getElementById('layer1-status-text');
        const btn  = document.getElementById('layer1-btn');

        if (exists) {
            dot.className        = 'status-dot green';
            text.textContent     = 'Layer 1 analysis found — ready to view';
            btn.className        = 'card-btn';
            btn.disabled         = false;
        } else {
            dot.className        = 'status-dot grey';
            text.textContent     = 'No Layer 1 data found — run analysis first';
            btn.className        = 'card-btn disabled';
            btn.disabled         = true;
        }
    }

  function updateLayer2Status(exists) {
    const dot      = document.getElementById('layer2-dot');
    const text     = document.getElementById('layer2-status-text');
    const btn      = document.getElementById('layer2-btn');
    const statsBtn = document.getElementById('layer2-stats-btn');

    if (exists) {
        dot.className        = 'status-dot green';
        text.textContent     = 'Knowledge graph found — ready to load';
        btn.className        = 'card-btn green-btn';
        btn.disabled         = false;
        statsBtn.className   = 'card-btn';
        statsBtn.style.background = '#1f3a1f';
        statsBtn.style.border     = '1px solid #51CF66';
        statsBtn.style.color      = '#51CF66';
        statsBtn.disabled         = false;
    } else {
        dot.className        = 'status-dot grey';
        text.textContent     = 'No graph data found — run Layer 2 first';
        btn.className        = 'card-btn disabled';
        btn.disabled         = true;
        statsBtn.className   = 'card-btn disabled';
        statsBtn.disabled    = true;
    }
}

    function updateLayerState(layer, status) {
        const stateEl = document.getElementById(\`state-\${layer}\`);
        const btnEl   = document.getElementById(\`btn-layer\${layer}\`);

        if (status === 'running') {
            stateEl.textContent = '⏳ running...';
            stateEl.className   = 'layer-state running';
            btnEl.textContent   = 'Running...';
            btnEl.disabled      = true;
        } else if (status === 'complete') {
            stateEl.textContent = '✓ complete';
            stateEl.className   = 'layer-state complete';
            btnEl.textContent   = 'Run';
            btnEl.disabled      = false;
            // re-check status after completion
            vscode.postMessage({ command: 'checkStatus' });
        }
    }

    // ── BUTTON HANDLERS ──────────────────────────────────
    function handleLayer1Stats() {
        vscode.postMessage({ command: 'openLayer1Stats' });
    }

    function handleLoadGraphs() {
        vscode.postMessage({ command: 'loadGraphs' });
    }

    function handleRunLayer1() {
        vscode.postMessage({ command: 'runLayer1' });
    }

    function handleRunLayer2() {
        vscode.postMessage({ command: 'runLayer2' });
    }

    function handleLayer2Stats() {
    vscode.postMessage({ command: 'openLayer2Stats' });
    }

    function handleRunLayer3() {
        vscode.postMessage({ command: 'runLayer3' });
    }

    function handleRunLayer4() {
        vscode.postMessage({ command: 'runLayer4' });
    }
</script>
</body>
</html>`;
}