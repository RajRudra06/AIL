import json
import os
from collections import Counter
from cp1_setup import SetupResult
import datetime


def write_json(path: str, data) -> None:
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"AIL CP8 | Saved → {os.path.basename(path)}")


def get_top_called_functions(edges: list[dict], nodes: list[dict], top_n: int = 10) -> list[dict]:
    call_counts: Counter = Counter()

    for edge in edges:
        if edge['type'] == 'calls':
            call_counts[edge['to']] += edge.get('call_count', 1)

    id_to_name = {n['id']: n['name'] for n in nodes}
    id_to_file = {n['id']: n.get('file', '') for n in nodes}

    top = []
    for node_id, count in call_counts.most_common(top_n):
        top.append({
            "id":         node_id,
            "name":       id_to_name.get(node_id, node_id),
            "file":       id_to_file.get(node_id, ''),
            "call_count": count
        })
    return top


def get_orphan_functions(edges: list[dict], nodes: list[dict]) -> list[dict]:
    called_ids = set()
    for edge in edges:
        if edge['type'] == 'calls':
            called_ids.add(edge['to'])

    orphans = []
    for node in nodes:
        if node['type'] == 'function' and node['id'] not in called_ids:
            name = node['name'].lower()
            if any(skip in name for skip in ['__init__', '__main__', 'main', 'test_', 'setup']):
                continue
            orphans.append({
                "id":   node['id'],
                "name": node['name'],
                "file": node.get('file', '')
            })
    return orphans


def detect_circular_dependencies(edges: list[dict]) -> list[list[str]]:
    # build adjacency list from import edges only
    graph: dict[str, list] = {}
    for edge in edges:
        if edge['type'] == 'imports':
            graph.setdefault(edge['from'], []).append(edge['to'])

    cycles    = []
    visited   = set()
    rec_stack = set()

    def dfs(node, path):
        visited.add(node)
        rec_stack.add(node)
        path.append(node)

        for neighbor in graph.get(node, []):
            if neighbor not in visited:
                dfs(neighbor, path)
            elif neighbor in rec_stack:
                cycle_start = path.index(neighbor)
                cycles.append(path[cycle_start:].copy())

        path.pop()
        rec_stack.discard(node)

    for node in list(graph.keys()):
        if node not in visited:
            dfs(node, [])

    return cycles


def get_complexity_stats(nodes: list[dict]) -> dict:
    complexities = [
        n['complexity']
        for n in nodes
        if n['type'] == 'function' and 'complexity' in n
    ]

    if not complexities:
        return {}

    high_complexity = [
        {
            "id":         n['id'],
            "name":       n['name'],
            "file":       n.get('file', ''),
            "complexity": n['complexity']
        }
        for n in nodes
        if n['type'] == 'function' and n.get('complexity', 0) >= 5
    ]
    high_complexity.sort(key=lambda x: x['complexity'], reverse=True)

    return {
        "avg_complexity":            round(sum(complexities) / len(complexities), 2),
        "max_complexity":            max(complexities),
        "min_complexity":            min(complexities),
        "high_complexity_functions": high_complexity[:10]
    }


def run_checkpoint8(
    nodes: list[dict],
    edges: list[dict],
    setup: SetupResult
) -> dict:
    print(f"AIL CP8 | Assembling meta-data.json...")

    node_type_counts = Counter(n['type'] for n in nodes)
    edge_type_counts = Counter(e['type'] for e in edges)
    language_counts  = Counter(
        n.get('language', 'unknown')
        for n in nodes
        if n['type'] == 'file'
    )

    top_called       = get_top_called_functions(edges, nodes)
    orphans          = get_orphan_functions(edges, nodes)
    circular_deps    = detect_circular_dependencies(edges)
    complexity_stats = get_complexity_stats(nodes)

    metadata = {
        "version":   "1.0.0",
        "timestamp": datetime.datetime.now().isoformat(),
        "workspace": setup.workspace_path,
        "summary": {
            "total_nodes":     len(nodes),
            "total_edges":     len(edges),
            "total_files":     node_type_counts.get('file', 0),
            "total_functions": node_type_counts.get('function', 0),
            "total_classes":   node_type_counts.get('class', 0),
            "total_variables": node_type_counts.get('global_variable', 0),
            "languages":       dict(language_counts)
        },
        "edge_breakdown": {
            "calls":    edge_type_counts.get('calls', 0),
            "imports":  edge_type_counts.get('imports', 0),
            "inherits": edge_type_counts.get('inherits', 0)
        },
        "insights": {
            "top_called_functions":  top_called,
            "orphan_functions":      orphans,
            "orphan_count":          len(orphans),
            "circular_dependencies": circular_deps,
            "circular_dep_count":    len(circular_deps),
            "complexity":            complexity_stats
        },
        "graphs": {
            "function_call_graph":   ".ail/layer2/graphs/function_call_graph.json",
            "import_graph":          ".ail/layer2/graphs/import_graph.json",
            "class_hierarchy_graph": ".ail/layer2/graphs/class_hierarchy_graph.json",
            "full_graph":            ".ail/layer2/graphs/full_graph.json"
        }
    }

    output_path = os.path.join(setup.ail_layer2_dir, 'meta-data.json')
    write_json(output_path, metadata)

    print(f"AIL CP8 | Meta-data complete:")
    print(f"         Total nodes:     {len(nodes)}")
    print(f"         Total edges:     {len(edges)}")
    print(f"         Orphan funcs:    {len(orphans)}")
    print(f"         Circular deps:   {len(circular_deps)}")
    print(f"         High complexity: {len(complexity_stats.get('high_complexity_functions', []))}")

    return metadata
