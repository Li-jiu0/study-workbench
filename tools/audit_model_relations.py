#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""一次性隐患普查：序列化/路由层是否访问了模型上不存在的关系/属性。

背景：本项目已多次出现「schemas/序列化层访问了模型上不存在的关系」这类 bug
（典型：schemas.note_detail 访问 Comment.author，但 Comment 模型没有 author 关系
→ 有评论的帖子 GET /api/notes/{id} 直接 500）。

本脚本做两件事：
  1) 运行时清单：导入 server/database.py，列出每个模型类的「列 + 关系」集合；
  2) 静态推断：用 AST 遍历 server/**.py，对形如 `X.rel.sub` 的三级属性访问，
     尽量推断 X 的模型类型；若该模型没有 rel 这个关系，则报「模型 → 缺失关系」。

用法（服务器上，注意用 PYTHONPATH 指向 server 目录）：
    python audit_model_relations.py /opt/study-workbench/server
"""
import ast
import os
import sys


def load_models_runtime(server_dir):
    """运行时：导入 database 模块，返回 {模型名: {关系名: (目标模型名, uselist)}} 与 {模型名: set(全部属性名)}。"""
    sys.path.insert(0, server_dir)
    import database as dbmod  # noqa: E402

    rels = {}
    attrs = {}
    for name, obj in vars(dbmod).items():
        if not isinstance(obj, type):
            continue
        if not hasattr(obj, "__mapper__"):
            continue
        if obj is dbmod.Base:
            continue
        col_names = {c.key for c in obj.__table__.columns}
        rel_map = {}
        for r in obj.__mapper__.relationships:
            try:
                target = r.mapper.class_.__name__
            except Exception:
                target = "?"
            rel_map[r.key] = (target, bool(r.uselist))
        attrs[name] = col_names | set(rel_map.keys())
        rels[name] = rel_map
    return rels, attrs


SCALAR_REL_HINTS = {"author", "note", "actor", "sender", "receiver", "owner",
                    "from_user", "to_user", "blocker", "blocked", "user", "parent"}


def load_models_ast(server_dir):
    """回退：不导入 SQLAlchemy，直接 AST 解析 database.py 提取「模型 → 列/关系」。"""
    db_path = os.path.join(server_dir, "database.py")
    with open(db_path, "r", encoding="utf-8") as fp:
        tree = ast.parse(fp.read(), db_path)
    rels, attrs = {}, {}
    for cls in [n for n in ast.walk(tree) if isinstance(n, ast.ClassDef)]:
        base_names = []
        for b in cls.bases:
            if isinstance(b, ast.Name):
                base_names.append(b.id)
            elif isinstance(b, ast.Attribute):
                base_names.append(b.attr)
        if "Base" not in base_names:
            continue
        cols, rel_map = set(), {}
        for stmt in cls.body:
            if not isinstance(stmt, ast.Assign) or not isinstance(stmt.targets[0], ast.Name):
                continue
            attr_name = stmt.targets[0].id
            val = stmt.value
            if not isinstance(val, ast.Call):
                continue
            fn = val.func
            fname = fn.id if isinstance(fn, ast.Name) else (fn.attr if isinstance(fn, ast.Attribute) else "")
            if fname == "Column":
                cols.add(attr_name)
            elif fname == "relationship":
                target = "?"
                if val.args and isinstance(val.args[0], ast.Constant):
                    target = str(val.args[0].value)
                uselist = None
                for kw in val.keywords:
                    if kw.arg == "uselist" and isinstance(kw.value, ast.Constant):
                        uselist = bool(kw.value.value)
                if uselist is None:
                    uselist = False if attr_name in SCALAR_REL_HINTS else attr_name.endswith("s")
                rel_map[attr_name] = (target, uselist)
        attrs[cls.name] = cols | set(rel_map.keys())
        rels[cls.name] = rel_map
    return rels, attrs


def load_models(server_dir):
    """优先运行时导入；失败（如本地 venv 缺 SQLAlchemy）则回退 AST 解析。"""
    try:
        rels, attrs = load_models_runtime(server_dir)
        print("[加载方式] 运行时导入 database 模块（SQLAlchemy 元数据）")
        return rels, attrs
    except Exception as e:  # noqa: BLE001
        print("[加载方式] 运行时导入失败（%s），回退 AST 静态解析 database.py" % type(e).__name__)
        return load_models_ast(server_dir)


CONTAINER_FUNCS = {"sorted", "list", "reversed", "tuple", "set"}

# 全局：函数名 → 返回注解里的模型名（如 `_visible_note(...) -> Note`）。
# 用于推断 `n = _visible_note(...)` 里的 n 就是 Note。
FUNC_RETURNS = {}


def collect_func_returns(paths):
    """扫描所有文件，收集「函数名 → 返回注解模型名」。"""
    out = {}
    for p in paths:
        try:
            with open(p, "r", encoding="utf-8") as fp:
                tree = ast.parse(fp.read(), p)
        except Exception:
            continue
        for fn in ast.walk(tree):
            if not isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            ann = fn.returns
            if isinstance(ann, ast.Name):
                out[fn.name] = ann.id
            elif isinstance(ann, ast.Constant) and isinstance(ann.value, str):
                out[fn.name] = ann.value
    return out


QUERY_PASSTHROUGH = {"filter", "filter_by", "order_by", "limit", "offset", "join",
                     "outerjoin", "group_by", "distinct", "options", "where", "having",
                     "scalars", "populate_existing"}


def _element_of(node, env, rels, attrs):
    """推断可迭代对象的「元素模型名」，推断不出返回 None。"""
    # 变量名
    if isinstance(node, ast.Name):
        t = env.get(node.id)
        if isinstance(t, tuple) and t and t[0] == "list":
            return t[1]
        return None
    # db.query(Model)....all() → 元素模型
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == "all":
        return infer_model(node.func.value, env, rels, attrs)
    # 形如 X.rel ：relationship 属性
    if isinstance(node, ast.Attribute):
        target = infer_model(node.value, env, rels, attrs)
        if target and target in rels:
            info = rels[target].get(node.attr)
            if info:
                return info[0]
        return None
    # 容器函数：sorted(x)/list(x)/reversed(x)/...
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in CONTAINER_FUNCS:
        if node.args:
            return _element_of(node.args[0], env, rels, attrs)
        return None
    # 切片 / 下标：取 value 的元素
    if isinstance(node, ast.Subscript):
        return _element_of(node.value, env, rels, attrs)
    return None


def infer_model(node, env, rels, attrs):
    """推断表达式 node 的「模型名」（单对象），推断不出返回 None。"""
    if isinstance(node, ast.Name):
        t = env.get(node.id)
        if isinstance(t, str):
            return t
        return None
    if isinstance(node, ast.Call):
        f = node.func
        # db.get(Model, id)
        if isinstance(f, ast.Attribute) and f.attr == "get" and node.args:
            a0 = node.args[0]
            if isinstance(a0, ast.Name) and a0.id in attrs:
                return a0.id
        # 已知「返回注解为某模型」的本地函数调用
        if isinstance(f, ast.Name) and f.id in FUNC_RETURNS and FUNC_RETURNS[f.id] in attrs:
            return FUNC_RETURNS[f.id]
        # db.query(Model)....first()/one()/get()
        if isinstance(f, ast.Attribute) and f.attr in ("first", "one", "one_or_none", "get"):
            return infer_model(f.value, env, rels, attrs)
        # SQLAlchemy 查询链透传：db.query(X).filter(...).order_by(...)... 仍是 X
        if isinstance(f, ast.Attribute) and f.attr in QUERY_PASSTHROUGH:
            return infer_model(f.value, env, rels, attrs)
        if isinstance(f, ast.Attribute) and f.attr == "query" and node.args:
            a0 = node.args[0]
            if isinstance(a0, ast.Name) and a0.id in attrs:
                return a0.id
    if isinstance(node, ast.Attribute):
        target = infer_model(node.value, env, rels, attrs)
        if target and target in rels:
            info = rels[target].get(node.attr)
            if info and not info[1]:  # 标量关系 → 目标模型
                return info[0]
    return None


def scan_file(path, rels, attrs):
    """静态扫描一个文件，返回 (问题列表, 命中列表)。
    问题列表：[ (行号, 变量, 模型, 缺失关系) ]
    命中列表：[ (行号, 变量, 模型, 关系) ] —— 所有成功推断出模型的 X.rel.* 链
    """
    try:
        with open(path, "r", encoding="utf-8") as fp:
            src = fp.read()
        tree = ast.parse(src, path)
    except Exception:
        return [], []

    problems = []
    hits = []
    for fn in ast.walk(tree):
        if not isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        env = {}
        # 参数注解 / 常见形参名提示
        for arg in list(fn.args.args) + list(fn.args.kwonlyargs):
            ann = arg.annotation
            if isinstance(ann, ast.Name) and ann.id in attrs:
                env[arg.arg] = ann.id
        # 先构建推断环境（多几轮，处理链式赋值）
        for _ in range(3):
            for node in ast.walk(fn):
                if isinstance(node, ast.Assign):
                    tgt = node.targets[0] if node.targets else None
                    if isinstance(tgt, ast.Name):
                        m = infer_model(node.value, env, rels, attrs)
                        if m:
                            env[tgt.id] = m
                            continue
                        el = _element_of(node.value, env, rels, attrs)
                        if el:
                            env[tgt.id] = ("list", el)
                elif isinstance(node, ast.For):
                    if isinstance(node.target, ast.Name):
                        el = _element_of(node.iter, env, rels, attrs)
                        if el:
                            env[node.target.id] = el
                elif isinstance(node, ast.comprehension):
                    # 列表/字典/集合/生成器推导式的 for 子句（如 [ {...} for c in page_rows ]）
                    if isinstance(node.target, ast.Name):
                        el = _element_of(node.iter, env, rels, attrs)
                        if el:
                            env[node.target.id] = el
        # 检查三级属性链 X.rel.sub
        for node in ast.walk(fn):
            if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Attribute):
                inner = node.value
                v = inner.value
                if not isinstance(v, ast.Name):
                    continue
                model = env.get(v.id)
                if not isinstance(model, str):
                    continue
                if model not in attrs:
                    continue
                hits.append((node.lineno, v.id, model, inner.attr))
                if inner.attr not in attrs[model]:
                    problems.append((node.lineno, v.id, model, inner.attr))
    return problems, hits


def main():
    server_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
    if os.path.basename(server_dir) != "server":
        # 允许传项目根：自动补 server
        cand = os.path.join(server_dir, "server")
        if os.path.isdir(cand):
            server_dir = cand
    rels, attrs = load_models(server_dir)

    print("=" * 60)
    print("模型关系清单（模型 → 关系）")
    print("=" * 60)
    for name in sorted(rels):
        if rels[name]:
            print("  %-16s %s" % (name, ", ".join(sorted(rels[name]))))

    targets = []
    for root, dirs, files in os.walk(server_dir):
        dirs[:] = [d for d in dirs if d not in (".venv", "__pycache__", "uploads", "scripts")]
        for f in files:
            if f.endswith(".py"):
                targets.append(os.path.join(root, f))

    global FUNC_RETURNS
    FUNC_RETURNS = collect_func_returns(targets)

    print("\n" + "=" * 60)
    print("静态扫描：疑似「模型缺关系」的属性链")
    print("=" * 60)
    total = 0
    hit_total = 0
    seen = set()
    verbose = "--verbose" in sys.argv or "-v" in sys.argv
    for p in sorted(targets):
        problems, hits = scan_file(p, rels, attrs)
        relpath = os.path.relpath(p, server_dir)
        for lineno, var, model, rel in hits:
            hit_total += 1
            if verbose:
                print("  · %s:%d  %s.%s.*  (模型 %s)" % (relpath, lineno, var, rel, model))
        for lineno, var, model, rel in problems:
            key = (relpath, lineno, var, model, rel)
            if key in seen:
                continue
            seen.add(key)
            total += 1
            print("  ⚠ %s:%d  %s.%s.*  →  模型 %s 缺少关系 '%s'" %
                  (relpath, lineno, var, rel, model, rel))
    if not total:
        print("  ✅ 未发现「模型缺关系」的属性链（所有推断到的 X.rel.* 关系均存在）")
    print("\n共推断命中 X.rel.* 链：%d 条；疑似问题：%d 条" % (hit_total, total))


if __name__ == "__main__":
    main()
