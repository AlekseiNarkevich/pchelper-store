/**
 * PCHelper — История заказов покупателя: список заказов, состав,
 * статусы, история переходов и подтверждение получения.
 */

import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { money } from '../api.js';
import { completeOrder, getOrderHistory, listOrders } from '../commerce.js';

/** Класс значка по статусу заказа. */
function statusClass(status) {
  // Новый — синий, отменённый — красный, финальные — зелёные,
  // остальные промежуточные — жёлтые.
  if (status === 'Новый') return 'is-new';
  if (status === 'Отменён') return 'is-cancel';
  if (
    status === 'Отправлен' ||
    status === 'Доставлен' ||
    status === 'Готов к выдаче' ||
    status === 'Завершён'
  ) {
    return 'is-done';
  }
  return 'is-progress';
}

/**
 * История заказов пользователя.
 */
export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openHistory, setOpenHistory] = useState(null);
  const [history, setHistory] = useState({});
  const [notice, setNotice] = useState('');
  const location = useLocation();
  // Если пользователь только что оформил заказ, показываем его сверху.
  const created = location.state?.order || null;

  // Подтверждение получения доступно для «Готов к выдаче» и «Доставлен»;
  // серверная проверка повторяет это правило.
  async function complete(order) {
    if (!window.confirm(`Подтвердить получение заказа ${order.number}?`)) return;
    try {
      await completeOrder(order.id);
      setOrders((current) =>
        current.map((item) =>
          item.id === order.id
            ? {
                ...item,
                status: 'Завершён',
                managerComment: 'Получение подтверждено покупателем',
              }
            : item,
        ),
      );
      setHistory((current) => ({ ...current, [order.id]: null }));
      setNotice(`Заказ ${order.number} завершён`);
    } catch (reason) {
      setError(reason.message);
    }
  }

  // История переходов подгружается один раз при первом раскрытии заказа.
  async function toggleHistory(order) {
    if (openHistory === order.id) {
      setOpenHistory(null);
      return;
    }
    setOpenHistory(order.id);
    if (history[order.id]) return;
    try {
      const data = await getOrderHistory(order.id);
      setHistory((current) => ({ ...current, [order.id]: data.items }));
    } catch (reason) {
      setError(reason.message);
    }
  }

  useEffect(() => {
    let alive = true;
    listOrders()
      .then((data) => {
        if (alive) setOrders(data.items);
      })
      .catch((reason) => {
        if (alive) setError(reason.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="container orders-page">
      <div className="breadcrumbs">
        <Link to="/">Главная</Link>
        <Link to="/profile">Личный кабинет</Link>
        <span>Заказы</span>
      </div>

      <div className="builder-head">
        <div>
          <div className="h1" style={{ fontSize: 26 }}>
            Мои заказы
          </div>
          <div className="sub">История заказов и статусы обработки</div>
        </div>
        <Link className="btn btn-secondary" to="/catalog">
          Перейти в каталог
        </Link>
      </div>

      {notice && <div className="state success">{notice}</div>}
      {created && (
        <div className="state success" role="status">
          Заказ <strong>{created.number}</strong> оформлен. Мы свяжемся с вами для
          подтверждения.
        </div>
      )}

      {error && (
        <div className="state error" role="alert">
          {error}
        </div>
      )}

      {loading && <div className="state">Загружаем заказы…</div>}

      {!loading && orders.length === 0 && (
        <div className="state">
          Заказов пока нет.
          <br />
          <Link className="btn" to="/catalog">
            Выбрать комплектующие
          </Link>
        </div>
      )}

      <div className="orders-list">
        {orders.map((order) => (
          <article className="order-card" key={order.id}>
            <header>
              <div>
                <h3>Заказ {order.number}</h3>
                <div className="small faint">
                  {order.createdAt
                    ? new Date(order.createdAt).toLocaleString('ru-RU')
                    : ''}
                </div>
              </div>
              <span className={`status-badge ${statusClass(order.status)}`}>
                {order.status}
              </span>
            </header>
            <div className="checkout-line">
              <span>Товары</span>
              <strong>{money(order.itemsTotal ?? order.total)}</strong>
            </div>
            <div className="checkout-line">
              <span>
                Доставка
                {order.deliveryZone === 'outside' && order.distanceKm
                  ? `, ${order.distanceKm} км за МКАД`
                  : ''}
              </span>
              <strong>
                {order.deliveryCost > 0 ? money(order.deliveryCost) : 'бесплатно'}
              </strong>
            </div>
            {order.managerComment && (
              <p className="order-comment">
                Комментарий менеджера: {order.managerComment}
              </p>
            )}
            <div className="order-total">
              <span>Итого</span>
              <strong>{money(order.total)}</strong>
            </div>
            <div className="order-actions">
              {['Готов к выдаче', 'Доставлен'].includes(order.status) && (
                <button
                  className="btn btn-sm"
                  onClick={() => complete(order)}
                  type="button"
                >
                  Подтвердить получение
                </button>
              )}
              <button
                className="link-button"
                onClick={() => toggleHistory(order)}
                type="button"
              >
                {openHistory === order.id ? 'Скрыть историю' : 'История статусов'}
              </button>
            </div>
            {openHistory === order.id && history[order.id] && (
              <ol className="order-history">
                {history[order.id].map((item) => (
                  <li key={item.id}>
                    <strong>{item.status}</strong>
                    {item.comment ? ` — ${item.comment}` : ''}
                    <span className="small faint">
                      {new Date(item.createdAt).toLocaleString('ru-RU')}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
