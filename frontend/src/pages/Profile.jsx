import React from 'react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { fetchMe, logout, onAuthChange, readAuth } from '../auth.js';

/**
 * Профиль пользователя и выход (ЛР8).
 */
export default function Profile() {
  const [user, setUser] = useState(() => readAuth().user);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthChange(() => setUser(readAuth().user));
    fetchMe().catch((reason) => setError(reason.message));
    return unsubscribe;
  }, []);

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  return (
    <div className="container auth-page">
      <div className="auth-card">
        <h1>Личный кабинет</h1>
        {error && (
          <div className="state error" role="alert">
            {error}
          </div>
        )}
        {user ? (
          <>
            <p>
              <strong>{user.name || user.email}</strong>
            </p>
            <p className="muted">{user.email}</p>
            <p className="muted">Роль: {user.role}</p>
            <button className="btn" onClick={handleLogout} type="button">
              Выйти
            </button>
          </>
        ) : (
          <p className="muted">Загружаем профиль…</p>
        )}
      </div>
    </div>
  );
}
