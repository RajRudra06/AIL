# cp7_graphs.py

import json
import os
from cp1_setup import SetupResult


def write_json(path: str, data) -> None:
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"AIL CP7 | Saved → {os.path.basename(path)}")


def load_json(path: str) -> list | dict:
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def build_function_call_graph(nodes: list[dict], edges: list[dict]) -> dict:
    # nodes: functions and methods only
    func_nodes = [n for n in nodes if n['type'] in ('function', 'method')]

    # edges: calls only
    call_edges = [e for e in edges if e['type'] == 'calls']

    # only keep nodes that appear in at least one edge
    # plus keep all function nodes for completeness
    return {
        "nodes": func_nodes,
        "edges": call_edges
    }


def build_import_graph(nodes: list[dict], edges: list[dict]) -> dict:
    # nodes: files only
    file_nodes = [n for n in nodes if n['type'] == 'file']

    # edges: imports only
    import_edges = [e for e in edges if e['type'] == 'imports']

    return {
        "nodes": file_nodes,
        "edges": import_edges
    }


def build_class_hierarchy_graph(nodes: list[dict], edges: list[dict]) -> dict:
    # nodes: classes only
    class_nodes = [n for n in nodes if n['type'] == 'class']

    # edges: inherits only
    inherits_edges = [e for e in edges if e['type'] == 'inherits']

    return {
        "nodes": class_nodes,
        "edges": inherits_edges
    }


def build_full_graph(nodes: list[dict], edges: list[dict]) -> dict:
    return {
        "nodes": nodes,
        "edges": edges
    }


def run_checkpoint7(
    nodes: list[dict],
    edges: list[dict],
    setup: SetupResult
) -> None:
    print(f"AIL CP7 | Building 4 graphs...")

    graphs_dir = setup.graphs_dir

    # graph 1 — function call graph
    func_graph = build_function_call_graph(nodes, edges)
    write_json(
        os.path.join(graphs_dir, 'function_call_graph.json'),
        func_graph
    )
    print(f"         Function call graph: {len(func_graph['nodes'])} nodes, {len(func_graph['edges'])} edges")

    # graph 2 — import graph
    import_graph = build_import_graph(nodes, edges)
    write_json(
        os.path.join(graphs_dir, 'import_graph.json'),
        import_graph
    )
    print(f"         Import graph:        {len(import_graph['nodes'])} nodes, {len(import_graph['edges'])} edges")

    # graph 3 — class hierarchy graph
    class_graph = build_class_hierarchy_graph(nodes, edges)
    write_json(
        os.path.join(graphs_dir, 'class_hierarchy_graph.json'),
        class_graph
    )
    print(f"         Class hierarchy:     {len(class_graph['nodes'])} nodes, {len(class_graph['edges'])} edges")

    # graph 4 — full graph
    full_graph = build_full_graph(nodes, edges)
    write_json(
        os.path.join(graphs_dir, 'full_graph.json'),
        full_graph
    )
    print(f"         Full graph:          {len(full_graph['nodes'])} nodes, {len(full_graph['edges'])} edges")

    print(f"AIL CP7 | All 4 graphs saved → .ail/layer2/graphs/")


# CP7 reads nodes.json and edges.json from CP6 and generates four filtered graph views: function call graph, import graph, class hierarchy graph, and the full graph.

# Each file contains only the nodes and edges relevant to its view and is saved to .ail/layer2/graphs/.