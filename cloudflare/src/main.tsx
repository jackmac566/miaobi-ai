import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import "../../app/globals.css";

const MainApp = lazy(() => import("../../app/page"));
const DomesticAdmin = lazy(() => import("./domestic-account").then(module => ({ default: module.DomesticAdmin })));
const DomesticLogin = lazy(() => import("./domestic-account").then(module => ({ default: module.DomesticLogin })));

const screen = location.pathname.startsWith("/admin")
  ? <DomesticAdmin />
  : location.pathname.startsWith("/login")
    ? <DomesticLogin />
    : <MainApp />;

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense fallback={<main className="domestic-admin-shell"><p>正在打开妙笔AI…</p></main>}>
      {screen}
    </Suspense>
  </React.StrictMode>,
);
