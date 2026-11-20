import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { login, readAuth, register } from '../auth.js';
import { mergeCartWithServer } from '../cart.js';

/**
 * Страница входа и регистрации.
 *
 * При регистрации сразу запрашиваются имя, телефон и адрес доставки:
 * они сохраняются в профиле Supabase и подставляются при оформлении заказа.
 */
export default function Login() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('demo@pchelper.by');
  const [password, setPassword] = useState('demo1234');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/';

  // Авторизованному пользователю не показываем форму входа (дефект LR9-03).
  useEffect(() => {
    const auth = readAuth();
    if (auth.accessToken) {
      navigate(auth.user?.role === 'admin' ? '/admin' : from, { replace: true });
    }
  }, [from, navigate]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result =
        mode === 'register'
          ? await register({ email, password, name, phone, address })
          : await login({ email, password });

      void mergeCartWithServer();
      navigate(result.user.role === 'admin' ? '/admin' : from, {
        replace: true,
      });
    } catch (reason) {
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  }

  function switchMode() {
    const next = mode === 'login' ? 'register' : 'login';
    setMode(next);
    setError('');
    // Демо-доступ относится только к входу: в регистрации он мешает,
    // потому что e-mail уже занят.
    if (next === 'register') {
      setEmail('');
      setPassword('');
    } else {
      setEmail('demo@pchelper.by');
      setPassword('demo1234');
    }
  }

  return (
    <div className="container auth-page">
      <div className="auth-card">
        <h1>{mode === 'login' ? 'Вход в PCHelper' : 'Регистрация'}</h1>
        <p className="muted">
          {mode === 'login'
            ? 'Войдите, чтобы сохранять сборки и оформлять заказы.'
            : 'Создайте аккаунт: имя, телефон и адрес сохранятся в профиле.'}
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'register' && (
            <label className="field">
              <span>Имя</span>
              <input
                autoComplete="name"
                name="name"
                onChange={(event) => setName(event.target.value)}
                placeholder="Как к вам обращаться"
                type="text"
                value={name}
              />
            </label>
          )}

          <label className="field">
            <span>Электронная почта</span>
            <input
              autoComplete="email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              required
              type="email"
              value={email}
            />
          </label>

          <label className="field">
            <span>Пароль</span>
            <input
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={6}
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Не менее 6 символов"
              required
              type="password"
              value={password}
            />
          </label>

          {mode === 'register' && (
            <>
              <label className="field">
                <span>Телефон</span>
                <input
                  autoComplete="tel"
                  name="phone"
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="+375 29 000-00-00"
                  type="tel"
                  value={phone}
                />
              </label>

              <label className="field">
                <span>Адрес доставки</span>
                <input
                  autoComplete="street-address"
                  name="address"
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="Минск, ул. Примерная, 1"
                  type="text"
                  value={address}
                />
              </label>
            </>
          )}

          {error && (
            <div className="state error" role="alert">
              {error}
            </div>
          )}

          <button className="btn" disabled={loading} type="submit">
            {loading ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
          </button>
        </form>

        <p className="auth-switch">
          {mode === 'login' ? 'Нет аккаунта?' : 'Уже есть аккаунт?'}{' '}
          <button className="link-button" onClick={switchMode} type="button">
            {mode === 'login' ? 'Зарегистрироваться' : 'Войти'}
          </button>
        </p>

        {mode === 'login' && (
          <p className="auth-hint">
            Демо-доступ: <code>demo@pchelper.by</code> / <code>demo1234</code>
          </p>
        )}

        <p>
          <Link to="/">← Вернуться в каталог</Link>
        </p>
      </div>
    </div>
  );
}
