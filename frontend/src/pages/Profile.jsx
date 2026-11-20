import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { fetchMe, logout, onAuthChange, readAuth, updateProfile } from '../auth.js';

/** Подписи ролей для интерфейса. */
const ROLE_LABELS = {
  user: 'покупатель',
  manager: 'менеджер',
  admin: 'администратор',
};

/**
 * Профиль пользователя: имя, телефон, адрес доставки и выход.
 */
export default function Profile() {
  const [user, setUser] = useState(() => readAuth().user);
  const [form, setForm] = useState({ name: '', phone: '', address: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthChange(() => setUser(readAuth().user));
    fetchMe()
      .then((profile) => {
        if (!profile) return;
        setForm({
          name: profile.name || '',
          phone: profile.phone || '',
          address: profile.address || '',
        });
      })
      .catch((reason) => setError(reason.message));
    return unsubscribe;
  }, []);

  function changeField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSave(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    setSaving(true);
    try {
      const updated = await updateProfile(form);
      setUser(updated);
      setNotice('Профиль сохранён');
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  }

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
        {notice && (
          <div className="state success" role="status">
            {notice}
          </div>
        )}

        {user ? (
          <>
            <p>
              <strong>{user.name || user.email}</strong>
            </p>
            <p className="muted">{user.email}</p>
            <p className="muted">
              Роль: {ROLE_LABELS[user.role] || user.role}
            </p>

            <form className="auth-form" onSubmit={handleSave}>
              <label className="field">
                <span>Имя</span>
                <input
                  autoComplete="name"
                  name="name"
                  onChange={changeField}
                  required
                  type="text"
                  value={form.name}
                />
              </label>

              <label className="field">
                <span>Телефон</span>
                <input
                  autoComplete="tel"
                  name="phone"
                  onChange={changeField}
                  placeholder="+375 29 000-00-00"
                  type="tel"
                  value={form.phone}
                />
              </label>

              <label className="field">
                <span>Адрес доставки</span>
                <input
                  autoComplete="street-address"
                  name="address"
                  onChange={changeField}
                  placeholder="Минск, ул. Примерная, 1"
                  type="text"
                  value={form.address}
                />
              </label>

              <button className="btn" disabled={saving} type="submit">
                {saving ? 'Сохраняем…' : 'Сохранить профиль'}
              </button>
            </form>

            <button className="btn btn-secondary" onClick={handleLogout} type="button">
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
