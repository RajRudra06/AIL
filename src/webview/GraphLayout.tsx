import React, { useMemo } from 'react';
import {
    ReactFlow,
    Background,
    BackgroundVariant,
    Controls,
    MiniMap,
    ConnectionLineType,
    Node,
    Edge
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { FunctionNode } from './FunctionNode';

interface GraphLayoutProps {
    nodes: Node[];
    edges: Edge[];
    onNodeClick?: (event: React.MouseEvent, node: Node) => void;
}

const nodeTypes = {
    customFunction: FunctionNode
};

export const GraphLayout: React.FC<GraphLayoutProps> = ({ nodes, edges, onNodeClick }) => {
    
    // Default edge configurations
    const defaultEdgeOptions = {
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#569cd6', strokeWidth: 1.5, opacity: 0.6 },
    };

    return (
        <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodeClick={onNodeClick}
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
                <Controls showInteractive={false} />
            </ReactFlow>
        </div>
    );
};
