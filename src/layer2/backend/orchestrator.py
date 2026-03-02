import sys
import os
import traceback

# add backend/layer2 to path so all cp imports work
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from cp1_setup      import run_checkpoint1
from cp2_ast_builder import run_checkpoint2
from cp3_extractor  import run_checkpoint3
from cp4_save_raw   import run_checkpoint4
from cp5_pass2      import run_checkpoint5
from cp6_collapse   import run_checkpoint6
from cp7_graphs     import run_checkpoint7
from cp8_metadata   import run_checkpoint8

def run_layer2(workspace_path: str) -> None:
    print(f"AIL Layer 2 | Starting analysis for: {workspace_path}")
    print(f"AIL Layer 2 | {'='*50}")

    # ── CP1: setup ────────────────────────────────────────────
    print(f"\nAIL Layer 2 | CP1 — Setup")
    setup = run_checkpoint1(workspace_path)

    # ── CP2: build ASTs ───────────────────────────────────────
    print(f"\nAIL Layer 2 | CP2 — Build ASTs")
    ast_results = run_checkpoint2(setup)

    # ── CP3: extract 6 attributes (Pass 1) ───────────────────
    print(f"\nAIL Layer 2 | CP3 — Extract attributes (Pass 1)")
    extraction = run_checkpoint3(ast_results)

    # free ASTs from memory — no longer needed
    del ast_results
    print(f"AIL Layer 2 | ASTs freed from memory")

    # ── CP4: save raw analysis to disk ────────────────────────
    print(f"\nAIL Layer 2 | CP4 — Save raw analysis")
    run_checkpoint4(extraction, setup)

    # ── CP5: resolve relationships (Pass 2) ───────────────────
    print(f"\nAIL Layer 2 | CP5 — Resolve relationships (Pass 2)")
    pass2 = run_checkpoint5(extraction)

    # ── CP6: collapse into nodes.json + edges.json ────────────
    print(f"\nAIL Layer 2 | CP6 — Collapse to nodes + edges")
    nodes, edges = run_checkpoint6(extraction, pass2, setup)

    # free extraction and pass2 from memory
    del extraction
    del pass2
    print(f"AIL Layer 2 | Extraction data freed from memory")

    # ── CP7: build 4 graphs ───────────────────────────────────
    print(f"\nAIL Layer 2 | CP7 — Build 4 graphs")
    run_checkpoint7(nodes, edges, setup)

    # ── CP8: assemble meta-data.json ──────────────────────────
    print(f"\nAIL Layer 2 | CP8 — Assemble meta-data")
    metadata = run_checkpoint8(nodes, edges, setup)

    print(f"\nAIL Layer 2 | {'='*50}")
    print(f"AIL Layer 2 | Analysis complete")
    print(f"AIL Layer 2 | Nodes:  {metadata['summary']['total_nodes']}")
    print(f"AIL Layer 2 | Edges:  {metadata['summary']['total_edges']}")
    print(f"AIL Layer 2 | Files:  {metadata['summary']['total_files']}")
    print(f"AIL Layer 2 | Output: {setup.ail_layer2_dir}")
    print(f"AIL Layer 2 | DONE")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("ERROR: workspacePath argument required")
        print("Usage: python orchestrator.py /path/to/workspace")
        sys.exit(1)

    workspace_path = sys.argv[1]

    if not os.path.exists(workspace_path):
        print(f"ERROR: workspace path does not exist: {workspace_path}")
        sys.exit(1)

    try:
        run_layer2(workspace_path)
        sys.exit(0)
    except KeyboardInterrupt:
        print("\nAIL Layer 2 | Interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\nAIL Layer 2 | FAILED: {e}")
        traceback.print_exc()
        sys.exit(1)

# Acts as the main entry point invoked by the TypeScript extension through child_process.spawn, receiving workspacePath as a command-line argument.

# It sequentially executes CP1 through CP8, streams progress logs to stdout for real-time extension updates, and exits with code 0 on success or 1 on failure.