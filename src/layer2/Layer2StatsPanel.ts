import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class Layer2StatsPanel {
    private static currentPanel: vscode.WebviewPanel | undefined;

    public static createOrShow(): void {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('AIL: No workspace folder open');
            return;
        }

        const workspacePath = workspaceFolders[0].uri.fsPath;
        const rawDir        = path.join(workspacePath, '.ail', 'layer2', 'raw_analysis');

        if (!fs.existsSync(rawDir)) {
            vscode.window.showErrorMessage('AIL: No Layer 2 data found — run Layer 2 analysis first');
            return;
        }

        const read = (file: string) => {
            try {
                return JSON.parse(fs.readFileSync(path.join(rawDir, file), 'utf-8'));
            } catch { return []; }
        };

        const data = {
            functions:   read('raw_functions.json'),
            classes:     read('raw_classes.json'),
            variables:   read('raw_variables.json'),
            funcCalls:   read('raw_func_calls.json'),
            imports:     read('raw_imports.json'),
            inheritance: read('raw_inheritance.json'),
            nodes:       read('nodes.json'),
            edges:       read('edges.json'),
        };

        if (Layer2StatsPanel.currentPanel) {
            Layer2StatsPanel.currentPanel.reveal(vscode.ViewColumn.Two);
            Layer2StatsPanel.currentPanel.webview.html = Layer2StatsPanel.getHTML(data);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'ailLayer2Stats',
            'AIL — Layer 2 Entities',
            vscode.ViewColumn.Two,
            { enableScripts: true }
        );

        panel.webview.html = Layer2StatsPanel.getHTML(data);
        panel.onDidDispose(() => { Layer2StatsPanel.currentPanel = undefined; });
        Layer2StatsPanel.currentPanel = panel;
    }

    private static getHTML(data: any): string {
        const { functions, classes, variables, funcCalls, imports, inheritance, edges } = data;

        // ── FUNCTIONS TABLE ──────────────────────────────
        const funcRows = functions.map((f: any) => {
            const complexity = f.complexity || 1;
            const color = complexity >= 10 ? '#FF0000'
                        : complexity >= 7  ? '#FF6B6B'
                        : complexity >= 5  ? '#FFD43B'
                        : complexity >= 3  ? '#74C0FC'
                        : '#51CF66';
            return `
                <tr>
                    <td class="mono">${f.name}</td>
                    <td class="grey">${f.file}</td>
                    <td>${f.line_start}${f.line_end ? ` – ${f.line_end}` : ''}</td>
                    <td>${f.loc || '—'}</td>
                    <td><span class="badge" style="color:${color};border-color:${color};background:${color}20">${complexity}</span></td>
                    <td>${f.is_async ? '<span class="badge blue">async</span>' : '—'}</td>
                    <td class="grey">${f.parent_class || '—'}</td>
                    <td class="grey">${(f.parameters || []).join(', ') || '—'}</td>
                </tr>
            `;
        }).join('');

        // ── CLASSES TABLE ────────────────────────────────
        const classRows = classes.map((c: any) => `
            <tr>
                <td class="mono">${c.name}</td>
                <td class="grey">${c.file}</td>
                <td>${c.line_start}${c.line_end ? ` – ${c.line_end}` : ''}</td>
                <td>${c.loc || '—'}</td>
                <td class="grey">${(c.methods || []).join(', ') || '—'}</td>
                <td class="grey">${(c.inherits || []).join(', ') || '—'}</td>
            </tr>
        `).join('');

        // ── VARIABLES TABLE ──────────────────────────────
        const varRows = variables.map((v: any) => `
            <tr>
                <td class="mono">${v.name}</td>
                <td class="grey">${v.file}</td>
                <td>${v.line || '—'}</td>
                <td class="grey mono">${v.value || '—'}</td>
            </tr>
        `).join('');

        // ── FUNC CALLS TABLE ─────────────────────────────
        const callRows = funcCalls.map((c: any) => `
            <tr>
                <td class="mono">${c.caller}</td>
                <td class="mono">${c.callee}</td>
                <td class="grey">${c.file}</td>
                <td>${c.line || '—'}</td>
            </tr>
        `).join('');

        // ── IMPORTS TABLE ────────────────────────────────
        const importRows = imports.map((i: any) => `
            <tr>
                <td class="grey">${i.file}</td>
                <td class="mono">${i.module}</td>
                <td class="grey">${(i.names || []).join(', ') || '—'}</td>
            </tr>
        `).join('');

        // ── INHERITANCE TABLE ────────────────────────────
        const inheritRows = inheritance.map((i: any) => `
            <tr>
                <td class="mono">${i.child}</td>
                <td class="mono">${i.parent}</td>
                <td class="grey">${i.file}</td>
            </tr>
        `).join('');

        // ── EDGES TABLE ──────────────────────────────────
        const edgeRows = edges.map((e: any) => `
            <tr>
                <td class="mono">${e.from}</td>
                <td class="mono">${e.to}</td>
                <td><span class="badge ${e.type === 'calls' ? 'blue' : e.type === 'imports' ? 'green' : 'red'}">${e.type}</span></td>
                <td>${e.call_count || '—'}</td>
            </tr>
        `).join('');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            background:  #1e1e1e;
            color:       #d4d4d4;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            padding:     32px;
            overflow-y:  auto;
        }

        h1 { font-size: 20px; font-weight: 700; color: #fff; margin-bottom: 4px; }
        .subtitle { font-size: 12px; color: #858585; margin-bottom: 24px; }

        /* SUMMARY GRID */
        .grid {
            display:               grid;
            grid-template-columns: repeat(6, 1fr);
            gap:                   10px;
            margin-bottom:         24px;
        }

        .stat-card {
            background:    #252526;
            border:        1px solid #3e3e42;
            border-radius: 8px;
            padding:       14px 16px;
            text-align:    center;
        }

        .stat-value { font-size: 22px; font-weight: 700; color: #fff; }
        .stat-label { font-size: 10px; color: #858585; margin-top: 4px; }

        /* SECTION */
        .section {
            background:    #252526;
            border:        1px solid #3e3e42;
            border-radius: 8px;
            margin-bottom: 16px;
            overflow:      hidden;
        }

        .section-header {
            padding:         12px 20px;
            border-bottom:   1px solid #3e3e42;
            display:         flex;
            align-items:     center;
            justify-content: space-between;
        }

        .section-title {
            font-size:  12px;
            font-weight: 600;
            color:      #cccccc;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .section-count {
            font-size:     11px;
            background:    #3e3e42;
            padding:       2px 8px;
            border-radius: 10px;
            color:         #d4d4d4;
        }

        /* TABLE */
        .table-wrap { overflow-x: auto; }

        table {
            width:           100%;
            border-collapse: collapse;
            font-size:       12px;
        }

        thead th {
            padding:       8px 16px;
            text-align:    left;
            font-size:     10px;
            font-weight:   600;
            color:         #858585;
            text-transform: uppercase;
            letter-spacing: 0.4px;
            border-bottom: 1px solid #3e3e42;
            background:    #2d2d30;
            white-space:   nowrap;
        }

        tbody tr {
            border-bottom: 1px solid #2d2d30;
            transition:    background 0.1s;
        }

        tbody tr:last-child { border-bottom: none; }
        tbody tr:hover { background: #2d2d30; }

        tbody td {
            padding:    8px 16px;
            color:      #d4d4d4;
            white-space: nowrap;
        }

        .mono  { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 11px; }
        .grey  { color: #858585; }

        .badge {
            display:       inline-block;
            font-size:     10px;
            font-weight:   600;
            padding:       2px 8px;
            border-radius: 10px;
            border:        1px solid transparent;
        }

        .badge.blue  { background: rgba(74,158,255,0.15);  color: #4A9EFF; border-color: #4A9EFF; }
        .badge.green { background: rgba(81,207,102,0.15);  color: #51CF66; border-color: #51CF66; }
        .badge.red   { background: rgba(255,107,107,0.15); color: #FF6B6B; border-color: #FF6B6B; }

        .empty { padding: 20px; color: #555; font-size: 12px; text-align: center; }
    </style>
</head>
<body>

<h1>🔬 Layer 2 — Collected Entities</h1>
<div class="subtitle">Pass 1 + Pass 2 extraction results · All raw entities</div>

<!-- SUMMARY -->
<div class="grid">
    <div class="stat-card">
        <div class="stat-value" style="color:#4A9EFF">${functions.length}</div>
        <div class="stat-label">Functions</div>
    </div>
    <div class="stat-card">
        <div class="stat-value" style="color:#FF6B6B">${classes.length}</div>
        <div class="stat-label">Classes</div>
    </div>
    <div class="stat-card">
        <div class="stat-value" style="color:#FFD43B">${variables.length}</div>
        <div class="stat-label">Variables</div>
    </div>
    <div class="stat-card">
        <div class="stat-value" style="color:#51CF66">${imports.length}</div>
        <div class="stat-label">Imports</div>
    </div>
    <div class="stat-card">
        <div class="stat-value" style="color:#c084fc">${funcCalls.length}</div>
        <div class="stat-label">Func Calls</div>
    </div>
    <div class="stat-card">
        <div class="stat-value" style="color:#f97316">${inheritance.length}</div>
        <div class="stat-label">Inheritance</div>
    </div>
</div>

<!-- FUNCTIONS -->
<div class="section">
    <div class="section-header">
        <div class="section-title">Functions</div>
        <span class="section-count">${functions.length}</span>
    </div>
    ${functions.length > 0 ? `
    <div class="table-wrap">
        <table>
            <thead>
                <tr>
                    <th>Name</th>
                    <th>File</th>
                    <th>Lines</th>
                    <th>LOC</th>
                    <th>Complexity</th>
                    <th>Async</th>
                    <th>Class</th>
                    <th>Parameters</th>
                </tr>
            </thead>
            <tbody>${funcRows}</tbody>
        </table>
    </div>` : '<div class="empty">No functions found</div>'}
</div>

<!-- CLASSES -->
<div class="section">
    <div class="section-header">
        <div class="section-title">Classes</div>
        <span class="section-count">${classes.length}</span>
    </div>
    ${classes.length > 0 ? `
    <div class="table-wrap">
        <table>
            <thead>
                <tr>
                    <th>Name</th>
                    <th>File</th>
                    <th>Lines</th>
                    <th>LOC</th>
                    <th>Methods</th>
                    <th>Inherits</th>
                </tr>
            </thead>
            <tbody>${classRows}</tbody>
        </table>
    </div>` : '<div class="empty">No classes found</div>'}
</div>

<!-- VARIABLES -->
<div class="section">
    <div class="section-header">
        <div class="section-title">Global Variables</div>
        <span class="section-count">${variables.length}</span>
    </div>
    ${variables.length > 0 ? `
    <div class="table-wrap">
        <table>
            <thead>
                <tr>
                    <th>Name</th>
                    <th>File</th>
                    <th>Line</th>
                    <th>Value</th>
                </tr>
            </thead>
            <tbody>${varRows}</tbody>
        </table>
    </div>` : '<div class="empty">No global variables found</div>'}
</div>

<!-- FUNC CALLS -->
<div class="section">
    <div class="section-header">
        <div class="section-title">Function Calls (Pass 1 — Unresolved)</div>
        <span class="section-count">${funcCalls.length}</span>
    </div>
    ${funcCalls.length > 0 ? `
    <div class="table-wrap">
        <table>
            <thead>
                <tr>
                    <th>Caller</th>
                    <th>Callee</th>
                    <th>File</th>
                    <th>Line</th>
                </tr>
            </thead>
            <tbody>${callRows}</tbody>
        </table>
    </div>` : '<div class="empty">No function calls found</div>'}
</div>

<!-- IMPORTS -->
<div class="section">
    <div class="section-header">
        <div class="section-title">Imports</div>
        <span class="section-count">${imports.length}</span>
    </div>
    ${imports.length > 0 ? `
    <div class="table-wrap">
        <table>
            <thead>
                <tr>
                    <th>File</th>
                    <th>Module</th>
                    <th>Names</th>
                </tr>
            </thead>
            <tbody>${importRows}</tbody>
        </table>
    </div>` : '<div class="empty">No imports found</div>'}
</div>

<!-- INHERITANCE -->
<div class="section">
    <div class="section-header">
        <div class="section-title">Inheritance</div>
        <span class="section-count">${inheritance.length}</span>
    </div>
    ${inheritance.length > 0 ? `
    <div class="table-wrap">
        <table>
            <thead>
                <tr>
                    <th>Child</th>
                    <th>Parent</th>
                    <th>File</th>
                </tr>
            </thead>
            <tbody>${inheritRows}</tbody>
        </table>
    </div>` : '<div class="empty">No inheritance relationships found</div>'}
</div>

<!-- RESOLVED EDGES -->
<div class="section">
    <div class="section-header">
        <div class="section-title">Resolved Edges (Pass 2)</div>
        <span class="section-count">${edges.length}</span>
    </div>
    ${edges.length > 0 ? `
    <div class="table-wrap">
        <table>
            <thead>
                <tr>
                    <th>From</th>
                    <th>To</th>
                    <th>Type</th>
                    <th>Call Count</th>
                </tr>
            </thead>
            <tbody>${edgeRows}</tbody>
        </table>
    </div>` : '<div class="empty">No resolved edges</div>'}
</div>

</body>
</html>`;
    }
}