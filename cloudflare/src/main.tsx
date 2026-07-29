import React from "react";
import { createRoot } from "react-dom/client";
import MainApp from "../../app/page";
import "../../app/globals.css";
import { DomesticAdmin, DomesticLogin } from "./domestic-account";

const screen = location.pathname.startsWith("/admin")
  ? <DomesticAdmin />
  : location.pathname.startsWith("/login")
    ? <DomesticLogin />
    : <MainApp />;

createRoot(document.getElementById("root")!).render(<React.StrictMode>{screen}</React.StrictMode>);
