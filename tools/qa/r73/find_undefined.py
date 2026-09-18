"""R73 read-only review helper #3: static undefined-global detector (symtable based).

For each .py under server/ (excluding .venv / backups), walk function scopes and report
names that are GLOBAL references but not defined at module level and not builtins.
These are runtime NameError candidates (like moments._visibility_allows).

Writes ASCII output to tools/qa/r73/undefined_globals.txt.
"""
import builtins
import os
import symtable
import sys

ROOT = "D:/\u4e0b\u8f7d\u7684\u6587\u4ef6/\u5b66\u4e60\u5de5\u4f5c\u53f0/server"
OUT = "D:/\u4e0b\u8f7d\u7684\u6587\u4ef6/\u5b66\u4e60\u5de5\u4f5c\u53f0/tools/qa/r73/undefined_globals.txt"
BUILTINS = set(dir(builtins))

SKIP_DIRS = {".venv", "__pycache__", "backups", "uploads", "data", "scripts"}


def module_defined_names(top):
    names = set()
    for sym in top.get_symbols():
        if sym.is_assigned() or sym.is_imported() or sym.is_namespace():
            names.add(sym.get_name())
    return names


def walk(table, module_names, out, path):
    for sym in table.get_symbols():
        if sym.is_namespace():
            try:
                namespaces = sym.get_namespaces()
            except ValueError:
                namespaces = []
            for ns in namespaces:
                walk(ns, module_names, out, path)
    # check this table's symbols
    for sym in table.get_symbols():
        if sym.is_global() and not sym.is_assigned() and not sym.is_imported():
            nm = sym.get_name()
            if nm not in module_names and nm not in BUILTINS:
                out.append("%s :: %s (in scope '%s')" % (path, nm, table.get_name()))


def main():
    out = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            if not fn.endswith(".py") or fn.endswith(".bak") or ".bak" in fn:
                continue
            path = os.path.join(dirpath, fn)
            try:
                src = open(path, encoding="utf-8").read()
                st = symtable.symtable(src, fn, "exec")
            except Exception as e:  # noqa: BLE001
                out.append("%s :: <parse error: %r>" % (path, e))
                continue
            mod_names = module_defined_names(st)
            walk(st, mod_names, out, path)
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write("\n".join(out) if out else "(none)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
