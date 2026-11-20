import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { money } from '../api.js';
import { listOrders } from '../commerce.js';

/** Класс значка по статусу заказа. */
function statusClass(status) {
  if (status === 'Новый') return 'is-new';
  if (status === 'Отменён') return 'is-cancel';
  if (status === 'Отправлен' || status === 'Доставлен') return 'is-done';
  return 'is-progress';
}

/**
 * История заказов пользователя.
 */
export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const location = useLocation();
  const created = location.state?.order || null;

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
            <div className="order-total">
              <span>Итого</span>
              <strong>{money(order.total)}</strong>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
