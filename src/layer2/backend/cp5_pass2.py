from dataclasses import dataclass, field
from cp3_extractor import ExtractionResult


@dataclass
class Pass2Result:
    edges: list[dict] = field(default_factory=list)

def build_func_id(func_name: str, file: str) -> str:
    return f"func::{file}::{func_name}"

def build_file_id(file: str) -> str:
    return f"file::{file}"

def build_class_id(class_name: str, file: str) -> str:
    return f"class::{file}::{class_name}"

def resolve_name(name: str, entity_registry: dict) -> str | None:
    # direct lookup
    if name in entity_registry:
        return entity_registry[name]
    # try without self. prefix
    clean = name.replace('self.', '').strip()
    if clean in entity_registry:
        return entity_registry[clean]
    return None


def resolve_func_calls(extraction: ExtractionResult, result: Pass2Result) -> None:
    print(f"AIL CP5 | Resolving {len(extraction.raw_func_calls)} function calls...")

    resolved   = 0
    unresolved = 0

    # aggregate call_count for duplicate calls
    # e.g. if start_app calls hash_string 3 times → call_count: 3
    call_counts: dict[tuple, int] = {}

    for call in extraction.raw_func_calls:
        caller_file = call['caller_file']
        caller_func = call['caller_func']
        callee_name = call['callee_name']

        # look up callee in entity registry
        callee_file = resolve_name(callee_name, extraction.entity_registry)

        if callee_file is None:
            # external call (e.g. print, len, library function) — skip
            unresolved += 1
            continue

        caller_id = build_func_id(caller_func, caller_file)
        callee_id = build_func_id(callee_name, callee_file)

        # aggregate call count
        key = (caller_id, callee_id)
        call_counts[key] = call_counts.get(key, 0) + 1
        resolved += 1

    # create edges with aggregated call counts
    for (caller_id, callee_id), count in call_counts.items():
        result.edges.append({
            "from":       caller_id,
            "to":         callee_id,
            "type":       "calls",
            "call_count": count
        })

    print(f"AIL CP5 | Calls resolved: {resolved} | External/unresolved: {unresolved}")


def resolve_imports(extraction: ExtractionResult, result: Pass2Result) -> None:
    print(f"AIL CP5 | Resolving {len(extraction.raw_imports)} imports...")

    resolved   = 0
    unresolved = 0
    seen       = set()  # deduplicate file→file import edges

    for imp in extraction.raw_imports:
        importer_file  = imp['importer_file']
        from_module    = imp['from_module']

        # try to resolve module to a file
        # e.g. "auth" → "auth.py" or "src/auth.py"
        resolved_file = resolve_module_to_file(from_module, extraction.entity_registry)

        if resolved_file is None:
            unresolved += 1
            continue

        # deduplicate — only one file→file import edge
        edge_key = (importer_file, resolved_file)
        if edge_key in seen:
            resolved += 1
            continue
        seen.add(edge_key)

        result.edges.append({
            "from":       build_file_id(importer_file),
            "to":         build_file_id(resolved_file),
            "type":       "imports",
            "call_count": 1
        })
        resolved += 1

    print(f"AIL CP5 | Imports resolved: {resolved} | External/unresolved: {unresolved}")


def resolve_module_to_file(module_name: str, entity_registry: dict) -> str | None:
    # entity registry maps name → file
    # we need to find which file a module name corresponds to
    # strategy: check if any registered entity lives in a file
    # whose name matches the module

    # normalize module name — remove dots, get last part
    # e.g. "src.auth" → "auth"
    parts       = module_name.replace('/', '.').split('.')
    short_name  = parts[-1].lower()

    # look through all registry values (files) for a match
    seen_files = set()
    for file in entity_registry.values():
        if file in seen_files:
            continue
        seen_files.add(file)

        # get filename without extension
        filename = file.split('/')[-1].split('\\')[-1]
        filename_no_ext = filename.rsplit('.', 1)[0].lower()

        if filename_no_ext == short_name:
            return file

    return None


def resolve_inheritance(extraction: ExtractionResult, result: Pass2Result) -> None:
    print(f"AIL CP5 | Resolving {len(extraction.raw_inheritance)} inheritance relationships...")

    resolved   = 0
    unresolved = 0

    for inh in extraction.raw_inheritance:
        child      = inh['child']
        child_file = inh['child_file']
        parent     = inh['parent_name']

        # look up parent class in entity registry
        parent_file = resolve_name(parent, extraction.entity_registry)

        if parent_file is None:
            # external class (e.g. inheriting from Django Model) — skip
            unresolved += 1
            continue

        result.edges.append({
            "from":       build_class_id(child, child_file),
            "to":         build_class_id(parent, parent_file),
            "type":       "inherits",
            "call_count": 1
        })
        resolved += 1

    print(f"AIL CP5 | Inheritance resolved: {resolved} | External/unresolved: {unresolved}")


def run_checkpoint5(extraction: ExtractionResult) -> Pass2Result:
    print(f"AIL CP5 | Starting Pass 2 — resolving all relationships...")

    result = Pass2Result()

    # resolve all 3 unresolved notepads
    resolve_func_calls(extraction, result)
    resolve_imports(extraction, result)
    resolve_inheritance(extraction, result)

    print(f"AIL CP5 | Pass 2 complete | Total edges: {len(result.edges)}")
    return result

# CP5 reads the unresolved notepads (`raw_func_calls`, `raw_imports`, `raw_inheritance`) along with the `entity_registry`, resolves each reference to its full file path, and generates a complete set of typed edges.

# This completes Pass 2—after CP5, all relationships are fully resolved and ready for persistence.
