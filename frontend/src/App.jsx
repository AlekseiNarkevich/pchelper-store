import React from 'react';
import { Route, Routes } from 'react-router-dom';

import Footer from './components/Footer.jsx';
import Header from './components/Header.jsx';
import Builder from './pages/Builder.jsx';
import Cart from './pages/Cart.jsx';
import Catalog from './pages/Catalog.jsx';
import Diagnostics from './pages/Diagnostics.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import NotFound from './pages/NotFound.jsx';
import Prebuilt from './pages/Prebuilt.jsx';
import Product from './pages/Product.jsx';
import Profile from './pages/Profile.jsx';
import PsuCalculator from './pages/PsuCalculator.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import SavedBuilds from './pages/SavedBuilds.jsx';

/**
 * Каркас витрины: шапка, область страницы, подвал.
 * Тема синяя — та же, что выбрана в ЛР5 по результатам опроса.
 */
export default function App() {
  return (
    <div className="app-shell theme-blue">
      <a className="skip-link" href="#main">
        Перейти к содержимому
      </a>
      <Header />
      <main className="app-main" id="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/catalog" element={<Catalog />} />
          <Route path="/catalog/:category" element={<Catalog />} />
          <Route path="/product/:id" element={<Product />} />
          <Route path="/prebuilt" element={<Prebuilt />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/builder" element={<Builder />} />
          <Route path="/psu" element={<PsuCalculator />} />
          <Route path="/diagnostics" element={<Diagnostics />} />
          <Route path="/login" element={<Login />} />
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
      </main>
      <Footer />
    </div>
  );
}
