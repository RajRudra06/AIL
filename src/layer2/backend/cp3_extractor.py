from dataclasses import dataclass, field
from cp2_ast_builder import ASTResult

@dataclass
class ExtractionResult:
    raw_functions:    list[dict] = field(default_factory=list)
    raw_classes:      list[dict] = field(default_factory=list)
    raw_variables:    list[dict] = field(default_factory=list)
    raw_func_calls:   list[dict] = field(default_factory=list)
    raw_imports:      list[dict] = field(default_factory=list)
    raw_inheritance:  list[dict] = field(default_factory=list)
    entity_registry:  dict       = field(default_factory=dict)


def get_node_text(node, source_code: bytes) -> str:
    return source_code[node.start_byte:node.end_byte].decode('utf-8', errors='ignore')


def get_node_text_by_type(node, type_name: str, source_code: bytes) -> str | None:
    for child in node.children:
        if child.type == type_name:
            return get_node_text(child, source_code)
    return None


COMPLEXITY_NODE_TYPES = {
    'if_statement', 'elif_clause', 'for_statement', 'while_statement',
    'try_statement', 'except_clause', 'with_statement', 'assert_statement',
    'conditional_expression', 'boolean_operator',
    # JavaScript/TypeScript
    'if', 'for', 'while', 'try', 'catch', 'switch', 'case',
    'ternary_expression', '&&', '||',
    # Java
    'for_statement', 'enhanced_for_statement', 'while_statement',
}

def calculate_complexity(func_node) -> int:
    complexity = 1  # base complexity
    def walk(node):
        nonlocal complexity
        if node.type in COMPLEXITY_NODE_TYPES:
            complexity += 1
        for child in node.children:
            walk(child)
    walk(func_node)
    return complexity


def extract_python(ast_result: ASTResult, result: ExtractionResult):
    source  = ast_result.source_code
    tree    = ast_result.tree
    file    = ast_result.relative_path

    def walk(node, current_class=None):

        # ── FUNCTION / METHOD DEFINITION ──────────────────────
        if node.type in ('function_definition', 'async_function_def'):
            name = get_node_text_by_type(node, 'identifier', source)
            if not name:
                pass
            else:
                params = []
                for child in node.children:
                    if child.type == 'parameters':
                        for param in child.children:
                            if param.type == 'identifier':
                                param_name = get_node_text(param, source)
                                if param_name != 'self' and param_name != 'cls':
                                    params.append(param_name)

                is_async   = node.type == 'async_function_def'
                line_start = node.start_point[0] + 1
                line_end   = node.end_point[0] + 1
                loc        = line_end - line_start + 1
                complexity = calculate_complexity(node)

                full_name = f"{current_class}.{name}" if current_class else name

                func_entry = {
                    "file":         file,
                    "name":         full_name,
                    "line_start":   line_start,
                    "line_end":     line_end,
                    "parameters":   params,
                    "complexity":   complexity,
                    "loc":          loc,
                    "is_async":     is_async,
                    "parent_class": current_class
                }
                result.raw_functions.append(func_entry)

                # add to entity registry
                result.entity_registry[full_name] = file

                # walk function body for calls
                for child in node.children:
                    if child.type == 'block':
                        walk_for_calls(child, full_name, file, source, result)

        # ── CLASS DEFINITION ──────────────────────────────────
        elif node.type == 'class_definition':
            class_name = get_node_text_by_type(node, 'identifier', source)
            if class_name:
                line_start = node.start_point[0] + 1
                line_end   = node.end_point[0] + 1
                loc        = line_end - line_start + 1

                # get parent classes (inheritance)
                inherits = []
                for child in node.children:
                    if child.type == 'argument_list':
                        for arg in child.children:
                            if arg.type == 'identifier':
                                parent = get_node_text(arg, source)
                                inherits.append(parent)
                                result.raw_inheritance.append({
                                    "child":       class_name,
                                    "child_file":  file,
                                    "parent_name": parent
                                })

                # collect method names
                methods = []
                for child in node.children:
                    if child.type == 'block':
                        for item in child.children:
                            if item.type in ('function_definition', 'async_function_def'):
                                method_name = get_node_text_by_type(item, 'identifier', source)
                                if method_name:
                                    methods.append(method_name)

                result.raw_classes.append({
                    "file":       file,
                    "name":       class_name,
                    "line_start": line_start,
                    "line_end":   line_end,
                    "methods":    methods,
                    "inherits":   inherits,
                    "loc":        loc
                })

                # add class to entity registry
                result.entity_registry[class_name] = file

                # walk class body with class context
                for child in node.children:
                    if child.type == 'block':
                        for item in child.children:
                            walk(item, current_class=class_name)
                return  # already walked children

        # ── IMPORT STATEMENTS ─────────────────────────────────
        elif node.type == 'import_statement':
            for child in node.children:
                if child.type == 'dotted_name':
                    result.raw_imports.append({
                        "importer_file":  file,
                        "imported_name":  get_node_text(child, source),
                        "from_module":    get_node_text(child, source)
                    })

        elif node.type == 'import_from_statement':
            from_module = None
            imported_names = []
            for child in node.children:
                if child.type == 'dotted_name':
                    from_module = get_node_text(child, source)
                elif child.type == 'identifier':
                    imported_names.append(get_node_text(child, source))
                elif child.type == 'aliased_import':
                    for subchild in child.children:
                        if subchild.type == 'identifier':
                            imported_names.append(get_node_text(subchild, source))
                            break

            for name in imported_names:
                result.raw_imports.append({
                    "importer_file":  file,
                    "imported_name":  name,
                    "from_module":    from_module or name
                })

        # ── GLOBAL VARIABLES ──────────────────────────────────
        elif node.type == 'expression_statement' and node.parent and node.parent.type == 'module':
            for child in node.children:
                if child.type == 'assignment':
                    left = child.children[0] if child.children else None
                    right = child.children[-1] if len(child.children) > 2 else None
                    if left and left.type == 'identifier':
                        var_name = get_node_text(left, source)
                        # only uppercase = likely a constant/config variable
                        if var_name.isupper():
                            result.raw_variables.append({
                                "file":  file,
                                "name":  var_name,
                                "line":  node.start_point[0] + 1,
                                "value": get_node_text(right, source) if right else None
                            })

        # walk children
        for child in node.children:
            walk(child)

    walk(tree.root_node)


def walk_for_calls(node, caller_func: str, caller_file: str, source: bytes, result: ExtractionResult):
    if node.type == 'call':
        func_node = node.children[0] if node.children else None
        if func_node:
            callee_name = get_node_text(func_node, source).strip()
            # clean up — remove 'self.' prefix
            if callee_name.startswith('self.'):
                callee_name = callee_name[5:]
            if callee_name:
                result.raw_func_calls.append({
                    "caller_file":  caller_file,
                    "caller_func":  caller_func,
                    "callee_name":  callee_name,
                    "call_count":   1
                })

    for child in node.children:
        walk_for_calls(child, caller_func, caller_file, source, result)


def extract_java(ast_result: ASTResult, result: ExtractionResult):
    source = ast_result.source_code
    tree   = ast_result.tree
    file   = ast_result.relative_path

    def walk(node, current_class=None):

        # ── CLASS DECLARATION ─────────────────────────────────
        if node.type == 'class_declaration':
            name = get_node_text_by_type(node, 'identifier', source)
            if name:
                line_start = node.start_point[0] + 1
                line_end   = node.end_point[0] + 1
                inherits   = []

                # extends
                for child in node.children:
                    if child.type == 'superclass':
                        for subchild in child.children:
                            if subchild.type == 'type_identifier':
                                parent = get_node_text(subchild, source)
                                inherits.append(parent)
                                result.raw_inheritance.append({
                                    "child":       name,
                                    "child_file":  file,
                                    "parent_name": parent
                                })

                # implements
                for child in node.children:
                    if child.type == 'super_interfaces':
                        for subchild in child.children:
                            if subchild.type == 'type_identifier':
                                parent = get_node_text(subchild, source)
                                inherits.append(parent)
                                result.raw_inheritance.append({
                                    "child":       name,
                                    "child_file":  file,
                                    "parent_name": parent
                                })

                methods = []
                for child in node.children:
                    if child.type == 'class_body':
                        for item in child.children:
                            if item.type == 'method_declaration':
                                method_name = get_node_text_by_type(item, 'identifier', source)
                                if method_name:
                                    methods.append(method_name)

                result.raw_classes.append({
                    "file":       file,
                    "name":       name,
                    "line_start": line_start,
                    "line_end":   line_end,
                    "methods":    methods,
                    "inherits":   inherits,
                    "loc":        line_end - line_start + 1
                })
                result.entity_registry[name] = file

                for child in node.children:
                    if child.type == 'class_body':
                        for item in child.children:
                            walk(item, current_class=name)
                return

        # ── METHOD DECLARATION ────────────────────────────────
        elif node.type == 'method_declaration':
            name = get_node_text_by_type(node, 'identifier', source)
            if name:
                line_start = node.start_point[0] + 1
                line_end   = node.end_point[0] + 1
                params     = []

                for child in node.children:
                    if child.type == 'formal_parameters':
                        for param in child.children:
                            if param.type == 'formal_parameter':
                                param_name = None
                                for subchild in param.children:
                                    if subchild.type == 'identifier':
                                        param_name = get_node_text(subchild, source)
                                if param_name:
                                    params.append(param_name)

                full_name = f"{current_class}.{name}" if current_class else name

                result.raw_functions.append({
                    "file":         file,
                    "name":         full_name,
                    "line_start":   line_start,
                    "line_end":     line_end,
                    "parameters":   params,
                    "complexity":   calculate_complexity(node),
                    "loc":          line_end - line_start + 1,
                    "is_async":     False,
                    "parent_class": current_class
                })
                result.entity_registry[full_name] = file

                for child in node.children:
                    if child.type == 'block':
                        walk_for_calls(child, full_name, file, source, result)

        # ── IMPORT DECLARATIONS ───────────────────────────────
        elif node.type == 'import_declaration':
            for child in node.children:
                if child.type == 'scoped_identifier':
                    full_import = get_node_text(child, source)
                    parts       = full_import.split('.')
                    name        = parts[-1] if parts else full_import
                    module      = '.'.join(parts[:-1]) if len(parts) > 1 else full_import

                    result.raw_imports.append({
                        "importer_file": file,
                        "imported_name": name,
                        "from_module":   module
                    })

        # ── FIELD DECLARATION (global-ish constants) ──────────
        elif node.type == 'field_declaration' and current_class is None:
            for child in node.children:
                if child.type == 'variable_declarator':
                    name_node = child.children[0] if child.children else None
                    val_node  = child.children[-1] if len(child.children) > 1 else None
                    if name_node and name_node.type == 'identifier':
                        var_name = get_node_text(name_node, source)
                        if var_name.isupper():
                            result.raw_variables.append({
                                "file":  file,
                                "name":  var_name,
                                "line":  node.start_point[0] + 1,
                                "value": get_node_text(val_node, source) if val_node else None
                            })

        for child in node.children:
            walk(child)

    walk(tree.root_node)


def extract_c(ast_result: ASTResult, result: ExtractionResult):
    source = ast_result.source_code
    tree   = ast_result.tree
    file   = ast_result.relative_path

    def walk(node):

        # ── FUNCTION DEFINITION ───────────────────────────────
        if node.type == 'function_definition':
            # C function: return_type name(params) { body }
            name = None
            for child in node.children:
                if child.type == 'function_declarator':
                    for subchild in child.children:
                        if subchild.type == 'identifier':
                            name = get_node_text(subchild, source)
                            break

            if name:
                line_start = node.start_point[0] + 1
                line_end   = node.end_point[0] + 1
                params     = []

                for child in node.children:
                    if child.type == 'function_declarator':
                        for subchild in child.children:
                            if subchild.type == 'parameter_list':
                                for param in subchild.children:
                                    if param.type == 'parameter_declaration':
                                        for p in param.children:
                                            if p.type == 'identifier':
                                                params.append(get_node_text(p, source))

                result.raw_functions.append({
                    "file":         file,
                    "name":         name,
                    "line_start":   line_start,
                    "line_end":     line_end,
                    "parameters":   params,
                    "complexity":   calculate_complexity(node),
                    "loc":          line_end - line_start + 1,
                    "is_async":     False,
                    "parent_class": None
                })
                result.entity_registry[name] = file

                for child in node.children:
                    if child.type == 'compound_statement':
                        walk_for_calls(child, name, file, source, result)

        # ── INCLUDE STATEMENTS ────────────────────────────────
        elif node.type == 'preproc_include':
            for child in node.children:
                if child.type in ('string_literal', 'system_lib_string'):
                    module = get_node_text(child, source).strip('"<>')
                    result.raw_imports.append({
                        "importer_file": file,
                        "imported_name": module,
                        "from_module":   module
                    })

        # ── GLOBAL VARIABLES ──────────────────────────────────
        elif node.type == 'declaration' and node.parent and node.parent.type == 'translation_unit':
            for child in node.children:
                if child.type == 'init_declarator':
                    name_node = child.children[0] if child.children else None
                    val_node  = child.children[-1] if len(child.children) > 1 else None
                    if name_node and name_node.type == 'identifier':
                        var_name = get_node_text(name_node, source)
                        if var_name.isupper():
                            result.raw_variables.append({
                                "file":  file,
                                "name":  var_name,
                                "line":  node.start_point[0] + 1,
                                "value": get_node_text(val_node, source) if val_node else None
                            })

        for child in node.children:
            walk(child)

    walk(tree.root_node)


def extract_js_ts(ast_result: ASTResult, result: ExtractionResult):
    source = ast_result.source_code
    tree   = ast_result.tree
    file   = ast_result.relative_path

    def walk(node, current_class=None):

        # ── FUNCTION DECLARATIONS ─────────────────────────────
        if node.type in ('function_declaration', 'function'):
            name = get_node_text_by_type(node, 'identifier', source)
            if name:
                line_start = node.start_point[0] + 1
                line_end   = node.end_point[0] + 1
                params     = extract_js_params(node, source)
                is_async   = any(c.type == 'async' for c in node.children)

                result.raw_functions.append({
                    "file":         file,
                    "name":         name,
                    "line_start":   line_start,
                    "line_end":     line_end,
                    "parameters":   params,
                    "complexity":   calculate_complexity(node),
                    "loc":          line_end - line_start + 1,
                    "is_async":     is_async,
                    "parent_class": current_class
                })
                result.entity_registry[name] = file

                for child in node.children:
                    if child.type == 'statement_block':
                        walk_for_calls(child, name, file, source, result)

        # ── ARROW FUNCTIONS assigned to const ─────────────────
        elif node.type == 'lexical_declaration':
            for child in node.children:
                if child.type == 'variable_declarator':
                    name_node  = child.children[0] if child.children else None
                    value_node = child.children[-1] if len(child.children) > 1 else None
                    if name_node and value_node and value_node.type == 'arrow_function':
                        name = get_node_text(name_node, source)
                        line_start = node.start_point[0] + 1
                        line_end   = node.end_point[0] + 1
                        params     = extract_js_params(value_node, source)
                        is_async   = any(c.type == 'async' for c in value_node.children)

                        result.raw_functions.append({
                            "file":         file,
                            "name":         name,
                            "line_start":   line_start,
                            "line_end":     line_end,
                            "parameters":   params,
                            "complexity":   calculate_complexity(value_node),
                            "loc":          line_end - line_start + 1,
                            "is_async":     is_async,
                            "parent_class": current_class
                        })
                        result.entity_registry[name] = file

        # ── CLASS DECLARATIONS ────────────────────────────────
        elif node.type == 'class_declaration':
            name = get_node_text_by_type(node, 'identifier', source)
            if name:
                line_start = node.start_point[0] + 1
                line_end   = node.end_point[0] + 1
                inherits   = []

                for child in node.children:
                    if child.type == 'class_heritage':
                        for subchild in child.children:
                            if subchild.type == 'identifier':
                                parent = get_node_text(subchild, source)
                                inherits.append(parent)
                                result.raw_inheritance.append({
                                    "child":       name,
                                    "child_file":  file,
                                    "parent_name": parent
                                })

                methods = []
                for child in node.children:
                    if child.type == 'class_body':
                        for item in child.children:
                            if item.type == 'method_definition':
                                method_name = get_node_text_by_type(item, 'property_identifier', source)
                                if method_name:
                                    methods.append(method_name)

                result.raw_classes.append({
                    "file":       file,
                    "name":       name,
                    "line_start": line_start,
                    "line_end":   line_end,
                    "methods":    methods,
                    "inherits":   inherits,
                    "loc":        line_end - line_start + 1
                })
                result.entity_registry[name] = file

                for child in node.children:
                    if child.type == 'class_body':
                        for item in child.children:
                            walk(item, current_class=name)
                return

        # ── IMPORT STATEMENTS ─────────────────────────────────
        elif node.type == 'import_statement':
            from_module = None
            imported_names = []

            for child in node.children:
                if child.type == 'string':
                    from_module = get_node_text(child, source).strip('"\'')
                elif child.type == 'import_clause':
                    for subchild in child.children:
                        if subchild.type == 'identifier':
                            imported_names.append(get_node_text(subchild, source))
                        elif subchild.type == 'named_imports':
                            for item in subchild.children:
                                if item.type == 'import_specifier':
                                    n = get_node_text_by_type(item, 'identifier', source)
                                    if n:
                                        imported_names.append(n)

            for name in imported_names:
                result.raw_imports.append({
                    "importer_file": file,
                    "imported_name": name,
                    "from_module":   from_module or name
                })

        # ── GLOBAL VARIABLES (const/let at top level) ─────────
        elif node.type == 'lexical_declaration' and node.parent and node.parent.type == 'program':
            for child in node.children:
                if child.type == 'variable_declarator':
                    name_node = child.children[0] if child.children else None
                    val_node  = child.children[-1] if len(child.children) > 1 else None
                    if name_node and name_node.type == 'identifier':
                        var_name = get_node_text(name_node, source)
                        if var_name.isupper():
                            result.raw_variables.append({
                                "file":  file,
                                "name":  var_name,
                                "line":  node.start_point[0] + 1,
                                "value": get_node_text(val_node, source) if val_node else None
                            })

        for child in node.children:
            walk(child)

    walk(tree.root_node)


def extract_js_params(node, source: bytes) -> list[str]:
    params = []
    for child in node.children:
        if child.type == 'formal_parameters':
            for param in child.children:
                if param.type in ('identifier', 'required_parameter', 'optional_parameter'):
                    name = get_node_text_by_type(param, 'identifier', source)
                    if name:
                        params.append(name)
                    elif param.type == 'identifier':
                        params.append(get_node_text(param, source))
    return params


EXTRACTORS = {
    'python':     extract_python,
    'javascript': extract_js_ts,
    'typescript': extract_js_ts,
    'java':       extract_java,   # ← add this
    'c':          extract_c,      # ← add this
    'cpp':        extract_c,      # ← C++ uses same extractor for now
}


def run_checkpoint3(ast_results: list[ASTResult]) -> ExtractionResult:
    print(f"AIL CP3 | Extracting 6 attributes from {len(ast_results)} files...")

    result = ExtractionResult()

    for ast_result in ast_results:
        language  = ast_result.language
        extractor = EXTRACTORS.get(language)

        if not extractor:
            print(f"WARNING: No extractor for language '{language}' — skipping {ast_result.filename}")
            continue

        try:
            extractor(ast_result, result)
        except Exception as e:
            print(f"WARNING: Extraction failed for {ast_result.filename}: {e} — skipping")
            continue

    print(f"AIL CP3 | Extraction complete:")
    print(f"         Functions:   {len(result.raw_functions)}")
    print(f"         Classes:     {len(result.raw_classes)}")
    print(f"         Variables:   {len(result.raw_variables)}")
    print(f"         Func calls:  {len(result.raw_func_calls)}")
    print(f"         Imports:     {len(result.raw_imports)}")
    print(f"         Inheritance: {len(result.raw_inheritance)}")
    print(f"         ER entries:  {len(result.entity_registry)}")

    return result


# Defines an `EXTRACTORS` mapping that links each supported language key to its corresponding extraction function.

# It ensures CP3 calls the correct extractor per language, with Java, C, and C++ explicitly mapped (C++ currently reusing the C extractor).
