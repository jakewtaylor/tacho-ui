import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Route, Routes } from 'react-router-dom';
import './style.css';
import App from './App';
import { Overview } from './pages/Overview';
import { DayPage } from './pages/DayPage';
import { WeeksPage } from './pages/WeeksPage';
import { PrintWeekPage } from './pages/PrintWeekPage';

const container = document.getElementById('root');
const root = createRoot(container!);

root.render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route element={<App />}>
          <Route index element={<Overview />} />
          <Route path="weeks" element={<WeeksPage />} />
          <Route path="day/:date" element={<DayPage />} />
          <Route path="print/week/:weekStart" element={<PrintWeekPage />} />
        </Route>
      </Routes>
    </HashRouter>
  </React.StrictMode>
);
