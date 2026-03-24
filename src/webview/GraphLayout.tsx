import React, { useMemo } from 'react';
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
        // Moving viewport by (+dx, +dy) logically shifts the viewport right/down, meaning the graph moves left/up on the screen.
        // We invert dx/dy to intuitively move the graph.
        setViewport({ x: x + dx, y: y + dy, zoom }, { duration: 300 });
    };

    return (
        <>
            {/* Zoom Controls (Bottom Left) */}
            <Panel position="bottom-left" className="control-panel d-pad-panel" style={{ display: 'flex', flexDirection: 'column', gap: '5px', justifyContent: 'center', marginLeft: '20px', marginBottom: '20px' }}>
                <button onClick={() => zoomIn({ duration: 300 })} className="control-btn" title="Zoom In">+</button>
                <button onClick={() => zoomOut({ duration: 300 })} className="control-btn" title="Zoom Out">-</button>
            </Panel>

            {/* Pan Controls (D-Pad, Bottom Right) */}
            <Panel position="bottom-right" className="control-panel d-pad-panel" style={{ display: 'flex', flexDirection: 'column', gap: '5px', alignItems: 'center', marginRight: '20px', marginBottom: '20px' }}>
                <button onClick={() => pan(0, 150)} className="control-btn" title="Pan Graph Down">▲</button>
                <div style={{ display: 'flex', gap: '5px' }}>
                    <button onClick={() => pan(150, 0)} className="control-btn" title="Pan Graph Right">◀</button>
                    <button onClick={() => fitView({ duration: 400, padding: 0.2 })} className="control-btn center-btn" title="Center Full Graph">●</button>
                    <button onClick={() => pan(-150, 0)} className="control-btn" title="Pan Graph Left">▶</button>
                </div>
                <button onClick={() => pan(0, -150)} className="control-btn" title="Pan Graph Up">▼</button>
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
}

const nodeTypes = {
    customFunction: FunctionNode
};

export const GraphLayout: React.FC<GraphLayoutProps> = ({ nodes, edges, onNodeClick, onNodesChange, onEdgesChange }) => {
    
    // Default edge configurations
    const defaultEdgeOptions = {
        type: 'smoothstep',
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
                    connectionLineType={ConnectionLineType.SmoothStep}
                    defaultEdgeOptions={defaultEdgeOptions}

                    fitView
                    fitViewOptions={{ padding: 0.2 }}
                    minZoom={0.1}
                    maxZoom={2}
                    nodesDraggable={false} // Lock to algorithmic layout
                    nodesConnectable={false}
                    elementsSelectable={true}
                >
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
