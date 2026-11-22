/**
 * PCHelper — Админ-панель: заказы, товары, готовые ПК, запросы
 * на поступление, журнал писем, пользователи и модерация отзывов.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { getCategories, money } from '../api.js';
import { readAuth } from '../auth.js';
import {
  createProduct,
  deleteOrder,
  deleteProduct,
  deleteUser,
  getEmails,
  getOrders,
  getPrebuiltStock,
  getProducts,
  getReviews,
  getStockRequests,
  getSummary,
  getUsers,
  moderateReview,
  resendEmail,
  sendTestEmail,
  updateOrder,
  updatePrebuiltStock,
  updateProduct,
  updateStockRequest,
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

/** Русские подписи способов оплаты для админки. */
const PAYMENT_LABELS = {
  card: 'Картой',
  cash: 'Наличными',
  invoice: 'По счёту',
};

/**
 * Способ получения и адрес одной строкой.
 *
 * @param {object} order Заказ.
 * @returns {string}
 */
function deliveryText(order) {
  const address = String(order.address || '').replace(/Г\.\s*Минск/g, 'г. Минск');
  if (order.deliveryMethod === 'pickup') {
    return `Самовывоз${address ? `, ${address}` : ''}`;
  }
  const zone =
    order.deliveryZone === 'outside'
      ? ', за МКАД'
      : order.deliveryZone === 'minsk'
        ? ', по Минску'
        : '';
  return `Курьером${zone}${address ? `, ${address}` : ''}`;
}

/**
 * Согласует слово «позиция» с числом.
 *
 * @param {number} count Количество.
 * @returns {string}
 */
function positionsText(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  let word = 'позиций';
  if (mod10 === 1 && mod100 !== 11) word = 'позиция';
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    word = 'позиции';
  }
  return `${count} ${word}`;
}

/**
 * Русская подпись способа оплаты.
 *
 * @param {string} value Значение из базы.
 * @returns {string}
 */
function paymentText(value) {
  return PAYMENT_LABELS[value] || value || '—';
}

/**
 * Административная панель: заказы, товары, готовые ПК, запросы,
 * письма, пользователи и отзывы.
 */
export default function Admin() {
  const [tab, setTab] = useState('orders');
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Сводка загружается один раз при открытии панели.
  useEffect(() => {
    getSummary()
      .then(setSummary)
      .catch((reason) => setError(reason.message));
  }, []);

  // Короткое сообщение об успешном действии; ошибки показываются отдельно.
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
          <div className="sub">Заказы, товары, склад, письма и отзывы</div>
        </div>
        <Link className="btn btn-secondary" to="/">
          Вернуться в магазин
        </Link>
      </div>

      {/* Сводные цифры по магазину: заказы, товары, пользователи, отзывы. */}
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

      {/* Вкладки разделов; каждая панель сама загружает свои данные. */}
      <div className="admin-tabs" role="tablist">
        {[
          ['orders', 'Заказы'],
          ['products', 'Товары'],
          ['prebuilt', 'Готовые ПК'],
          ['requests', 'Запросы'],
          ['emails', 'Письма'],
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
      {tab === 'prebuilt' && <PrebuiltStockPanel onError={setError} onFlash={flash} />}
      {tab === 'requests' && <StockRequestsPanel onError={setError} onFlash={flash} />}
      {tab === 'emails' && <EmailsPanel onError={setError} onFlash={flash} />}
      {tab === 'users' && <UsersPanel onError={setError} onFlash={flash} />}
      {tab === 'reviews' && <ReviewsPanel onError={setError} onFlash={flash} />}
    </div>
  );
}

/** Заказы, статусы и отмена с причиной. */
function OrdersPanel({ onError, onFlash }) {
  const [orders, setOrders] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [filter, setFilter] = useState('active');
  const [cancelTarget, setCancelTarget] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    getOrders()
      .then((data) => {
        if (alive) setOrders(data.items);
      })
      .catch((error) => onError(error.message));
    return () => {
      alive = false;
    };
  }, [onError]);

  // Черновик хранит несохранённые изменения конкретного заказа.
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

  function clearDraft(orderId) {
    setDrafts((current) => {
      const next = { ...current };
      delete next[orderId];
      return next;
    });
  }

  // Сохраняем статус, трек-номер и комментарий; список перечитываем,
  // чтобы увидеть историю и актуальное состояние из базы.
  async function save(order) {
    try {
      const updated = await updateOrder(order.id, draft(order));
      setOrders((current) =>
        current.map((item) =>
          item.id === updated.id ? { ...item, ...updated } : item,
        ),
      );
      clearDraft(order.id);
      onFlash(`Заказ ${order.number} обновлён`);
    } catch (error) {
      onError(error.message);
    }
  }

  // Быстрое подтверждение нового заказа: «Новый» → «В обработке».
  async function confirmOrder(order) {
    try {
      const updated = await updateOrder(order.id, {
        status: 'В обработке',
        comment: 'Заказ подтверждён администратором',
      });
      setOrders((current) =>
        current.map((item) =>
          item.id === updated.id ? { ...item, ...updated } : item,
        ),
      );
      onFlash(`Заказ ${order.number} подтверждён`);
    } catch (error) {
      onError(error.message);
    }
  }

  // «Удалить» и выбор статуса «Отменён» ведут в одно окно причины.
  function openCancel(order) {
    setCancelTarget(order);
    setReason('');
  }

  function closeCancel() {
    if (busy) return;
    setCancelTarget(null);
    setReason('');
  }

  async function confirmCancel() {
    const value = reason.trim();
    if (!cancelTarget || !value) return;
    setBusy(true);
    try {
      const updated = await updateOrder(cancelTarget.id, {
        status: 'Отменён',
        comment: value,
      });
      setOrders((current) =>
        current.map((item) =>
          item.id === updated.id ? { ...item, ...updated } : item,
        ),
      );
      clearDraft(cancelTarget.id);
      onFlash(
        `Заказ ${cancelTarget.number} отменён — покупателю отправлено письмо с причиной`,
      );
      setCancelTarget(null);
      setReason('');
    } catch (error) {
      onError(error.message);
    } finally {
      setBusy(false);
    }
  }

  // Уже отменённый заказ удаляем сразу: письмо и причина не нужны.
  async function removeCancelled(order) {
    try {
      await deleteOrder(order.id);
      setOrders((current) => current.filter((item) => item.id !== order.id));
      clearDraft(order.id);
      onFlash(`Заказ ${order.number} удалён из списка`);
    } catch (error) {
      onError(error.message);
    }
  }

  const visibleOrders = orders.filter((order) => {
    if (filter === 'cancelled') return order.status === 'Отменён';
    if (filter === 'all') return true;
    return order.status !== 'Отменён';
  });

  if (!orders.length) return <div className="state">Заказов пока нет.</div>;

  return (
    <>
      {/* Отменённые заказы не забивают список, но остаются доступны. */}
      <div className="chips order-filter" role="group" aria-label="Фильтр заказов">
        {[
          ['active', 'Активные'],
          ['cancelled', 'Отменённые'],
          ['all', 'Все'],
        ].map(([value, label]) => (
          <button
            className={`chip${filter === value ? ' is-on' : ''}`}
            key={value}
            onClick={() => setFilter(value)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {!visibleOrders.length ? (
        <div className="state">
          {filter === 'cancelled' ? 'Отменённых заказов нет.' : 'Заказов пока нет.'}
        </div>
      ) : (
        <div className="admin-list">
          {visibleOrders.map((order) => (
            <article className="admin-order" key={order.id}>
              <header>
                <div>
                  <h3>Заказ {order.number}</h3>
                  <div className="small faint">
                    {order.userName} · {order.userEmail} · {order.phone}
                  </div>
                  <div className="small faint">
                    {new Date(order.createdAt).toLocaleString('ru-RU')} ·{' '}
                    {positionsText(order.positionsCount)}
                  </div>
                </div>
                <strong>{money(order.total)}</strong>
              </header>

              <div className="admin-order-grid">
                <label className="field">
                  <span>Статус</span>
                  <select
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value === 'Отменён') {
                        if (order.status !== 'Отменён') openCancel(order);
                        return;
                      }
                      change(order, 'status', value);
                    }}
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
                    className="btn btn-danger"
                    onClick={() =>
                      order.status === 'Отменён'
                        ? removeCancelled(order)
                        : openCancel(order)
                    }
                    type="button"
                  >
                    Удалить
                  </button>
                </div>
              </div>

              <div className="small faint">
                Доставка: {deliveryText(order)}. Оплата:{' '}
                {paymentText(order.paymentMethod)}. Стоимость доставки:{' '}
                {money(order.deliveryCost)}.
              </div>

              <div className="order-positions">
                <div className="order-positions-head">Состав заказа</div>
                <div className="picker-wrap">
                  <table className="picker">
                    <thead>
                      <tr>
                        <th>Товар</th>
                        <th>Количество</th>
                        <th>Сумма</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(order.positions || []).map((item) => (
                        <tr key={item.id}>
                          <td>{item.name}</td>
                          <td>{item.qty}</td>
                          <td>{money(item.sum)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {cancelTarget && (
        <div className="modal-backdrop" onClick={closeCancel} role="presentation">
          <div
            aria-labelledby="cancel-order-title"
            aria-modal="true"
            className="modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <h3 id="cancel-order-title">Отменить заказ {cancelTarget.number}?</h3>
            <p className="muted">
              Заказ получит статус «Отменён» и исчезнет из активного списка. Покупателю
              уйдёт письмо с указанной причиной.
            </p>
            <label className="field">
              <span>Причина отмены</span>
              <textarea
                autoFocus
                onChange={(event) => setReason(event.target.value)}
                placeholder="Например: товара нет в наличии, покупатель попросил отменить"
                rows={4}
                value={reason}
              />
            </label>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                disabled={busy}
                onClick={closeCancel}
                type="button"
              >
                Не отменять
              </button>
              <button
                className="btn btn-danger"
                disabled={busy || !reason.trim()}
                onClick={confirmCancel}
                type="button"
              >
                {busy ? 'Отменяем…' : 'Отменить заказ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
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

  // Загрузка товаров выбранной категории; форма редактирования справа.
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

  const fields = useMemo(
    () => [...(PRODUCT_FIELDS[category] || []), ['количество', 'number']],
    [category],
  );

  function startCreate() {
    setEditingId(null);
    setForm({});
  }

  // JSON-поля показываем текстом, чтобы их можно было править вручную.
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

  // Перед отправкой приводим типы полей и проверяем JSON.
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

/** Остатки готовых компьютеров. */
function PrebuiltStockPanel({ onError, onFlash }) {
  const [items, setItems] = useState([]);
  const [values, setValues] = useState({});

  function load() {
    getPrebuiltStock()
      .then((data) => {
        setItems(data.items);
        setValues(Object.fromEntries(data.items.map((item) => [item.id, item.stock])));
      })
      .catch((reason) => onError(reason.message));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  async function save(item) {
    try {
      await updatePrebuiltStock(item.id, Number(values[item.id]));
      onFlash(`Остаток «${item.name}» обновлён`);
      load();
    } catch (reason) {
      onError(reason.message);
    }
  }

  return (
    <div className="picker-wrap">
      <table className="picker">
        <thead>
          <tr>
            <th>Готовая сборка</th>
            <th>На складе</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td className="picker-name">{item.name}</td>
              <td>
                <input
                  className="input-price"
                  min="0"
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [item.id]: event.target.value,
                    }))
                  }
                  type="number"
                  value={values[item.id] ?? 0}
                />
              </td>
              <td>
                <button
                  className="link-button"
                  onClick={() => save(item)}
                  type="button"
                >
                  Сохранить
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Запросы на поступление товара. */
function StockRequestsPanel({ onError, onFlash }) {
  const [items, setItems] = useState([]);

  function load() {
    getStockRequests()
      .then((data) => setItems(data.items))
      .catch((reason) => onError(reason.message));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  async function mark(request) {
    try {
      await updateStockRequest(request.id, 'обработан');
      load();
      onFlash('Запрос отмечен обработанным');
    } catch (reason) {
      onError(reason.message);
    }
  }

  if (!items.length) return <div className="state">Запросов нет.</div>;

  return (
    <div className="admin-list">
      {items.map((request) => (
        <article className="admin-order" key={request.id}>
          <header>
            <div>
              <h3>{request.productName}</h3>
              <div className="small faint">
                {request.productId} · {request.email || 'без e-mail'} ·{' '}
                {request.phone || 'без телефона'}
              </div>
              <div className="small faint">
                {new Date(request.createdAt).toLocaleString('ru-RU')}
              </div>
            </div>
            <span
              className={`status-badge ${
                request.status === 'обработан' ? 'is-done' : 'is-progress'
              }`}
            >
              {request.status}
            </span>
          </header>
          {request.status === 'новый' && (
            <button className="btn btn-sm" onClick={() => mark(request)} type="button">
              Отметить обработанным
            </button>
          )}
        </article>
      ))}
    </div>
  );
}

/** Журнал писем и повторная отправка. */
function EmailsPanel({ onError, onFlash }) {
  const [items, setItems] = useState([]);
  const [configured, setConfigured] = useState(false);
  const [to, setTo] = useState(readAuth()?.user?.email || '');
  const [busy, setBusy] = useState(false);

  function load() {
    getEmails()
      .then((data) => {
        setItems(data.items);
        setConfigured(data.configured);
      })
      .catch((reason) => onError(reason.message));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  async function sendTest(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await sendTestEmail(to);
      onFlash(
        result.sent
          ? `Проверочное письмо отправлено на ${to}`
          : `Письмо не отправлено: ${result.error}`,
      );
      load();
    } catch (reason) {
      onError(reason.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendAgain(item) {
    try {
      const result = await resendEmail(item.id);
      onFlash(
        result.sent
          ? `Письмо для ${item.email} отправлено повторно`
          : `Письмо не отправлено: ${result.error}`,
      );
      load();
    } catch (reason) {
      onError(reason.message);
    }
  }

  return (
    <div className="admin-list">
      <div className={`state ${configured ? 'success' : 'error'}`}>
        {configured
          ? 'SMTP настроен: письма уходят каждому получателю.'
          : 'SMTP не настроен: письма только сохраняются в журнале.'}
      </div>

      <form className="admin-order" onSubmit={sendTest}>
        <header>
          <div>
            <h3>Проверка почты</h3>
            <div className="small faint">
              Письмо придёт на указанный адрес. Получатели заказов и запросов берутся из
              их аккаунтов.
            </div>
          </div>
        </header>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <input
            aria-label="Адрес для проверки"
            className="input-price"
            onChange={(event) => setTo(event.target.value)}
            style={{ flex: '1 1 260px', minWidth: 240 }}
            type="email"
            value={to}
          />
          <button className="btn btn-sm" disabled={busy} type="submit">
            Отправить проверку
          </button>
        </div>
      </form>

      {!items.length && <div className="state">Писем пока нет.</div>}

      {items.map((item) => (
        <article className="admin-order" key={item.id}>
          <header>
            <div>
              <h3>{item.subject}</h3>
              <div className="small faint">
                {item.email} · {new Date(item.createdAt).toLocaleString('ru-RU')}
              </div>
              {item.error && <div className="small faint">Ошибка: {item.error}</div>}
            </div>
            <span className={`status-badge ${item.sent ? 'is-done' : 'is-progress'}`}>
              {item.sent ? 'отправлено' : 'не отправлено'}
            </span>
          </header>
          {!item.sent && (
            <button
              className="btn btn-sm"
              onClick={() => sendAgain(item)}
              type="button"
            >
              Отправить снова
            </button>
          )}
        </article>
      ))}
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

  // Роль меняется сразу; админов и себя менять нельзя (сервер тоже проверяет).
  async function changeRole(user, role) {
    try {
      await updateUser(user.id, { role });
      load();
      onFlash('Роль обновлена');
    } catch (reason) {
      onError(reason.message);
    }
  }

  // Блокировка с причиной; причина показывается пользователю при входе.
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

  // Удаление требует двух подтверждений; администраторов удалять нельзя.
  async function removeUser(user) {
    if (user.role === 'admin' || user.id === currentId) return;
    const confirmed = window.confirm(
      `Удалить аккаунт ${user.email}? Он исчезнет из списка, заказы останутся обезличенными.`,
    );
    if (!confirmed) return;
    const typed = window.prompt('Введите УДАЛИТЬ для подтверждения');
    if (typed !== 'УДАЛИТЬ') return;
    try {
      await deleteUser(user.id);
      load();
      onFlash('Аккаунт удалён');
    } catch (reason) {
      onError(reason.message);
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
                  disabled={user.id === currentId || user.role === 'admin'}
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
                {user.role === 'admin' ? (
                  <span className="small faint">аккаунт защищён</span>
                ) : (
                  <>
                    <button
                      className="link-button"
                      disabled={user.id === currentId}
                      onClick={() => toggleBlock(user)}
                      type="button"
                    >
                      {user.blocked ? 'Разблокировать' : 'Заблокировать'}
                    </button>{' '}
                    <button
                      className="link-button"
                      disabled={user.id === currentId}
                      onClick={() => removeUser(user)}
                      type="button"
                    >
                      Удалить
                    </button>
                  </>
                )}
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
