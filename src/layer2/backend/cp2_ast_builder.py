import os
from dataclasses import dataclass
from cp1_setup import SetupResult


@dataclass
class ASTResult:
    path:          str       # absolute path
    relative_path: str       # relative to workspace
    filename:      str       # just the filename e.g. "auth.py"
    language:      str       # tree-sitter key e.g. "python"
    tree:          object    # Tree-sitter tree object
    source_code:   bytes     # raw file bytes (needed for node text extraction in CP3)
    line_count:    int       # total lines in file

def read_file(path: str) -> bytes | None:
    try:
        with open(path, 'rb') as f:    # read as bytes — tree-sitter requires bytes
            return f.read()
    except Exception as e:
        print(f"WARNING: Could not read file {path}: {e} — skipping")
        return None


def build_ast(source_code: bytes, parser: object, path: str) -> object | None:
    try:
        tree = parser.parse(source_code)
        return tree
    except Exception as e:
        print(f"WARNING: Could not parse {path}: {e} — skipping")
        return None


def count_lines(source_code: bytes) -> int:
    return source_code.count(b'\n') + 1


def run_checkpoint2(setup: SetupResult) -> list[ASTResult]:
    print(f"AIL CP2 | Building ASTs for {len(setup.source_files)} files...")

    ast_results = []
    skipped     = 0
    parsed      = 0

    for file_info in setup.source_files:
        path          = file_info['path']
        language      = file_info['language']
        relative_path = file_info['relative_path']
        filename      = file_info['filename']

        # step 1: get correct parser for this file's language
        parser = setup.parsers.get(language)
        if not parser:
            print(f"WARNING: No parser for language '{language}' — skipping {filename}")
            skipped += 1
            continue

        # step 2: read file as bytes
        source_code = read_file(path)
        if source_code is None:
            skipped += 1
            continue

        # step 3: build AST
        tree = build_ast(source_code, parser, path)
        if tree is None:
            skipped += 1
            continue

        # step 4: store result
        ast_results.append(ASTResult(
            path          = path,
            relative_path = relative_path,
            filename      = filename,
            language      = language,
            tree          = tree,
            source_code   = source_code,
            line_count    = count_lines(source_code)
        ))
        parsed += 1

    print(f"AIL CP2 | ASTs built: {parsed} | Skipped: {skipped}")
    return ast_results

# CP2 takes the SetupResult, reads each source file, and builds a Tree-sitter AST using the appropriate parser for its language.

# It stores these ASTs in memory as ASTResult objects—one per file—until CP3 extracts the required data, after which they are discarded.