"use client";

import { useEffect, useState } from "react";
import { VERSION } from "../../lib/version";

/**
 * 自动更新检测：页面加载后立即检查一次，之后每 60 秒轮询 /api/health。
 * 一旦服务端发布新版本，就显示底部横幅，用户点击"立即更新"刷新到最新版，
 * 避免"最新版本已发布、用户还在用旧版"的问题。
 */
export default function UpdateChecker() {
  const [release, setRelease] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        const data = (await response.json().catch(() => null)) as { release?: string } | null;
        if (cancelled || !data || typeof data.release !== "string") return;
        if (data.release !== VERSION) setRelease(data.release);
      } catch {
        // 网络或接口暂时不可用时静默跳过，下一轮再试。
      }
    };
    check();
    const timer = setInterval(check, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const applyUpdate = () => {
    try {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistration().then(registration => registration?.update()).catch(() => undefined);
      }
    } catch {
      // 忽略 SW 更新失败，直接刷新页面同样能拿到最新内容。
    }
    location.reload();
  };

  if (!release || dismissed) return null;

  return (
    <div className="update-banner" role="status">
      <span>已发布新版本 {release}（当前 {VERSION}）</span>
      <button className="update-apply" onClick={applyUpdate}>立即更新</button>
      <button className="update-dismiss" aria-label="稍后提醒" onClick={() => setDismissed(true)}>稍后</button>
    </div>
  );
}
