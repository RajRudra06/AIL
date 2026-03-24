import React, { useEffect, useState, useMemo } from 'react';
import './App.css';

import { GraphLayout } from './GraphLayout';
import { getLayoutedElements } from './layoutUtils';
import { Node, Edge, applyNodeChanges, applyEdgeChanges, NodeChange, EdgeChange } from '@xyflow/react';
import { SummaryPanel } from './SummaryPanel';
import { ChatPanel } from './ChatPanel';


interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

const App: React.FC = () => {

    const [graphData, setGraphData] = useState<any>(null);
    const [nodes, setNodes] = useState<Node[]>([]);
    const [edges, setEdges] = useState<Edge[]>([]);
    const [sidebarWidth, setSidebarWidth] = useState(340);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [rightSidebarWidth, setRightSidebarWidth] = useState(0);
    const [isChatPanelOpen, setIsChatPanelOpen] = useState(false);
    const [chatNode, setChatNode] = useState<any>(null);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [searchResults, setSearchResults] = useState<Node[]>([]);
    const [currentSearchIndex, setCurrentSearchIndex] = useState<number>(-1);
    const [chatHistory, setChatHistory] = useState<Message[]>([]);
    const [isLoadingChat, setIsLoadingChat] = useState(false);
    const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
    const [viewMode, setViewMode] = useState<'relationships' | 'independent'>('relationships');




    // Use Refs to bypass stale closures for callbacks bound inside nodes
    const graphDataRef = React.useRef<any>(null);
    const nodesRef = React.useRef<Node[]>([]);
    const edgesRef = React.useRef<Edge[]>([]);
    const isResizing = React.useRef<boolean>(false);
    const isResizingRight = React.useRef<boolean>(false);

    useEffect(() => { graphDataRef.current = graphData; }, [graphData]);
    useEffect(() => { nodesRef.current = nodes; }, [nodes]);
    useEffect(() => { edgesRef.current = edges; }, [edges]);

    // Sidebar Resizing Logic
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isResizing.current) {
                const newWidth = Math.max(0, Math.min(e.clientX, window.innerWidth - 100));
                if (newWidth < 50) {
                    setSidebarWidth(0);
                    setIsSidebarCollapsed(true);
                } else {
                    setSidebarWidth(newWidth);
                    setIsSidebarCollapsed(false);
                }
            } else if (isResizingRight.current) {
                const newWidth = Math.max(0, Math.min(window.innerWidth - e.clientX, window.innerWidth - 100));
                if (newWidth < 50) {
                    setRightSidebarWidth(0);
                    setIsChatPanelOpen(false);
                } else {
                    setRightSidebarWidth(newWidth);
                    setIsChatPanelOpen(true);
                }
            }
        };
        const handleMouseUp = () => {
            isResizing.current = false;
            isResizingRight.current = false;
            document.body.style.cursor = 'default';
        };
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

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
                case 'explainFunction':
                case 'chatResponse':
                    console.log("React received assistant response", message.command);
                    const content = message.text || message.content;
                    setIsLoadingChat(false);
                    if (content) {
                        setChatHistory(prev => {
                            // Quick safety check: if the last message is assistant and has identical content, skip
                            if (prev.length > 0) {
                                const last = prev[prev.length - 1];
                                if (last.role === 'assistant' && last.content === content) {
                                    return prev;
                                }
                            }
                            return [...prev, { role: 'assistant', content }];
                        });
                    }
                    break;


            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    useEffect(() => {
        if (window.vscode) {
            window.vscode.postMessage({ command: 'getGraph' });
        }
    }, []);


    const onNodesChange = (changes: NodeChange[]) => {
        setNodes((nds) => applyNodeChanges(changes, nds));
    };

    // Effect to keep selectedNodeIds in sync with node selected state
    useEffect(() => {
        const selected = nodes.filter(n => n.selected).map(n => n.id);
        setSelectedNodeIds(selected);
    }, [nodes]);


    const onEdgesChange = (changes: EdgeChange[]) => {
        setEdges((eds) => applyEdgeChanges(changes, eds));
    };


    // --- Graph Engine --- //

    const buildNode = (nodeData: any, depth: number, edgesData: any[], isExpanded: boolean = false): Node => {
        const id = nodeData.id;
        const label = nodeData.name || id;

        // Check if there are outgoing calls from this function in the graph payload
        const hasChildren = edgesData.some((e: any) => e.source === id);

        return {
            id,
            type: 'customFunction',
            position: { x: 0, y: 0 },
            connectable: false,
            selectable: false,
            data: {
                label,
                file: nodeData.file || 'unknown',
                startLine: nodeData.startLine || 0,
                endLine: nodeData.endLine || 0,
                depth,
                hasChildren,
                isExpanded,
                onExpand: handleExpand,
                onClick: handleNodeClick,
                onExplain: handleExplainFunction,
                params: nodeData.params || [],
                metadata: nodeData.metadata || {}
            }
        };
    };

    const initializeGraph = (data: any, mode: 'relationships' | 'independent' = 'relationships') => {
        if (!data || !data.graph || !data.graph.nodes) return;

        const nodesData: any[] = data.graph.nodes;
        const edgesData: any[] = data.graph.edges || [];

        if (mode === 'relationships') {
            const incomingCounts: Record<string, number> = {};
            edgesData.forEach(e => {
                incomingCounts[e.target] = (incomingCounts[e.target] || 0) + 1;
            });

            // Find all potential roots (priority to functions with 0 incoming edges)
            const roots = nodesData.filter(n => n.type === 'function' && !incomingCounts[n.id]);
            
            if (roots.length > 0) {
                const rootNodes = roots.map(r => buildNode(r, 1, edgesData, false));
                const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(rootNodes, [], 'LR');
                setNodes(layoutedNodes);
                setEdges(layoutedEdges);
            } else if (nodesData.length > 0) {
                // Fallback to first available node
                const root = buildNode(nodesData[0], 1, edgesData, false);
                const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements([root], [], 'LR');
                setNodes(layoutedNodes);
                setEdges(layoutedEdges);
            }
        } else {
            // Independent Nodes View
            const incomingCounts: Record<string, number> = {};
            const outgoingCounts: Record<string, number> = {};
            
            edgesData.forEach(e => {
                incomingCounts[e.target] = (incomingCounts[e.target] || 0) + 1;
                outgoingCounts[e.source] = (outgoingCounts[e.source] || 0) + 1;
            });

            // Truly independent: 0 incoming AND 0 outgoing
            const independent = nodesData.filter(n => 
                n.type === 'function' && 
                !incomingCounts[n.id] && 
                !outgoingCounts[n.id]
            );

            // Limited batch for performance
            const batch = independent.slice(0, 30);
            const batchNodes = batch.map(n => buildNode(n, 1, edgesData, false));
            
            // Layout in a single vertical column
            const layoutedNodes = batchNodes.map((n, i) => ({
                ...n,
                position: { x: 100, y: i * 150 + 100 }
            }));
            
            setNodes(layoutedNodes);
            setEdges([]);
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

        const childEdges = currentEdgesData.filter((e: any) => e.source === nodeId);
        const currentDepth = targetNode.data.depth as number;

        let newChildNodes: Node[] = [];
        let newReactFlowEdges: Edge[] = [];

        childEdges.forEach((edge: any) => {
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

    const handleNodeClick = (event: React.MouseEvent, node: Node) => {
        if (event.metaKey || event.ctrlKey) {
            // Manual selection toggle
            setNodes((nds) => 
                nds.map((n) => n.id === node.id ? { ...n, selected: !n.selected } : n)
            );
        } else {
            // Navigation
            console.log("React handleNodeClick navigation", node.data.file, node.data.startLine);
            window.vscode.postMessage({ command: 'jumpToCode', file: node.data.file, line: node.data.startLine });
        }
    };

    
    const handleExplainFunction = (nodeId: string, label: string, file: string) => {
        console.log("React handleExplainFunction", nodeId);
        setChatNode({ id: nodeId, label, file, isMulti: false });
        setIsChatPanelOpen(true);
        setRightSidebarWidth(380);
        setChatHistory([]);
        setIsLoadingChat(true);
        
        window.vscode.postMessage({ 
            command: 'explainFunction', 
            nodeId, 
            label, 
            file 
        });
    };

    const handleExplainSelection = () => {
        if (selectedNodeIds.length === 0) return;
        
        const selectedNodes = nodes.filter(n => selectedNodeIds.includes(n.id));
        const labels = selectedNodes.map(n => n.data.label).join(', ');
        
        console.log("React handleExplainSelection", selectedNodeIds);
        setChatNode({ 
            id: 'multi-selection', 
            label: `Selection: ${labels}`, 
            isMulti: true, 
            nodes: selectedNodes.map(n => ({ id: n.id, label: n.data.label, file: n.data.file }))
        });
        
        setIsChatPanelOpen(true);
        setRightSidebarWidth(380);
        setChatHistory([]);
        setIsLoadingChat(true);

        window.vscode.postMessage({
            command: 'explainMultipleFunctions',
            nodes: selectedNodes.map(n => ({
                id: n.id,
                label: n.data.label,
                file: n.data.file,
                params: (n.data as any).params || '[]',
                metadata: (n.data as any).metadata || {}
            })),
            query: `What do these selected ${selectedNodeIds.length} functions achieve as a unit? What is their collective contribution to the overall project and function graph?`
        });
    };


    const styledEdges = useMemo(() => {
        return edges.map(edge => {
            const isHighlighted = selectedNodeIds.includes(edge.source) && selectedNodeIds.includes(edge.target);
            if (isHighlighted) {
                return {
                    ...edge,
                    animated: true,
                    style: { ...edge.style, stroke: '#ff0066', strokeWidth: 3, opacity: 1, filter: 'drop-shadow(0 0 5px #ff0066)' }
                };
            }
            return edge;
        });
    }, [edges, selectedNodeIds]);

    const summaryMarkdown = graphData ? graphData.report : '';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
            <div className="header-container">
                <div className="explorer-title">
                    <h2>
                        <button 
                            className="sidebar-toggle-btn" 
                            title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                            onClick={() => {
                                if (isSidebarCollapsed) {
                                    setSidebarWidth(340);
                                    setIsSidebarCollapsed(false);
                                } else {
                                    setSidebarWidth(0);
                                    setIsSidebarCollapsed(true);
                                }
                            }}
                        >
                            {isSidebarCollapsed ? "→" : "←"}
                        </button>
                        <span className="ail-gradient">AIL</span> Architecture Explorer
                    </h2>
                    <span className="explorer-subtext">Navigate complexity, depth by depth.</span>
                </div>

                <div className="view-controls-container">
                    <div className="view-section">
                        <div className="view-header">
                            <span className="view-label">View</span>
                            <span className="view-tag">below option are diff view to look at the same codebase</span>
                        </div>
                        <div className="view-btn-group">
                            <button className="view-btn active">Function Graph</button>
                            <button className="view-btn disabled">Directory Graph</button>
                            <button className="view-btn disabled">Overall Graph</button>
                        </div>
                    </div>

                    <div className="view-section" style={{ marginLeft: '20px' }}>
                        <div className="view-header">
                            <span className="view-label">Relationship Mode</span>
                        </div>
                        <select 
                            className="view-mode-select"
                            value={viewMode}
                            onChange={(e) => {
                                const newMode = e.target.value as 'relationships' | 'independent';
                                setViewMode(newMode);
                                if (graphData) initializeGraph(graphData, newMode);
                            }}
                        >
                            <option value="relationships">Relationship Based Nodes</option>
                            <option value="independent">Independent Nodes</option>
                        </select>
                    </div>
                    <button 
                        className="sidebar-toggle-btn" 
                        title={isChatPanelOpen ? "Close Chat" : "Open Chat"}
                        onClick={() => setIsChatPanelOpen(!isChatPanelOpen)}
                    >
                        {isChatPanelOpen ? "→" : "←"}
                    </button>
                    {selectedNodeIds.length > 0 && (
                        <button 
                            className="view-btn explain-selection-btn"
                            style={{ 
                                marginLeft: '15px', 
                                background: 'linear-gradient(135deg, #ff0066 0%, #ff5c93 100%)',
                                color: 'white',
                                fontWeight: 'bold',
                                border: 'none',
                                animation: 'pulse 2s infinite'
                            }}
                            onClick={handleExplainSelection}
                        >
                            Analyze Selection ({selectedNodeIds.length})
                        </button>
                    )}
                    {selectedNodeIds.length > 0 && (
                        <div style={{ marginLeft: '10px', fontSize: '11px', color: '#ff0066', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#ff0066', animation: 'pulse 1s infinite' }}></span>
                            {selectedNodeIds.length} Functions Active
                        </div>
                    )}
                </div>
            </div>






            <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
                <div 
                    className={`sidebar-container ${isSidebarCollapsed ? 'collapsed' : ''}`}
                    style={{
                        width: `${sidebarWidth}px`,
                        minWidth: `${sidebarWidth}px`,
                        overflowX: 'hidden',
                        overflowY: 'auto',
                        background: '#1e1e1e',
                        zIndex: 10,
                        display: 'flex',
                        flexDirection: 'column',
                        position: 'relative',
                        transition: isResizing.current ? 'none' : 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                >
                    {!isSidebarCollapsed && (
                        <button 
                            title="Collapse Sidebar"
                            className="close-panel-btn"
                            style={{ position: 'absolute', right: '10px', top: '10px', zIndex: 20 }}
                            onClick={() => {
                                setSidebarWidth(0);
                                setIsSidebarCollapsed(true);
                            }}
                        >
                            ✕
                        </button>
                    )}
                    <SummaryPanel markdown={graphData ? graphData.report : ''} />
                </div>


                <div
                    title="Resize Left Sidebar"
                    style={{ width: '4px', cursor: 'col-resize', background: '#333', zIndex: 20 }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#0078d4'}
                    onMouseLeave={(e) => e.currentTarget.style.background = '#333'}
                    onMouseDown={(e) => { e.preventDefault(); isResizing.current = true; }}
                />

                <div style={{ flex: 1, position: 'relative' }}>
                    {nodes.length > 0 ? (
                        <GraphLayout 
                            nodes={nodes} 
                            edges={styledEdges} 
                            onNodeClick={handleNodeClick}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                        />

                    ) : (
                        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#888' }}>
                            {graphData ? "No entries found in Adjacency List" : "Loading Architecture..."}
                        </div>
                    )}
                </div>

                {isChatPanelOpen && (
                    <div
                        title="Resize Chat Sidebar"
                        style={{ width: '4px', cursor: 'col-resize', background: '#333', zIndex: 20 }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#ff0066'}
                        onMouseLeave={(e) => e.currentTarget.style.background = '#333'}
                        onMouseDown={(e) => { e.preventDefault(); isResizingRight.current = true; }}
                    />
                )}

                <div 
                    className={`sidebar-container right-sidebar ${!isChatPanelOpen ? 'collapsed' : ''}`}
                    style={{
                        width: `${rightSidebarWidth}px`,
                        minWidth: `${rightSidebarWidth}px`,
                        overflowX: 'hidden',
                        overflowY: 'auto',
                        background: '#1e1e1e',
                        zIndex: 10,
                        display: 'flex',
                        flexDirection: 'column',
                        position: 'relative',
                        transition: isResizingRight.current ? 'none' : 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                >
                    <ChatPanel
                        node={chatNode}
                        history={chatHistory}
                        isLoading={isLoadingChat}
                        onClose={() => {
                            setRightSidebarWidth(0);
                            setIsChatPanelOpen(false);
                        }}
                        onSendMessage={(msg) => {
                            const newMsg: Message = { role: 'user', content: msg };
                            const updatedHistory = [...chatHistory, newMsg];
                            setChatHistory(updatedHistory);
                            setIsLoadingChat(true);
                            
                            window.vscode.postMessage({
                                command: chatNode.isMulti ? 'askMultipleFunctionsChat' : 'askFunctionChat',
                                nodeId: chatNode.id,
                                query: msg,
                                history: updatedHistory,
                                nodes: chatNode.nodes // Only sent if isMulti is true
                            });

                        }}

                    />
                </div>
            </div>
        </div>
    );
};

export default App;