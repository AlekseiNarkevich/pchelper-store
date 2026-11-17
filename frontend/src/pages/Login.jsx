import React from 'react';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { login, register } from '../auth.js';

/**
 * Страница входа и регистрации (ЛР8).
 */
export default function Login() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('demo@pchelper.by');
  const [password, setPassword] = useState('demo1234');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/';

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'register') {
        await register({ email, password, name });
      } else {
        await login({ email, password });
      }
      navigate(from, { replace: true });
    } catch (reason) {
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  }

  function switchMode() {
    setMode((current) => (current === 'login' ? 'register' : 'login'));
    setError('');
  }

  return (
    <div className="container auth-page">
      <div className="auth-card">
        <h1>{mode === 'login' ? 'Вход в PCHelper' : 'Регистрация'}</h1>
        <p className="muted">
          {mode === 'login'
            ? 'Войдите, чтобы сохранять сборки и оформлять заказы.'
            : 'Создайте аккаунт для оформления заказов.'}
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
