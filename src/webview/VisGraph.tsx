import React, { useEffect, useRef, memo } from 'react';

const VisGraphInner: React.FC<{ data: any; llmLimit: number; onNodeSelect?: (nodeId: string) => void }> = ({ data, llmLimit, onNodeSelect }) => {
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
                
                // Normalize llmLimit in case user changes it
                const limit = Math.max(1, Math.min(10, llmLimit));

                data.graph.nodes.forEach((n: any) => {
                    if (!n.id || includedIds.has(n.id)) return; // Prevent duplicate nodes from crashing Vis!

                    const score = n.metadata?.importanceScore || 0;
                    // Always render files and external modules as the backbone. Filter functions based on slider.
                    if ((n.type === 'module' || n.type === 'file') || score >= limit || limit === 1) {
                        
                        let bg = '#555', border = '#333';
                        if (n.type === 'file') { bg = '#2B5B84'; border = '#1A364E'; }
                        else if (n.type === 'function') { bg = '#2A4365'; border = '#1A293E'; }
                        else if (n.type === 'class') { bg = '#553C9A'; border = '#32235B'; }

                        const titleHtml = `Type: ${n.type}`
                            + (score ? `\nImportance: ${score}/10` : '');

                        visNodes.push({
                            id: n.id,
                            label: (n.name || n.id).split(/[\\/]/).pop(),
                            title: titleHtml,
                            group: n.type,
                            shape: n.type === 'file' ? 'box' : 'dot',
                            size: n.type === 'file' ? undefined : Math.max(10, score * 3),
                            color: { background: bg, border: border, highlight: { background: '#fff', border: border } },
                            font: { color: '#f8fafc', size: n.type === 'file' ? 16 : 14, strokeWidth: 2, strokeColor: '#000', face: 'system-ui', multi: 'html' }
                        });
                        includedIds.add(n.id);
                    }
                });

            data.graph.edges.forEach((e: any) => {
                if (includedIds.has(e.source) && includedIds.has(e.target)) {
                    visEdges.push({
                        from: e.source,
                        to: e.target,
                        arrows: 'to',
                        title: `Type: ${e.type || 'Interaction'}\nWeight: ${e.weight || 1}`,
                        color: { color: e.type === 'calls' ? 'rgba(139,92,246,0.6)' : 'rgba(255,255,255,0.1)', highlight: '#0078d4' },
                        width: e.weight > 1 ? Math.min(e.weight, 4) : 1
                    });
                }
            });

            const graphDataObj = { nodes: visNodes, edges: visEdges };
            const options = {
                nodes: { borderWidth: 0, font: { size: 12 } },
                edges: { smooth: { type: 'continuous' } },
                layout: { hierarchical: false }, // Crucial: Physics engine spiderweb graph!
                physics: {
                    forceAtlas2Based: { gravitationalConstant: -100, centralGravity: 0.005, springLength: 200, springConstant: 0.08, damping: 0.4 },
                    solver: 'forceAtlas2Based',
                    stabilization: { iterations: 100 },
                },
                interaction: { hover: true, navigationButtons: true, zoomView: true }
            };

            if (networkRef.current) {
                networkRef.current.destroy();
            }
            networkRef.current = new (window as any).vis.Network(containerRef.current, graphDataObj, options);

            // Single click to select node and open Explanation sidebar
            networkRef.current.on('click', (params: any) => {
                if (params.nodes.length > 0 && onNodeSelect) {
                    onNodeSelect(params.nodes[0]);
                }
            });

            // Double click to jump/focus to code (matching our original logic)
            networkRef.current.on('doubleClick', (params: any) => {
                if (params.nodes.length > 0) {
                    const nodeId = params.nodes[0];
                    const gNode = data.graph.nodes.find((n: any) => n.id === nodeId);
                    if (gNode && gNode.file && (window as any).vscode) {
                        (window as any).vscode.postMessage({ command: 'jumpToCode', file: gNode.file, line: gNode.startLine });
                    }
                }
            });

            // Physics calculation can be heavy; hide loader after stabilization finishes
            networkRef.current.once('stabilizationIterationsDone', () => {
                if (isMounted) setIsLoading(false);
            });
            // Fallback unlock if there are very few nodes and it stabilizes instantly
            setTimeout(() => { if (isMounted) setIsLoading(false); }, 500);

            } catch (err: any) {
                console.error("VisGraph implementation crashed:", err);
                if (isMounted) {
                    setIsLoading(false);
                    setCrashError(err.message || String(err));
                }
            }
        };

        // Dynamic script loading logic for vis.js
        if (!(window as any).vis) {
            const existingScript = document.getElementById('vis-network-cdn') as HTMLScriptElement | null;
            if (!existingScript) {
                const script = document.createElement('script');
                script.id = 'vis-network-cdn';
                script.src = 'https://unpkg.com/vis-network/standalone/umd/vis-network.min.js';
                script.async = true;
                script.onload = () => initNetwork();
                script.onerror = () => {
                    console.error("Failed to load vis-network script via CDN. Check CSP settings.");
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
    }, [data, llmLimit]);

    return (
        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
            {isLoading && (
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    backgroundColor: '#161b22', zIndex: 10, color: '#8b949e', fontFamily: 'system-ui'
                }}>
                    <div className="spinner" style={{ border: '4px solid rgba(139,92,246,0.3)', borderTop: '4px solid #8b5cf6', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite', marginBottom: '15px' }}></div>
                    <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                    <span>Initializing Intelligent Architecture Grid...</span>
                </div>
            )}
            {!isLoading && !(window as any).vis && !crashError && (
                <div style={{
                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                    backgroundColor: 'rgba(255,50,50,0.1)', padding: '20px', borderRadius: '8px',
                    border: '1px solid rgba(255,50,50,0.3)', color: '#ffaaaa', textAlign: 'center', zIndex: 5
                }}>
                    <b>Failed to load Physics Engine</b><br/>
                    Content Security Policy blocked the vis-network CDN script.<br/><br/>
                    <i>Run "Developer: Reload Window" in VS Code to apply the new CSP relaxations!</i>
                </div>
            )}
            {crashError && (
                <div style={{
                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                    backgroundColor: 'rgba(255,0,0,0.1)', padding: '20px', borderRadius: '8px',
                    border: '1px solid rgba(255,0,0,0.5)', color: '#ff5555', textAlign: 'center', zIndex: 5, maxWidth: '80%'
                }}>
                    <b>VisGraph Engine Crashed</b><br/>
                    <pre style={{textAlign:'left', overflowX:'auto', marginTop:'10px', color: '#ffaaaa'}}>{crashError}</pre>
                </div>
            )}
            <div ref={containerRef} style={{ width: '100%', height: '100%', outline: 'none', backgroundColor: '#0d1117' }} />
        </div>
    );
};

export const VisGraph = memo(VisGraphInner, (prev, next) => {
    // Only rebuild vis network if node count changed or llmLimit changed
    const prevCount = prev.data?.graph?.nodes?.length ?? 0;
    const nextCount = next.data?.graph?.nodes?.length ?? 0;
    return prevCount === nextCount && prev.llmLimit === next.llmLimit;
});
