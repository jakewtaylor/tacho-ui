import React from "react";
import { createRoot } from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";

import "./style.css";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { importAction, importFromPathAction, wipeAction } from "./actions";
import { AppLayout } from "./layouts/app-layout";
import { driverLoader, layoutLoader } from "./loaders";
import { DayPage } from "./pages/DayPage";
import { Home } from "./pages/Home";
import { Overview } from "./pages/Overview";
import { PrintWeekPage } from "./pages/PrintWeekPage";
import { RouteError } from "./pages/RouteError";
import { WeeksPage } from "./pages/WeeksPage";

const router = createHashRouter([
  {
    id: "layout",
    element: <AppLayout />,
    loader: layoutLoader,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Home /> },
      { path: "import", action: importAction },
      { path: "import-from-path", action: importFromPathAction },
      { path: "wipe", action: wipeAction },
      {
        path: "driver/:cardNumber",
        id: "driver",
        loader: driverLoader,
        children: [
          { index: true, element: <Overview /> },
          { path: "weeks", element: <WeeksPage /> },
          { path: "day/:date", element: <DayPage /> },
        ],
      },
    ],
  },
  {
    path: "driver/:cardNumber/print/week/:weekStart",
    id: "print-driver",
    loader: driverLoader,
    element: <PrintWeekPage />,
    errorElement: <RouteError />,
  },
]);

const container = document.getElementById("root");
const root = createRoot(container!);

root.render(
  <React.StrictMode>
    <TooltipProvider>
      <RouterProvider router={router} />
      <Toaster position="bottom-right" />
    </TooltipProvider>
  </React.StrictMode>,
);
