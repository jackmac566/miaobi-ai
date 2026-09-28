#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 v5 工作树推送到 GitHub（非破坏性）。

为什么不用 git push：
  本机网络环境下 git push (HTTPS) 持续 curl 55 / broken pipe，不可靠。
  改用 GitHub REST API 逐文件建 blob → 建 tree → 建 commit → 更新 ref，
  每次请求都带 Connection: close，稳定得多。

安全策略：
  - 用 base_tree 叠加，不删除仓库里已有的任何文件（main 上的 V1.5.0 原样保留）
  - 新提交以当前 main HEAD 为父，不用 force
  - 所有内容放在 v5/ 前缀下，随时可以整目录删掉回退

用法：
  python3 tools/push_to_github.py            # 推送
  python3 tools/push_to_github.py --dry-run  # 只列出将上传的文件
"""
import base64
import json
import os
import time
import subprocess
import sys
import tempfile
from pathlib import Path

OWNER = "jackmac566"
REPO = "miaobi-ai"
BRANCH = "main"
PREFIX = "v5"

ROOT = Path(__file__).resolve().parent.parent

INCLUDE = [
    "README.md",
    "build.py",
    "tools/gen_patches.py",
    "tools/push_to_github.py",
    "src/modules/lib/models.js",
    "src/modules/lib/catalog.js",
    "src/modules/lib/connection.js",
    "src/modules/lib/chat-api.js",
    "src/modules/lib/types.js",
    "src/modules/components/ApiSettings.js",
    "src/modules/components/Composer.js",
    "src/modules/components/ModelPicker.js",
    "src/modules/components/ThinkingPanel.js",
    "src/modules/components/ui/ProviderLogo.js",
    "tests/logic.test.mjs",
    "tests/ui.e2e.mjs",
    "docs/妙笔AI-v4.2-问题诊断报告.md",
    "docs/妙笔AI-v5-改造说明.md",
    "_src/miaobi-v4.2.html",
    "dist/miaobi-v5.html",
]


def collect():
    files = []
    for rel in INCLUDE:
        p = ROOT / rel
        if not p.exists():
            raise SystemExit(f"缺少文件：{rel}")
        files.append((rel, p))
    for d in ("src/patches", "docs/screenshots"):
        for p in sorted((ROOT / d).iterdir()):
            if p.is_file():
                files.append((p.relative_to(ROOT).as_posix(), p))
    return files


def gh(args, payload=None, jq=None):
    """带重试地调用 gh api。

    本机到 api.github.com 的 TLS 握手偶发超时（net/http: TLS handshake timeout），
    单次失败不代表请求有问题，所以这里做指数退避重试。
    注意：只重试「建立连接」类失败；4xx 业务错误直接抛出，不重试。
    """
    last = ""
    for attempt in range(5):
        cmd = ["gh", "api", "-H", "Connection: close"] + args
        path = None
        if payload is not None:
            with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False)
                path = f.name
            cmd += ["--input", path]
        if jq:
            cmd += ["--jq", jq]
        out = subprocess.run(cmd, capture_output=True, text=True)
        if path:
            try:
                os.unlink(path)
            except OSError:
                pass
        if out.returncode == 0:
            return out.stdout.strip()
        last = (out.stderr or "").strip()
        transient = any(k in last for k in ("TLS handshake timeout", "connection reset", "timeout", "EOF", "502", "503", "504"))
        if not transient or attempt == 4:
            break
        wait = 2 ** attempt
        print(f"  [重试 {attempt + 1}/4] {last.splitlines()[0][:90]} —— {wait}s 后重试")
        time.sleep(wait)
    raise SystemExit(f"gh 调用失败：{' '.join(args[:4])}\n{last}")


def main():
    files = collect()
    total = sum(p.stat().st_size for _, p in files)
    print(f"将推送 {len(files)} 个文件，共 {total:,} 字节，前缀 {PREFIX}/")
    for rel, p in files:
        print(f"  {p.stat().st_size:>9,}  {PREFIX}/{rel}")
    if "--dry-run" in sys.argv:
        return

    head = gh([f"repos/{OWNER}/{REPO}/git/ref/heads/{BRANCH}"], jq=".object.sha")
    print(f"\n当前 {BRANCH} HEAD：{head}")

    entries = []
    for rel, p in files:
        content = base64.b64encode(p.read_bytes()).decode("ascii")
        sha = gh([f"repos/{OWNER}/{REPO}/git/blobs", "-X", "POST"],
                 payload={"content": content, "encoding": "base64"}, jq=".sha")
        entries.append({"path": f"{PREFIX}/{rel}", "mode": "100644", "type": "blob", "sha": sha})
        print(f"  blob {sha[:8]}  {PREFIX}/{rel}")

    base = gh([f"repos/{OWNER}/{REPO}/git/commits/{head}"], jq=".tree.sha")
    tree = gh([f"repos/{OWNER}/{REPO}/git/trees", "-X", "POST"],
              payload={"base_tree": base, "tree": entries}, jq=".sha")
    print(f"\n新 tree：{tree}")

    message = (
        "feat(v5): 妙笔 AI v5 —— 换用真实模型身份，修掉两分钟延迟，接通联网与生图\n\n"
        "v5 以单文件 HTML 形态交付，同时补上了可复现的构建链路（v4.2 只有打包产物、没有源码）。\n\n"
        "修掉 v4.2 的三个核心问题：\n"
        "1. 回复慢：默认换了非免费档模型；推理文本改为实时流式显示（原来只发一个布尔标志位，\n"
        "   推理文字全部丢弃，导致模型思考期间界面长时间空白）；补上 max_tokens；\n"
        "   写作控制信息只在写作模式下携带；超时从 310s 降到 120s。\n"
        "2. 没有联网与生图：接入智谱 web_search 与 CogView。DeepSeek 官方接口本身没有这两项能力，\n"
        "   所以联网与画图需要配智谱 Key；只填 DeepSeek 时聊天正常，并会明确提示能力不可用。\n"
        "3. 模型身份造假：原先 ChatGPT / Claude 两个入口背后是同一个智谱模型（同一份配置的浅拷贝），\n"
        "   还会伪造出 GPT-6 Pro、GPT-5.6 sol 这类不存在的型号。现在界面名字就是实际发送的 Model ID，\n"
        "   并在设置、消息抬头、用量面板、导出内容里一致标注真实厂商。\n\n"
        "另外修掉：思考面板是死 UI（依赖直连模式下不存在的 summary.delta 事件）、\n"
        "换厂商会被写死的 glm- 正则挡住、费用估算依赖手填单价、残留的 qwen/历史 Claude 通道死代码。\n\n"
        "构建与测试：\n"
        "- build.py 会把基底 + src/modules + src/patches 拼成成品，含 4 道一致性校验\n"
        "- node tests/logic.test.mjs  → 66 项通过\n"
        "- node tests/ui.e2e.mjs      → 45 项通过（真实 Chromium，接口全 mock，自动截图）\n\n"
        "本轮非破坏性：文件都放在 v5/ 下，main 上原有的 V1.5.0 一行未动。"
    )
    commit = gh([f"repos/{OWNER}/{REPO}/git/commits", "-X", "POST"],
                payload={"message": message, "tree": tree, "parents": [head]}, jq=".sha")
    print(f"新 commit：{commit}")

    gh([f"repos/{OWNER}/{REPO}/git/refs/heads/{BRANCH}", "-X", "PATCH"],
       payload={"sha": commit, "force": False})
    print(f"\n已更新 {BRANCH} → {commit}")
    print(f"https://github.com/{OWNER}/{REPO}/tree/{BRANCH}/{PREFIX}")


if __name__ == "__main__":
    main()
