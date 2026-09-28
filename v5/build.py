#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
妙笔 AI v5 构建脚本
===================

把 _src/miaobi-v4.2.html 作为基底，用 src/modules/ 下的模块源码替换对应模块，
并在需要的位置做精确字符串补丁，产出 dist/miaobi-v5.html。

为什么要这么做：
  v4.2 只有一个 485KB 的打包产物，没有源码，改动无法追溯也无法回滚。
  这个脚本把「改什么」收敛到 src/ 目录下可读的文件里，
  任何一次改动都能 diff，也能一条命令重新产出成品。

用法：
  python3 build.py            # 构建
  python3 build.py --check    # 只校验（不写文件）
"""

import re
import sys
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BASE = ROOT / "_src" / "miaobi-v4.2.html"
MODDIR = ROOT / "src" / "modules"
PATCHDIR = ROOT / "src" / "patches"
OUT = ROOT / "dist" / "miaobi-v5.html"
NODE = "/Users/macjack622/.workbuddy/binaries/node/versions/22.22.2-3/bin/node"

MOD_HEAD = re.compile(r'^"([^"]+)":function\(module,exports,require\)\{\s*$')

# 模块替换过程中需要保证存在的关键标记（防止替换出错静默通过）
REQUIRED_MARKERS = [
    "https://api.deepseek.com",
    "https://open.bigmodel.cn/api/paas/v4",
    "deepseek-v4-flash",
    "reasoning.delta",
    "images/generations",
    # v5.1：场景必须真的进提示词，安全与合规标记必须在
    "buildWritingPrompt",
    "hasWritingIntent",
    "Content-Security-Policy",
    "safeHref",
    "AI 生成",
]


def split_modules(lines):
    """返回 [(模块名, 起始下标, 结束下标)]，下标为 0-based，结束下标不含。

    模块体一律以行首的 `},` 收尾（整个注册表是 `const modules={ ... }` 一个对象字面量）。
    所以结束边界取「模块头之后第一个行首为 `},` 的行」再 +1，
    而不是取下一个模块头——否则注册表里最后一个模块会连 loader 一起吃掉。
    """
    heads = []
    for i, l in enumerate(lines):
        m = MOD_HEAD.match(l)
        if m:
            heads.append((m.group(1), i))
    out = []
    for name, start in heads:
        end = None
        for j in range(start + 1, len(lines)):
            if lines[j] == "},":
                end = j + 1
                break
        if end is None:
            raise SystemExit("[split] 模块 %s 找不到结束标记，文件结构可能已损坏" % name)
        out.append((name, start, end))
    return out


def replace_modules(lines, mods):
    """用 src/modules/ 下的文件替换模块体。文件名 = 模块名 + '.js'。"""
    files = {}
    if MODDIR.exists():
        for p in sorted(MODDIR.rglob("*.js")):
            key = p.relative_to(MODDIR).with_suffix("").as_posix()
            files[key] = p

    if not files:
        return lines, []

    # 倒序处理，避免下标位移
    applied = []
    for name, start, end in reversed(mods):
        if name not in files:
            continue
        path = files[name]
        body = path.read_text(encoding="utf-8").rstrip("\n").split("\n")
        stop = end if end is not None else len(lines)
        lines = lines[:start] + body + lines[stop:]
        applied.append(name)

    return lines, sorted(applied)


def apply_patches(text):
    """src/patches/*.patch —— 每份文件用 ===== 分隔「待替换」与「替换为」。"""
    results = []
    if not PATCHDIR.exists():
        return text, results
    for p in sorted(PATCHDIR.glob("*.patch")):
        raw = p.read_text(encoding="utf-8")
        parts = raw.split("\n=====\n")
        if len(parts) != 2:
            raise SystemExit(f"[patch] {p.name} 格式错误：需要用单独一行 ===== 分隔两段")
        old, new = parts[0], parts[1]
        old = old.rstrip("\n")
        new = new.rstrip("\n")
        count = text.count(old)
        if count == 0:
            raise SystemExit(f"[patch] {p.name} 未匹配到目标内容，已中止（避免静默失效）")
        if count > 1:
            raise SystemExit(f"[patch] {p.name} 匹配到 {count} 处，需要更精确的上下文")
        text = text.replace(old, new, 1)
        results.append(f"{p.name}")
    return text, results


def check_script_syntax(text):
    """把内联模块脚本抽出来交给 node --check。

    为什么必须做：补丁是字符串级替换，多一个或少一个括号在构建阶段完全看不出来，
    要到打开页面才会白屏。这次改造就踩过一次（少一个右括号）。
    提脚本用「最后一个 <script> 到最后一个 </script>」——压缩后的 React bundle 里
    含裸字符串 "<script>"，用非贪婪正则会错位。
    """
    opens = [m.end() for m in re.finditer(r"<script>", text)]
    closes = [m.start() for m in re.finditer(r"</script>", text)]
    if not opens or not closes or closes[-1] < opens[-1]:
        return "跳过（没找到完整的脚本块）"
    code = text[opens[-1]:closes[-1]]
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as f:
        f.write(code)
        path = f.name
    try:
        out = subprocess.run([NODE, "--check", path], capture_output=True, text=True)
        if out.returncode != 0:
            first = (out.stderr or "").strip().split("\n")
            return "失败：" + " | ".join(first[:4])
        return None
    except FileNotFoundError:
        return "跳过（找不到 node）"
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


def main():
    check_only = "--check" in sys.argv

    if not BASE.exists():
        raise SystemExit(f"找不到基底文件：{BASE}")

    html = BASE.read_text(encoding="utf-8")
    # 保留原始换行风格：先按 \n 切
    lines = html.split("\n")
    mods = split_modules(lines)
    print(f"基底模块数：{len(mods)}")

    lines, applied = replace_modules(lines, mods)
    print(f"已替换模块（{len(applied)}）：")
    for a in applied:
        print(f"  - {a}")

    text = "\n".join(lines)
    text, patched = apply_patches(text)
    if patched:
        print(f"已应用补丁（{len(patched)}）：")
        for a in patched:
            print(f"  - {a}")

    # 校验
    mods2 = split_modules(text.split("\n"))
    if len(mods2) != len(mods):
        raise SystemExit(f"模块数量发生了变化：{len(mods)} -> {len(mods2)}，构建中止")
    print(f"构建后模块数：{len(mods2)}（一致）")

    missing = [m for m in REQUIRED_MARKERS if m not in text]
    if missing:
        print("警告：以下关键标记缺失，请确认是否忘了接线：")
        for m in missing:
            print(f"  ! {m}")
    else:
        print("关键标记全部存在")

    syntax = check_script_syntax(text)
    if syntax is None:
        print("内联脚本语法检查：通过")
    elif syntax.startswith("跳过"):
        print("内联脚本语法检查：" + syntax)
    else:
        raise SystemExit("内联脚本语法检查未通过，构建中止：\n  " + syntax)

    for bad in ("gpt6", "claude55", "GPT-6", "GPT-5.6", "ChatGPT"):
        if bad in text:
            print(f"警告：仍存在旧身份字符串 {bad!r}")

    if check_only:
        print("仅校验，未写文件。")
        return

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding="utf-8")
    size = OUT.stat().st_size
    print(f"已写出 {OUT}（{size:,} 字节）")


if __name__ == "__main__":
    main()
