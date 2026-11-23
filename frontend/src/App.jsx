/**
 * PCHelper — корневой компонент и маршруты приложения.
 *
 * Общая шапка и подвал остаются на всех страницах; личные и админские
 * маршруты закрыты RequireAuth/RequireAdmin. Здесь же обновляется
 * состояние пользователя после входа, выхода и смены профиля.
 */

/* global __PCH_BUILD__ */

import React, { useEffect, useState } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import Footer from './components/Footer.jsx';
import Header from './components/Header.jsx';
import Admin from './pages/Admin.jsx';
import Builder from './pages/Builder.jsx';
import Cart from './pages/Cart.jsx';
import Catalog from './pages/Catalog.jsx';
import Checkout from './pages/Checkout.jsx';
import Diagnostics from './pages/Diagnostics.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import NotFound from './pages/NotFound.jsx';
import Orders from './pages/Orders.jsx';
import Prebuilt from './pages/Prebuilt.jsx';
import Product from './pages/Product.jsx';
import Profile from './pages/Profile.jsx';
import PsuCalculator from './pages/PsuCalculator.jsx';
import RequireAdmin from './components/RequireAdmin.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import SavedBuilds from './pages/SavedBuilds.jsx';
import { mergeCartWithServer } from './cart.js';
import { readAuth, resetAuth } from './auth.js';
import { onError } from './errorBus.js';

/**
 * Показывает понятное сообщение вместо белого экрана, если React
 * не смог отрисовать страницу.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="container">
          <div className="state error" role="alert">
            <h1 className="h2">Что-то пошло не так</h1>
            <p>{this.state.error.message}</p>
            <button
              className="btn"
              onClick={() => window.location.reload()}
              type="button"
            >
              Обновить страницу
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Каркас витрины: шапка, область страницы, подвал.
 * Тема синяя — та же, что выбрана в ЛР5 по результатам опроса.
 */
export default function App() {
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // В desktop-приложении сессия привязана к конкретной сборке и режиму.
    // При установке новой версии или переходе Portable ↔ Setup показываем
    // вход: старая сессия администратора не должна открываться автоматически.
    // Внутри одной сборки повторный вход не требуется.
    if (!window.pchelperDesktop) return;

    const buildId = typeof __PCH_BUILD__ !== 'undefined' ? __PCH_BUILD__ : 'dev';
    const mode = window.pchelperDesktop.mode || 'installed';
    const buildKey = 'pchelper-desktop-build';
    const modeKey = 'pchelper-desktop-mode';
    const storedBuild = localStorage.getItem(buildKey);
    const storedMode = localStorage.getItem(modeKey);
    const hasAuth = Boolean(readAuth().accessToken);

    const isNewBuild = storedBuild !== buildId;
    const isNewMode = storedMode !== mode;

    if (isNewBuild || isNewMode) {
      resetAuth();
      localStorage.setItem(buildKey, buildId);
      localStorage.setItem(modeKey, mode);
      navigate('/login', { replace: true });
      return;
    }

    if (!hasAuth && location.pathname === '/') {
      navigate('/login', { replace: true });
    }
    // Проверяем только при старте приложения.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let timer;

    const unsubscribe = onError((event) => {
      setError(event.detail.message);
      clearTimeout(timer);
      timer = setTimeout(() => setError(''), 7000);
    });

    if (readAuth().accessToken) {
      void mergeCartWithServer();
    }

    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className="app-shell theme-blue">
      <a className="skip-link" href="#main">
        Перейти к содержимому
      </a>
      <Header />
      <main className="app-main" id="main">
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/catalog" element={<Catalog />} />
            <Route path="/catalog/:category" element={<Catalog />} />
            <Route path="/product/:id" element={<Product />} />
            <Route path="/prebuilt" element={<Prebuilt />} />
            <Route path="/cart" element={<Cart />} />
            <Route
              path="/checkout"
              element={
                <RequireAuth>
                  <Checkout />
                </RequireAuth>
              }
            />
            <Route
              path="/orders"
              element={
                <RequireAuth>
                  <Orders />
                </RequireAuth>
              }
            />
            <Route path="/builder" element={<Builder />} />
            <Route path="/psu" element={<PsuCalculator />} />
            <Route path="/diagnostics" element={<Diagnostics />} />
            <Route
              path="/admin"
              element={
                <RequireAdmin>
                  <Admin />
                </RequireAdmin>
              }
            />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Login initialMode="register" />} />
            <Route
              path="/builds"
              element={
                <RequireAuth>
                  <SavedBuilds />
                </RequireAuth>
              }
            />
            <Route
              path="/profile"
              element={
                <RequireAuth>
                  <Profile />
                </RequireAuth>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ErrorBoundary>
      </main>
      <Footer />
      {error && (
        <div className="error-toast" role="alert">
          <span>{error}</span>
          <button aria-label="Закрыть" onClick={() => setError('')} type="button">
            ×
          </button>
        </div>
      )}
    </div>
  );
}
