import React, { useEffect, useRef } from 'react';

export const RiskHeatmap: React.FC<{
    data: any;
    onNodeSelect?: (nodeId: string) => void;
}> = ({ data, onNodeSelect }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const networkRef = useRef<any>(null);
    const [isLoading, setIsLoading] = React.useState(true);
    const [crashError, setCrashError] = React.useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;

        const initNetwork = () => {
            if (!isMounted) return;
            try {
                if (!data || !data.graph || !data.graph.nodes || !containerRef.current) {
                    setIsLoading(false);
                    return;
                }
                if (!(window as any).vis) {
                    console.warn("Vis.js not attached to window yet.");
                    setIsLoading(false);
                    return;
                }

                const visNodes: any[] = [];
                const visEdges: any[] = [];
                const includedIds = new Set();

                data.graph.nodes.forEach((n: any) => {
                    if (!n.id || includedIds.has(n.id)) return;

                    const rawRpi = n.metadata?.riskScore;
                    const rpi = (rawRpi === undefined || rawRpi === null) ? 0 : Number(rawRpi);
                    const safeRpi = isNaN(rpi) ? 0 : rpi;

                    // Color by RPI tier
                    let bg: string;
                    if (safeRpi >= 7) { bg = '#ff4040'; }
                    else if (safeRpi >= 4) { bg = '#ff9f5f'; }
                    else if (safeRpi >= 1) { bg = '#ffc66d'; }
                    else { bg = '#2d6a4f'; }

                    // Size nodes by risk — higher risk = bigger node
                    const nodeSize = Math.max(8, safeRpi * 5);

                    const complexity = n.metadata?.complexity ?? n.metadata?.cyclomaticComplexity ?? '—';
                    const churn = n.metadata?.churn ?? n.metadata?.changeFrequency ?? '—';
                    const coupling = n.metadata?.coupling ?? n.metadata?.couplingScore ?? '—';
                    const riskLevel = n.metadata?.riskLevel || (safeRpi >= 7 ? 'critical' : safeRpi >= 4 ? 'high' : safeRpi >= 1 ? 'medium' : 'low');
                    const filePath = n.file || n.id;

                    const tooltip = [
                        n.name || n.id,
                        `Type: ${n.type}`,
                        `File: ${filePath}`,
                        `Risk Priority Index: ${safeRpi.toFixed(2)} (${riskLevel})`,
                        `Complexity: ${complexity}`,
                        `Churn: ${churn}`,
                        `Coupling: ${coupling}`,
                    ].join('\n');

                    visNodes.push({
                        id: n.id,
                        label: (n.name || n.id).split(/[\\/]/).pop(),
                        title: tooltip,
                        shape: n.type === 'file' ? 'box' : 'dot',
                        size: n.type === 'file' ? undefined : nodeSize,
                        color: { background: bg, border: bg, highlight: { background: '#fff', border: bg } },
                        font: { color: '#f8fafc', size: 14, strokeWidth: 2, strokeColor: '#000', face: 'system-ui' }
                    });
                    includedIds.add(n.id);
                });

                const nodeNameMap = new Map<string, string>();
                data.graph.nodes.forEach((n: any) => {
                    if (n.id) { nodeNameMap.set(n.id, (n.name || n.id).split(/[\\/]/).pop() || n.id); }
                });

                data.graph.edges.forEach((e: any) => {
                    if (includedIds.has(e.source) && includedIds.has(e.target)) {
                        const srcName = nodeNameMap.get(e.source) || e.source;
                        const tgtName = nodeNameMap.get(e.target) || e.target;
                        const edgeTooltip = [
                            `${srcName} → ${tgtName}`,
                            `Type: ${e.type || 'calls'}`,
                            e.weight ? `Weight: ${e.weight}` : null,
                        ].filter(Boolean).join('\n');

                        visEdges.push({
                            from: e.source,
                            to: e.target,
                            arrows: 'to',
                            title: edgeTooltip,
                            color: { color: 'rgba(255,255,255,0.08)', highlight: '#ff4040' },
                            width: e.weight > 1 ? Math.min(e.weight, 3) : 1
                        });
                    }
                });

                const options = {
                    nodes: { borderWidth: 0, font: { size: 12 } },
                    edges: { smooth: { type: 'continuous' } },
                    layout: { hierarchical: false },
                    physics: {
                        forceAtlas2Based: { gravitationalConstant: -80, centralGravity: 0.008, springLength: 180, springConstant: 0.06, damping: 0.5 },
                        solver: 'forceAtlas2Based',
                        stabilization: { iterations: 120 },
                    },
                    interaction: { hover: true, navigationButtons: true, zoomView: true }
                };

                if (networkRef.current) {
                    networkRef.current.destroy();
                }
                networkRef.current = new (window as any).vis.Network(containerRef.current, { nodes: visNodes, edges: visEdges }, options);

                networkRef.current.on('click', (params: any) => {
                    if (params.nodes.length > 0 && onNodeSelect) {
                        onNodeSelect(params.nodes[0]);
                    }
                });

                networkRef.current.on('doubleClick', (params: any) => {
                    if (params.nodes.length > 0) {
                        const nodeId = params.nodes[0];
                        const gNode = data.graph.nodes.find((n: any) => n.id === nodeId);
                        if (gNode && gNode.file && (window as any).vscode) {
                            (window as any).vscode.postMessage({ command: 'jumpToCode', file: gNode.file, line: gNode.startLine });
                        }
                    }
                });

                networkRef.current.once('stabilizationIterationsDone', () => {
                    if (isMounted) setIsLoading(false);
                });
                setTimeout(() => { if (isMounted) setIsLoading(false); }, 500);

            } catch (err: any) {
                console.error("RiskHeatmap crashed:", err);
                if (isMounted) {
                    setIsLoading(false);
                    setCrashError(err.message || String(err));
                }
            }
        };

        if (!(window as any).vis) {
            const existingScript = document.getElementById('vis-network-cdn') as HTMLScriptElement | null;
            if (!existingScript) {
                const script = document.createElement('script');
                script.id = 'vis-network-cdn';
                script.src = 'https://unpkg.com/vis-network/standalone/umd/vis-network.min.js';
                script.async = true;
                script.onload = () => initNetwork();
                script.onerror = () => {
                    console.error("Failed to load vis-network script via CDN.");
                    if (isMounted) setIsLoading(false);
                };
                document.head.appendChild(script);
            } else {
                existingScript.addEventListener('load', () => initNetwork());
            }
        } else {
            initNetwork();
        }

        return () => {
            isMounted = false;
        };
    }, [data]);

    return (
        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
            {isLoading && (
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    backgroundColor: '#161b22', zIndex: 10, color: '#8b949e', fontFamily: 'system-ui'
                }}>
                    <div className="spinner" style={{ border: '4px solid rgba(255,64,64,0.3)', borderTop: '4px solid #ff4040', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite', marginBottom: '15px' }}></div>
                    <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                    <span>Mapping Risk Topology...</span>
                </div>
            )}
            {crashError && (
                <div style={{
                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                    backgroundColor: 'rgba(255,0,0,0.1)', padding: '20px', borderRadius: '8px',
                    border: '1px solid rgba(255,0,0,0.5)', color: '#ff5555', textAlign: 'center', zIndex: 5, maxWidth: '80%'
                }}>
                    <b>Risk Heatmap Crashed</b><br/>
                    <pre style={{ textAlign: 'left', overflowX: 'auto', marginTop: '10px', color: '#ffaaaa' }}>{crashError}</pre>
                </div>
            )}
            <div ref={containerRef} style={{ width: '100%', height: '100%', outline: 'none', backgroundColor: '#0d1117' }} />
        </div>
    );
};
