export function getPanelHTML(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline' 'unsafe-eval'; img-src 'self' data: https:;">
    <title>AIL Mission Control</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            background: #0e0e10;
            color: #d4d4d4;
            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
            height: 100vh;
            overflow: hidden;
        }

        .screen { display: none; height: 100vh; position: relative; }
        .screen.active { display: flex; }

        /* ── LANDING ────────────────────────────────── */
        #landing {
            align-items: center;
            justify-content: center;
            flex-direction: column;
            gap: 36px;
        }

        .landing-brand { text-align: center; }
        .landing-brand .logo-icon {
            font-size: 14px;
            margin-bottom: 14px;
            display: inline-block;
            letter-spacing: 2px;
            text-transform: uppercase;
            color: #7ca6d3;
            border: 1px solid rgba(124, 166, 211, 0.3);
            border-radius: 999px;
            padding: 5px 12px;
        }
        .landing-brand h1 { font-size: 28px; font-weight: 700; color: #fff; letter-spacing: -0.5px; }
        .landing-brand h1 span { background: linear-gradient(135deg, #4a9eff, #a855f7); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .landing-brand .tagline { font-size: 13px; color: #858585; margin-top: 8px; max-width: 460px; line-height: 1.6; }

        .landing-status { text-align: center; font-size: 12px; color: #6b6b7b; }
        .status-badge { display: inline-block; padding: 3px 10px; border-radius: 10px; font-size: 11px; font-weight: 600; margin-bottom: 6px; }
        .status-badge.found { background: rgba(81,207,102,0.12); color: #51CF66; }
        .status-badge.none { background: rgba(135,135,155,0.12); color: #858585; }

        .landing-actions { display: flex; gap: 20px; align-items: stretch; }

        .action-card {
            background: #1a1a1f;
            border: 1px solid #2d2d35;
            border-radius: 12px;
            padding: 28px 24px;
            width: 280px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            transition: border-color 0.2s, transform 0.15s, box-shadow 0.2s;
            cursor: pointer;
        }
        .action-card:hover:not(.disabled) { border-color: #4a9eff; transform: translateY(-2px); box-shadow: 0 8px 24px rgba(74,158,255,0.08); }
        .action-card.disabled { opacity: 0.35; cursor: not-allowed; }
        .action-card .card-icon {
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.8px;
            text-transform: uppercase;
            color: #7ca6d3;
            border: 1px solid rgba(124, 166, 211, 0.28);
            border-radius: 999px;
            width: fit-content;
            padding: 4px 9px;
        }
        .action-card h3 { font-size: 15px; font-weight: 600; color: #fff; }
        .action-card p { font-size: 11.5px; color: #858585; line-height: 1.55; flex: 1; }
        .action-card .card-btn {
            background: #4a9eff; border: none; color: #fff; padding: 10px 0; border-radius: 6px;
            font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.15s; text-align: center;
        }
        .action-card .card-btn:hover { background: #3d8be5; }
        .action-card.disabled .card-btn { background: #2d2d35; color: #555; cursor: not-allowed; pointer-events: none; }

        /* ── GLASS PROGRESS OVERLAY ──────────────────── */
        #progress-overlay {
            display: none;
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            z-index: 1000;
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            background: rgba(0, 0, 0, 0.6);
            align-items: center;
            justify-content: center;
        }
        #progress-overlay.active { display: flex; }

        .glass-card {
            background: rgba(30, 30, 38, 0.85);
            border: 1px solid rgba(74, 158, 255, 0.15);
            border-radius: 16px;
            padding: 36px 44px;
            width: 420px;
            text-align: center;
            box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
        }

        .glass-card h2 { font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 20px; }

        .progress-track {
            width: 100%;
            height: 6px;
            background: #2d2d35;
            border-radius: 3px;
            overflow: hidden;
            margin-bottom: 14px;
        }
        .progress-fill {
            height: 100%;
            width: 0%;
            background: linear-gradient(90deg, #4a9eff, #a855f7);
            border-radius: 3px;
            transition: width 0.5s ease;
        }

        .progress-text {
            font-size: 12px;
            color: #858585;
            min-height: 18px;
            transition: opacity 0.2s;
        }

        /* ── DASHBOARD ──────────────────────────────── */
        #dashboard {
            flex-direction: column;
            overflow: hidden;
        }

        #dash-header {
            background: #141418;
            border-bottom: 1px solid #2d2d35;
            padding: 14px 28px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
        }
        #dash-header h1 { font-size: 17px; font-weight: 700; color: #fff; letter-spacing: -0.3px; }
        #dash-header .actions { display: flex; gap: 8px; }

        .btn {
            background: #4a9eff; border: none; color: #fff; padding: 7px 16px; border-radius: 6px;
            font-size: 12px; font-weight: 600; cursor: pointer; transition: background 0.15s;
        }
        .btn:hover { background: #3d8be5; }
        .btn.outline { background: transparent; border: 1px solid #2d2d35; color: #d4d4d4; }
        .btn.outline:hover { background: #1a1a1f; }
        .btn.green { background: #1f7a4f; }
        .btn.green:hover { background: #25965f; }
        .btn:disabled { background: #2d2d35; color: #555; cursor: not-allowed; border: none; }

        .dash-content { flex: 1; padding: 24px 28px; overflow-y: auto; display: flex; flex-direction: column; gap: 20px; }

        /* Overview Hero Card */
        .overview-card { 
            background: linear-gradient(135deg, #141418 0%, #1a1a1f 100%); 
            border: 1px solid #2d2d35; 
            border-radius: 12px; 
            padding: 24px; 
            cursor: pointer;
            transition: all 0.2s ease;
            position: relative;
            overflow: hidden;
        }
        .overview-card:hover { border-color: #4a9eff; box-shadow: 0 8px 32px rgba(74,158,255,0.1); transform: translateY(-2px); }
        .overview-card::after { 
            content: 'VIEW ARCHITECTURAL DNA →'; 
            position: absolute; top: 24px; right: 24px; 
            font-size: 10px; font-weight: 700; color: #4a9eff; opacity: 0.6;
        }

        .project-name { font-size: 20px; font-weight: 700; color: #fff; margin-bottom: 8px; }
        .project-badges { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
        .badge { display: inline-block; padding: 3px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; }
        .badge.type { background: rgba(168,85,247,0.15); color: #c084fc; }
        .badge.fw { background: rgba(74,158,255,0.12); color: #4a9eff; }
        .badge.lang { background: rgba(81,207,102,0.12); color: #51CF66; }
        .overview-desc { font-size: 12px; color: #858585; line-height: 1.5; margin-top: 4px; }

        .lang-bar-container { margin-top: 16px; }
        .lang-bar-label { font-size: 11px; color: #6b6b7b; margin-bottom: 6px; text-transform: uppercase; font-weight: 600; letter-spacing: 0.3px; }
        .lang-bar { display: flex; height: 10px; border-radius: 5px; overflow: hidden; background: #2d2d35; }
        .lang-bar .segment { height: 100%; transition: width 0.3s ease; }
        .lang-legend { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 10px; }
        .lang-legend-item { display: flex; align-items: center; gap: 5px; font-size: 11px; color: #d4d4d4; }
        .lang-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

        .stats-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 10px; margin-top: 20px; }
        .stat-box { background: #1a1a1f; border: 1px solid #2d2d35; border-radius: 8px; padding: 14px; text-align: center; }
        .stat-val { font-size: 22px; font-weight: 700; color: #fff; line-height: 1; }
        .stat-label { font-size: 10px; color: #6b6b7b; text-transform: uppercase; margin-top: 5px; letter-spacing: 0.3px; }

        /* ── HIGHLIGHTS STRIP ───────────────────────── */
        .highlights-card {
            background: linear-gradient(135deg, #141418 0%, #181a21 100%);
            border: 1px solid #2d2d35;
            border-radius: 12px;
            padding: 16px 18px;
        }
        .highlights-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 10px; }
        .highlights-title { font-size: 13px; font-weight: 700; color: #dbe8f6; text-transform: uppercase; letter-spacing: 0.5px; }
        .highlights-sub { font-size: 11px; color: #7f90a6; }
        .highlights-list { display: grid; grid-template-columns: repeat(2, minmax(220px, 1fr)); gap: 9px; }
        .highlight-item {
            background: #11141c;
            border: 1px solid rgba(122, 154, 188, 0.26);
            border-radius: 8px;
            padding: 10px 12px;
            min-height: 62px;
        }
        .highlight-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; gap: 8px; }
        .highlight-tag {
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.5px;
            text-transform: uppercase;
            padding: 2px 7px;
            border-radius: 999px;
            background: rgba(74,158,255,0.14);
            color: #8dc2ff;
            border: 1px solid rgba(74,158,255,0.35);
        }
        .highlight-meta { font-size: 10px; color: #8390a2; white-space: nowrap; }
        .highlight-text { font-size: 12px; color: #d8e1ec; line-height: 1.45; }

        /* ── METRIC CARDS GRID ───────────────────────── */
        .metric-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }

        .metric-card {
            background: #141418;
            border: 1px solid #2d2d35;
            border-radius: 10px;
            padding: 20px;
            cursor: pointer;
            transition: border-color 0.2s, transform 0.12s, box-shadow 0.2s;
        }
        .metric-card:hover { border-color: #4a9eff; transform: translateY(-1px); box-shadow: 0 4px 16px rgba(74,158,255,0.06); }
        .metric-card .mc-icon {
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.8px;
            text-transform: uppercase;
            color: #9fc0e3;
            margin-bottom: 10px;
            border: 1px solid rgba(159, 192, 227, 0.24);
            border-radius: 999px;
            width: fit-content;
            padding: 3px 8px;
        }
        .metric-card .mc-title { font-size: 14px; font-weight: 600; color: #fff; margin-bottom: 4px; }
        .metric-card .mc-stat { font-size: 12px; color: #4a9eff; font-weight: 600; margin-bottom: 6px; }
        .metric-card .mc-desc { font-size: 11px; color: #6b6b7b; line-height: 1.4; }

        /* ── DETAIL PANEL ───────────────────────────── */
        #detail-view { display: none; }
        #detail-view.active { display: block; }
        #cards-view.hidden { display: none; }

        .detail-back {
            display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600;
            color: #4a9eff; cursor: pointer; margin-bottom: 16px; background: none; border: none;
        }
        .detail-back:hover { color: #7ebbff; }

        .detail-header { margin-bottom: 16px; }
        .detail-header h2 { font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 6px; }
        .detail-header p { font-size: 12px; color: #858585; line-height: 1.5; max-width: 700px; }

        .detail-insights { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
        .insight-chip { background: #1a1a1f; border: 1px solid #2d2d35; border-radius: 8px; padding: 10px 16px; text-align: center; }
        .insight-chip .val { font-size: 18px; font-weight: 700; color: #fff; }
        .insight-chip .lbl { font-size: 10px; color: #6b6b7b; text-transform: uppercase; margin-top: 3px; }

        .detail-table-wrap {
            background: #141418; border: 1px solid #2d2d35; border-radius: 10px;
            overflow: hidden; max-height: 450px; display: flex; flex-direction: column;
        }
        .scroll-area { overflow-y: auto; flex: 1; }

        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { text-align: left; padding: 8px 14px; font-weight: 600; font-size: 10px; text-transform: uppercase; color: #6b6b7b; border-bottom: 1px solid #2d2d35; position: sticky; top: 0; background: #141418; z-index: 10; }
        td { padding: 8px 14px; border-bottom: 1px solid #1a1a1f; color: #ccc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px; }
        tr:hover td { background: rgba(255,255,255,0.02); }

        .tag { font-size: 10px; padding: 2px 7px; border-radius: 4px; font-weight: 600; }
        .tag.hot { background: #63171b; color: #ffb1b1; }
        .tag.warn { background: #8f4f00; color: #ffd43b; }
        .tag.info { background: #1a365d; color: #90cdf4; }
        .tag.fn { background: #1a365d; color: #90cdf4; }
        .tag.ok { background: rgba(81,207,102,0.12); color: #51CF66; }
        .empty-state { padding: 30px; text-align: center; color: #6b6b7b; font-style: italic; font-size: 12px; }

        /* Chat */
        .chat-panel { background: #141418; border: 1px solid #2d2d35; border-radius: 10px; display: flex; flex-direction: column; max-height: 480px; height: 420px; }
        .chat-header { padding: 14px 16px; border-bottom: 1px solid #2d2d35; font-size: 13px; font-weight: 600; color: #fff; }
        .chat-bubble { max-width: 90%; padding: 12px 16px; border-radius: 12px; font-size: 12.5px; line-height: 1.6; position: relative; }
        .chat-bubble.ai { background: #1a1a1f; align-self: flex-start; color: #d4d4d4; border: 1px solid rgba(255,255,255,0.05); }
        .chat-bubble.user { background: #4a9eff; align-self: flex-end; color: #fff; box-shadow: 0 4px 12px rgba(74,158,255,0.2); }
        .chat-disabled { opacity: 0.5; pointer-events: none; }
        .chat-input { flex: 1; background: #1a1a1f; border: 1px solid #2d2d35; color: #d4d4d4; padding: 10px 12px; border-radius: 8px; font-size: 12px; outline: none; }
        .chat-input:focus { border-color: #4a9eff; }

        /* Assistant Message Formatting */
        .ai-bubble-content strong { color: #4a9eff; font-weight: 600; }
        .ai-bubble-content .h3-style { color: #4a9eff; font-size: 14px; font-weight: 700; margin-top: 14px; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid rgba(74,158,255,0.2); padding-bottom: 2px; }
        .ai-bubble-content .h4-style { color: #7ebbff; font-size: 13px; font-weight: 600; margin-top: 10px; margin-bottom: 4px; display: flex; align-items: center; }
        .ai-bubble-content .h4-style::before { content: '→'; margin-right: 6px; opacity: 0.6; }
        .ai-bubble-content ul { margin: 8px 0; padding-left: 18px; list-style: none; }
        .ai-bubble-content li { position: relative; margin-bottom: 4px; }
        .ai-bubble-content li::before { content: '•'; position: absolute; left: -14px; color: #4a9eff; font-weight: bold; }
        .ai-bubble-content code { background: rgba(255,255,255,0.08); padding: 2px 5px; border-radius: 4px; font-family: monospace; color: #7ebbff; font-size: 0.9em; }
        .ai-bubble-content pre { background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 10px; margin: 10px 0; overflow-x: auto; font-family: monospace; }
        .ai-bubble-content pre code { background: transparent; padding: 0; color: #eeeeee; }

    </style>
</head>
<body>

<!-- ═══ LANDING ══════════════════════════════════════ -->
<div id="landing" class="screen active">
    <div class="landing-brand">
        <span class="logo-icon">AIL</span>
        <h1><span>AIL</span> Mission Control</h1>
        <p class="tagline">Architectural Intelligence Layer — analyze codebases with AST parsing, git intelligence, knowledge graphs, and AI-powered insights.</p>
    </div>
    <div id="landing-status" class="landing-status"></div>
    <div class="landing-actions">
        <div class="action-card disabled" id="card-existing" onclick="handleUseExisting()">
            <div class="card-icon">LOAD</div>
            <h3>Use Current Analysis</h3>
            <p>Load your previous analysis results directly. No scanning — just opens the dashboard with existing .ail data.</p>
            <div class="card-btn">Open Dashboard</div>
        </div>
        <div class="action-card" id="card-fresh" onclick="handleRunFresh()">
            <div class="card-icon">RUN</div>
            <h3>Run Fresh Analysis</h3>
            <p>Purges any existing .ail data and performs a full codebase scan from scratch — files, AST, git history, and knowledge graph.</p>
            <div class="card-btn">Start Fresh</div>
        </div>
    </div>
</div>

<!-- ═══ GLASS PROGRESS OVERLAY ═══════════════════════ -->
<div id="progress-overlay">
    <div class="glass-card">
        <h2>Analyzing Repository</h2>
        <div class="progress-track"><div class="progress-fill" id="prog-fill"></div></div>
        <div class="progress-text" id="prog-text">Preparing...</div>
    </div>
</div>

<!-- ═══ DASHBOARD ════════════════════════════════════ -->
<div id="dashboard" class="screen">
    <div id="dash-header">
        <h1>AIL Mission Control</h1>
        <div class="actions">
            <button class="btn outline" onclick="goHome()">← Home</button>
            <button class="btn outline" onclick="purgeCache()">Purge Cache</button>
            <button class="btn outline" onclick="selectModel()">Select Model</button>
            <button class="btn green" id="btn-load-graphs" onclick="handleLoadGraphs()" disabled>Open Graph View</button>
        </div>
    </div>
    <div class="dash-content">
        <div id="cards-view">
            <div class="overview-card" id="overview-card"><div class="empty-state">No data</div></div>
            <div class="highlights-card" id="highlights-card">
                <div class="highlights-head">
                    <div class="highlights-title">Repository Highlights</div>
                    <div class="highlights-sub">Key moments and activity signals</div>
                </div>
                <div class="highlights-list" id="highlights-list">
                    <div class="empty-state">Run analysis to generate highlights.</div>
                </div>
            </div>
            <div class="metric-grid" id="metric-grid"></div>
            <div class="chat-panel">
                <div class="chat-header">Architecture GraphRAG Agent</div>
                <div class="scroll-area" id="chat-history" style="padding:14px;display:flex;flex-direction:column;gap:10px;">
                    <div class="chat-bubble ai">Hello! I'm your Architectural Intelligence Agent. Ask me anything about the codebase.</div>
                </div>
                <div id="chat-controls" style="padding:10px 14px;border-top:1px solid #2d2d35;background:#141418;display:flex;gap:8px;flex-shrink:0;">
                    <input type="text" id="chat-input" class="chat-input" placeholder="Ask about architecture, risk, specific functions..." onkeypress="if(event.key==='Enter'){event.preventDefault();sendChat();}"/>
                    <button class="btn" onclick="sendChat()">Send</button>
                </div>
            </div>
        </div>
        <div id="detail-view"></div>
    </div>
</div>

<script>
    const vscode = acquireVsCodeApi();
    let dashData = {};
    let ailExists = false;

    const LANG_COLORS = {
        'TypeScript':'#3178c6','JavaScript':'#f1e05a','Python':'#3572A5','Java':'#b07219',
        'Go':'#00ADD8','Rust':'#dea584','C++':'#f34b7d','C#':'#178600','Ruby':'#701516',
        'PHP':'#4F5D95','Swift':'#F05138','Kotlin':'#A97BFF','HTML':'#e34c26','CSS':'#563d7c',
        'JSON':'#858585','YAML':'#cb171e','Markdown':'#083fa1'
    };

    function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function fname(p) { return String(p||'').split(/[\\\\/]/).pop() || p; }
    function safeNum(v) { return (typeof v === 'number' && !isNaN(v) && isFinite(v)) ? v : 0; }
    function safePercent(v) { var n = safeNum(v); return Math.round(n * 100); }

    /* ── SCREEN SWITCHING ─────────────────────────── */
    function showScreen(id) {
        document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
        document.getElementById(id).classList.add('active');
    }

    /* ── LANDING ──────────────────────────────────── */
    function updateLanding() {
        var statusEl = document.getElementById('landing-status');
        var existingCard = document.getElementById('card-existing');
        if (ailExists) {
            statusEl.innerHTML = '<div class="status-badge found">✓ Previous analysis found</div><br>Your .ail data is available. Load it or start fresh.';
            existingCard.classList.remove('disabled');
        } else {
            statusEl.innerHTML = '<div class="status-badge none">No analysis found</div><br>Run a fresh scan to analyze your codebase.';
            existingCard.classList.add('disabled');
        }
    }

    function handleUseExisting() {
        if (!ailExists) return;
        vscode.postMessage({ command: 'useCurrentAnalysis' });
    }

    function handleRunFresh() {
        showOverlay();
        vscode.postMessage({ command: 'runFreshAnalysis' });
    }

    function goHome() {
        showScreen('landing');
        vscode.postMessage({ command: 'requestData' });
    }

    function handleLoadGraphs() { vscode.postMessage({ command: 'loadGraphs' }); }
    function purgeCache() { vscode.postMessage({ command: 'requestPurge' }); }
    function selectModel() { vscode.postMessage({ command: 'selectModel' }); }

    /* ── PROGRESS OVERLAY ────────────────────────── */
    var layerTexts = {
        0: 'Preparing analysis pipeline...',
        1: 'Scanning repository — files, languages, frameworks...',
        2: 'Parsing code structure — AST, entities, imports...',
        3: 'Mining git history — churn, coupling, blast radius...',
        4: 'Building knowledge graph — risk scoring, summary...',
        5: 'Analysis complete!'
    };

    function showOverlay() {
        var o = document.getElementById('progress-overlay');
        o.classList.add('active');
        document.getElementById('prog-fill').style.width = '0%';
        document.getElementById('prog-text').textContent = layerTexts[0];
    }

    function hideOverlay() {
        document.getElementById('progress-overlay').classList.remove('active');
    }

    function updateOverlay(layer, status) {
        var fill = document.getElementById('prog-fill');
        var text = document.getElementById('prog-text');
        if (status === 'running') {
            fill.style.width = ((layer - 1) * 25) + '%';
            text.textContent = layerTexts[layer] || 'Processing...';
        } else if (status === 'complete') {
            fill.style.width = (layer * 25) + '%';
            if (layer === 4) {
                text.textContent = layerTexts[5];
            }
        } else if (status === 'error') {
            text.textContent = 'Error at step ' + layer + '. Check console.';
        }
    }

    /* ── OVERVIEW CARD ───────────────────────────── */
    function renderOverview() {
        var card = document.getElementById('overview-card');
        var l1 = dashData.l1_manifest;
        if (!l1) { card.innerHTML = '<div class="empty-state">No data</div>'; return; }

        var projectName = (l1.workspacePath || '').split(/[\\\\/]/).pop() || 'Project';
        var execModel = l1.executionModel || {};
        var frameworks = (l1.frameworks && l1.frameworks.frameworks) || [];
        var langs = (l1.languages && l1.languages.languages) || [];
        var metrics = l1.metrics || {};
        var deps = l1.dependencies || {};
        var depDepth = l1.dependencyDepth || {};
        var directDeps = (deps.direct || []).length;
        var transitiveDeps = (deps.transitive || []).length;
        var totalDeps = directDeps + transitiveDeps;

        var h = '';
        h += '<div class="project-name">' + esc(projectName) + '</div>';
        h += '<div class="project-badges">';
        if (execModel.model) h += '<span class="badge type">' + esc(execModel.model) + '</span>';
        var conf = safePercent(execModel.confidence);
        if (conf > 0) h += '<span class="badge type" style="background:rgba(255,212,59,0.1);color:#ffd43b;">' + conf + '% confidence</span>';
        for (var i = 0; i < frameworks.length; i++) { h += '<span class="badge fw">' + esc(frameworks[i].name) + '</span>'; }
        if (l1.primaryLanguage) h += '<span class="badge lang">' + esc(l1.primaryLanguage) + '</span>';
        h += '</div>';
        if (execModel.reasoning) h += '<div class="overview-desc">' + esc(execModel.reasoning) + '</div>';

        if (langs.length > 0) {
            h += '<div class="lang-bar-container"><div class="lang-bar-label">Language Distribution</div><div class="lang-bar">';
            for (var j = 0; j < langs.length; j++) {
                var color = LANG_COLORS[langs[j].name] || '#6b6b7b';
                var pct = safeNum(langs[j].percentage);
                h += '<div class="segment" style="width:' + pct.toFixed(1) + '%;background:' + color + ';" title="' + esc(langs[j].name) + ' ' + pct.toFixed(1) + '%"></div>';
            }
            h += '</div><div class="lang-legend">';
            for (var k = 0; k < langs.length; k++) {
                var c2 = LANG_COLORS[langs[k].name] || '#6b6b7b';
                h += '<div class="lang-legend-item"><div class="lang-dot" style="background:' + c2 + ';"></div>' + esc(langs[k].name) + ' <span style="color:#6b6b7b;">' + safeNum(langs[k].percentage).toFixed(1) + '%</span></div>';
            }
            h += '</div></div>';
        }

        h += '<div class="stats-row">';
        h += statBox(safeNum(metrics.totalFiles), 'Source Files');
        h += statBox(safeNum(metrics.totalLines).toLocaleString(), 'Lines of Code');
        h += statBox(formatSize(safeNum(metrics.totalSizeKB)), 'Total Size');
        h += statBox(safeNum(metrics.avgLinesPerFile), 'Avg Lines/File');
        if (totalDeps > 0) h += statBox(totalDeps, 'Dependencies');
        if (depDepth.riskLevel) {
            var dc = depDepth.riskLevel === 'low' ? '#51CF66' : depDepth.riskLevel === 'medium' ? '#FFD43B' : '#ff4a4a';
            h += '<div class="stat-box"><div class="stat-val" style="color:' + dc + ';">' + esc(depDepth.riskLevel) + '</div><div class="stat-label">Dep. Risk</div></div>';
        }
        var epCount = (l1.entryPoints && l1.entryPoints.entryPoints) ? l1.entryPoints.entryPoints.length : 0;
        if (epCount > 0) h += statBox(epCount, 'Entry Points');
        h += '</div>';
        h += '</div>';
        card.onclick = () => openDetail('metadata');
        card.innerHTML = h;
    }


    function statBox(v, l) { return '<div class="stat-box"><div class="stat-val">' + v + '</div><div class="stat-label">' + l + '</div></div>'; }
    function formatSize(kb) { return kb > 1024 ? (kb/1024).toFixed(1)+' MB' : Math.round(kb)+' KB'; }

    function toShortDate(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        return d.toISOString().slice(0, 10);
    }

    function highlightItem(tag, text, meta) {
        var m = meta ? '<div class="highlight-meta">' + esc(meta) + '</div>' : '<div class="highlight-meta">&nbsp;</div>';
        return '<div class="highlight-item">'
            + '<div class="highlight-top"><span class="highlight-tag">' + esc(tag) + '</span>' + m + '</div>'
            + '<div class="highlight-text">' + esc(text) + '</div>'
            + '</div>';
    }

    function renderHighlights() {
        var listEl = document.getElementById('highlights-list');
        if (!listEl) return;

        var highlights = [];
        var l3c = dashData.l3_churn || {};
        var l3b = dashData.l3_blast || {};
        var l3p = dashData.l3_coupling || {};
        var l3k = dashData.l3_commits || {};
        var l3u = dashData.l3_contributors || {};
        var l4s = dashData.l4_summary || {};

        var spots = l4s.riskHotspots || [];
        var critical = spots.filter(function(s) { return s.level === 'critical'; });
        var high = spots.filter(function(s) { return s.level === 'high'; });
        if (critical.length > 0 || high.length > 0) {
            highlights.push({
                tag: 'Risk',
                text: critical.length + ' critical and ' + high.length + ' high-risk entities need priority hardening.',
                meta: spots.length + ' scored nodes'
            });
        }

        var commits = l3k.commits || [];
        if (commits.length > 0) {
            var latest = commits[0];
            highlights.push({
                tag: 'Latest Commit',
                text: (latest.author || 'Unknown') + ' changed ' + safeNum(latest.filesChanged) + ' files: ' + (latest.message || 'No message'),
                meta: toShortDate(latest.date)
            });
        }

        var highImpact = l3b.highImpactCommits || [];
        if (highImpact.length > 0) {
            var topImpact = highImpact[0];
            highlights.push({
                tag: 'Blast Radius',
                text: 'Highest-impact commit touches ' + safeNum(topImpact.blastRadius) + ' files transitively.',
                meta: (topImpact.hash || '').slice(0, 7) + ' by ' + (topImpact.author || 'unknown')
            });
        }

        var hotFiles = l3c.hotFiles || [];
        if (hotFiles.length > 0) {
            var firstHot = hotFiles[0];
            highlights.push({
                tag: 'Hotspot',
                text: hotFiles.length + ' files are high-churn. Top volatile file: ' + fname(firstHot.file || 'unknown') + '.',
                meta: 'focus test coverage'
            });
        }

        var strongPairs = l3p.stronglyCoupled || [];
        if (strongPairs.length > 0) {
            var pair = strongPairs[0];
            var pct = Math.round(safeNum(pair.couplingStrength) * 100);
            highlights.push({
                tag: 'Coupling',
                text: fname(pair.fileA) + ' and ' + fname(pair.fileB) + ' co-change at ' + pct + '% strength.',
                meta: safeNum(pair.coChanges) + ' co-change commits'
            });
        }

        var contributors = l3u.contributors || [];
        if (contributors.length > 0) {
            var topContributor = contributors[0];
            highlights.push({
                tag: 'Ownership',
                text: 'Top contributor is ' + (topContributor.name || 'Unknown') + ' with ' + safeNum(topContributor.commits) + ' commits.',
                meta: contributors.length + ' contributors total'
            });
        }

        if (highlights.length === 0) {
            listEl.innerHTML = '<div class="empty-state">No highlight signals yet. Run analysis to populate key moments.</div>';
            return;
        }

        highlights = highlights.slice(0, 6);
        var html = '';
        for (var i = 0; i < highlights.length; i++) {
            html += highlightItem(highlights[i].tag, highlights[i].text, highlights[i].meta);
        }
        listEl.innerHTML = html;
    }

    /* ── METRIC CARDS ────────────────────────────── */
    var metricDefs = [
        { id: 'risk',       icon: 'RK', title: 'Risk Hotspots',       desc: 'Identifies bug-prone code by combining complexity, high churn, and tight coupling into a single RPI score.' },
        { id: 'complexity', icon: 'CX', title: 'Code Complexity',     desc: 'Highlights functions with excessive branching (Cyclomatic > 10) requiring refactoring for maintainability.' },
        { id: 'churn',      icon: 'CH', title: 'File Churn',          desc: 'Reveals structurally volatile files or stale code blocks to track accumulating technical debt.' },
        { id: 'blast',      icon: 'BR', title: 'Blast Radius',        desc: 'Calculates transitive impact across imports, spotting modules that break distant systems when modified.' },
        { id: 'coupling',   icon: 'CP', title: 'Hidden Coupling',     desc: 'Detects file pairs that frequently change together in Git to expose implicit, undocumented dependencies.' },
        { id: 'entities',   icon: 'EN', title: 'Code Entities',       desc: 'Catalogs all parsed structural boundaries (functions, classes) to fuel the semantic knowledge graph.' }
    ];



    function renderMetricCards() {
        var grid = document.getElementById('metric-grid');
        var h = '';
        for (var i = 0; i < metricDefs.length; i++) {
            var m = metricDefs[i];
            var stat = getMetricStat(m.id);
            h += '<div class="metric-card" onclick="openDetail(\\'' + m.id + '\\')">';
            h += '<div class="mc-icon">' + m.icon + '</div>';
            h += '<div class="mc-title">' + m.title + '</div>';
            h += '<div class="mc-stat">' + stat + '</div>';
            h += '<div class="mc-desc">' + m.desc + '</div>';
            h += '</div>';
        }
        grid.innerHTML = h;
    }

    function getMetricStat(id) {
        var l2c = dashData.l2_complexity;
        var l3c = dashData.l3_churn;
        var l3b = dashData.l3_blast;
        var l3p = dashData.l3_coupling;
        var l4s = dashData.l4_summary;
        var l2e = dashData.l2_entities;

        if (id === 'risk') {
            if (!l4s || !l4s.riskHotspots) return 'No data';
            var crit = 0, high = 0;
            for (var i = 0; i < l4s.riskHotspots.length; i++) {
                if (l4s.riskHotspots[i].level === 'critical') crit++;
                if (l4s.riskHotspots[i].level === 'high') high++;
            }
            return crit + ' critical, ' + high + ' high risk';
        }
        if (id === 'complexity') {
            if (!l2c || !l2c.functions) return 'No data';
            var complex = 0;
            for (var j = 0; j < l2c.functions.length; j++) { if (l2c.functions[j].cyclomatic > 10) complex++; }
            return complex + ' complex functions (>10)';
        }
        if (id === 'churn') {
            if (!l3c) return 'No data';
            var hot = (l3c.hotFiles || []).length;
            var stale = (l3c.staleFiles || []).length;
            return hot + ' hot, ' + stale + ' stale files';
        }
        if (id === 'blast') {
            if (!l3b) return 'No data';
            return 'Avg radius: ' + safeNum(l3b.avgBlastRadius).toFixed(1) + ' files';
        }
        if (id === 'coupling') {
            if (!l3p || !l3p.stronglyCoupled) return 'No data';
            return l3p.stronglyCoupled.length + ' strongly coupled pairs';
        }
        if (id === 'entities') {
            if (!l2e || !l2e.entities) return 'No data';
            var fns = 0, cls = 0;
            for (var k = 0; k < l2e.entities.length; k++) {
                if (l2e.entities[k].type === 'function') fns++;
                if (l2e.entities[k].type === 'class') cls++;
            }
            return fns + ' functions, ' + cls + ' classes';
        }
        if (id === 'metadata') {
            var l1 = dashData.l1_manifest;
            if (!l1) return 'No data';
            return (l1.primaryLanguage || 'Unknown') + ' | ' + (l1.metrics?.totalFiles || 0) + ' files';
        }
        return 'No data';

    }

    /* ── DETAIL PANEL ────────────────────────────── */
    function openDetail(id) {
        document.getElementById('cards-view').classList.add('hidden');
        var dv = document.getElementById('detail-view');
        dv.classList.add('active');
        dv.innerHTML = buildDetail(id);
        dv.scrollTop = 0;
    }

    function closeDetail() {
        document.getElementById('detail-view').classList.remove('active');
        document.getElementById('detail-view').innerHTML = '';
        document.getElementById('cards-view').classList.remove('hidden');
    }

    function buildDetail(id) {
        var h = '<button class="detail-back" onclick="closeDetail()">← Back to Dashboard</button>';

        if (id === 'risk') {
            var l4s = dashData.l4_summary;
            var spots = (l4s && l4s.riskHotspots) || [];
            h += '<div class="detail-header"><h2>🔴 Risk Hotspots</h2>';
            h += '<p>The Risk Priority Index (RPI) combines cyclomatic complexity (40%), file churn (40%), and coupling degree (20%) into a single score. Higher scores indicate code that is complex, frequently changing, and tightly coupled — making it the most likely source of bugs.</p></div>';
            var crit=0, hi=0, med=0;
            for (var i=0;i<spots.length;i++) { if (spots[i].level==='critical') crit++; else if (spots[i].level==='high') hi++; else if (spots[i].level==='medium') med++; }
            h += '<div class="detail-insights">';
            h += insightChip(crit, 'Critical', '#ff4a4a');
            h += insightChip(hi, 'High', '#FFD43B');
            h += insightChip(med, 'Medium', '#90cdf4');
            h += insightChip(spots.length, 'Total Scored');
            h += '</div>';
            h += '<div class="detail-table-wrap"><div class="scroll-area"><table><thead><tr><th>Entity</th><th>File</th><th>RPI Score</th><th>Level</th></tr></thead><tbody>';
            for (var j=0;j<spots.length;j++) {
                var r = spots[j];
                var sc = safeNum(r.riskScore).toFixed(2);
                var tag = r.level==='critical' ? '<span class="tag hot">CRITICAL</span>' : r.level==='high' ? '<span class="tag warn">HIGH</span>' : r.level==='medium' ? '<span class="tag info">MEDIUM</span>' : '<span class="tag ok">LOW</span>';
                h += '<tr><td><strong>'+esc(r.name)+'</strong></td><td>'+esc(fname(r.file))+'</td><td>'+sc+'</td><td>'+tag+'</td></tr>';
            }
            h += '</tbody></table></div></div>';
        }

        else if (id === 'complexity') {
            var l2c = dashData.l2_complexity;
            var fns = (l2c && l2c.functions) || [];
            h += '<div class="detail-header"><h2>Cyclomatic Complexity</h2>';
            h += '<p>Cyclomatic complexity measures the number of independent paths through a function. Values above 10 indicate functions that are harder to test and maintain. Each branch (if, for, while, switch case, catch, ternary, &&, ||) adds one to the count.</p></div>';
            var complex = 0;
            for (var a=0;a<fns.length;a++) { if (fns[a].cyclomatic > 10) complex++; }
            h += '<div class="detail-insights">';
            h += insightChip(complex, 'Complex (>10)', '#FFD43B');
            h += insightChip(fns.length, 'Total Analyzed');
            if (fns.length > 0) h += insightChip(fns[0].cyclomatic, 'Highest');
            h += '</div>';
            h += '<div class="detail-table-wrap"><div class="scroll-area"><table><thead><tr><th>Function</th><th>File</th><th>Cyclomatic</th><th>Nesting</th></tr></thead><tbody>';
            for (var b=0;b<fns.length;b++) {
                var f = fns[b];
                var color = f.cyclomatic > 10 ? '#FFD43B' : '#51CF66';
                h += '<tr><td><strong>'+esc(f.entityName)+'</strong></td><td>'+esc(fname(f.file))+'</td><td style="color:'+color+';">'+f.cyclomatic+'</td><td>'+safeNum(f.nestingDepth)+'</td></tr>';
            }
            h += '</tbody></table></div></div>';
        }

        else if (id === 'churn') {
            var l3c = dashData.l3_churn;
            var files = (l3c && l3c.files) || [];
            var hotCount = (l3c && l3c.hotFiles) ? l3c.hotFiles.length : 0;
            var staleCount = (l3c && l3c.staleFiles) ? l3c.staleFiles.length : 0;
            h += '<div class="detail-header"><h2>🔥 File Churn Analysis</h2>';
            h += '<p>File churn measures how frequently files change. "Hot" files are in the top 10% by change frequency — they are evolving rapidly and may need extra test coverage. "Stale" files have not been touched in 6+ months and may contain outdated code.</p></div>';
            h += '<div class="detail-insights">';
            h += insightChip(hotCount, 'Hot Files', '#ff4a4a');
            h += insightChip(staleCount, 'Stale Files', '#858585');
            h += insightChip(files.length, 'Total Tracked');
            h += '</div>';
            h += '<div class="detail-table-wrap"><div class="scroll-area"><table><thead><tr><th>File</th><th>Commits</th><th>Insertions</th><th>Deletions</th><th>Status</th></tr></thead><tbody>';
            for (var c=0;c<files.length;c++) {
                var fl = files[c];
                var tag2 = fl.isHot ? '<span class="tag hot">HOT</span>' : fl.isStale ? '<span class="tag info">STALE</span>' : '';
                h += '<tr><td>'+esc(fname(fl.file))+'</td><td>'+safeNum(fl.commits)+'</td><td style="color:#51CF66;">+'+safeNum(fl.insertions)+'</td><td style="color:#ff4a4a;">-'+safeNum(fl.deletions)+'</td><td>'+tag2+'</td></tr>';
            }
            h += '</tbody></table></div></div>';
        }

        else if (id === 'blast') {
            var l3b = dashData.l3_blast;
            var commits = (l3b && l3b.highImpactCommits) || [];
            h += '<div class="detail-header"><h2>Blast Radius Analysis</h2>';
            h += '<p>Blast radius measures how many files are transitively affected when a commit changes a file. It follows the import graph — if file A imports B which imports C, changing C has a blast radius covering A and B. High blast radius commits are risky because a single bug can propagate widely.</p></div>';
            h += '<div class="detail-insights">';
            h += insightChip(safeNum(l3b && l3b.avgBlastRadius).toFixed(1), 'Avg Radius');
            h += insightChip(commits.length, 'High Impact');
            if (commits.length > 0) h += insightChip(safeNum(commits[0].blastRadius), 'Max Radius');
            h += '</div>';
            h += '<div class="detail-table-wrap"><div class="scroll-area"><table><thead><tr><th>Commit</th><th>Author</th><th>Radius</th><th>Message</th></tr></thead><tbody>';
            for (var d=0;d<commits.length;d++) {
                var cm = commits[d];
                var rad = safeNum(cm.blastRadius);
                var tag3 = rad > 15 ? '<span class="tag hot">HIGH</span>' : '';
                h += '<tr><td style="font-family:monospace;font-size:10px;">'+esc(cm.hash.substring(0,7))+'</td><td>'+esc(cm.author)+'</td><td style="color:'+(rad>15?'#FFD43B':'#51CF66')+';">'+rad+' '+tag3+'</td><td>'+esc(cm.message)+'</td></tr>';
            }
            h += '</tbody></table></div></div>';
        }

        else if (id === 'coupling') {
            var l3p = dashData.l3_coupling;
            var pairs = (l3p && l3p.pairs) || [];
            var strong = (l3p && l3p.stronglyCoupled) || [];
            h += '<div class="detail-header"><h2>🔗 Hidden Coupling Analysis</h2>';
            h += '<p>Co-change coupling detects files that frequently change together in the same commits — even when they have no direct import relationship. Strong coupling (>60%) may indicate hidden dependencies, shared assumptions, or code that should be refactored into a single module.</p></div>';
            h += '<div class="detail-insights">';
            h += insightChip(strong.length, 'Strong (>60%)', '#ff4a4a');
            h += insightChip(pairs.length, 'Total Pairs');
            h += '</div>';
            h += '<div class="detail-table-wrap"><div class="scroll-area"><table><thead><tr><th>File A</th><th>File B</th><th>Co-Changes</th><th>Coupling</th></tr></thead><tbody>';
            for (var e=0;e<pairs.length;e++) {
                var p = pairs[e];
                var pct = Math.round(safeNum(p.couplingStrength)*100);
                var tag4 = pct > 60 ? '<span class="tag hot">STRONG</span>' : pct > 30 ? '<span class="tag warn">MODERATE</span>' : '';
                h += '<tr><td>'+esc(fname(p.fileA))+'</td><td>'+esc(fname(p.fileB))+'</td><td>'+safeNum(p.coChanges)+'</td><td style="color:'+(pct>60?'#FFD43B':'#51CF66')+';">'+pct+'% '+tag4+'</td></tr>';
            }
            h += '</tbody></table></div></div>';
        }

        else if (id === 'entities') {
            var l2e = dashData.l2_entities;
            var entities = (l2e && l2e.entities) || [];
            var fns2=0, cls2=0, iface=0, methods=0;
            for (var f2=0;f2<entities.length;f2++) {
                var t = entities[f2].type;
                if (t==='function') fns2++; else if (t==='class') cls2++; else if (t==='interface') iface++; else if (t==='method') methods++;
            }
            h += '<div class="detail-header"><h2>📦 Code Entities</h2>';
            h += '<p>All code entities detected through AST parsing — functions, classes, interfaces, methods, type aliases, and more. These form the nodes of the knowledge graph.</p></div>';
            h += '<div class="detail-insights">';
            h += insightChip(fns2, 'Functions');
            h += insightChip(cls2, 'Classes');
            h += insightChip(iface, 'Interfaces');
            h += insightChip(methods, 'Methods');
            h += insightChip(entities.length, 'Total');
            h += '</div>';
            h += '<div class="detail-table-wrap"><div class="scroll-area"><table><thead><tr><th>Name</th><th>Type</th><th>File</th><th>Line</th><th>Exported</th></tr></thead><tbody>';
            for (var g=0;g<entities.length;g++) {
                var en = entities[g];
                h += '<tr><td><strong>'+esc(en.name)+'</strong></td><td><span class="tag fn">'+esc(en.type)+'</span></td><td>'+esc(fname(en.file))+'</td><td>L'+safeNum(en.startLine)+'</td><td>'+(en.exported?'✓':'')+'</td></tr>';
            }
            h += '</tbody></table></div></div>';
        }

        else if (id === 'metadata') {
            var l1 = dashData.l1_manifest;
            if (!l1) { h += '<div class="empty-state">No Layer 1 metadata found.</div>'; return h; }
            
            h += '<div class="detail-header"><h2>Repository Metadata</h2>';
            h += '<p>Detailed analysis from Phase 1 — including language distribution, execution model inference, entry points, and framework detection.</p></div>';

            h += '<div class="detail-insights">';
            h += insightChip(l1.primaryLanguage || 'N/A', 'Primary');
            h += insightChip(l1.executionModel?.model || 'N/A', 'Exec Model');
            h += insightChip(l1.frameworks?.totalFound || 0, 'Frameworks');
            h += insightChip(l1.entryPoints?.totalFound || 0, 'Entry Points');
            h += '</div>';

            h += '<div class="detail-header"><h3>Language Distribution</h3></div>';
            h += '<div class="detail-table-wrap"><div class="scroll-area"><table><thead><tr><th>Language</th><th>Files</th><th>Percentage</th></tr></thead><tbody>';
            var langs = (l1.languages && l1.languages.languages) || [];
            for (var lang of langs) {
                h += '<tr><td><strong>'+esc(lang.name)+'</strong></td><td>'+lang.fileCount+'</td><td>'+lang.percentage.toFixed(1)+'%</td></tr>';
            }
            h += '</tbody></table></div></div><br>';

            h += '<div class="detail-header"><h3>Inferred Entry Points</h3></div>';
            h += '<div class="detail-table-wrap"><div class="scroll-area"><table><thead><tr><th>File</th><th>Type</th><th>Confidence</th><th>Language</th></tr></thead><tbody>';
            var eps = (l1.entryPoints && l1.entryPoints.entryPoints) || [];
            for (var ep of eps) {
                h += '<tr><td>'+esc(fname(ep.file))+'</td><td><span class="tag info">'+ep.type+'</span></td><td>'+ep.confidence+'</td><td>'+ep.language+'</td></tr>';
            }
            h += '</tbody></table></div></div><br>';

            h += '<div class="detail-header"><h3>Detected Frameworks</h3></div>';
            h += '<div class="detail-table-wrap"><div class="scroll-area"><table><thead><tr><th>Name</th><th>Type</th><th>Language</th><th>Detection Source</th></tr></thead><tbody>';
            var fws = (l1.frameworks && l1.frameworks.frameworks) || [];
            for (var fw of fws) {
                h += '<tr><td><strong>'+esc(fw.name)+'</strong></td><td>'+fw.type+'</td><td>'+fw.language+'</td><td>'+esc(fname(fw.source))+'</td></tr>';
            }
            h += '</tbody></table></div></div><br>';

            h += '<div class="detail-header"><h3>Layer 2 Code Architecture</h3></div>';
            var l2e = dashData.l2_entities || { entities: [] };
            var ents = l2e.entities || [];
            var counts = { function:0, class:0, interface:0, method:0, import:0, other:0 };
            for (var ent of ents) {
                if (counts[ent.type] !== undefined) counts[ent.type]++;
                else counts.other++;
            }
            h += '<div class="detail-insights">';
            h += insightChip(counts.function, 'Functions', '#4a9eff');
            h += insightChip(counts.class, 'Classes', '#a855f7');
            h += insightChip(counts.method, 'Methods', '#51CF66');
            h += insightChip(counts.interface, 'Interfaces', '#FFD43B');
            h += insightChip(counts.import || 'N/A', 'Imports', '#858585');
            h += '</div>';

            h += '<div class="detail-table-wrap"><div class="scroll-area"><table><thead><tr><th>Entity Category</th><th>Total Count</th><th>Architectural Impact</th></tr></thead><tbody>';
            h += '<tr><td><strong>Functions</strong></td><td>'+counts.function+'</td><td>Core logic units</td></tr>';
            h += '<tr><td><strong>Classes</strong></td><td>'+counts.class+'</td><td>State containers</td></tr>';
            h += '<tr><td><strong>Methods</strong></td><td>'+counts.method+'</td><td>Behavioral members</td></tr>';
            h += '<tr><td><strong>Interfaces/Types</strong></td><td>'+counts.interface+'</td><td>Structural contracts</td></tr>';
            h += '<tr><td><strong>Imports</strong></td><td>'+(counts.import || 0)+'</td><td>Dependency fan-in</td></tr>';
            h += '</tbody></table></div></div>';

        }


        return h;

    }

    function insightChip(val, label, color) {
        var style = color ? ' style="color:'+color+';"' : '';
        return '<div class="insight-chip"><div class="val"'+style+'>'+val+'</div><div class="lbl">'+label+'</div></div>';
    }

    /* ── RENDER DASHBOARD ────────────────────────── */
    function renderDashboard() {
        renderOverview();
        renderHighlights();
        renderMetricCards();
        var l4 = dashData.l4_manifest;
        document.getElementById('btn-load-graphs').disabled = !l4;
    }

    /* ── CHAT ─────────────────────────────────────── */
    var chatHistory = [];
    function sendChat() {
        var input = document.getElementById('chat-input');
        var q = input.value.trim();
        if (!q) return;
        appendChat('user', q);
        input.value = '';
        document.getElementById('chat-controls').classList.add('chat-disabled');
        vscode.postMessage({ command: 'askGraphRAG', query: q, history: chatHistory });
        chatHistory.push({ role: 'user', content: q });
    }
    function formatMessage(text) {
        var html = text;
        var bt = String.fromCharCode(96);
        var tbt = bt + bt + bt;
        // 1. Code Blocks
        var cbRegex = new RegExp(tbt + '(?:\\\\w+)?\\\\n([\\\\s\\\\S]*?)\\\\n' + tbt, 'g');
        html = html.replace(cbRegex, '<pre><code>$1</code></pre>');
        // 2. Headings
        html = html.replace(/^### (.*$)/gm, '<div class="h3-style">$1</div>');
        html = html.replace(/^#### (.*$)/gm, '<div class="h4-style">$1</div>');
        // 3. Bold (remove ** and wrap in strong)
        html = html.replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>');
        // 4. Lists
        html = html.replace(/^\\* (.*$)/gm, '<li>$1</li>');
        html = html.replace(/^- (.*$)/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\\/li>\\n?)+/g, function(m) { return '<ul>' + m + '</ul>'; });
        // 5. Inline Code
        var icRegex = new RegExp(bt + '([^' + bt + ']+)' + bt, 'g');
        html = html.replace(icRegex, '<code>$1</code>');
        // 6. Br
        html = html.replace(/\\n(?!<ul|<li|<\\/ul|<\\/li|<pre|<\\/pre|<div|<\\/div)/g, '<br/>');
        return html;
    }





    var currentAiBubble = null;
    function appendChat(role, text) {
        var hist = document.getElementById('chat-history');
        var b = document.createElement('div');
        b.className = 'chat-bubble ' + role;
        if (role === 'ai') {
            b.innerHTML = '<div class="ai-bubble-content">' + formatMessage(text) + '</div>';
            currentAiBubble = b;
        } else {
            b.textContent = text;
        }
        hist.appendChild(b);
        hist.scrollTop = hist.scrollHeight;
    }


    /* ── MESSAGE HANDLER ─────────────────────────── */
    window.addEventListener('message', function(e) {
        var msg = e.data;

        if (msg.command === 'dashboardData') {
            dashData = msg.data || {};
            ailExists = !!dashData.ailExists;
            /* On initial load — just update landing buttons, do NOT auto-navigate */
            updateLanding();
        }

        if (msg.command === 'showDashboard') {
            hideOverlay();
            showScreen('dashboard');
            renderDashboard();
        }

        if (msg.command === 'analysisStarted') {
            showOverlay();
        }

        if (msg.command === 'analysisCancelled') {
            hideOverlay();
            showScreen('landing');
            vscode.postMessage({ command: 'requestData' });
        }

        if (msg.command === 'layerStatus') {
            updateOverlay(msg.layer, msg.status);
        }

        if (msg.command === 'analysisComplete') {
            /* Data will arrive via dashboardData + showDashboard right after this */
        }

        if (msg.command === 'chatResponse') {
            if (msg.text === '...') {
                appendChat('ai', 'Thinking...');
            } else {
                if (currentAiBubble) {
                    currentAiBubble.innerHTML = '<div class="ai-bubble-content">' + formatMessage(msg.text) + '</div>';
                }
                chatHistory.push({ role: 'assistant', content: msg.text });
                document.getElementById('chat-controls').classList.remove('chat-disabled');
            }
        }

        if (msg.command === 'modelSelectionUpdated') {
            appendChat('ai', 'Model selection updated. Future AI requests will use your latest configuration.');
        }

    });

    /* Initial data request — only to check if .ail exists */
    setTimeout(function() { vscode.postMessage({ command: 'requestData' }); }, 100);
</script>
</body>
</html>`;
}