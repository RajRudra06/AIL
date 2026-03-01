import json
import os
from cp3_extractor import ExtractionResult
from cp1_setup import SetupResult


def write_json(path: str, data) -> None:
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"AIL CP4 | Saved → {os.path.basename(path)} ({len(data) if isinstance(data, (list, dict)) else '?'} entries)")

def run_checkpoint4(extraction: ExtractionResult, setup: SetupResult) -> None:
    print(f"AIL CP4 | Saving raw analysis to disk...")

    raw_dir = setup.raw_analysis_dir

    # notepad 1 — functions
    write_json(
        os.path.join(raw_dir, 'raw_functions.json'),
        extraction.raw_functions
    )

    # notepad 2 — classes
    write_json(
        os.path.join(raw_dir, 'raw_classes.json'),
        extraction.raw_classes
    )

    # notepad 3 — variables
    write_json(
        os.path.join(raw_dir, 'raw_variables.json'),
        extraction.raw_variables
    )

    # notepad 4 — func calls (unresolved)
    write_json(
        os.path.join(raw_dir, 'raw_func_calls.json'),
        extraction.raw_func_calls
    )

    # notepad 5 — imports (unresolved)
    write_json(
        os.path.join(raw_dir, 'raw_imports.json'),
        extraction.raw_imports
    )

    # notepad 6 — inheritance (unresolved)
    write_json(
        os.path.join(raw_dir, 'raw_inheritance.json'),
        extraction.raw_inheritance
    )

    # entity registry — phone book
    write_json(
        os.path.join(raw_dir, 'entity_registry.json'),
        extraction.entity_registry
    )

    print(f"AIL CP4 | All raw analysis saved → .ail/layer2/raw_analysis/")

# CP4 receives the `ExtractionResult` from CP3 and writes the six notepads and the entity registry as JSON files into `.ail/layer2/raw_analysis/`.

# It is a pure persistence step with no processing—after this point, all Pass 1 data is durably stored on disk.
