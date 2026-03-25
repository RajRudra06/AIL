import React, { useEffect, useState, useMemo } from 'react';
import './App.css';

import { GraphLayout } from './GraphLayout';
import { getLayoutedElements } from './layoutUtils';
import { Node, Edge, Position, applyNodeChanges, applyEdgeChanges, NodeChange, EdgeChange } from '@xyflow/react';
import { SummaryPanel } from './SummaryPanel';
import { ChatPanel } from './ChatPanel';
import { VisGraph } from './VisGraph';

interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

type GraphViewMode = 'function' | 'directory' | 'sequence' | 'overall';

const NODE_PAGE_SIZE = 25;
const MAX_LAYOUT_NODES_FOR_DAGRE = 320;
const MAX_LAYOUT_EDGES_FOR_DAGRE = 1400;

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
    const [graphViewMode, setGraphViewMode] = useState<GraphViewMode>('function');
    const [relationshipLimit, setRelationshipLimit] = useState<number>(NODE_PAGE_SIZE);
    const [independentLimit, setIndependentLimit] = useState<number>(NODE_PAGE_SIZE);
    const [relationshipTotal, setRelationshipTotal] = useState<number>(0);
    const [independentTotal, setIndependentTotal] = useState<number>(0);
    const [llmLimit, setLlmLimit] = useState<number>(1);
    const [graphLoadError, setGraphLoadError] = useState<string | null>(null);

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
                    setRelationshipLimit(NODE_PAGE_SIZE);
                    setIndependentLimit(NODE_PAGE_SIZE);
                    setGraphLoadError(null);
                    setGraphData(message.data);
                    window.vscode?.postMessage({
                        command: 'graphDataAck',
                        nodes: message.data?.graph?.nodes?.length || 0,
                        edges: message.data?.graph?.edges?.length || 0
                    });
                    try {
                        initializeGraph(message.data);
                    } catch (err: any) {
                        console.error('Graph initialization failed', err);
                        setGraphLoadError('Graph initialization failed: ' + (err?.message || 'unknown error'));
                    }
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
        if (!window.vscode) {
            setGraphLoadError('VS Code API unavailable inside webview.');
            return;
        }

        // Explicit ready ping helps avoid races where host sends before listeners settle.
        window.vscode.postMessage({ command: 'graphWebviewReady' });

        let attempts = 0;
        const maxAttempts = 8;
        const requestGraph = () => {
            if (graphDataRef.current?.graph?.nodes?.length) {
                return;
            }
            attempts += 1;
            window.vscode.postMessage({ command: 'getGraph' });
            if (attempts >= maxAttempts && !graphDataRef.current?.graph?.nodes?.length) {
                setGraphLoadError('Graph payload not received. Try reopening Graph View.');
            }
        };

        requestGraph();
        const timer = window.setInterval(requestGraph, 1200);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        if (!graphData) return;
        initializeGraph(graphData, viewMode, graphViewMode);
    }, [relationshipLimit, independentLimit]);


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
                nodeType: nodeData.type,
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

    const applyFastGridLayout = (inputNodes: Node[], direction: 'LR' | 'TB' = 'LR'): Node[] => {
        const cols = direction === 'LR' ? 14 : 10;
        const xGap = direction === 'LR' ? 260 : 220;
        const yGap = direction === 'LR' ? 130 : 170;

        return inputNodes.map((n, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = direction === 'LR' ? row * xGap + 40 : col * xGap + 40;
            const y = direction === 'LR' ? col * yGap + 40 : row * yGap + 40;
            return {
                ...n,
                position: { x, y },
                targetPosition: direction === 'LR' ? Position.Left : Position.Top,
                sourcePosition: direction === 'LR' ? Position.Right : Position.Bottom,
            };
        });
    };

    const finalizeLayout = (
        builtNodes: Node[],
        builtEdges: Edge[],
        direction: 'LR' | 'TB',
        useSwimlanes: boolean
    ) => {
        if (builtNodes.length > MAX_LAYOUT_NODES_FOR_DAGRE || builtEdges.length > MAX_LAYOUT_EDGES_FOR_DAGRE) {
            const fastNodes = applyFastGridLayout(builtNodes, direction);
            const fastEdges = builtEdges.map(e => ({ ...e, animated: false }));
            setNodes(fastNodes);
            setEdges(fastEdges);
            return;
        }

        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
            builtNodes,
            builtEdges,
            direction,
            useSwimlanes
        );
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
    };

    const initializeGraph = (
        data: any,
        mode: 'relationships' | 'independent' = 'relationships',
        graphMode: GraphViewMode = graphViewMode
    ) => {
        if (!data || !data.graph || !data.graph.nodes) return;

        const nodesData: any[] = data.graph.nodes;
        const edgesData: any[] = data.graph.edges || [];

        setRelationshipTotal(nodesData.length);
        setIndependentTotal(nodesData.length);

        const isCallableNode = (n: any) => n.type === 'function' || n.type === 'method';

        let workingNodes: any[] = nodesData;
        let workingEdges: any[] = edgesData;

        // ── PERFORMANCE CAP FOR MASSIVE REPOSITORIES (e.g., Gitea) ──
        // React Flow creates DOM instances. 14,000 nodes will freeze the webview.
        const MAX_RENDER_NODES = 600;
        const degreeCounts: Record<string, number> = {};
        edgesData.forEach((e: any) => {
            degreeCounts[e.source] = (degreeCounts[e.source] || 0) + 1;
            degreeCounts[e.target] = (degreeCounts[e.target] || 0) + 1;
        });
        const getNodeScore = (n: any) => (degreeCounts[n.id] || 0) + (n.metadata?.importanceScore || 1);


        // ── Early-return branches for function, sequence, and overall ──
        // These use the RAW entity-level nodes/edges BEFORE any directory aggregation.

        if (graphMode === 'function') {
            let callableNodes = nodesData.filter(isCallableNode);
            setRelationshipTotal(callableNodes.length > 0 ? callableNodes.length : nodesData.length);
            setIndependentTotal(callableNodes.length > 0 ? callableNodes.length : nodesData.length);
            if (callableNodes.length === 0) {
                // Fallback: use ALL nodes if no functions/methods found (e.g. Go)
                const allNodes = nodesData.slice()
                    .sort((a: any, b: any) => getNodeScore(b) - getNodeScore(a))
                    .slice(0, MAX_RENDER_NODES);
                const allIds = new Set(allNodes.map((n: any) => n.id));
                const allEdges = edgesData.filter((e: any) => allIds.has(e.source) && allIds.has(e.target));
                const builtNodes = allNodes.map((n: any) => buildNode(n, 1, allEdges, false));
                const builtEdges: Edge[] = allEdges.map((e: any) => ({
                    id: `${e.source}->${e.target}`,
                    source: e.source,
                    target: e.target,
                    type: 'default',
                    animated: true,
                    style: { stroke: '#7fa6cf', strokeWidth: 1.5, opacity: 0.7 }
                }));
                finalizeLayout(builtNodes, builtEdges, 'LR', true);
                return;
            }
            // Sort and cap to prevent DOM freezing
            callableNodes = callableNodes
                .sort((a, b) => getNodeScore(b) - getNodeScore(a))
                .slice(0, MAX_RENDER_NODES);

            const callableIds = new Set(callableNodes.map((n: any) => n.id));
            const callableEdges = edgesData.filter(
                (e: any) => callableIds.has(e.source) && callableIds.has(e.target)
            );
            const builtNodes = callableNodes.map((n: any) => buildNode(n, 1, callableEdges, false));
            const builtEdges: Edge[] = callableEdges.map((e: any) => ({
                id: `${e.source}->${e.target}`,
                source: e.source,
                target: e.target,
                type: 'default',
                animated: true,
                style: { stroke: '#7fa6cf', strokeWidth: 1.5, opacity: 0.7 }
            }));
            finalizeLayout(builtNodes, builtEdges, 'LR', true);
            return;
        }

        if (graphMode === 'sequence') {
            let candidates = nodesData.filter(isCallableNode);
            if (candidates.length === 0) candidates = nodesData.slice();
            setRelationshipTotal(candidates.length);
            setIndependentTotal(candidates.length);
            
            candidates = candidates
                .sort((a: any, b: any) => getNodeScore(b) - getNodeScore(a))
                .slice(0, MAX_RENDER_NODES);
            
            const candidateIds = new Set(candidates.map((n: any) => n.id));
            const seqEdges = edgesData.filter(
                (e: any) => candidateIds.has(e.source) && candidateIds.has(e.target)
            );

            // Topological sort (Kahn's algorithm)
            const inDeg: Record<string, number> = {};
            candidates.forEach((n: any) => { inDeg[n.id] = 0; });
            seqEdges.forEach((e: any) => { inDeg[e.target] = (inDeg[e.target] || 0) + 1; });
            const queue = candidates.filter((n: any) => (inDeg[n.id] || 0) === 0);
            const sorted: any[] = [];
            const visited = new Set<string>();
            while (queue.length > 0) {
                const node = queue.shift()!;
                if (visited.has(node.id)) continue;
                visited.add(node.id);
                sorted.push(node);
                seqEdges.filter((e: any) => e.source === node.id).forEach((e: any) => {
                    inDeg[e.target] = (inDeg[e.target] || 0) - 1;
                    const target = candidates.find((n: any) => n.id === e.target);
                    if (target && (inDeg[e.target] || 0) <= 0 && !visited.has(e.target)) {
                        queue.push(target);
                    }
                });
            }
            candidates.forEach((n: any) => { if (!visited.has(n.id)) sorted.push(n); });

            const builtNodes: Node[] = sorted.map((n: any, i: number) => {
                const node = buildNode(n, 1, seqEdges, false);
                return {
                    ...node,
                    position: { x: 80, y: i * 90 + 40 },
                    targetPosition: Position.Top,
                    sourcePosition: Position.Bottom,
                };
            });
            const builtEdges: Edge[] = seqEdges.map((e: any) => ({
                id: `seq-${e.source}->${e.target}`,
                source: e.source,
                target: e.target,
                type: 'default',
                animated: true,
                label: 'calls',
                labelStyle: { fill: '#8ea4bf', fontSize: 9, fontFamily: 'system-ui' },
                style: { stroke: '#f59e0b', strokeWidth: 1.5, opacity: 0.7 }
            }));
            setNodes(builtNodes);
            setEdges(builtEdges);
            return;
        }

        if (graphMode === 'overall') {
            setRelationshipTotal(workingNodes.length);
            setIndependentTotal(workingNodes.length);
            const cappedNodes = workingNodes
                .sort((a: any, b: any) => getNodeScore(b) - getNodeScore(a))
                .slice(0, MAX_RENDER_NODES);
            const validIds = new Set(cappedNodes.map((n: any) => n.id));
            
            // Only use the capped nodes
            workingNodes = cappedNodes;
            workingEdges = edgesData.filter((e: any) => validIds.has(e.source) && validIds.has(e.target));
            // Fall through to directory mode renderer at the end
        } else {
            // ── DIRECTORY MODE: aggregate entity nodes into file-level nodes ──
            const idToNode = new Map<string, any>();
            for (const node of nodesData) {
                idToNode.set(node.id, node);
            }

            const fileMap = new Map<string, { importanceScore: number; complexitySum: number; complexityCount: number; entityCount: number }>();
            for (const node of nodesData) {
                const file = String(node.file || '').trim();
                if (!file) continue;
                const current = fileMap.get(file) || { importanceScore: 1, complexitySum: 0, complexityCount: 0, entityCount: 0 };
                const nodeImportance = typeof node.metadata?.importanceScore === 'number' ? node.metadata.importanceScore : 1;
                const complexity = typeof node.metadata?.complexity === 'number' ? node.metadata.complexity : undefined;
                current.importanceScore = Math.max(current.importanceScore, nodeImportance);
                if (complexity !== undefined) { current.complexitySum += complexity; current.complexityCount += 1; }
                current.entityCount += 1;
                fileMap.set(file, current);
            }

            const fileEdgeCount = new Map<string, number>();
            for (const edge of edgesData) {
                const srcNode = idToNode.get(edge.source);
                const dstNode = idToNode.get(edge.target);
                if (!srcNode || !dstNode || !srcNode.file || !dstNode.file) continue;
                if (String(srcNode.file) === String(dstNode.file)) continue;
                const key = `${srcNode.file}=>${dstNode.file}`;
                fileEdgeCount.set(key, (fileEdgeCount.get(key) || 0) + 1);
            }

            workingNodes = Array.from(fileMap.entries()).map(([file, stats]) => {
                const avgComplexity = stats.complexityCount > 0 ? stats.complexitySum / stats.complexityCount : 0;
                return {
                    id: `file::${file}`,
                    name: file.split('/').pop() || file,
                    type: 'file',
                    file,
                    startLine: 1,
                    endLine: 1,
                    metadata: { importanceScore: stats.importanceScore, complexity: avgComplexity, entityCount: stats.entityCount }
                };
            });

            workingEdges = Array.from(fileEdgeCount.entries()).map(([key, weight]) => {
                const [sourceFile, targetFile] = key.split('=>');
                return { source: `file::${sourceFile}`, target: `file::${targetFile}`, type: 'calls', weight };
            });

            setRelationshipTotal(workingNodes.length);
            setIndependentTotal(workingNodes.length);
        }

        const incomingCounts: Record<string, number> = {};
        const outgoingCounts: Record<string, number> = {};
        workingEdges.forEach((e: any) => {
            incomingCounts[e.target] = (incomingCounts[e.target] || 0) + 1;
            outgoingCounts[e.source] = (outgoingCounts[e.source] || 0) + 1;
        });

        const getImportance = (node: any): number => {
            const explicitImportance = typeof node.metadata?.importanceScore === 'number' ? node.metadata.importanceScore : undefined;
            if (explicitImportance !== undefined) {
                return explicitImportance;
            }

            const incoming = incomingCounts[node.id] || 0;
            const outgoing = outgoingCounts[node.id] || 0;
            const hasComplexity = typeof node.metadata?.complexity === 'number' ? node.metadata.complexity : 0;
            return (outgoing * 2) + incoming + (hasComplexity * 0.1);
        };

        // ── MODE-BASED RENDERING FOR DIRECTORY / OVERALL ──
        // Cap the number of files to render
        const cappedFileNodes = workingNodes
            .sort((a: any, b: any) => getNodeScore(b) - getNodeScore(a))
            .slice(0, MAX_RENDER_NODES);

        const validIds = new Set(cappedFileNodes.map((n: any) => n.id));
        const cappedFileEdges = workingEdges.filter((e: any) => validIds.has(e.source) && validIds.has(e.target));

        const allFileNodes = cappedFileNodes.map((n: any) => buildNode(n, 1, cappedFileEdges, false));
        const allFileEdges: Edge[] = cappedFileEdges.map((e: any) => ({
            id: `${e.source}->${e.target}`,
            source: e.source,
            target: e.target,
            type: 'default',
            animated: true,
            label: String(e.weight || ''),
            labelStyle: { fill: '#8ea4bf', fontSize: 9 },
            style: { stroke: '#7fa6cf', strokeWidth: Math.min(e.weight || 1, 3), opacity: 0.7 }
        }));
        finalizeLayout(allFileNodes, allFileEdges, 'LR', false);
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
            const layouted = getLayoutedElements(newNodes, newEdges, 'LR', graphViewMode === 'function');
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
                style: { stroke: '#7fa6cf', strokeWidth: 2, opacity: 0.8 }
            });
        });

        currentNodes[targetNodeIndex] = { ...targetNode, data: { ...targetNode.data, isExpanded: true } };
        const allNodes = [...currentNodes, ...newChildNodes];
        const allEdges = [...currentEdges, ...newReactFlowEdges];
        const layouted = getLayoutedElements(allNodes, allEdges, 'LR', graphViewMode === 'function');
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
        // Don't clear chat history if it's the same node being re-explained
        if (!chatNode || chatNode.id !== nodeId) {
            setChatHistory([]);
        }
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
                    style: { ...edge.style, stroke: '#7fa6cf', strokeWidth: 2.5, opacity: 0.95 }
                };
            }
            return edge;
        });
    }, [edges, selectedNodeIds]);

    const summaryMarkdown = graphData ? graphData.report : '';
    const totalForMode = viewMode === 'relationships' ? relationshipTotal : independentTotal;
    const shownForMode = viewMode === 'relationships'
        ? Math.min(relationshipLimit, relationshipTotal)
        : Math.min(independentLimit, independentTotal);

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
                            <span className="view-tag">alternate visual modes for the same codebase</span>
                        </div>
                        <div className="view-btn-group">
                            <button
                                className={`view-btn ${graphViewMode === 'function' ? 'active' : ''}`}
                                onClick={() => {
                                    setGraphViewMode('function');
                                    setRelationshipLimit(NODE_PAGE_SIZE);
                                    setIndependentLimit(NODE_PAGE_SIZE);
                                    if (graphData) initializeGraph(graphData, viewMode, 'function');
                                }}
                            >
                                Function Graph
                            </button>
                            <button
                                className={`view-btn ${graphViewMode === 'directory' ? 'active' : ''}`}
                                onClick={() => {
                                    setGraphViewMode('directory');
                                    setRelationshipLimit(NODE_PAGE_SIZE);
                                    setIndependentLimit(NODE_PAGE_SIZE);
                                    if (graphData) initializeGraph(graphData, viewMode, 'directory');
                                }}
                            >
                                Directory Graph
                            </button>
                            <button
                                className={`view-btn ${graphViewMode === 'sequence' ? 'active' : ''}`}
                                onClick={() => {
                                    setGraphViewMode('sequence');
                                    if (graphData) initializeGraph(graphData, viewMode, 'sequence');
                                }}
                            >
                                Sequence
                            </button>
                            <button
                                className={`view-btn ${graphViewMode === 'overall' ? 'active' : ''}`}
                                onClick={() => {
                                    setGraphViewMode('overall');
                                    setRelationshipLimit(NODE_PAGE_SIZE);
                                    setIndependentLimit(NODE_PAGE_SIZE);
                                    if (graphData) initializeGraph(graphData, viewMode, 'overall');
                                }}
                            >
                                Overall Graph
                            </button>
                        </div>
                    </div>

                    <div className="view-section" style={{ marginLeft: '20px' }}>
                        <div className="view-header">
                            <span className="view-label">Relationship Mode</span>
                        </div>
                        {graphViewMode === 'overall' ? (
                            <>
                                <div style={{ fontSize: '11px', color: '#8ea4bf', marginBottom: '4px' }}>
                                    LLM Importance Stringency: {llmLimit === 1 ? 'ALL' : `>= ${llmLimit}/10`}
                                </div>
                                <input
                                    type="range"
                                    min="1"
                                    max="10"
                                    value={llmLimit}
                                    style={{ width: '130px', accentColor: '#7fa6cf' }}
                                    onChange={e => setLlmLimit(parseInt(e.target.value))}
                                />
                            </>
                        ) : (
                            <>
                                <select 
                                    className="view-mode-select"
                                    value={viewMode}
                                    onChange={(e) => {
                                        const newMode = e.target.value as 'relationships' | 'independent';
                                        setViewMode(newMode);
                                        if (graphData) initializeGraph(graphData, newMode, graphViewMode);
                                    }}
                                >
                                    <option value="relationships">Relationship Based Nodes</option>
                                    <option value="independent">Independent Nodes</option>
                                </select>
                                <div style={{ marginTop: '6px', fontSize: '11px', color: '#8ea4bf' }}>
                                    Showing {shownForMode} of {totalForMode} nodes
                                </div>
                                {shownForMode < totalForMode && (
                                    <button
                                        className="view-btn"
                                        style={{ marginTop: '8px', padding: '6px 10px' }}
                                        onClick={() => {
                                            if (viewMode === 'relationships') {
                                                setRelationshipLimit(prev => prev + NODE_PAGE_SIZE);
                                            } else {
                                                setIndependentLimit(prev => prev + NODE_PAGE_SIZE);
                                            }
                                        }}
                                    >
                                        Load More (+{NODE_PAGE_SIZE})
                                    </button>
                                )}
                            </>
                        )}
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
                                background: 'rgba(118, 161, 203, 0.24)',
                                color: '#dbe8f6',
                                fontWeight: 600,
                                border: '1px solid rgba(161, 185, 212, 0.26)',
                                animation: 'pulse 2s infinite'
                            }}
                            onClick={handleExplainSelection}
                        >
                            Analyze Selection ({selectedNodeIds.length})
                        </button>
                    )}
                    {selectedNodeIds.length > 0 && (
                        <div style={{ marginLeft: '10px', fontSize: '11px', color: '#8ea4bf', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#7fa6cf', animation: 'pulse 1s infinite' }}></span>
                            {selectedNodeIds.length} functions selected
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
                        background: '#12161d',
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
                    onMouseEnter={(e) => e.currentTarget.style.background = '#5f7d9f'}
                    onMouseLeave={(e) => e.currentTarget.style.background = '#333'}
                    onMouseDown={(e) => { e.preventDefault(); isResizing.current = true; }}
                />

                <div style={{ flex: 1, position: 'relative' }}>
                    {graphViewMode === 'overall' ? (
                        <VisGraph 
                            data={graphData} 
                            llmLimit={llmLimit} 
                            onNodeSelect={(nodeId) => {
                                const gNode = graphData?.graph?.nodes?.find((n: any) => n.id === nodeId);
                                if (gNode) {
                                    handleExplainFunction(nodeId, gNode.name || gNode.id, gNode.file);
                                    setSelectedNodeIds([nodeId]);
                                }
                            }}
                        />
                    ) : nodes.length > 0 ? (
                        <GraphLayout 
                            nodes={nodes} 
                            edges={styledEdges} 
                            onNodeClick={handleNodeClick}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                        />

                    ) : (
                        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#888', textAlign: 'center', maxWidth: '360px' }}>
                            {graphLoadError
                                ? graphLoadError
                                : graphData
                                    ? "No entries found in Adjacency List"
                                    : "Loading Architecture..."}
                        </div>
                    )}
                </div>

                {isChatPanelOpen && (
                    <div
                        title="Resize Chat Sidebar"
                        style={{ width: '4px', cursor: 'col-resize', background: '#333', zIndex: 20 }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#5f7d9f'}
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
                        background: '#12161d',
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