"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type StandaloneNavigator = Navigator & { standalone?: boolean };

/**
 * 官网安装入口：
 * - Chrome/Edge/Android 等支持 beforeinstallprompt 的浏览器：点击直接弹出系统安装提示；
 * - iOS Safari 等不支持该事件的浏览器：展示“添加到主屏幕”图文指引；
 * - 已经以独立窗口运行（已安装）时不显示。
 */
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    // 挂载后一次性读取浏览器独立窗口状态；仅同步执行这一次，不参与后续渲染级联。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInstalled(
      window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as StandaloneNavigator).standalone === true,
    );

    const capture = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const markInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      setShowGuide(false);
    };
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", markInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  if (installed) return null;

  const startInstall = async () => {
    if (!deferredPrompt) {
      setShowGuide(true);
      return;
    }
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setInstalled(true);
      }
    } catch {
      setShowGuide(true);
    } finally {
      setDeferredPrompt(null);
    }
  };

  return (
    <>
      <button className="top-install" onClick={startInstall} title="安装到桌面，像 App 一样使用">
        安装到桌面
      </button>
      {showGuide && (
        <div className="install-guide" role="dialog" aria-label="安装到桌面指引" onClick={() => setShowGuide(false)}>
          <div className="install-guide-card" onClick={event => event.stopPropagation()}>
            <h2>把妙笔AI装到桌面</h2>
            <p><b>iPhone / iPad（Safari）</b>：点击底部“分享”按钮，选择“添加到主屏幕”。</p>
            <p><b>Android（Chrome / 系统浏览器）</b>：点击右上角菜单，选择“安装应用”或“添加到主屏幕”。</p>
            <p><b>电脑（Chrome / Edge）</b>：点击地址栏右侧的安装图标，或菜单中的“安装妙笔AI”。</p>
            <p className="install-guide-note">安装后像 App 一样从桌面打开，无需下载任何安装包。</p>
            <button onClick={() => setShowGuide(false)}>知道了</button>
          </div>
        </div>
      )}
    </>
  );
}
