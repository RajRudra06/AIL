import json
import os
from cp3_extractor import ExtractionResult
from cp5_pass2 import Pass2Result
from cp1_setup import SetupResult


def build_func_id(name: str, file: str) -> str:
    return f"func::{file}::{name}"

def build_class_id(name: str, file: str) -> str:
    return f"class::{file}::{name}"

def build_file_id(file: str) -> str:
    return f"file::{file}"

def build_var_id(name: str, file: str) -> str:
    return f"var::{file}::{name}"


def build_function_nodes(extraction: ExtractionResult) -> list[dict]:
    nodes = []
    for func in extraction.raw_functions:
        nodes.append({
            "id":           build_func_id(func['name'], func['file']),
            "type":         "function",
            "name":         func['name'],
            "file":         func['file'],
            "line_start":   func['line_start'],
            "line_end":     func['line_end'],
            "parameters":   func.get('parameters', []),
            "complexity":   func.get('complexity', 1),
            "loc":          func.get('loc', 0),
            "is_async":     func.get('is_async', False),
            "parent_class": func.get('parent_class', None)
        })
    return nodes


def build_class_nodes(extraction: ExtractionResult) -> list[dict]:
    nodes = []
    for cls in extraction.raw_classes:
        nodes.append({
            "id":         build_class_id(cls['name'], cls['file']),
            "type":       "class",
            "name":       cls['name'],
            "file":       cls['file'],
            "line_start": cls['line_start'],
            "line_end":   cls['line_end'],
            "methods":    cls.get('methods', []),
            "inherits":   cls.get('inherits', []),
            "loc":        cls.get('loc', 0)
        })
    return nodes


def build_file_nodes(extraction: ExtractionResult, setup: SetupResult) -> list[dict]:
    # build file nodes from source_files in setup
    # group functions and classes per file
    file_functions: dict[str, list] = {}
    file_classes:   dict[str, list] = {}

    for func in extraction.raw_functions:
        f = func['file']
        file_functions.setdefault(f, []).append(func['name'])

    for cls in extraction.raw_classes:
        f = cls['file']
        file_classes.setdefault(f, []).append(cls['name'])

    nodes = []
    for file_info in setup.source_files:
        rel_path = file_info['relative_path']
        language = file_info['language']

        # count lines from raw_functions for this file
        loc = max(
            [f['line_end'] for f in extraction.raw_functions if f['file'] == rel_path],
            default=0
        )

        nodes.append({
            "id":        build_file_id(rel_path),
            "type":      "file",
            "name":      file_info['filename'],
            "path":      rel_path,
            "language":  language,
            "loc":       loc,
            "functions": file_functions.get(rel_path, []),
            "classes":   file_classes.get(rel_path, [])
        })
    return nodes


def build_variable_nodes(extraction: ExtractionResult) -> list[dict]:
    nodes = []
    for var in extraction.raw_variables:
        nodes.append({
            "id":    build_var_id(var['name'], var['file']),
            "type":  "global_variable",
            "name":  var['name'],
            "file":  var['file'],
            "line":  var['line'],
            "value": var.get('value', None)
        })
    return nodes

def write_json(path: str, data) -> None:
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"AIL CP6 | Saved → {os.path.basename(path)} ({len(data)} entries)")
    

def run_checkpoint6(
    extraction: ExtractionResult,
    pass2:      Pass2Result,
    setup:      SetupResult
) -> tuple[list[dict], list[dict]]:

    print(f"AIL CP6 | Collapsing notepads into nodes.json and edges.json...")

    # ── BUILD NODES ───────────────────────────────────────────
    function_nodes = build_function_nodes(extraction)
    class_nodes    = build_class_nodes(extraction)
    file_nodes     = build_file_nodes(extraction, setup)
    variable_nodes = build_variable_nodes(extraction)

    # merge all into one flat nodes list
    all_nodes = function_nodes + class_nodes + file_nodes + variable_nodes

    # ── EDGES already built in CP5 ────────────────────────────
    all_edges = pass2.edges

    # ── SAVE TO DISK ──────────────────────────────────────────
    raw_dir = setup.raw_analysis_dir

    write_json(os.path.join(raw_dir, 'nodes.json'), all_nodes)
    write_json(os.path.join(raw_dir, 'edges.json'), all_edges)

    print(f"AIL CP6 | Collapse complete:")
    print(f"         Function nodes:  {len(function_nodes)}")
    print(f"         Class nodes:     {len(class_nodes)}")
    print(f"         File nodes:      {len(file_nodes)}")
    print(f"         Variable nodes:  {len(variable_nodes)}")
    print(f"         Total nodes:     {len(all_nodes)}")
    print(f"         Total edges:     {len(all_edges)}")

    return all_nodes, all_edges

# CP6 combines the `ExtractionResult` (CP3) and `Pass2Result` (CP5), consolidates notepads 1–3 into `nodes.json`, and writes the resolved edges into `edges.json` under `.ail/layer2/raw_analysis/`.

# At this stage, each entity is assigned its final unique ID using the format `func::file::name`.
