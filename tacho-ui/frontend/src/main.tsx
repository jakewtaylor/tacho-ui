import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Route, Routes } from "react-router-dom";
import "./style.css";
import App from "./App";
import { Home } from "./pages/Home";
import { Overview } from "./pages/Overview";
import { DayPage } from "./pages/DayPage";
import { WeeksPage } from "./pages/WeeksPage";
import { PrintWeekPage } from "./pages/PrintWeekPage";
import { AppLayout } from "./layouts/app-layout";

const container = document.getElementById("root");
const root = createRoot(container!);

root.render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route element={<App />}>
          <Route element={<AppLayout />}>
            <Route index element={<Home />} />
            <Route path="driver/:cardNumber" element={<Overview />} />
            <Route path="driver/:cardNumber/weeks" element={<WeeksPage />} />
            <Route path="driver/:cardNumber/day/:date" element={<DayPage />} />
          </Route>

          <Route
            path="driver/:cardNumber/print/week/:weekStart"
            element={<PrintWeekPage />}
          />
        </Route>
      </Routes>
    </HashRouter>
  </React.StrictMode>,
);
