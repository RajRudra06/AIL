import React, { useEffect, useState, useMemo } from 'react';
import './App.css';

import { GraphLayout } from './GraphLayout';
import { getLayoutedElements } from './layoutUtils';
import { Node, Edge, Position, MarkerType, applyNodeChanges, applyEdgeChanges, NodeChange, EdgeChange } from '@xyflow/react';
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
const INITIAL_FUNCTION_DEPTH = 2;

const DEPTH_COLOR_LEGEND = [
    { depth: 1, color: '#38bdf8' },
    { depth: 2, color: '#34d399' },
    { depth: 3, color: '#a78bfa' },
    { depth: 4, color: '#f59e0b' },
    { depth: 5, color: '#f97316' },
    { depth: 6, color: '#ef4444' },
];

const App: React.FC = () => {

    const [graphData, setGraphData] = useState<any>(null);
    const [nodes, setNodes] = useState<Node[]>([]);
    const [edges, setEdges] = useState<Edge[]>([]);
    const [sidebarWidth, setSidebarWidth] = useState(340);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [rightSidebarWidth, setRightSidebarWidth] = useState(420);
    const [isChatPanelOpen, setIsChatPanelOpen] = useState(true);
    const [rightPanelTab, setRightPanelTab] = useState<'summary' | 'chat'>('summary');
    const [chatNode, setChatNode] = useState<any>(null);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [searchResults, setSearchResults] = useState<Node[]>([]);
    const [currentSearchIndex, setCurrentSearchIndex] = useState<number>(-1);
    const [chatHistory, setChatHistory] = useState<Message[]>([]);
    const [isLoadingChat, setIsLoadingChat] = useState(false);
    const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
    const [viewMode, setViewMode] = useState<'relationships' | 'core' | 'independent'>('relationships');
    const [graphViewMode, setGraphViewMode] = useState<GraphViewMode>('function');
    const [relationshipLimit, setRelationshipLimit] = useState<number>(NODE_PAGE_SIZE);
    const [independentLimit, setIndependentLimit] = useState<number>(NODE_PAGE_SIZE);
    const [relationshipTotal, setRelationshipTotal] = useState<number>(0);
    const [independentTotal, setIndependentTotal] = useState<number>(0);
    const [llmLimit, setLlmLimit] = useState<number>(1);
    const [renderNodeBudget, setRenderNodeBudget] = useState<number>(600);
    const [graphLoadError, setGraphLoadError] = useState<string | null>(null);
    const [sequenceComponents, setSequenceComponents] = useState<Array<{ id: number; nodes: number; edges: number }>>([]);
    const [sequenceFocusComponent, setSequenceFocusComponent] = useState<number | 'all'>('all');
    const [sequenceEdgeMode, setSequenceEdgeMode] = useState<'backbone' | 'all'>('backbone');
    const [isOverviewOverlayOpen, setIsOverviewOverlayOpen] = useState<boolean>(false);
    const [dashboardOverview, setDashboardOverview] = useState<any>(null);
    const [tuckedIndependentCount, setTuckedIndependentCount] = useState<number>(0);

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
                    setDashboardOverview(message.data?.overview || null);
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
    }, [relationshipLimit, independentLimit, renderNodeBudget]);

    useEffect(() => {
        if (graphViewMode !== 'sequence') {
            setSequenceFocusComponent('all');
        }
    }, [graphViewMode]);

    useEffect(() => {
        if (graphViewMode === 'sequence' && graphData) {
            initializeGraph(graphData, viewMode, 'sequence');
        }
    }, [sequenceFocusComponent]);

    useEffect(() => {
        if (graphViewMode === 'sequence' && graphData) {
            initializeGraph(graphData, viewMode, 'sequence');
        }
    }, [sequenceEdgeMode]);


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

    const buildNode = (
        nodeData: any,
        depth: number,
        edgesData: any[],
        isExpanded: boolean = false,
        canExpand: boolean = true
    ): Node => {
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
                canExpand,
                onExpand: handleExpand,
                onClick: handleNodeClick,
                onExplain: handleExplainFunction,
                params: nodeData.params || [],
                metadata: nodeData.metadata || {},
                addedByExpand: Boolean(nodeData.addedByExpand)
            }
        };
    };

    const computeDepthMap = (graphNodes: any[], graphEdges: any[]): Map<string, number> => {
        const ids = new Set(graphNodes.map(n => n.id));
        const indegree = new Map<string, number>();
        const outgoing = new Map<string, string[]>();
        const depth = new Map<string, number>();

        graphNodes.forEach(n => {
            indegree.set(n.id, 0);
            outgoing.set(n.id, []);
            depth.set(n.id, 1);
        });

        graphEdges.forEach(e => {
            if (!ids.has(e.source) || !ids.has(e.target)) return;
            indegree.set(e.target, (indegree.get(e.target) || 0) + 1);
            outgoing.set(e.source, [...(outgoing.get(e.source) || []), e.target]);
        });

        const roots = [...ids].filter(id => (indegree.get(id) || 0) === 0);
        const queue = roots.length > 0 ? [...roots] : [...ids].slice(0, Math.min(50, ids.size));
        const visited = new Set<string>();

        while (queue.length > 0) {
            const id = queue.shift()!;
            if (visited.has(id)) continue;
            visited.add(id);

            const currentDepth = depth.get(id) || 1;
            const next = outgoing.get(id) || [];
            next.forEach(targetId => {
                depth.set(targetId, Math.max(depth.get(targetId) || 1, currentDepth + 1));
                const nextIndeg = (indegree.get(targetId) || 0) - 1;
                indegree.set(targetId, nextIndeg);
                if (nextIndeg <= 0) {
                    queue.push(targetId);
                }
            });
        }

        return depth;
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
        try {
            const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
                builtNodes,
                builtEdges,
                direction,
                useSwimlanes
            );
            setNodes(layoutedNodes);
            setEdges(layoutedEdges);
        } catch (err: any) {
            console.error('Layout failed. Falling back to fast grid layout.', err);
            const fastNodes = applyFastGridLayout(builtNodes, direction);
            const fastEdges = builtEdges.map(e => ({ ...e, animated: false }));
            setGraphLoadError('Layout fallback used for this graph density.');
            setNodes(fastNodes);
            setEdges(fastEdges);
        }
    };

    const initializeGraph = (
        data: any,
        mode: 'relationships' | 'core' | 'independent' = 'relationships',
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

        // Performance cap tunable from UI for hackathon demos on large repos.
        const maxRenderNodes = renderNodeBudget;
        const degreeCounts: Record<string, number> = {};
        edgesData.forEach((e: any) => {
            degreeCounts[e.source] = (degreeCounts[e.source] || 0) + 1;
            degreeCounts[e.target] = (degreeCounts[e.target] || 0) + 1;
        });
        const getNodeScore = (n: any) => (degreeCounts[n.id] || 0) + (n.metadata?.importanceScore || 1);

        const filterConnectedOrDense = (candidateNodes: any[], candidateEdges: any[]) => {
            const nodeIds = new Set(candidateNodes.map(n => n.id));
            const degree = new Map<string, number>();
            candidateNodes.forEach((n: any) => degree.set(n.id, 0));

            candidateEdges.forEach((e: any) => {
                if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) return;
                degree.set(e.source, (degree.get(e.source) || 0) + 1);
                degree.set(e.target, (degree.get(e.target) || 0) + 1);
            });

            const connectedOrDense = candidateNodes.filter((n: any) => {
                const d = degree.get(n.id) || 0;
                return d > 0 || d >= 3;
            });

            const finalNodes = connectedOrDense.length > 0 ? connectedOrDense : candidateNodes;
            const finalIds = new Set(finalNodes.map((n: any) => n.id));
            const finalEdges = candidateEdges.filter((e: any) => finalIds.has(e.source) && finalIds.has(e.target));

            return {
                nodes: finalNodes,
                edges: finalEdges,
                tucked: Math.max(0, candidateNodes.length - finalNodes.length)
            };
        };

        const filterCoreByDegree = (candidateNodes: any[], candidateEdges: any[], minDegree = 3) => {
            const nodeIds = new Set(candidateNodes.map(n => n.id));
            const degree = new Map<string, number>();
            candidateNodes.forEach((n: any) => degree.set(n.id, 0));

            candidateEdges.forEach((e: any) => {
                if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) return;
                degree.set(e.source, (degree.get(e.source) || 0) + 1);
                degree.set(e.target, (degree.get(e.target) || 0) + 1);
            });

            const coreNodes = candidateNodes.filter((n: any) => (degree.get(n.id) || 0) >= minDegree);
            const finalNodes = coreNodes.length > 0 ? coreNodes : candidateNodes;
            const finalIds = new Set(finalNodes.map((n: any) => n.id));
            const finalEdges = candidateEdges.filter((e: any) => finalIds.has(e.source) && finalIds.has(e.target));

            return {
                nodes: finalNodes,
                edges: finalEdges,
                tucked: Math.max(0, candidateNodes.length - finalNodes.length)
            };
        };


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
                    .slice(0, maxRenderNodes);
                const allIds = new Set(allNodes.map((n: any) => n.id));
                const allEdges = edgesData.filter((e: any) => allIds.has(e.source) && allIds.has(e.target));
                const depthMap = computeDepthMap(allNodes, allEdges);
                const builtNodes = allNodes.map((n: any) => buildNode(n, Math.max(1, Math.min(depthMap.get(n.id) || 1, 6)), allEdges, false, false));
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

            // Lazy-load strategy for function view:
            // Render only first two graph layers, then expand on demand.
            const sortedCallable = callableNodes
                .slice()
                .sort((a, b) => getNodeScore(b) - getNodeScore(a));

            const callableIds = new Set(sortedCallable.map((n: any) => n.id));
            let callableEdges = edgesData.filter((e: any) => callableIds.has(e.source) && callableIds.has(e.target));

            if (mode === 'relationships') {
                const filtered = filterConnectedOrDense(sortedCallable, callableEdges);
                callableNodes = filtered.nodes;
                callableEdges = filtered.edges;
                setTuckedIndependentCount(filtered.tucked);
            } else if (mode === 'core') {
                const filtered = filterCoreByDegree(sortedCallable, callableEdges, 3);
                callableNodes = filtered.nodes;
                callableEdges = filtered.edges;
                setTuckedIndependentCount(filtered.tucked);
            } else {
                callableNodes = sortedCallable;
                setTuckedIndependentCount(0);
            }

            setRelationshipTotal(callableNodes.length);
            setIndependentTotal(callableNodes.length);

            const indegree = new Map<string, number>();
            const outgoing = new Map<string, string[]>();
            sortedCallable.forEach((n: any) => {
                indegree.set(n.id, 0);
                outgoing.set(n.id, []);
            });
            callableEdges.forEach((e: any) => {
                indegree.set(e.target, (indegree.get(e.target) || 0) + 1);
                outgoing.set(e.source, [...(outgoing.get(e.source) || []), e.target]);
            });

            const rootCandidates = callableNodes.filter((n: any) => (indegree.get(n.id) || 0) === 0);
            const rankedRoots = (rootCandidates.length > 0 ? rootCandidates : callableNodes)
                .slice()
                .sort((a: any, b: any) => getNodeScore(b) - getNodeScore(a));

            const seedRootCount = Math.max(8, Math.min(40, Math.floor(maxRenderNodes / 12)));
            const seedRoots = rankedRoots.slice(0, seedRootCount);

            const visible = new Set<string>();
            const queue: Array<{ id: string; depth: number }> = seedRoots.map((n: any) => ({ id: n.id, depth: 1 }));

            while (queue.length > 0 && visible.size < maxRenderNodes) {
                const item = queue.shift()!;
                if (visible.has(item.id)) continue;
                visible.add(item.id);

                if (item.depth >= INITIAL_FUNCTION_DEPTH) continue;

                const children = (outgoing.get(item.id) || [])
                    .slice()
                    .sort((a, b) => {
                        const aNode = callableNodes.find((n: any) => n.id === a);
                        const bNode = callableNodes.find((n: any) => n.id === b);
                        return getNodeScore(bNode || { id: b, metadata: {} }) - getNodeScore(aNode || { id: a, metadata: {} });
                    })
                    .slice(0, 18);

                children.forEach(childId => {
                    if (!visible.has(childId)) {
                        queue.push({ id: childId, depth: item.depth + 1 });
                    }
                });
            }

            if (visible.size === 0 && callableNodes.length > 0) {
                visible.add(callableNodes[0].id);
            }

            const initialNodes = callableNodes.filter((n: any) => visible.has(n.id));
            const initialEdges = callableEdges.filter((e: any) => visible.has(e.source) && visible.has(e.target));
            const depthMap = computeDepthMap(initialNodes, initialEdges);

            const builtNodes = initialNodes.map((n: any) =>
                buildNode(n, Math.max(1, Math.min(depthMap.get(n.id) || 1, 6)), callableEdges, false, true)
            );

            const builtEdges: Edge[] = initialEdges.map((e: any) => ({
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
            const candidateIds = new Set(candidates.map((n: any) => n.id));
            let seqEdges = edgesData.filter(
                (e: any) => candidateIds.has(e.source) && candidateIds.has(e.target)
            );

            if (mode === 'relationships') {
                const filtered = filterConnectedOrDense(candidates, seqEdges);
                candidates = filtered.nodes;
                seqEdges = filtered.edges;
                setTuckedIndependentCount(filtered.tucked);
            } else if (mode === 'core') {
                const filtered = filterCoreByDegree(candidates, seqEdges, 3);
                candidates = filtered.nodes;
                seqEdges = filtered.edges;
                setTuckedIndependentCount(filtered.tucked);
            } else {
                setTuckedIndependentCount(0);
            }

            setRelationshipTotal(candidates.length);
            setIndependentTotal(candidates.length);

            candidates = candidates
                .sort((a: any, b: any) => getNodeScore(b) - getNodeScore(a))
                .slice(0, maxRenderNodes);

            const filteredIds = new Set(candidates.map((n: any) => n.id));
            seqEdges = seqEdges.filter((e: any) => filteredIds.has(e.source) && filteredIds.has(e.target));

            // Build weakly connected components so disjoint graphs do not collapse into one vertical chain.
            const undirected = new Map<string, Set<string>>();
            candidates.forEach((n: any) => undirected.set(n.id, new Set<string>()));
            seqEdges.forEach((e: any) => {
                undirected.get(e.source)?.add(e.target);
                undirected.get(e.target)?.add(e.source);
            });

            const components: string[][] = [];
            const seen = new Set<string>();
            for (const n of candidates) {
                if (seen.has(n.id)) continue;
                const queue = [n.id];
                seen.add(n.id);
                const comp: string[] = [];
                while (queue.length > 0) {
                    const id = queue.shift()!;
                    comp.push(id);
                    (undirected.get(id) || new Set<string>()).forEach(next => {
                        if (!seen.has(next)) {
                            seen.add(next);
                            queue.push(next);
                        }
                    });
                }
                components.push(comp);
            }

            const allComponentSummaries = components.map((comp, idx) => {
                const compSet = new Set(comp);
                const compEdgeCount = seqEdges.filter((e: any) => compSet.has(e.source) && compSet.has(e.target)).length;
                return { id: idx + 1, nodes: comp.length, edges: compEdgeCount };
            });
            setSequenceComponents(allComponentSummaries);

            let focusedComponents = components;
            if (sequenceFocusComponent !== 'all') {
                const focusIndex = Number(sequenceFocusComponent) - 1;
                if (focusIndex >= 0 && focusIndex < components.length) {
                    focusedComponents = [components[focusIndex]];
                }
            }

            const nodeById = new Map(candidates.map((n: any) => [n.id, n]));
            const builtNodes: Node[] = [];
            let componentXOffset = 80;
            const backboneEdgesAccumulator: any[] = [];

            focusedComponents.forEach((comp) => {
                const compSet = new Set(comp);
                const compEdges = seqEdges.filter((e: any) => compSet.has(e.source) && compSet.has(e.target));

                // Build a spanning-forest style backbone so sequence is meaningfully different from function view.
                const outBySource = new Map<string, string[]>();
                const inByTarget = new Map<string, string[]>();
                comp.forEach(id => {
                    outBySource.set(id, []);
                    inByTarget.set(id, []);
                });
                compEdges.forEach((e: any) => {
                    outBySource.set(e.source, [...(outBySource.get(e.source) || []), e.target]);
                    inByTarget.set(e.target, [...(inByTarget.get(e.target) || []), e.source]);
                });

                const indeg = new Map<string, number>();
                comp.forEach(id => indeg.set(id, (inByTarget.get(id) || []).length));
                const roots = comp.filter(id => (indeg.get(id) || 0) === 0);
                const rankedCompNodes = comp
                    .slice()
                    .sort((a, b) => {
                        const aNode = nodeById.get(a);
                        const bNode = nodeById.get(b);
                        return getNodeScore(bNode || { id: b, metadata: {} }) - getNodeScore(aNode || { id: a, metadata: {} });
                    });
                const seed = roots.length > 0 ? roots : [rankedCompNodes[0]];

                const visited = new Set<string>();
                const q = seed.map(id => ({ id, level: 1 }));
                const backboneEdges: any[] = [];
                const levelById: Record<string, number> = {};
                seed.forEach(id => { levelById[id] = 1; });

                while (q.length > 0) {
                    const item = q.shift()!;
                    if (visited.has(item.id)) continue;
                    visited.add(item.id);
                    levelById[item.id] = Math.max(levelById[item.id] || 1, item.level);

                    const nextTargets = (outBySource.get(item.id) || [])
                        .slice()
                        .sort((a, b) => {
                            const aNode = nodeById.get(a);
                            const bNode = nodeById.get(b);
                            return getNodeScore(bNode || { id: b, metadata: {} }) - getNodeScore(aNode || { id: a, metadata: {} });
                        });

                    nextTargets.forEach(targetId => {
                        if (!visited.has(targetId)) {
                            const alreadyHasParent = backboneEdges.some(e => e.target === targetId);
                            if (!alreadyHasParent) {
                                backboneEdges.push({ source: item.id, target: targetId, type: 'calls' });
                                q.push({ id: targetId, level: item.level + 1 });
                            }
                        }
                    });
                }

                rankedCompNodes.forEach(id => {
                    if (!visited.has(id)) {
                        levelById[id] = 1;
                    }
                });

                backboneEdgesAccumulator.push(...backboneEdges);

                const inDeg: Record<string, number> = {};
                comp.forEach(id => { inDeg[id] = 0; });
                backboneEdges.forEach((e: any) => { inDeg[e.target] = (inDeg[e.target] || 0) + 1; });

                const topoQueue = comp.filter(id => (inDeg[id] || 0) === 0);
                const ordered: string[] = [];
                const localVisited = new Set<string>();

                while (topoQueue.length > 0) {
                    const id = topoQueue.shift()!;
                    if (localVisited.has(id)) continue;
                    localVisited.add(id);
                    ordered.push(id);
                    backboneEdges.filter((e: any) => e.source === id).forEach((e: any) => {
                        levelById[e.target] = Math.max(levelById[e.target] || 1, (levelById[id] || 1) + 1);
                        inDeg[e.target] = (inDeg[e.target] || 0) - 1;
                        if ((inDeg[e.target] || 0) <= 0 && !localVisited.has(e.target)) {
                            topoQueue.push(e.target);
                        }
                    });
                }

                comp.forEach(id => { if (!localVisited.has(id)) ordered.push(id); });

                const lanes = new Map<number, string[]>();
                ordered.forEach(id => {
                    const lvl = Math.max(1, Math.min(levelById[id] || 1, 8));
                    lanes.set(lvl, [...(lanes.get(lvl) || []), id]);
                });

                const laneLevels = [...lanes.keys()].sort((a, b) => a - b);
                let localMaxWidth = 0;

                laneLevels.forEach((lvl) => {
                    const laneNodes = lanes.get(lvl) || [];
                    localMaxWidth = Math.max(localMaxWidth, lvl);
                    laneNodes.forEach((id, idx) => {
                        const raw = nodeById.get(id);
                        if (!raw) return;
                        const node = buildNode(raw, Math.min(6, lvl), backboneEdges, false, false);
                        builtNodes.push({
                            ...node,
                            position: { x: componentXOffset + ((lvl - 1) * 260), y: 60 + (idx * 92) },
                            targetPosition: Position.Left,
                            sourcePosition: Position.Right,
                        });
                    });
                });

                componentXOffset += Math.max(340, (localMaxWidth * 280) + 170);

            });

            const renderedIds = new Set(builtNodes.map(n => n.id));
            const sequenceEdgesSource = sequenceEdgeMode === 'all' ? seqEdges : backboneEdgesAccumulator;
            const builtEdges: Edge[] = sequenceEdgesSource.map((e: any) => ({
                id: `seq-${e.source}->${e.target}`,
                source: e.source,
                target: e.target,
                type: 'default',
                animated: false,
                label: 'call',
                labelStyle: { fill: '#9cb4cf', fontSize: 8, fontFamily: 'system-ui' },
                style: { stroke: '#f59e0b', strokeWidth: 1.3, opacity: 0.65 },
                markerEnd: {
                    type: MarkerType.ArrowClosed,
                    color: '#f59e0b',
                    width: 16,
                    height: 16,
                }
            })).filter((e) => renderedIds.has(e.source) && renderedIds.has(e.target));
            setNodes(builtNodes);
            setEdges(builtEdges);
            return;
        }

        if (graphMode === 'overall') {
            setTuckedIndependentCount(0);
            setRelationshipTotal(workingNodes.length);
            setIndependentTotal(workingNodes.length);
            const cappedNodes = workingNodes
                .sort((a: any, b: any) => getNodeScore(b) - getNodeScore(a))
                .slice(0, maxRenderNodes);
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

            if (mode === 'relationships') {
                const filtered = filterConnectedOrDense(workingNodes, workingEdges);
                workingNodes = filtered.nodes;
                workingEdges = filtered.edges;
                setTuckedIndependentCount(filtered.tucked);
                setRelationshipTotal(workingNodes.length);
                setIndependentTotal(workingNodes.length);
            } else if (mode === 'core') {
                const filtered = filterCoreByDegree(workingNodes, workingEdges, 3);
                workingNodes = filtered.nodes;
                workingEdges = filtered.edges;
                setTuckedIndependentCount(filtered.tucked);
                setRelationshipTotal(workingNodes.length);
                setIndependentTotal(workingNodes.length);
            } else {
                setTuckedIndependentCount(0);
            }
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
            .slice(0, maxRenderNodes);

        const validIds = new Set(cappedFileNodes.map((n: any) => n.id));
        const cappedFileEdges = workingEdges.filter((e: any) => validIds.has(e.source) && validIds.has(e.target));

        const directoryDepthMap = computeDepthMap(cappedFileNodes, cappedFileEdges);
        const allFileNodes = cappedFileNodes.map((n: any) =>
            buildNode(n, Math.max(1, Math.min(directoryDepthMap.get(n.id) || 1, 6)), cappedFileEdges, false, false)
        );
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
        if (graphViewMode !== 'function') {
            return;
        }

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
            const descendantIds = new Set(
                descendants
                    .filter(d => Boolean((d.data as any)?.addedByExpand))
                    .map(d => d.id)
            );

            if (descendantIds.size === 0) {
                const resetNodes = currentNodes.map(n => n.id === nodeId ? { ...n, data: { ...n.data, isExpanded: false } } : n);
                setNodes(resetNodes);
                return;
            }

            const newNodes = currentNodes
                .filter(n => !descendantIds.has(n.id))
                .map(n => n.id === nodeId ? { ...n, data: { ...n.data, isExpanded: false } } : n);
            const newEdges = currentEdges.filter(e => !descendantIds.has(e.target) && !descendantIds.has(e.source));
            // Keep current layout stable during collapse to avoid viewport jump.
            setNodes(newNodes);
            setEdges(newEdges);
            return;
        }

        const childEdges = currentEdgesData
            .filter((e: any) => e.source === nodeId)
            .slice(0, 24);
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

            const built = buildNode({ ...childNodeData, addedByExpand: true }, currentDepth + 1, currentEdgesData, false);
            newChildNodes.push(built);
            newReactFlowEdges.push({
                id: `${nodeId}-${childNodeData.id}`,
                source: nodeId,
                target: childNodeData.id,
                type: 'default',
                animated: true,
                style: { stroke: '#7fa6cf', strokeWidth: 2, opacity: 0.8 }
            });
        });

        // Progressive lazy expansion: if direct children are already visible, reveal one more hop.
        if (newChildNodes.length === 0) {
            const visibleChildIds = childEdges
                .map((e: any) => e.target)
                .filter((id: string) => currentNodes.some(n => n.id === id));

            const frontierEdges = currentEdgesData
                .filter((e: any) => visibleChildIds.includes(e.source))
                .slice(0, 36);

            frontierEdges.forEach((edge: any) => {
                const childNodeData = (currentGraphData.graph.nodes || []).find((n: any) => n.id === edge.target);
                if (!childNodeData) return;
                if (currentNodes.some(n => n.id === childNodeData.id)) return;

                const built = buildNode({ ...childNodeData, addedByExpand: true }, currentDepth + 1, currentEdgesData, false);
                newChildNodes.push(built);
                newReactFlowEdges.push({
                    id: `${edge.source}-${childNodeData.id}`,
                    source: edge.source,
                    target: childNodeData.id,
                    type: 'default',
                    animated: true,
                    style: { stroke: '#7fa6cf', strokeWidth: 2, opacity: 0.75 }
                });
            });
        }

        if (newChildNodes.length === 0) {
            return;
        }

        // Position expanded nodes near the parent so the expansion feels local and clean.
        const occupied = new Set(currentNodes.map(n => `${Math.round(n.position.x)}:${Math.round(n.position.y)}`));
        const parentPos = targetNode.position || { x: 0, y: 0 };
        const laneX = parentPos.x + 290;
        const laneYStart = parentPos.y - Math.max(0, (newChildNodes.length - 1) * 42);
        const yStep = 84;

        const positionedChildren = newChildNodes.map((child, idx) => {
            let y = laneYStart + (idx * yStep);
            let guard = 0;
            while (occupied.has(`${Math.round(laneX)}:${Math.round(y)}`) && guard < 12) {
                y += yStep;
                guard += 1;
            }
            occupied.add(`${Math.round(laneX)}:${Math.round(y)}`);
            return {
                ...child,
                position: { x: laneX, y },
                sourcePosition: Position.Right,
                targetPosition: Position.Left,
            };
        });

        currentNodes[targetNodeIndex] = { ...targetNode, data: { ...targetNode.data, isExpanded: true } };
        const allNodes = [...currentNodes, ...positionedChildren];
        const allEdges = [...currentEdges, ...newReactFlowEdges];
        // Keep viewport stable: no global relayout on expand.
        setNodes(allNodes);
        setEdges(allEdges);
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
        setRightPanelTab('chat');
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
        setRightPanelTab('chat');
        
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
    const totalForMode = viewMode === 'independent' ? independentTotal : relationshipTotal;
    const shownForMode = nodes.length;
    const stats = graphData?.graph?.stats || {};
    const isPruned = Boolean(stats.wasPruned);
    const renderedNodes = Number(stats.renderedNodes || graphData?.graph?.nodes?.length || 0);
    const fullNodes = Number(stats.totalNodes || graphData?.graph?.nodes?.length || 0);
    const renderedEdges = Number(stats.renderedEdges || graphData?.graph?.edges?.length || 0);
    const fullEdges = Number(stats.totalEdges || graphData?.graph?.edges?.length || 0);

    const modeSemantics: Record<GraphViewMode, string> = {
        function: 'Full static call topology (lazy expanded) with all known call edges.',
        directory: 'File-level dependency view aggregated from entity interactions.',
        sequence: 'Backbone flow view (spanning forest), not runtime execution tracing.',
        overall: 'Global exploration mode with vis-network physics and importance filtering.',
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
            <div className="header-container">
                <div className="explorer-title">
                    <h2>
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
                        <div style={{ marginTop: '6px', fontSize: '11px', color: '#8ea4bf' }}>
                            {modeSemantics[graphViewMode]}
                        </div>
                        {graphViewMode === 'sequence' && (
                            <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '11px', color: '#9eb2ca' }}>Sequence Focus</span>
                                <select
                                    className="view-mode-select"
                                    value={String(sequenceFocusComponent)}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setSequenceFocusComponent(val === 'all' ? 'all' : parseInt(val, 10));
                                    }}
                                >
                                    <option value="all">All Components</option>
                                    {sequenceComponents.map(comp => (
                                        <option key={comp.id} value={String(comp.id)}>
                                            Component {comp.id} ({comp.nodes}n/{comp.edges}e)
                                        </option>
                                    ))}
                                </select>
                                <span style={{ fontSize: '11px', color: '#9eb2ca' }}>Edges</span>
                                <select
                                    className="view-mode-select"
                                    value={sequenceEdgeMode}
                                    onChange={(e) => setSequenceEdgeMode(e.target.value as 'backbone' | 'all')}
                                >
                                    <option value="backbone">Backbone</option>
                                    <option value="all">All Edges</option>
                                </select>
                                {sequenceComponents.slice(0, 4).map(comp => (
                                    <span
                                        key={`pill-${comp.id}`}
                                        style={{
                                            fontSize: '10px',
                                            color: '#c3d7ef',
                                            border: '1px solid rgba(114,144,176,0.38)',
                                            background: 'rgba(14,24,36,0.7)',
                                            borderRadius: '999px',
                                            padding: '3px 7px'
                                        }}
                                    >
                                        Lane {comp.id}: {comp.nodes} nodes
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="view-section" style={{ marginLeft: '20px' }}>
                        <div className="view-header">
                            <span className="view-label">Visibility</span>
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
                                        const newMode = e.target.value as 'relationships' | 'core' | 'independent';
                                        setViewMode(newMode);
                                        if (graphData) initializeGraph(graphData, newMode, graphViewMode);
                                    }}
                                >
                                    <option value="relationships">Showing Connected Nodes</option>
                                    <option value="core">Connected Core Only (&gt;=3 edges)</option>
                                    <option value="independent">Show All</option>
                                </select>
                                <div style={{ marginTop: '6px', fontSize: '11px', color: '#8ea4bf' }}>
                                    Showing {shownForMode} of {totalForMode} nodes
                                </div>
                                {viewMode !== 'independent' && tuckedIndependentCount > 0 && (
                                    <div style={{ marginTop: '4px', fontSize: '11px', color: '#8ea4bf' }}>
                                        Tucked away low-signal nodes: {tuckedIndependentCount}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                    <button
                        className="sidebar-toggle-btn"
                        title={isChatPanelOpen ? "Close Insights Panel" : "Open Insights Panel"}
                        onClick={() => {
                            if (isChatPanelOpen) {
                                setRightSidebarWidth(0);
                                setIsChatPanelOpen(false);
                            } else {
                                setRightSidebarWidth(420);
                                setIsChatPanelOpen(true);
                            }
                        }}
                        style={{ fontWeight: 700, fontSize: '14px' }}
                    >
                        i
                    </button>
                    <button
                        className="view-btn"
                        style={{ marginLeft: '8px', padding: '6px 10px' }}
                        onClick={() => setIsOverviewOverlayOpen(prev => !prev)}
                    >
                        {isOverviewOverlayOpen ? 'Hide Overlay' : 'Dashboard Overlay'}
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
                    <div style={{ marginLeft: '12px', fontSize: '11px', color: '#93a9c2', whiteSpace: 'nowrap' }}>
                        Click node: jump · i: explain · Ctrl/Cmd+Click: multi-select
                    </div>
                </div>
            </div>

            <div style={{ padding: '6px 14px', borderBottom: '1px solid rgba(112,136,160,0.2)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', color: '#9ab1ca' }}>
                <span style={{ padding: '3px 8px', borderRadius: '999px', border: '1px solid rgba(113,150,186,0.35)', background: 'rgba(15,24,35,0.65)' }}>
                    Nodes {renderedNodes}/{fullNodes}
                </span>
                <span style={{ padding: '3px 8px', borderRadius: '999px', border: '1px solid rgba(113,150,186,0.35)', background: 'rgba(15,24,35,0.65)' }}>
                    Edges {renderedEdges}/{fullEdges}
                </span>
                {isPruned && (
                    <span style={{ padding: '3px 8px', borderRadius: '999px', border: '1px solid rgba(229,173,92,0.45)', background: 'rgba(65,44,12,0.35)', color: '#ffd089' }}>
                        Large Repo Mode Active
                    </span>
                )}
                <span>Render Budget</span>
                <select
                    value={renderNodeBudget}
                    className="view-mode-select"
                    style={{ width: '92px', minWidth: '92px', padding: '4px 6px', fontSize: '11px' }}
                    onChange={(e) => setRenderNodeBudget(parseInt(e.target.value, 10))}
                >
                    <option value={300}>300</option>
                    <option value={600}>600</option>
                    <option value={900}>900</option>
                    <option value={1200}>1200</option>
                </select>
                <button
                    className="view-btn"
                    style={{ padding: '4px 10px' }}
                    onClick={() => {
                        setGraphLoadError(null);
                        window.vscode?.postMessage({ command: 'getGraph' });
                    }}
                >
                    Reload Graph
                </button>
                {graphLoadError && (
                    <span style={{ color: '#ffb1b1' }}>{graphLoadError}</span>
                )}
            </div>






            <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                    {isOverviewOverlayOpen && (
                        <div
                            style={{
                                position: 'absolute',
                                top: '14px',
                                left: '14px',
                                zIndex: 30,
                                width: '340px',
                                maxHeight: 'calc(100% - 28px)',
                                overflowY: 'auto',
                                background: 'rgba(10, 16, 24, 0.92)',
                                border: '1px solid rgba(126, 158, 194, 0.35)',
                                borderRadius: '12px',
                                padding: '12px'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                <div style={{ color: '#dbe8f6', fontWeight: 700, fontSize: '13px' }}>Mission Overlay</div>
                                <button
                                    className="close-panel-btn"
                                    onClick={() => setIsOverviewOverlayOpen(false)}
                                    title="Close Overlay"
                                >
                                    ✕
                                </button>
                            </div>

                            <div style={{ color: '#a8bfd8', fontSize: '11px', marginBottom: '8px' }}>
                                {dashboardOverview?.projectName || 'Workspace'}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
                                <div style={{ background: 'rgba(16,25,36,0.7)', border: '1px solid rgba(100,133,167,0.3)', borderRadius: '8px', padding: '8px' }}>
                                    <div style={{ color: '#dce9f8', fontSize: '16px', fontWeight: 700 }}>{dashboardOverview?.totalFiles || 0}</div>
                                    <div style={{ color: '#8ea4bf', fontSize: '10px' }}>Files</div>
                                </div>
                                <div style={{ background: 'rgba(16,25,36,0.7)', border: '1px solid rgba(100,133,167,0.3)', borderRadius: '8px', padding: '8px' }}>
                                    <div style={{ color: '#dce9f8', fontSize: '16px', fontWeight: 700 }}>{(dashboardOverview?.totalLines || 0).toLocaleString()}</div>
                                    <div style={{ color: '#8ea4bf', fontSize: '10px' }}>Lines</div>
                                </div>
                                <div style={{ background: 'rgba(16,25,36,0.7)', border: '1px solid rgba(100,133,167,0.3)', borderRadius: '8px', padding: '8px' }}>
                                    <div style={{ color: '#fbbf24', fontSize: '16px', fontWeight: 700 }}>{dashboardOverview?.criticalRisk || 0}</div>
                                    <div style={{ color: '#8ea4bf', fontSize: '10px' }}>Critical Risk</div>
                                </div>
                                <div style={{ background: 'rgba(16,25,36,0.7)', border: '1px solid rgba(100,133,167,0.3)', borderRadius: '8px', padding: '8px' }}>
                                    <div style={{ color: '#fb7185', fontSize: '16px', fontWeight: 700 }}>{dashboardOverview?.highRisk || 0}</div>
                                    <div style={{ color: '#8ea4bf', fontSize: '10px' }}>High Risk</div>
                                </div>
                                <div style={{ background: 'rgba(16,25,36,0.7)', border: '1px solid rgba(100,133,167,0.3)', borderRadius: '8px', padding: '8px' }}>
                                    <div style={{ color: '#4ade80', fontSize: '16px', fontWeight: 700 }}>{dashboardOverview?.hotFiles || 0}</div>
                                    <div style={{ color: '#8ea4bf', fontSize: '10px' }}>Hot Files</div>
                                </div>
                                <div style={{ background: 'rgba(16,25,36,0.7)', border: '1px solid rgba(100,133,167,0.3)', borderRadius: '8px', padding: '8px' }}>
                                    <div style={{ color: '#60a5fa', fontSize: '16px', fontWeight: 700 }}>{dashboardOverview?.strongCouplingPairs || 0}</div>
                                    <div style={{ color: '#8ea4bf', fontSize: '10px' }}>Strong Pairs</div>
                                </div>
                            </div>

                            <div style={{ marginTop: '10px', color: '#8ea4bf', fontSize: '10px' }}>
                                Primary language: {dashboardOverview?.primaryLanguage || 'Unknown'}
                            </div>
                            {Array.isArray(dashboardOverview?.frameworks) && dashboardOverview.frameworks.length > 0 && (
                                <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                    {dashboardOverview.frameworks.map((fw: string, idx: number) => (
                                        <span key={`${fw}-${idx}`} style={{ fontSize: '10px', color: '#b9d3ee', border: '1px solid rgba(112,146,181,0.35)', borderRadius: '999px', padding: '2px 7px', background: 'rgba(22,34,48,0.75)' }}>
                                            {fw}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

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

                    {graphViewMode !== 'overall' && (
                        <div
                            style={{
                                position: 'absolute',
                                top: '14px',
                                right: '14px',
                                background: 'rgba(11, 16, 24, 0.88)',
                                border: '1px solid rgba(126, 158, 194, 0.35)',
                                borderRadius: '10px',
                                padding: '10px 12px',
                                color: '#c9d7e7',
                                fontSize: '11px',
                                zIndex: 25,
                                minWidth: '170px'
                            }}
                        >
                            <div style={{ fontWeight: 700, marginBottom: '8px', color: '#dbe8f6' }}>Depth Legend</div>
                            {DEPTH_COLOR_LEGEND.map(item => (
                                <div key={item.depth} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: item.color, border: '1px solid rgba(255,255,255,0.2)' }} />
                                    <span>Depth {item.depth}</span>
                                </div>
                            ))}
                            <div style={{ marginTop: '6px', fontSize: '10px', color: '#8ea4bf' }}>
                                Sequence view is static-path inferred from call graph, not runtime trace.
                            </div>
                        </div>
                    )}
                </div>

                {isChatPanelOpen && (
                    <div
                        title="Resize Insights Panel"
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderBottom: '1px solid rgba(113,150,186,0.25)' }}>
                        <button
                            className={`view-btn ${rightPanelTab === 'summary' ? 'active' : ''}`}
                            style={{ padding: '5px 9px' }}
                            onClick={() => setRightPanelTab('summary')}
                        >
                            Summary
                        </button>
                        <button
                            className={`view-btn ${rightPanelTab === 'chat' ? 'active' : ''}`}
                            style={{ padding: '5px 9px' }}
                            onClick={() => setRightPanelTab('chat')}
                        >
                            Chat
                        </button>
                        <button
                            className="close-panel-btn"
                            style={{ marginLeft: 'auto' }}
                            title="Close Insights Panel"
                            onClick={() => {
                                setRightSidebarWidth(0);
                                setIsChatPanelOpen(false);
                            }}
                        >
                            ✕
                        </button>
                    </div>

                    <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        {rightPanelTab === 'summary' ? (
                            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                                <SummaryPanel markdown={graphData ? graphData.report : ''} />
                            </div>
                        ) : (
                            <ChatPanel
                                node={chatNode || { id: 'global', label: 'Architecture Chat', file: '' }}
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

                                    const effectiveNode = chatNode || { id: 'global', isMulti: false, nodes: [] };
                                    window.vscode.postMessage({
                                        command: (!chatNode || effectiveNode.isMulti) ? 'askMultipleFunctionsChat' : 'askFunctionChat',
                                        nodeId: effectiveNode.id || 'global',
                                        query: msg,
                                        history: updatedHistory,
                                        nodes: effectiveNode.nodes || []
                                    });
                                }}
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default App;