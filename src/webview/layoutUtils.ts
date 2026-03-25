import { Node, Edge, Position } from '@xyflow/react';
import dagre from 'dagre';

const nodeWidth = 200;
const nodeHeight = 60;

// Classify a file path into an architectural layer
const classifyLane = (filePath: string): string => {
  const f = filePath.toLowerCase();
  // View / UI Layer
  if (f.includes('webview') || f.includes('panel/') || f.includes('view') ||
      f.endsWith('.tsx') || f.endsWith('.jsx') || f.includes('ui.') ||
      f.includes('html') || f.includes('component') || f.includes('render')) {
    return 'lane_ui';
  }
  // Utility / Data / I-O Layer
  if (f.includes('util') || f.includes('helper') || f.includes('config') ||
      f.includes('mock') || f.includes('db') || f.includes('fs') ||
      f.includes('.json') || f.includes('adapter') || f.includes('service')) {
    return 'lane_util';
  }
  // Default: Controller / Business Logic Layer
  return 'lane_logic';
};

export const getLayoutedElements = (
  nodes: Node[], edges: Edge[],
  direction: 'TB' | 'LR' = 'TB',
  useSwimlanes: boolean = false
) => {
  // Force horizontal flow when swimlanes are active (View → Logic → Util, L→R)
  const effectiveDirection = useSwimlanes ? 'LR' : direction;

  const dagreGraph = new dagre.graphlib.Graph({ compound: useSwimlanes, directed: true });
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: effectiveDirection,
    nodesep: useSwimlanes ? 30 : 60,
    ranksep: useSwimlanes ? 200 : 120,
  });

  if (useSwimlanes) {
    dagreGraph.setNode('lane_ui', { label: 'View / UI Layer' });
    dagreGraph.setNode('lane_logic', { label: 'Controller / Business Logic' });
    dagreGraph.setNode('lane_util', { label: 'Utility / Data / I-O' });
  }

  // Strip pre-existing group/lane nodes before recalculating
  const functionNodes = nodes.filter(n => n.type !== 'group');

  functionNodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
    if (useSwimlanes) {
      const lane = classifyLane(String(node.data?.file || ''));
      dagreGraph.setParent(node.id, lane);
    }
  });

  edges.forEach((edge) => {
    if (dagreGraph.hasNode(edge.source) && dagreGraph.hasNode(edge.target)) {
      dagreGraph.setEdge(edge.source, edge.target);
    }
  });

  dagre.layout(dagreGraph);

  // Map nodes to absolute positions (no React-Flow parent nesting)
  const layoutedNodes: Node[] = functionNodes.map((node) => {
    const pos = dagreGraph.node(node.id);
    return {
      ...node,
      parentNode: undefined,
      extent: undefined,
      targetPosition: effectiveDirection === 'TB' ? Position.Top : Position.Left,
      sourcePosition: effectiveDirection === 'TB' ? Position.Bottom : Position.Right,
      position: { x: pos.x - nodeWidth / 2, y: pos.y - nodeHeight / 2 },
    };
  });

  // Render three horizontal bounding boxes acting as architectural swimlanes
  if (useSwimlanes) {
    const laneSpecs = [
      { id: 'lane_ui',    rgba: 'rgba(59, 130, 246, 0.06)', stroke: '#3b82f6', label: '🖥 View / UI Layer' },
      { id: 'lane_logic', rgba: 'rgba(139, 92, 246, 0.06)', stroke: '#8b5cf6', label: '⚙ Controller / Business Logic' },
      { id: 'lane_util',  rgba: 'rgba(16, 185, 129, 0.06)', stroke: '#10b981', label: '🗄 Utility / Data / I-O' }
    ];

    laneSpecs.forEach((spec) => {
      const p = dagreGraph.node(spec.id);
      if (p && p.width && p.height) {
        const pad = 30;
        layoutedNodes.push({
          id: spec.id,
          type: 'group',
          position: { x: p.x - p.width / 2 - pad, y: p.y - p.height / 2 - pad - 28 },
          style: {
            width: p.width + pad * 2,
            height: p.height + pad * 2 + 28,
            backgroundColor: spec.rgba,
            borderColor: spec.stroke,
            borderStyle: 'dashed',
            borderWidth: 2,
            borderRadius: '14px',
            zIndex: -1,
            pointerEvents: 'none' as any,
          },
          data: { label: spec.label },
          draggable: false,
          selectable: false,
        } as unknown as Node);
      }
    });
  }

  return { nodes: layoutedNodes, edges };
};
