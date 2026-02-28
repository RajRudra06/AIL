export function getPanelHTML(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8"/>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: 13px;
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            padding: 20px 24px;
        }

        h2 {
            font-size: 15px;
            font-weight: 600;
            margin-bottom: 4px;
        }

        .subtitle {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 28px;
        }

        .layer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 14px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            margin-bottom: 8px;
            opacity: 1;
            transition: opacity 0.2s;
        }

        .layer.locked { opacity: 0.4; pointer-events: none; }

        .layer-left { display: flex; flex-direction: column; gap: 2px; }

        .layer-name {
            font-weight: 600;
            font-size: 13px;
        }

        .layer-desc {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }

        .layer-status {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }

        .layer-status.running { color: var(--vscode-charts-yellow); }
        .layer-status.complete { color: var(--vscode-charts-green); }

        button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            padding: 6px 14px;
            font-size: 12px;
            cursor: pointer;
        }

        button:hover { background: var(--vscode-button-hoverBackground); }
        button:disabled { opacity: 0.5; cursor: default; }

        .output {
            margin-top: 6px;
            font-size: 11px;
            font-family: var(--vscode-editor-font-family);
            color: var(--vscode-descriptionForeground);
            display: none;
            line-height: 1.7;
        }

        .output.visible { display: block; }
        .output .ok { color: var(--vscode-charts-green); }

        .divider {
            border: none;
            border-top: 1px solid var(--vscode-panel-border);
            margin: 20px 0;
        }

        .run-all {
            width: 100%;
            padding: 8px;
            font-size: 12px;
        }
    </style>
</head>
<body>

<h2>AIL — Analysis Pipeline</h2>
<div class="subtitle">Run each layer in order. Output saved to .ail/ in workspace root.</div>

<div class="layer" id="card-1">
    <div class="layer-left">
        <div class="layer-name">Layer 1 — Repository Ingestion</div>
        <div class="layer-desc">Languages · Frameworks · Entry points · Metrics</div>
        <div class="layer-status" id="status-1">not started</div>
        <div class="output" id="output-1"></div>
    </div>
    <button id="btn-1" onclick="runLayer(1)">Run</button>
</div>

<div class="layer locked" id="card-2">
    <div class="layer-left">
        <div class="layer-name">Layer 2 — AST Analysis</div>
        <div class="layer-desc">Entities · Call graph · Relationships · Complexity</div>
        <div class="layer-status" id="status-2">waiting for Layer 1</div>
        <div class="output" id="output-2"></div>
    </div>
    <button id="btn-2" onclick="runLayer(2)">Run</button>
</div>

<div class="layer locked" id="card-3">
    <div class="layer-left">
        <div class="layer-name">Layer 3 — Git Intelligence</div>
        <div class="layer-desc">Commits · Structural diff · ADRs · Archaeology</div>
        <div class="layer-status" id="status-3">waiting for Layer 2</div>
        <div class="output" id="output-3"></div>
    </div>
    <button id="btn-3" onclick="runLayer(3)">Run</button>
</div>

<div class="layer locked" id="card-4">
    <div class="layer-left">
        <div class="layer-name">Layer 4 — Agentic Reasoning</div>
        <div class="layer-desc">Knowledge graph · Chat agent · Blast radius</div>
        <div class="layer-status" id="status-4">waiting for Layer 3</div>
        <div class="output" id="output-4"></div>
    </div>
    <button id="btn-4" onclick="runLayer(4)">Run</button>
</div>

<hr class="divider"/>
<button class="run-all" onclick="runAll()">Run Full Pipeline</button>

<script>
    const vscode = acquireVsCodeApi();
    const state = { 1: 'idle', 2: 'locked', 3: 'locked', 4: 'locked' };

    const logs = {
        1: ['Scanning files...', 'Detecting languages...', 'Scanning frameworks...', 'Finding entry points...', 'Computing metrics...', '✓ Saved → .ail/layer1-manifest.json'],
        2: ['Reading manifest...', 'Parsing AST...', 'Extracting entities...', 'Building graph...', '✓ Saved → .ail/layer2-graph.json'],
        3: ['Fetching git history...', 'Parsing commits...', 'Generating structural diffs...', 'Running LLM context...', '✓ Saved → .ail/layer3-git.json'],
        4: ['Loading graph...', 'Initializing agent...', 'Starting health monitor...', '✓ Agent ready']
    };

    function runLayer(n) {
        if (state[n] !== 'idle') return;
        state[n] = 'running';

        document.getElementById('btn-' + n).disabled = true;
        document.getElementById('btn-' + n).textContent = '...';

        const statusEl = document.getElementById('status-' + n);
        statusEl.className = 'layer-status running';
        statusEl.textContent = 'running...';

        const outputEl = document.getElementById('output-' + n);
        outputEl.innerHTML = '';
        outputEl.classList.add('visible');

        vscode.postMessage({ command: 'runLayer' + n });

        logs[n].forEach((line, i) => {
            setTimeout(() => {
                const d = document.createElement('div');
                d.className = i === logs[n].length - 1 ? 'ok' : '';
                d.textContent = line;
                outputEl.appendChild(d);
            }, i * 300);
        });
    }

    function markComplete(n) {
        state[n] = 'complete';
        const statusEl = document.getElementById('status-' + n);
        statusEl.className = 'layer-status complete';
        statusEl.textContent = '✓ complete';
        document.getElementById('btn-' + n).textContent = '✓';

        if (n + 1 <= 4) {
            state[n + 1] = 'idle';
            document.getElementById('card-' + (n+1)).classList.remove('locked');
            document.getElementById('status-' + (n+1)).textContent = 'ready';
        }
    }

    function runAll() {
        let delay = 0;
        [1,2,3,4].forEach(n => {
            setTimeout(() => { if (state[n] === 'idle') runLayer(n); }, delay);
            delay += logs[n].length * 300 + 500;
        });
    }

    window.addEventListener('message', e => {
        const msg = e.data;
        if (msg.command === 'layerStatus' && msg.status === 'complete') {
            setTimeout(() => markComplete(msg.layer), logs[msg.layer].length * 300 + 200);
        }
    });
</script>
</body>
</html>`;
}