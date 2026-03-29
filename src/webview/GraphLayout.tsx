import React, { useEffect, useMemo, useRef } from 'react';
import {
    ReactFlow,
    Background,
    BackgroundVariant,
    ConnectionLineType,
    Node,
    Edge,
    Panel,
    useReactFlow,
    ReactFlowProvider
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { FunctionNode } from './FunctionNode';

// --- Custom controls replacing default --- //
const CustomControls = () => {
    const { zoomIn, zoomOut, fitView, setViewport, getViewport } = useReactFlow();

    const pan = (dx: number, dy: number) => {
        const { x, y, zoom } = getViewport();
        setViewport({ x: x + dx, y: y + dy, zoom }, { duration: 300 });
    };

    // Keyboard shortcuts: R to recenter, +/- to zoom, arrow keys to pan
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;

            switch (e.key.toLowerCase()) {
                case 'r':
                    fitView({ duration: 500, padding: 0.15 });
                    break;
                case '=':
                case '+':
                    zoomIn({ duration: 250 });
                    break;
                case '-':
                    zoomOut({ duration: 250 });
                    break;
                case 'arrowup':
                    e.preventDefault();
                    pan(0, 120);
                    break;
                case 'arrowdown':
                    e.preventDefault();
                    pan(0, -120);
                    break;
                case 'arrowleft':
                    e.preventDefault();
                    pan(120, 0);
                    break;
                case 'arrowright':
                    e.preventDefault();
                    pan(-120, 0);
                    break;
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [fitView, zoomIn, zoomOut, getViewport, setViewport]);

    return (
        <>
            {/* Zoom Controls (Bottom Left) */}
            <Panel position="bottom-left" className="control-panel d-pad-panel" style={{ display: 'flex', flexDirection: 'column', gap: '5px', justifyContent: 'center', marginLeft: '20px', marginBottom: '20px' }}>
                <button onClick={() => zoomIn({ duration: 300 })} className="control-btn" title="Zoom In (+)">+</button>
                <button onClick={() => zoomOut({ duration: 300 })} className="control-btn" title="Zoom Out (-)">-</button>
            </Panel>

            {/* Pan Controls (D-Pad, Bottom Right) */}
            <Panel position="bottom-right" className="control-panel d-pad-panel" style={{ display: 'flex', flexDirection: 'column', gap: '5px', alignItems: 'center', marginRight: '20px', marginBottom: '20px' }}>
                <button onClick={() => pan(0, 150)} className="control-btn" title="Pan Up (↑)">▲</button>
                <div style={{ display: 'flex', gap: '5px' }}>
                    <button onClick={() => pan(150, 0)} className="control-btn" title="Pan Left (←)">◀</button>
                    <button onClick={() => fitView({ duration: 500, padding: 0.15 })} className="control-btn center-btn" title="Recenter (R)">●</button>
                    <button onClick={() => pan(-150, 0)} className="control-btn" title="Pan Right (→)">▶</button>
                </div>
                <button onClick={() => pan(0, -150)} className="control-btn" title="Pan Down (↓)">▼</button>
            </Panel>
        </>
    );
};

interface GraphLayoutProps {
    nodes: Node[];
    edges: Edge[];
    onNodeClick?: (event: React.MouseEvent, node: Node) => void;
    onNodesChange?: (changes: any[]) => void;
    onEdgesChange?: (changes: any[]) => void;
    focusNodeId?: string;
    focusToken?: number;
}

const nodeTypes = {
    customFunction: FunctionNode
};

const AutoFit: React.FC<{ nodeCount: number }> = ({ nodeCount }) => {
    const { fitView } = useReactFlow();
    const prevNodeCount = useRef(0);

    useEffect(() => {
        if (nodeCount <= 0) {
            prevNodeCount.current = 0;
            return;
        }
        // Auto-fit on first load AND when node count changes significantly (mode switch)
        const delta = Math.abs(nodeCount - prevNodeCount.current);
        const isSignificantChange = prevNodeCount.current === 0 || delta > 5;
        if (!isSignificantChange) return;

        const timer = window.setTimeout(() => {
            fitView({ duration: 420, padding: 0.15 });
            prevNodeCount.current = nodeCount;
        }, 60);
        return () => window.clearTimeout(timer);
    }, [nodeCount, fitView]);

    return null;
};

const AutoFocusNode: React.FC<{ focusNodeId?: string; focusToken?: number }> = ({ focusNodeId, focusToken }) => {
    const { getNode, setCenter, fitView } = useReactFlow();

    useEffect(() => {
        if (!focusNodeId) {
            return;
        }
        let cancelled = false;
        let attempts = 0;

        const tryFocus = () => {
            if (cancelled) {
                return;
            }
            const node = getNode(focusNodeId);
            if (node) {
                const x = node.position.x + ((node.width || 180) / 2);
                const y = node.position.y + ((node.height || 64) / 2);
                setCenter(x, y, { duration: 340, zoom: 1.14 });
                return;
            }

            attempts += 1;
            if (attempts <= 6) {
                window.setTimeout(tryFocus, 70);
                return;
            }

            // Fallback to fitView when exact node positioning is not yet available.
            fitView({ duration: 280, padding: 0.2 });
        };

        tryFocus();
        return () => {
            cancelled = true;
        };
    }, [focusNodeId, focusToken, getNode, setCenter, fitView]);

    return null;
};

export const GraphLayout: React.FC<GraphLayoutProps> = ({ nodes, edges, onNodeClick, onNodesChange, onEdgesChange, focusNodeId, focusToken }) => {
    
    const defaultEdgeOptions = {
        type: 'default',
        animated: false,
        style: { stroke: '#569cd6', strokeWidth: 1.5, opacity: 0.6 },
    };

    return (
        <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
            <ReactFlowProvider>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    onNodeClick={onNodeClick}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    connectionLineType={ConnectionLineType.Bezier}
                    defaultEdgeOptions={defaultEdgeOptions}

                    minZoom={0.05}
                    maxZoom={4}
                    nodesDraggable={true}
                    nodesConnectable={false}

                >
                    <AutoFit nodeCount={nodes.length} />
                    <AutoFocusNode focusNodeId={focusNodeId} focusToken={focusToken} />

                    <Background 
                        variant={BackgroundVariant.Dots} 
                        gap={15} 
                        size={1.5} 
                        color="#444444" 
                    />
                    <CustomControls />
                </ReactFlow>
            </ReactFlowProvider>
        </div>
    );
};
