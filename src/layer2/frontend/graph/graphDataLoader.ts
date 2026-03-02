export interface GraphNode {
    id:           string;
    type:         'function' | 'class' | 'file' | 'global_variable';
    name:         string;
    file?:        string;
    line_start?:  number;
    line_end?:    number;
    parameters?:  string[];
    complexity?:  number;
    loc?:         number;
    is_async?:    boolean;
    parent_class?: string | null;
    methods?:     string[];
    inherits?:    string[];
    language?:    string;
    path?:        string;
    value?:       string;
}

export interface GraphEdge {
    from:        string;
    to:          string;
    type:        'calls' | 'imports' | 'inherits';
    call_count:  number;
}

export interface Graph {
    nodes: GraphNode[];
    edges: GraphEdge[];
}

export interface AllGraphs {
    function_call_graph:    Graph;
    import_graph:           Graph;
    class_hierarchy_graph:  Graph;
    full_graph:             Graph;
}

export interface Metadata {
    summary: {
        total_nodes:     number;
        total_edges:     number;
        total_files:     number;
        total_functions: number;
        total_classes:   number;
        total_variables: number;
        languages:       Record<string, number>;
    };
    edge_breakdown: {
        calls:    number;
        imports:  number;
        inherits: number;
    };
    insights: {
        top_called_functions: {
            id:         string;
            name:       string;
            file:       string;
            call_count: number;
        }[];
        orphan_functions: {
            id:   string;
            name: string;
            file: string;
        }[];
        orphan_count:         number;
        circular_dependencies: string[][];
        circular_dep_count:   number;
        complexity: {
            avg_complexity:  number;
            max_complexity:  number;
            high_complexity_functions: {
                id:         string;
                name:       string;
                file:       string;
                complexity: number;
            }[];
        };
    };
}

export type GraphView = 'function_call_graph' | 'import_graph' | 'class_hierarchy_graph' | 'full_graph';

export function getGraphForView(graphs: AllGraphs, view: GraphView): Graph {
    return graphs[view] || { nodes: [], edges: [] };
}

export function getNodeColor(node: GraphNode): string {
    switch (node.type) {
        case 'function':        return '#4A9EFF';  // blue
        case 'class':           return '#FF6B6B';  // red
        case 'file':            return '#51CF66';  // green
        case 'global_variable': return '#FFD43B';  // yellow
        default:                return '#ADB5BD';  // grey
    }
}

export function getNodeSize(node: GraphNode): number {
    // bigger = more important
    if (node.type === 'file')     return 20;
    if (node.type === 'class')    return 16;
    if (node.type === 'function') return 10 + Math.min((node.loc || 0) / 10, 10);
    return 8;
}

export function getEdgeWidth(edge: GraphEdge): number {
    // thicker = called more times
    return Math.min(1 + (edge.call_count || 1) * 0.5, 5);
}

export function getComplexityColor(complexity: number): string {
    if (complexity >= 10) return '#FF0000';  // red — very high
    if (complexity >= 7)  return '#FF6B6B';  // orange-red — high
    if (complexity >= 5)  return '#FFD43B';  // yellow — medium
    if (complexity >= 3)  return '#74C0FC';  // light blue — low
    return '#51CF66';                         // green — very low
}