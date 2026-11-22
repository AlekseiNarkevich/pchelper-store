/**
 * PCHelper — Личный кабинет: профиль покупателя, последние сборки,
 * быстрые действия и удаление аккаунта с подтверждением.
 */

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { money } from '../api.js';
import {
  deleteMyAccount,
  fetchMe,
  logout,
  onAuthChange,
  readAuth,
  updateProfile,
} from '../auth.js';
import { listBuilds } from '../builds.js';
import { useAutoRefresh } from '../useAutoRefresh.js';
import { clearLocalCart } from '../cart.js';

/** Подписи ролей для интерфейса. */
const ROLE_LABELS = {
  user: 'покупатель',
  manager: 'менеджер',
  admin: 'администратор',
};

/**
 * Личный кабинет: профиль, сохранённые сборки и быстрые действия.
 *
 * Двухколоночный макет использует ширину экрана: слева форма профиля,
 * справа — сборки и сервисы подбора.
 */
export default function Profile() {
  const [user, setUser] = useState(() => readAuth().user);
  const [form, setForm] = useState({ name: '', phone: '', address: '' });
  const [builds, setBuilds] = useState([]);
  const [buildsLoading, setBuildsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Профиль и последние сборки загружаются параллельно.
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

    listBuilds()
      .then((data) => setBuilds(data.items.slice(0, 4)))
      .catch(() => setBuilds([]))
      .finally(() => setBuildsLoading(false));

    return unsubscribe;
  }, []);

  // Форму профиля не трогаем, чтобы не стереть ввод. Обновляем только
  // последние сборки: они могли измениться в конфигураторе.
  useAutoRefresh(() => {
    listBuilds()
      .then((data) => setBuilds(data.items.slice(0, 4)))
      .catch(() => {});
  });

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
    clearLocalCart();
    navigate('/');
  }

  async function handleDeleteAccount() {
    // Два подтверждения: случайное нажатие не должно удалять аккаунт.
    const confirmed = window.confirm(
      'Удалить аккаунт? Профиль, корзина и сборки будут удалены, вход станет невозможен.',
    );
    if (!confirmed) return;
    const typed = window.prompt('Введите УДАЛИТЬ для подтверждения');
    if (typed !== 'УДАЛИТЬ') return;

    try {
      await deleteMyAccount();
      clearLocalCart();
      navigate('/');
    } catch (reason) {
      setError(reason.message);
    }
  }

  return (
    <div className="container profile-page">
      <div className="profile-grid">
        <section className="auth-card profile-card">
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
              <p className="muted">Роль: {ROLE_LABELS[user.role] || user.role}</p>

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

              <button
                className="btn btn-secondary"
                onClick={handleLogout}
                type="button"
              >
                Выйти
              </button>

              {user.role !== 'admin' && (
                <div className="danger-zone">
                  <div className="h3">Удаление аккаунта</div>
                  <p className="muted">
                    Профиль, корзина и сохранённые сборки будут удалены. Заказы
                    останутся обезличенными, войти в аккаунт больше не получится.
                  </p>
                  <button
                    className="btn btn-danger"
                    onClick={handleDeleteAccount}
                    type="button"
                  >
                    Удалить аккаунт
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="muted">Загружаем профиль…</p>
          )}
        </section>

        <aside className="profile-side">
          <section className="profile-panel">
            <div className="panel-head">
              <h2>Мои сборки</h2>
              <Link className="small" to="/builds">
                Все сборки →
              </Link>
            </div>

            {buildsLoading ? (
              <p className="muted">Загружаем сборки…</p>
            ) : builds.length > 0 ? (
              <ul className="profile-builds">
                {builds.map((build) => (
                  <li key={build.id}>
                    <div>
                      <Link to="/builds">{build.name}</Link>
                      <div className="small faint">
                        {build.updatedAt
                          ? new Date(build.updatedAt).toLocaleDateString('ru-RU')
                          : ''}
                      </div>
                    </div>
                    <strong>{money(build.total)}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">
                Пока нет сохранённых сборок. Соберите первый ПК — он появится здесь и на
                странице «Мои сборки».
              </p>
            )}

            <Link className="btn" to="/builder">
              Собрать новый ПК
            </Link>
          </section>

          <div className="profile-panels">
            <section className="profile-panel">
              <h2>Быстрые действия</h2>
              <div className="profile-actions">
                <Link className="btn btn-secondary" to="/orders">
                  Мои заказы
                </Link>
                <Link className="btn btn-secondary" to="/psu">
                  Калькулятор БП
                </Link>
                <Link className="btn btn-secondary" to="/diagnostics">
                  Диагностика
                </Link>
                <Link className="btn btn-secondary" to="/prebuilt">
                  Готовые сборки
                </Link>
                <Link className="btn btn-secondary" to="/catalog">
                  Каталог
                </Link>
              </div>
            </section>

            <section className="profile-panel">
              <h2>Данные аккаунта</h2>
              <dl className="profile-data">
                <div>
                  <dt>Электронная почта</dt>
                  <dd>{user?.email || '—'}</dd>
                </div>
                <div>
                  <dt>Телефон</dt>
                  <dd>{form.phone || 'не указан'}</dd>
                </div>
                <div>
                  <dt>Адрес доставки</dt>
                  <dd>{form.address || 'не указан'}</dd>
                </div>
              </dl>
            </section>
          </div>
        </aside>
      </div>
    </div>
  );
}
