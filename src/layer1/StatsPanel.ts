import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class StatsPanel {
    private static currentPanel: vscode.WebviewPanel | undefined;

    public static createOrShow(): void {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('AIL: No workspace folder open');
            return;
        }

        const workspacePath = workspaceFolders[0].uri.fsPath;
        const metaPath      = path.join(workspacePath, '.ail', 'layer1', 'meta-data.json');

        if (!fs.existsSync(metaPath)) {
            vscode.window.showErrorMessage('AIL: No Layer 1 data found — run analysis first');
            return;
        }

        let metadata: any;
        try {
            metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        } catch {
            vscode.window.showErrorMessage('AIL: Failed to read Layer 1 meta-data.json');
            return;
        }

        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (StatsPanel.currentPanel) {
            StatsPanel.currentPanel.reveal(column);
            StatsPanel.currentPanel.webview.html = StatsPanel.getHTML(metadata);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'ailLayer1Stats',
            'AIL — Layer 1 Analysis',
            vscode.ViewColumn.Two,
            { enableScripts: true }
        );

        panel.webview.html = StatsPanel.getHTML(metadata);

        panel.onDidDispose(() => {
            StatsPanel.currentPanel = undefined;
        });

        StatsPanel.currentPanel = panel;
    }

    private static getHTML(meta: any): string {
const languages   = meta.languages       || {};
const frameworks  = meta.frameworks      || {};
const entryPoints = meta.entryPoints?.entryPoints || [];
const metrics     = meta.metrics         || {};
const deps        = meta.dependencies    || {};
const depDepth    = meta.dependencyDepth || {};

const langList   = languages.languages || [];
const totalLOC   = metrics.totalLines  || 0;
const totalFiles = metrics.totalFiles  || 0;

const langBars = langList.map((l: any) => `
    <div class="lang-row">
        <div class="lang-name">${l.name}</div>
        <div class="lang-bar-wrap">
            <div class="lang-bar" style="width:${l.percentage}%"></div>
        </div>
        <div class="lang-pct">${l.percentage}%</div>
    </div>
`).join('');

const frameworkTags = (frameworks.frameworks || []).map((f: any) => `
    <span class="tag">${f.name} <span style="color:#555;font-size:10px">${f.type}</span></span>
`).join('');

const entryList = entryPoints.map((e: any) => `
    <div class="entry-row">
        <span class="entry-icon">→</span>
        <span class="entry-path">${e.file}</span>
        <span class="tag" style="margin-left:auto">${e.type}</span>
    </div>
`).join('');

const depList = (deps.directList || []).map((d: string) => `
    <span class="tag">${d}</span>
`).join('');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            background:     #1e1e1e;
            color:          #d4d4d4;
            font-family:    -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            padding:        32px;
            overflow-y:     auto;
        }

        h1 {
            font-size:     20px;
            font-weight:   700;
            color:         #ffffff;
            margin-bottom: 4px;
        }

        .subtitle {
            font-size:     12px;
            color:         #858585;
            margin-bottom: 32px;
        }

        .grid {
            display:               grid;
            grid-template-columns: repeat(3, 1fr);
            gap:                   16px;
            margin-bottom:         24px;
        }

        .stat-card {
            background:    #252526;
            border:        1px solid #3e3e42;
            border-radius: 8px;
            padding:       16px 20px;
        }

        .stat-value {
            font-size:   28px;
            font-weight: 700;
            color:       #ffffff;
        }

        .stat-label {
            font-size:  12px;
            color:      #858585;
            margin-top: 4px;
        }

        .section {
            background:    #252526;
            border:        1px solid #3e3e42;
            border-radius: 8px;
            padding:       20px 24px;
            margin-bottom: 16px;
        }

        .section-title {
            font-size:     13px;
            font-weight:   600;
            color:         #cccccc;
            margin-bottom: 16px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .lang-row {
            display:       flex;
            align-items:   center;
            gap:           12px;
            margin-bottom: 10px;
        }

        .lang-name {
            font-size: 12px;
            color:     #d4d4d4;
            min-width: 90px;
        }

        .lang-bar-wrap {
            flex:          1;
            background:    #3e3e42;
            border-radius: 4px;
            height:        6px;
            overflow:      hidden;
        }

        .lang-bar {
            background:    #4A9EFF;
            height:        100%;
            border-radius: 4px;
            transition:    width 0.5s ease;
        }

        .lang-pct {
            font-size: 11px;
            color:     #858585;
            min-width: 36px;
            text-align: right;
        }

        .tag {
            display:       inline-block;
            background:    #2d2d30;
            border:        1px solid #3e3e42;
            color:         #d4d4d4;
            padding:       3px 10px;
            border-radius: 12px;
            font-size:     11px;
            margin:        3px;
        }

        .entry-row {
            display:       flex;
            align-items:   center;
            gap:           10px;
            padding:       6px 0;
            border-bottom: 1px solid #2d2d30;
            font-size:     12px;
        }

        .entry-row:last-child { border-bottom: none; }

        .entry-icon {
            color:     #4A9EFF;
            font-size: 14px;
        }

        .entry-path {
            color:       #d4d4d4;
            font-family: monospace;
            font-size:   11px;
        }

        .risk-badge {
            display:       inline-block;
            padding:       3px 10px;
            border-radius: 12px;
            font-size:     12px;
            font-weight:   600;
        }

        .risk-low    { background: rgba(81,207,102,0.15); color: #51CF66; }
        .risk-medium { background: rgba(255,212,59,0.15);  color: #FFD43B; }
        .risk-high   { background: rgba(255,107,107,0.15); color: #FF6B6B; }
    </style>
</head>
<body>

<h1>📊 Layer 1 — Repository Analysis</h1>
<div class="subtitle">Generated by AIL · ${meta.timestamp ? new Date(meta.timestamp).toLocaleString() : ''}</div>

<!-- STATS GRID -->
<div class="grid">
    <div class="stat-card">
        <div class="stat-value">${totalFiles}</div>
        <div class="stat-label">Total Files</div>
    </div>
    <div class="stat-card">
        <div class="stat-value">${totalLOC.toLocaleString()}</div>
        <div class="stat-label">Lines of Code</div>
    </div>
    <div class="stat-card">
        <div class="stat-value">${langList.length}</div>
        <div class="stat-label">Languages</div>
    </div>
    <div class="stat-card">
        <div class="stat-value">${(frameworks.frameworks || []).length}</div>
        <div class="stat-label">Frameworks</div>
    </div>
    <div class="stat-card">
        <div class="stat-value">${entryPoints.length}</div>
        <div class="stat-label">Entry Points</div>
    </div>
    <div class="stat-card">
        <div class="stat-value">${deps.totalDirect || 0}</div>
        <div class="stat-label">Direct Dependencies</div>
    </div>
    <div class="stat-card">
        <div class="stat-value">${deps.totalTransitive || 0}</div>
        <div class="stat-label">Transitive Dependencies</div>
    </div>
    <div class="stat-card">
        <div class="stat-value">
            <span class="risk-badge risk-${(depDepth.riskLevel || 'low').toLowerCase()}">
                ${depDepth.riskLevel || 'Low'}
            </span>
        </div>
        <div class="stat-label">Dependency Risk</div>
    </div>
</div>

<!-- LANGUAGES -->
<div class="section">
    <div class="section-title">Languages</div>
    ${langBars || '<div style="color:#555;font-size:12px">No language data</div>'}
</div>

<!-- FRAMEWORKS -->
<div class="section">
    <div class="section-title">Frameworks & Libraries</div>
    ${frameworkTags || '<div style="color:#555;font-size:12px">None detected</div>'}
</div>

<!-- ENTRY POINTS -->
<div class="section">
    <div class="section-title">Entry Points</div>
    ${entryList || '<div style="color:#555;font-size:12px">None detected</div>'}
</div>

<!-- DEPENDENCIES -->
<div class="section">
    <div class="section-title">Dependencies</div>
    ${depList || '<div style="color:#555;font-size:12px">None detected</div>'}
</div>

</body>
</html>`;
    }
}