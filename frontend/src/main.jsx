import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App.jsx';
import './styles/app.css';
import './styles/shop.css';
import './styles/a11y.css';
import './styles/coursework.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);

// PWA: service worker регистрируем только в production, чтобы не мешать dev-серверу.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Офлайн-режим не критичен для отображения витрины.
    });
  });
}
