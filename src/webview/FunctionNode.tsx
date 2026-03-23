import React from 'react';
import { Handle, Position } from '@xyflow/react';
import './FunctionNode.css';

export interface FunctionNodeData {
    label: string;
    file: string;
    startLine: number;
    endLine: number;
    depth: number;
    hasChildren?: boolean;
    isExpanded?: boolean;
    onExpand?: (nodeId: string) => void;
    onClick?: (file: string, line: number) => void;
    onExplain?: (nodeId: string, label: string, file: string) => void;
}


export const FunctionNode: React.FC<{ data: FunctionNodeData, id: string; targetPosition?: Position; sourcePosition?: Position }> = ({ 
    data, 
    id, 
    sourcePosition = Position.Bottom, 
    targetPosition = Position.Top 
}) => {
    
    // Depth-based neon/glassmorphism colors
    const getDepthColor = (depth: number) => {
        const colors = [
            { bg: 'rgba(0, 229, 255, 0.15)', border: '#00e5ff', text: '#ffffff', glow: 'rgba(0, 229, 255, 0.4)' }, // Depth 1: Cyan/Neon Blue
            { bg: 'rgba(189, 0, 255, 0.15)', border: '#bd00ff', text: '#ffffff', glow: 'rgba(189, 0, 255, 0.4)' }, // Depth 2: Purple/Magenta
            { bg: 'rgba(255, 0, 102, 0.15)', border: '#ff0066', text: '#ffffff', glow: 'rgba(255, 0, 102, 0.4)' }, // Depth 3: Pink/Red
            { bg: 'rgba(255, 171, 0, 0.15)', border: '#ffab00', text: '#ffffff', glow: 'rgba(255, 171, 0, 0.4)' },   // Depth 4: Amber/Gold
            { bg: 'rgba(0, 255, 136, 0.15)', border: '#00ff88', text: '#ffffff', glow: 'rgba(0, 255, 136, 0.4)' }, // Depth 5+: Neon Green
        ];
        return colors[Math.min(depth - 1, colors.length - 1)];
    };

    const colors = getDepthColor(data.depth || 1);

    return (
        <div 
            className="function-node" 
            style={{ 
                backgroundColor: colors.bg, 
                borderColor: colors.border,
                color: colors.text,
                boxShadow: `0 4px 12px ${colors.glow}, inset 0 0 8px ${colors.glow}`
            }}
            onClick={() => data.onClick && data.onClick(data.file, data.startLine)}
        >
            <Handle type="target" position={targetPosition} className="node-handle" />
            
            <div className="node-content">
                <span className="node-label" title={data.label}>{data.label}</span>
            </div>

            {data.hasChildren && (
                <button 
                    className={`expand-btn ${data.isExpanded ? 'expanded' : ''}`}
                    onClick={(e) => {
                        e.stopPropagation(); // prevent triggering the node click
                        if (data.onExpand) data.onExpand(id);
                    }}
                    title="Toggle Children"
                >
                    {data.isExpanded ? '▼' : '▶'}
                </button>
            )}

            <button 
                className="info-btn"
                onClick={(e) => {
                    e.stopPropagation();
                    console.log("Info button clicked for node:", id);
                    if (data.onExplain) {
                        data.onExplain(id, data.label, data.file);
                    } else {
                        console.error("onExplain handler not provided to node");
                    }
                }}
                title="want AIL to explain this func to u?"
            >
                i
            </button>



            <Handle type="source" position={sourcePosition} className="node-handle" />
            
            {/* Native CSS Tooltip for pure hover support without JS state */}
            <div className="node-tooltip">
                <div className="tooltip-row"><strong>File:</strong> <span>{data.file.split('/').pop()}</span></div>
                <div className="tooltip-row"><strong>Lines:</strong> <span>{data.startLine} - {data.endLine}</span></div>
                <div className="tooltip-row"><strong>Length:</strong> <span>{data.endLine - data.startLine} lines</span></div>
            </div>
        </div>
    );
};
