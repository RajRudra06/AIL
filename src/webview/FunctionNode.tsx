import React from 'react';
import { Handle, Position } from '@xyflow/react';
import './FunctionNode.css';

export interface FunctionNodeData {
    label: string;
    nodeType?: string;
    file: string;
    startLine: number;
    endLine: number;
    depth: number;
    hasChildren?: boolean;
    canExpand?: boolean;
    isExpanded?: boolean;
    onExpand?: (nodeId: string) => void;
    onClick?: (file: string, line: number) => void;
    onExplain?: (nodeId: string, label: string, file: string) => void;
    metadata?: any;
    viewMode?: 'function' | 'directory' | 'sequence' | 'overall';
    searchHit?: boolean;
    searchActive?: boolean;
}


export const FunctionNode: React.FC<{ data: FunctionNodeData, id: string; selected?: boolean; targetPosition?: Position; sourcePosition?: Position }> = ({ 
    data, 
    id, 
    selected,
    sourcePosition = Position.Bottom, 
    targetPosition = Position.Top 
}) => {

    // Depth-based palette to make graph traversal levels visually obvious.
    const getDepthColor = (depth: number) => {
        const palette = [
            { bg: 'rgba(94, 200, 255, 0.14)', border: '#5ec8ff', text: '#e6f8ff', glow: 'rgba(94, 200, 255, 0.2)' },
            { bg: 'rgba(98, 224, 193, 0.14)', border: '#62e0c1', text: '#e9fff8', glow: 'rgba(98, 224, 193, 0.2)' },
            { bg: 'rgba(179, 140, 255, 0.14)', border: '#b38cff', text: '#f2ebff', glow: 'rgba(179, 140, 255, 0.2)' },
            { bg: 'rgba(255, 198, 109, 0.14)', border: '#ffc66d', text: '#fff5e4', glow: 'rgba(255, 198, 109, 0.2)' },
            { bg: 'rgba(255, 159, 95, 0.14)', border: '#ff9f5f', text: '#fff0e5', glow: 'rgba(255, 159, 95, 0.2)' },
            { bg: 'rgba(255, 112, 112, 0.14)', border: '#ff7070', text: '#ffeaea', glow: 'rgba(255, 112, 112, 0.2)' },
        ];

        const normalizedDepth = Math.max(1, Math.min(depth || 1, palette.length));
        return palette[normalizedDepth - 1];
    };

    const colors = getDepthColor(data.depth || 1);
    const viewAccent = data.viewMode === 'sequence'
        ? 'rgba(248, 179, 103, 0.26)'
        : data.viewMode === 'directory'
            ? 'rgba(122, 182, 255, 0.24)'
            : 'rgba(99, 210, 255, 0.24)';

    return (
        <div 
            className={`function-node ${selected ? 'selected' : ''} ${data.searchHit ? 'search-hit' : ''} ${data.searchActive ? 'search-active' : ''}`} 
            style={{ 
                backgroundColor: colors.bg, 
                borderColor: colors.border,
                color: colors.text,
                boxShadow: `0 4px 10px rgba(5, 9, 14, 0.25), inset 0 0 0 1px ${colors.glow}, 0 0 0 1px ${viewAccent}`
            }}
        >

            <Handle type="target" position={targetPosition} className="node-handle" />
            
            <div className="node-content">
                <span className="node-label" title={data.label}>{data.label}</span>
            </div>

            {data.hasChildren && data.canExpand !== false && (
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
                {data.nodeType === 'file' ? (
                    <>
                        <div className="tooltip-row"><strong>Entities:</strong> <span>{data.metadata?.entityCount || 0}</span></div>
                        <div className="tooltip-row"><strong>Avg Complexity:</strong> <span>{Math.round(data.metadata?.complexity || 0)}</span></div>
                    </>
                ) : (
                    <>
                        <div className="tooltip-row"><strong>Lines:</strong> <span>{data.startLine} - {data.endLine}</span></div>
                        <div className="tooltip-row"><strong>Length:</strong> <span>{data.endLine > 0 ? (data.endLine - data.startLine + 1) : 0} lines</span></div>
                    </>
                )}
            </div>
        </div>
    );
};
