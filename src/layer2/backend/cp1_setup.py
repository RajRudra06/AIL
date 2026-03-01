import sys
import json
import os
from dataclasses import dataclass, field
from typing import Optional

try:
    from tree_sitter_languages import get_parser
except ImportError:
    print("ERROR: tree_sitter_languages not installed. Run: pip install tree-sitter-languages")
    sys.exit(1)


SUPPORTED_LANGUAGES = {
    'Python':     'python',
    'JavaScript': 'javascript',
    'TypeScript': 'typescript',
    'Java':       'java',
    'Go':         'go',
    'Rust':       'rust',
    'Ruby':       'ruby',
    'PHP':        'php',
    'C':          'c',
    'C++':        'cpp',
}

# maps tree-sitter key → file extensions
LANGUAGE_EXTENSIONS = {
    'python':     ['.py'],
    'javascript': ['.js', '.jsx'],
    'typescript': ['.ts', '.tsx'],
    'java':       ['.java'],
    'go':         ['.go'],
    'rust':       ['.rs'],
    'ruby':       ['.rb'],
    'php':        ['.php'],
    'c':          ['.c', '.h'],
    'cpp':        ['.cpp', '.cc', '.cxx', '.hpp'],
}

EXCLUDE_DIRS = {
    'node_modules', '.git', '__pycache__', 'dist',
    'build', '.next', 'out', 'target', '.ail',
    'venv', '.venv', 'env', 'AutoAI_ENV'
}


@dataclass
class SetupResult:
    workspace_path:    str
    primary_language:  str                    # e.g. "Python"
    active_languages:  dict[str, str]         # e.g. {"Python": "python", "TypeScript": "typescript"}
    parsers:           dict[str, object]      # e.g. {"python": <parser>, "typescript": <parser>}
    source_files:      list[dict]             # [{"path": "/repo/main.py", "language": "python"}]
    layer1_metadata:   dict                   # full Layer 1 meta-data.json
    ail_layer2_dir:    str                    # .ail/layer2/
    raw_analysis_dir:  str                    # .ail/layer2/raw_analysis/
    graphs_dir:        str                    # .ail/layer2/graphs/


def read_layer1_metadata(workspace_path: str) -> dict:
    metadata_path = os.path.join(workspace_path, '.ail', 'layer1', 'meta-data.json')

    if not os.path.exists(metadata_path):
        print(f"ERROR: Layer 1 meta-data.json not found at {metadata_path}")
        print("Please run Layer 1 analysis first.")
        sys.exit(1)

    with open(metadata_path, 'r') as f:
        return json.load(f)


def detect_active_languages(metadata: dict) -> tuple[str, dict[str, str]]:
    # primary language from Layer 1
    primary = metadata.get('primaryLanguage', '')

    if not primary:
        print("ERROR: primaryLanguage not found in Layer 1 meta-data.json")
        sys.exit(1)

    # all languages detected by Layer 1
    all_languages = metadata.get('languages', {}).get('languages', [])

    # extract language names from Layer 1 language objects
    # Layer 1 stores: {"languages": [{"name": "Python", "percentage": 60}, ...]}
    language_names = []
    if isinstance(all_languages, list):
        language_names = [l.get('name', '') for l in all_languages]
    elif isinstance(all_languages, dict):
        language_names = list(all_languages.keys())

    # always include primary even if not in languages list
    if primary not in language_names:
        language_names.append(primary)

    # filter to only supported languages
    active = {
        name: SUPPORTED_LANGUAGES[name]
        for name in language_names
        if name in SUPPORTED_LANGUAGES
    }

    if not active:
        print(f"ERROR: No supported languages found in repo.")
        print(f"Supported: {', '.join(SUPPORTED_LANGUAGES.keys())}")
        sys.exit(1)

    print(f"AIL CP1 | Primary language: {primary}")
    print(f"AIL CP1 | Active languages: {', '.join(active.keys())}")
    return primary, active


def init_parsers(active_languages: dict[str, str]) -> dict[str, object]:
    parsers = {}
    for lang_name, lang_key in active_languages.items():
        try:
            parsers[lang_key] = get_parser(lang_key)
            print(f"AIL CP1 | Parser initialized: {lang_name} → {lang_key}")
        except Exception as e:
            print(f"WARNING: Failed to initialize parser for {lang_name}: {e} — skipping")
    return parsers


def collect_source_files(workspace_path: str, active_languages: dict[str, str]) -> list[dict]:
    # build extension → language_key map for fast lookup
    ext_to_lang = {}
    for lang_key in active_languages.values():
        for ext in LANGUAGE_EXTENSIONS.get(lang_key, []):
            ext_to_lang[ext] = lang_key

    source_files = []

    for root, dirs, files in os.walk(workspace_path):
        # skip excluded directories
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]

        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext in ext_to_lang:
                source_files.append({
                    "path":     os.path.join(root, file),
                    "language": ext_to_lang[ext],
                    "filename": file,
                    "relative_path": os.path.relpath(
                        os.path.join(root, file),
                        workspace_path
                    )
                })

    print(f"AIL CP1 | Found {len(source_files)} source files across {len(active_languages)} languages")
    return source_files


def create_output_dirs(workspace_path: str) -> tuple[str, str, str]:
    ail_dir          = os.path.join(workspace_path, '.ail')
    layer2_dir       = os.path.join(ail_dir, 'layer2')
    raw_analysis_dir = os.path.join(layer2_dir, 'raw_analysis')
    graphs_dir       = os.path.join(layer2_dir, 'graphs')

    for d in [ail_dir, layer2_dir, raw_analysis_dir, graphs_dir]:
        os.makedirs(d, exist_ok=True)

    print(f"AIL CP1 | Output directories ready → .ail/layer2/")
    return layer2_dir, raw_analysis_dir, graphs_dir


def run_checkpoint1(workspace_path: str) -> SetupResult:
    print(f"AIL CP1 | Starting setup for: {workspace_path}")

    # step 1: read Layer 1 metadata
    metadata = read_layer1_metadata(workspace_path)

    # step 2: detect all active languages
    primary_language, active_languages = detect_active_languages(metadata)

    # step 3: initialize one parser per language
    parsers = init_parsers(active_languages)

    if not parsers:
        print("ERROR: No parsers could be initialized")
        sys.exit(1)

    # step 4: collect all source files tagged with language
    source_files = collect_source_files(workspace_path, active_languages)

    if len(source_files) == 0:
        print("ERROR: No source files found")
        sys.exit(1)

    # step 5: create output directories
    layer2_dir, raw_analysis_dir, graphs_dir = create_output_dirs(workspace_path)

    result = SetupResult(
        workspace_path   = workspace_path,
        primary_language = primary_language,
        active_languages = active_languages,
        parsers          = parsers,
        source_files     = source_files,
        layer1_metadata  = metadata,
        ail_layer2_dir   = layer2_dir,
        raw_analysis_dir = raw_analysis_dir,
        graphs_dir       = graphs_dir
    )

    print(f"AIL CP1 | Setup complete | Languages: {len(active_languages)} | Files: {len(source_files)}")
    return result