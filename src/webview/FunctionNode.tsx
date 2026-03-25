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
    isExpanded?: boolean;
    onExpand?: (nodeId: string) => void;
    onClick?: (file: string, line: number) => void;
    onExplain?: (nodeId: string, label: string, file: string) => void;
    metadata?: any;
}


export const FunctionNode: React.FC<{ data: FunctionNodeData, id: string; selected?: boolean; targetPosition?: Position; sourcePosition?: Position }> = ({ 
    data, 
    id, 
    selected,
    sourcePosition = Position.Bottom, 
    targetPosition = Position.Top 
}) => {
    
    // Neon-tinted depth palette: smooth, minimal, architectural
    const getDepthColor = (depth: number) => {
        const file = String(data.file || '').toLowerCase();
        // Classify by architectural lane for consistent visual identity
        if (file.includes('webview') || file.includes('panel/') || file.includes('view') || 
            file.endsWith('.tsx') || file.endsWith('.jsx') || file.includes('ui.') || file.includes('render')) {
            // View / UI — Electric Blue
            return { bg: 'rgba(56, 189, 248, 0.12)', border: '#38bdf8', text: '#e0f2fe', glow: 'rgba(56, 189, 248, 0.18)' };
        }
        if (file.includes('util') || file.includes('helper') || file.includes('config') ||
            file.includes('mock') || file.includes('db') || file.includes('service') || file.includes('adapter')) {
            // Utility / I-O — Neon Emerald
            return { bg: 'rgba(52, 211, 153, 0.12)', border: '#34d399', text: '#d1fae5', glow: 'rgba(52, 211, 153, 0.18)' };
        }
        // Controller / Logic — Soft Violet
        return { bg: 'rgba(167, 139, 250, 0.12)', border: '#a78bfa', text: '#ede9fe', glow: 'rgba(167, 139, 250, 0.18)' };
    };

    const colors = getDepthColor(data.depth || 1);

    return (
        <div 
            className={`function-node ${selected ? 'selected' : ''}`} 
            style={{ 
                backgroundColor: colors.bg, 
                borderColor: colors.border,
                color: colors.text,
                boxShadow: `0 4px 10px rgba(5, 9, 14, 0.25), inset 0 0 0 1px ${colors.glow}`
            }}
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
