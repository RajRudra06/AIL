import React, { useEffect, useState } from 'react';
import './App.css';

import { GraphLayout } from './GraphLayout';
import { getLayoutedElements } from './layoutUtils';
import { Node, Edge } from '@xyflow/react';
import { SummaryPanel } from './SummaryPanel';

const App: React.FC = () => {
    const [graphData, setGraphData] = useState<any>(null);
    const [nodes, setNodes] = useState<Node[]>([]);
    const [edges, setEdges] = useState<Edge[]>([]);

    // Use Refs to bypass stale closures for callbacks bound inside nodes
    const graphDataRef = React.useRef<any>(null);
    const nodesRef = React.useRef<Node[]>([]);
    const edgesRef = React.useRef<Edge[]>([]);

    useEffect(() => { graphDataRef.current = graphData; }, [graphData]);
    useEffect(() => { nodesRef.current = nodes; }, [nodes]);
    useEffect(() => { edgesRef.current = edges; }, [edges]);

    // Listen for messages from the VS Code Extension Host
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            switch (message.command) {
                case 'loadGraphData':
                    console.log("React received graph data");
                    setGraphData(message.data);
                    initializeGraph(message.data);
                    break;
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    // --- Graph Engine --- //

    const buildNode = (nodeData: any, depth: number, edgesData: any[], isExpanded: boolean = false): Node => {
        const id = nodeData.id;
        const label = nodeData.name || id;
        
        // Check if there are outgoing calls from this function in the graph payload
        const hasChildren = edgesData.some((e: any) => e.source === id);

        return {
            id,
            type: 'customFunction',
            position: { x: 0, y: 0 }, // Dagre handles actual positions
            data: {
                label,
                file: nodeData.file || 'unknown',
                startLine: nodeData.startLine || 0,
                endLine: nodeData.endLine || 0,
                depth,
                hasChildren,
                isExpanded,
                onExpand: handleExpand,
                onClick: handleNodeClick
            }
        };
    };

    const initializeGraph = (data: any) => {
        if (!data || !data.graph || !data.graph.nodes) return;
        
        const nodesData: any[] = data.graph.nodes;
        const edgesData: any[] = data.graph.edges || [];
        
        let rootNode: any = null;
        
        if (nodesData.length > 0) {
            // Find a node with no incoming edges if possible
            const incomingCounts: Record<string, number> = {};
            edgesData.forEach(e => {
                incomingCounts[e.target] = (incomingCounts[e.target] || 0) + 1;
            });
            
            // Try to find a function node (not file) with no incoming edges or fallback to the first function
            rootNode = nodesData.find(n => n.type === 'function' && !incomingCounts[n.id]) 
                       || nodesData.find(n => n.type === 'function') 
                       || nodesData[0];
        }

        if (rootNode) {
            const root = buildNode(rootNode, 1, edgesData, false);
            
            // Layout through Dagre immediately
            const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements([root], [], 'LR');
            setNodes(layoutedNodes);
            setEdges(layoutedEdges);
        }
    };

    const handleExpand = (nodeId: string) => {
        const currentGraphData = graphDataRef.current;
        const currentNodes = [...nodesRef.current];
        const currentEdges = [...edgesRef.current];

        if (!currentGraphData) return;

        const targetNodeIndex = currentNodes.findIndex(n => n.id === nodeId);
        if (targetNodeIndex === -1) return;
        
        const targetNode = currentNodes[targetNodeIndex];
        const currentEdgesData = currentGraphData.graph.edges || [];

        if (targetNode.data.isExpanded) {
            // Collapse logic: Remove all descendants
            const descendants = getDescendants(nodeId, currentEdges, currentNodes);
            const descendantIds = new Set(descendants.map(d => d.id));
            
            const newNodes = currentNodes
                .filter(n => !descendantIds.has(n.id))
                .map(n => n.id === nodeId ? { ...n, data: { ...n.data, isExpanded: false } } : n);
            
            const newEdges = currentEdges.filter(e => !descendantIds.has(e.target) && !descendantIds.has(e.source));
            
            const layouted = getLayoutedElements(newNodes, newEdges, 'LR');
            setNodes(layouted.nodes);
            setEdges(layouted.edges);
            return;
        }

        // Expand logic: Add immediate children
        const childEdges = currentEdgesData.filter((e: any) => e.source === nodeId);
        const currentDepth = targetNode.data.depth as number;
        
        let newChildNodes: Node[] = [];
        let newReactFlowEdges: Edge[] = [];

        childEdges.forEach((edge: any) => {
            // Prioritize resolved code nodes over unresolved duplicates by checking for "::"
            let childNodeData = (currentGraphData.graph.nodes || []).find((n: any) => n.id.endsWith(`::${edge.target}`) && n.type !== 'file');
            
            if (!childNodeData) {
                childNodeData = (currentGraphData.graph.nodes || []).find((n: any) => n.name === edge.target || n.id === edge.target);
            }
            
            if (!childNodeData) return;
            if (currentNodes.some(n => n.id === childNodeData.id)) return;

            newChildNodes.push(buildNode(childNodeData, currentDepth + 1, currentEdgesData, false));
            
            newReactFlowEdges.push({
                id: `${nodeId}-${childNodeData.id}`,
                source: nodeId,
                target: childNodeData.id,
                type: 'default',
                animated: true,
                style: { stroke: '#00e5ff', strokeWidth: 2, opacity: 0.8 }
            });
        });

        // Mark parent as expanded
        currentNodes[targetNodeIndex] = { ...targetNode, data: { ...targetNode.data, isExpanded: true } };

        const allNodes = [...currentNodes, ...newChildNodes];
        const allEdges = [...currentEdges, ...newReactFlowEdges];

        const layouted = getLayoutedElements(allNodes, allEdges, 'LR');
        setNodes(layouted.nodes);
        setEdges(layouted.edges);
    };

    const getDescendants = (nodeId: string, currentEdges: Edge[], currentNodes: Node[]): Node[] => {
        const outEdges = currentEdges.filter(e => e.source === nodeId);
        let descendants: Node[] = [];
        for (const edge of outEdges) {
            const childNode = currentNodes.find(n => n.id === edge.target);
            if (childNode) {
                descendants.push(childNode);
                descendants = descendants.concat(getDescendants(childNode.id, currentEdges, currentNodes));
            }
        }
        return descendants;
    };

    const handleNodeClick = (file: string, line: number) => {
        window.vscode.postMessage({
            command: 'jumpToCode',
            file: file,
            line: line
        });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
            <div style={{ padding: '10px 20px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1e1e1e', zIndex: 10 }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '18px' }}><span style={{ color: '#0078d4' }}>AIL</span> Architecture Explorer</h2>
                    <span style={{ fontSize: '12px', color: '#888' }}>Navigate complexity, depth by depth.</span>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', letterSpacing: '1px' }}>Views</span>
                    <button className="view-btn active">Function Graph</button>
                    <button className="view-btn disabled">Directory Graph</button>
                    <button className="view-btn disabled">Overall Graph</button>
                </div>
            </div>
            
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                <div style={{ width: '300px', borderRight: '1px solid #333', padding: '20px', overflowY: 'auto', background: '#1e1e1e', zIndex: 10 }}>
                    <SummaryPanel markdown={graphData ? graphData.report : ''} />
                </div>
                <div style={{ flex: 1, position: 'relative' }}>
                    {nodes.length > 0 ? (
                        <GraphLayout 
                            nodes={nodes} 
                            edges={edges} 
                        />
                    ) : (
                        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#888' }}>
                            {graphData ? "No entries found in Adjacency List" : "Loading Architecture..."}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default App;
