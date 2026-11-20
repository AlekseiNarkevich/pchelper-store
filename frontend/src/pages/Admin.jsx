import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { getCategories, money } from '../api.js';
import { readAuth } from '../auth.js';
import {
  createProduct,
  deleteProduct,
  getOrderPositions,
  getOrders,
  getProducts,
  getReviews,
  getSummary,
  getUsers,
  moderateReview,
  updateOrder,
  updateProduct,
  updateUser,
} from '../admin.js';

/** Поля товаров по категориям: [имя поля, тип]. */
const PRODUCT_FIELDS = {
  cpu: [
    ['название', 'text'],
    ['производитель', 'text'],
    ['сокет', 'text'],
    ['ядра_потоки', 'json'],
    ['частота', 'json'],
    ['tdp', 'number'],
    ['встроенная_графика', 'text'],
    ['поддержка_памяти', 'text'],
    ['цена', 'number'],
    ['фото_url', 'text'],
  ],
  motherboard: [
    ['название', 'text'],
    ['сокет', 'text'],
    ['тип_памяти', 'text'],
    ['форм_фактор', 'text'],
    ['чипсет', 'text'],
    ['фазы_питания', 'text'],
    ['макс_объем_памяти', 'number'],
    ['m2_слоты', 'number'],
    ['sata_порты', 'number'],
    ['цена', 'number'],
    ['фото_url', 'text'],
  ],
  ram: [
    ['название', 'text'],
    ['объем', 'number'],
    ['частота', 'number'],
    ['тип', 'text'],
    ['профили_разгона', 'boolean'],
    ['тайминги', 'text'],
    ['цена', 'number'],
    ['фото_url', 'text'],
  ],
  gpu: [
    ['название', 'text'],
    ['производитель', 'text'],
    ['объем_памяти', 'number'],
    ['длина', 'number'],
    ['tdp', 'number'],
    ['количество_вентиляторов', 'number'],
    ['толщина_в_слотах', 'number'],
    ['цена', 'number'],
    ['фото_url', 'text'],
  ],
  psu: [
    ['название', 'text'],
    ['мощность_в_ваттах', 'number'],
    ['стандарт_блока_питания', 'text'],
    ['сертификат_80plus', 'text'],
    ['сертификат_cybenetics', 'text'],
    ['модульный', 'boolean'],
    ['pcie_gen5', 'boolean'],
    ['количество_pcie', 'number'],
    ['количество_cpu', 'number'],
    ['количество_sata', 'number'],
    ['цена', 'number'],
    ['фото_url', 'text'],
  ],
  storage: [
    ['название', 'text'],
    ['объем_в_гб', 'number'],
    ['тип', 'text'],
    ['интерфейс', 'text'],
    ['скорость_чтения_записи', 'json'],
    ['драм_буфер', 'boolean'],
    ['радиатор_охлаждения', 'boolean'],
    ['цена', 'number'],
    ['фото_url', 'text'],
  ],
  case: [
    ['название', 'text'],
    ['форм_фактор', 'text'],
    ['макс_длина_gpu', 'number'],
    ['макс_высота_кулера', 'number'],
    ['поддержка_сжо', 'boolean'],
    ['макс_длина_радиатора', 'number'],
    ['вентиляторы_в_комплекте', 'text'],
    ['цена', 'number'],
    ['фото_url', 'text'],
  ],
  cooling: [
    ['название', 'text'],
    ['тип', 'text'],
    ['tdp', 'number'],
    ['высота', 'number'],
    ['длина_радиатора', 'number'],
    ['шум_макс', 'number'],
    ['цена', 'number'],
    ['фото_url', 'text'],
  ],
};

/** Статусы заказа. */
const ORDER_STATUSES = [
  'Новый',
  'В обработке',
  'Собран',
  'Готов к выдаче',
  'Отправлен',
  'Доставлен',
  'Завершён',
  'Отменён',
];

/**
 * Административная панель: заказы, товары, пользователи, отзывы.
 */
export default function Admin() {
  const [tab, setTab] = useState('orders');
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    getSummary()
      .then(setSummary)
      .catch((reason) => setError(reason.message));
  }, []);

  function flash(message) {
    setNotice(message);
    setError('');
    setTimeout(() => setNotice(''), 4000);
  }

  return (
    <div className="container admin-page">
      <div className="builder-head">
        <div>
          <div className="h1" style={{ fontSize: 26 }}>
            Администрирование
          </div>
          <div className="sub">Заказы, товары, пользователи и отзывы</div>
        </div>
        <Link className="btn btn-secondary" to="/">
          Вернуться в магазин
        </Link>
      </div>

      {summary && (
        <div className="admin-summary">
          <div>
            <span>Заказы</span>
            <strong>{summary.orders}</strong>
          </div>
          <div>
            <span>Товары</span>
            <strong>{summary.products}</strong>
          </div>
          <div>
            <span>Пользователи</span>
            <strong>{summary.users}</strong>
          </div>
          <div>
            <span>Отзывы на модерации</span>
            <strong>{summary.pendingReviews}</strong>
          </div>
        </div>
      )}

      {error && (
        <div className="state error" role="alert">
          {error}
        </div>
      )}
      {notice && <div className="state success">{notice}</div>}

      <div className="admin-tabs" role="tablist">
        {[
          ['orders', 'Заказы'],
          ['products', 'Товары'],
          ['users', 'Пользователи'],
          ['reviews', 'Отзывы'],
        ].map(([key, label]) => (
          <button
            aria-selected={tab === key}
            className={`admin-tab${tab === key ? ' is-on' : ''}`}
            key={key}
            onClick={() => setTab(key)}
            role="tab"
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'orders' && <OrdersPanel onError={setError} onFlash={flash} />}
      {tab === 'products' && <ProductsPanel onError={setError} onFlash={flash} />}
      {tab === 'users' && <UsersPanel onError={setError} onFlash={flash} />}
      {tab === 'reviews' && <ReviewsPanel onError={setError} onFlash={flash} />}
    </div>
  );
}

/** Заказы и статусы. */
function OrdersPanel({ onError, onFlash }) {
  const [orders, setOrders] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [positions, setPositions] = useState({});

  useEffect(() => {
    getOrders()
      .then((data) => setOrders(data.items))
      .catch((reason) => onError(reason.message));
  }, [onError]);

  function draft(order) {
    return (
      drafts[order.id] || {
        status: order.status,
        track: order.track,
        comment: order.managerComment,
      }
    );
  }

  function change(order, field, value) {
    setDrafts((current) => ({
      ...current,
      [order.id]: { ...draft(order), [field]: value },
    }));
  }

  async function save(order) {
    try {
      await updateOrder(order.id, draft(order));
      const data = await getOrders();
      setOrders(data.items);
      onFlash(`Заказ ${order.number} обновлён`);
    } catch (reason) {
      onError(reason.message);
    }
  }

  async function confirmOrder(order) {
    try {
      await updateOrder(order.id, {
        status: 'В обработке',
        comment: 'Заказ подтверждён администратором',
      });
      const data = await getOrders();
      setOrders(data.items);
      onFlash(`Заказ ${order.number} подтверждён`);
    } catch (reason) {
      onError(reason.message);
    }
  }

  async function togglePositions(order) {
    if (positions[order.id]) {
      setPositions((current) => ({ ...current, [order.id]: null }));
      return;
    }
    try {
      const data = await getOrderPositions(order.id);
      setPositions((current) => ({ ...current, [order.id]: data.items }));
    } catch (reason) {
      onError(reason.message);
    }
  }

  if (!orders.length) return <div className="state">Заказов пока нет.</div>;

  return (
    <div className="admin-list">
      {orders.map((order) => (
        <article className="admin-order" key={order.id}>
          <header>
            <div>
              <h3>Заказ {order.number}</h3>
              <div className="small faint">
                {order.userName} · {order.userEmail} · {order.phone}
              </div>
              <div className="small faint">
                {new Date(order.createdAt).toLocaleString('ru-RU')} ·{' '}
                {order.positionsCount} позиций
              </div>
            </div>
            <strong>{money(order.total)}</strong>
          </header>

          <div className="admin-order-grid">
            <label className="field">
              <span>Статус</span>
              <select
                onChange={(event) => change(order, 'status', event.target.value)}
                value={draft(order).status}
              >
                {ORDER_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Трек-номер</span>
              <input
                onChange={(event) => change(order, 'track', event.target.value)}
                type="text"
                value={draft(order).track || ''}
              />
            </label>
            <label className="field">
              <span>Комментарий менеджера</span>
              <input
                onChange={(event) => change(order, 'comment', event.target.value)}
                type="text"
                value={draft(order).comment || ''}
              />
            </label>
            <div className="admin-actions">
              {order.status === 'Новый' && (
                <button
                  className="btn"
                  onClick={() => confirmOrder(order)}
                  type="button"
                >
                  Подтвердить заказ
                </button>
              )}
              <button className="btn" onClick={() => save(order)} type="button">
                Сохранить
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => togglePositions(order)}
                type="button"
              >
                {positions[order.id] ? 'Скрыть состав' : 'Состав'}
              </button>
            </div>
          </div>

          <div className="small faint">
            Доставка: {order.deliveryMethod === 'pickup' ? 'самовывоз' : 'курьер'}
            {order.deliveryZone ? ` (${order.deliveryZone})` : ''}
            {order.address ? `, ${order.address}` : ''}. Оплата: {order.paymentMethod}.
            Доставка: {money(order.deliveryCost)}.
          </div>

          {positions[order.id] && (
            <table className="picker">
              <thead>
                <tr>
                  <th>Товар</th>
                  <th>Количество</th>
                  <th>Сумма</th>
                </tr>
              </thead>
              <tbody>
                {positions[order.id].map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{item.qty}</td>
                    <td>{money(item.sum)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>
      ))}
    </div>
  );
}

/** Товары: редактирование сырых строк таблицы. */
function ProductsPanel({ onError, onFlash }) {
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState('cpu');
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({});
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    getCategories()
      .then((data) => setCategories(data.items))
      .catch((reason) => onError(reason.message));
  }, [onError]);

  function load(nextCategory = category) {
    getProducts(nextCategory)
      .then((data) => setItems(data.items))
      .catch((reason) => onError(reason.message));
  }

  useEffect(() => {
    load();
    setForm({});
    setEditingId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  const fields = useMemo(() => PRODUCT_FIELDS[category] || [], [category]);

  function startCreate() {
    setEditingId(null);
    setForm({});
  }

  function startEdit(row) {
    setEditingId(row.id);
    const next = {};
    for (const [key, type] of fields) {
      const value = row[key];
      next[key] =
        type === 'json' && value != null ? JSON.stringify(value, null, 2) : value;
      if (next[key] === null || next[key] === undefined) next[key] = '';
    }
    setForm(next);
  }

  function changeField(event) {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }));
  }

  async function save(event) {
    event.preventDefault();
    try {
      const data = {};
      for (const [key, type] of fields) {
        let value = form[key];
        if (type === 'json') {
          if (!String(value || '').trim()) continue;
          try {
            value = JSON.parse(value);
          } catch {
            throw new Error(`Поле «${key}»: некорректный JSON`);
          }
        }
        if (type === 'number' && value !== '') value = Number(value);
        data[key] = value;
      }

      if (editingId) {
        await updateProduct(category, editingId, data);
        onFlash('Товар сохранён');
      } else {
        await createProduct(category, data);
        onFlash('Товар добавлен');
      }
      load();
      startCreate();
    } catch (reason) {
      onError(reason.message);
    }
  }

  async function remove(row) {
    if (!window.confirm(`Удалить товар «${row['название']}»?`)) return;
    try {
      await deleteProduct(category, row.id);
      load();
      onFlash('Товар удалён');
    } catch (reason) {
      onError(reason.message);
    }
  }

  return (
    <div className="admin-products">
      <div className="admin-categories">
        {categories.map((item) => (
          <button
            className={`chip${category === item.id ? ' is-on' : ''}`}
            key={item.id}
            onClick={() => setCategory(item.id)}
            type="button"
          >
            {item.name}
          </button>
        ))}
      </div>

      <div className="admin-products-grid">
        <div>
          <div className="panel-head">
            <h3>Товары категории</h3>
            <button className="btn btn-sm" onClick={startCreate} type="button">
              + Добавить
            </button>
          </div>
          <div className="picker-wrap">
            <table className="picker">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Название</th>
                  <th>Цена</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td className="picker-name">{row['название']}</td>
                    <td>{money(row['цена'])}</td>
                    <td>
                      <button
                        className="link-button"
                        onClick={() => startEdit(row)}
                        type="button"
                      >
                        Изменить
                      </button>{' '}
                      <button
                        className="link-button"
                        onClick={() => remove(row)}
                        type="button"
                      >
                        Удалить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <form className="admin-editor" onSubmit={save}>
          <div className="panel-head">
            <h3>{editingId ? `Товар #${editingId}` : 'Новый товар'}</h3>
            {editingId && (
              <button className="link-button" onClick={startCreate} type="button">
                Отменить
              </button>
            )}
          </div>

          <div className="admin-fields">
            {fields.map(([key, type]) => (
              <label className="field" key={key}>
                <span>{key}</span>
                {type === 'boolean' ? (
                  <input
                    checked={Boolean(form[key])}
                    name={key}
                    onChange={changeField}
                    type="checkbox"
                  />
                ) : type === 'json' ? (
                  <textarea
                    name={key}
                    onChange={changeField}
                    rows={3}
                    value={form[key] || ''}
                  />
                ) : (
                  <input
                    name={key}
                    onChange={changeField}
                    step={type === 'number' ? 'any' : undefined}
                    type={type}
                    value={form[key] ?? ''}
                  />
                )}
              </label>
            ))}
          </div>

          <button className="btn" type="submit">
            {editingId ? 'Сохранить товар' : 'Добавить товар'}
          </button>
        </form>
      </div>
    </div>
  );
}

/** Пользователи: роли и блокировка. */
function UsersPanel({ onError, onFlash }) {
  const [users, setUsers] = useState([]);
  const currentId = readAuth().user?.id;

  function load() {
    getUsers()
      .then((data) => setUsers(data.items))
      .catch((reason) => onError(reason.message));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  async function changeRole(user, role) {
    try {
      await updateUser(user.id, { role });
      load();
      onFlash('Роль обновлена');
    } catch (reason) {
      onError(reason.message);
    }
  }

  async function toggleBlock(user) {
    const next = !user.blocked;
    const reason = next
      ? window.prompt('Причина блокировки', 'Нарушение правил магазина')
      : '';
    if (next && reason === null) return;
    try {
      await updateUser(user.id, { blocked: next, reason });
      load();
      onFlash(next ? 'Пользователь заблокирован' : 'Пользователь разблокирован');
    } catch (reasonText) {
      onError(reasonText.message);
    }
  }

  return (
    <div className="picker-wrap">
      <table className="picker">
        <thead>
          <tr>
            <th>ID</th>
            <th>E-mail</th>
            <th>Имя</th>
            <th>Роль</th>
            <th>Статус</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td>{user.id}</td>
              <td>{user.email}</td>
              <td>{user.name}</td>
              <td>
                <select
                  disabled={user.id === currentId}
                  onChange={(event) => changeRole(user, event.target.value)}
                  value={user.role}
                >
                  <option value="customer">customer</option>
                  <option value="manager">manager</option>
                  <option value="admin">admin</option>
                </select>
              </td>
              <td>
                {user.blocked ? (
                  <span className="status-badge is-cancel">заблокирован</span>
                ) : (
                  <span className="status-badge is-done">активен</span>
                )}
              </td>
              <td>
                <button
                  className="link-button"
                  disabled={user.id === currentId}
                  onClick={() => toggleBlock(user)}
                  type="button"
                >
                  {user.blocked ? 'Разблокировать' : 'Заблокировать'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Отзывы: модерация. */
function ReviewsPanel({ onError, onFlash }) {
  const [reviews, setReviews] = useState([]);
  const [status, setStatus] = useState('на модерации');

  function load(next = status) {
    getReviews(next)
      .then((data) => setReviews(data.items))
      .catch((reason) => onError(reason.message));
  }

  useEffect(() => {
    load(status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function moderate(review, nextStatus) {
    try {
      await moderateReview(review.id, nextStatus);
      load(status);
      onFlash('Статус отзыва обновлён');
    } catch (reason) {
      onError(reason.message);
    }
  }

  return (
    <div>
      <div className="admin-categories">
        {['на модерации', 'опубликован', 'отклонён', ''].map((value) => (
          <button
            className={`chip${status === value ? ' is-on' : ''}`}
            key={value || 'all'}
            onClick={() => setStatus(value)}
            type="button"
          >
            {value || 'все'}
          </button>
        ))}
      </div>

      {!reviews.length && <div className="state">Отзывов нет.</div>}

      <div className="admin-list">
        {reviews.map((review) => (
          <article className="admin-order" key={review.id}>
            <header>
              <div>
                <h3>
                  {review.productId} · {review.rating} / 5
                </h3>
                <div className="small faint">
                  {review.author} · {review.email} ·{' '}
                  {new Date(review.createdAt).toLocaleString('ru-RU')}
                </div>
              </div>
              <span
                className={`status-badge ${
                  review.status === 'опубликован'
                    ? 'is-done'
                    : review.status === 'отклонён'
                      ? 'is-cancel'
                      : 'is-progress'
                }`}
              >
                {review.status}
              </span>
            </header>
            <p>{review.text || 'Без текста'}</p>
            <div className="admin-actions">
              <button
                className="btn btn-sm"
                onClick={() => moderate(review, 'опубликован')}
                type="button"
              >
                Опубликовать
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => moderate(review, 'отклонён')}
                type="button"
              >
                Отклонить
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
