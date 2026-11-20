import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { money } from '../api.js';
import { fetchMe, readAuth } from '../auth.js';
import { readCart, clearCart } from '../cart.js';
import { createOrder, syncCart } from '../commerce.js';

/**
 * Оформление заказа.
 *
 * Локальная корзина переносится в серверную, заказ сохраняется в Supabase,
 * после успеха локальная корзина очищается.
 */
export default function Checkout() {
  const [items] = useState(readCart);
  const user = readAuth().user;
  const [form, setForm] = useState({
    deliveryMethod: 'courier',
    paymentMethod: 'card',
    phone: user?.phone || '',
    address: user?.address || '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);

  useEffect(() => {
    fetchMe()
      .then((profile) => {
        if (!profile) return;
        setForm((current) => ({
          ...current,
          phone: current.phone || profile.phone || '',
          address: current.address || profile.address || '',
        }));
      })
      .catch(() => {
        /* профиль не обязателен для формы */
      });
  }, []);

  function changeField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    const phone = form.phone.trim();
    if (phone.length < 7) {
      setError('Укажите телефон для связи');
      return;
    }
    if (form.deliveryMethod === 'courier' && !form.address.trim()) {
      setError('Для доставки курьером нужен адрес');
      return;
    }

    setLoading(true);
    try {
      await syncCart(items);
      const order = await createOrder({
        deliveryMethod: form.deliveryMethod,
        paymentMethod: form.paymentMethod,
        phone,
        address: form.address.trim(),
      });
      clearCart();
      navigate('/orders', { replace: true, state: { order } });
    } catch (reason) {
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="container">
        <div className="state">
          <h1 className="h2">Корзина пуста</h1>
          <p className="muted">Добавьте товары, чтобы оформить заказ.</p>
          <Link className="btn" to="/catalog">
            Перейти в каталог
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container checkout-page">
      <div className="breadcrumbs">
        <Link to="/">Главная</Link>
        <Link to="/cart">Корзина</Link>
        <span>Оформление заказа</span>
      </div>

      <div className="builder-head">
        <div>
          <div className="h1" style={{ fontSize: 26 }}>
            Оформление заказа
          </div>
          <div className="sub">
            {items.reduce((sum, item) => sum + item.qty, 0)} единиц товара на{' '}
            {money(total)}
          </div>
        </div>
        <Link className="btn btn-secondary" to="/cart">
          Вернуться в корзину
        </Link>
      </div>

      <form className="checkout-grid" onSubmit={handleSubmit}>
        <div className="checkout-form">
          <section className="profile-panel">
            <h2>Получатель</h2>
            <label className="field">
              <span>Телефон</span>
              <input
                autoComplete="tel"
                name="phone"
                onChange={changeField}
                placeholder="+375 29 000-00-00"
                required
                type="tel"
                value={form.phone}
              />
            </label>
            <label className="field">
              <span>Адрес доставки</span>
              <input
                autoComplete="street-address"
                disabled={form.deliveryMethod === 'pickup'}
                name="address"
                onChange={changeField}
                placeholder="Минск, ул. Примерная, 1"
                type="text"
                value={form.address}
              />
            </label>
          </section>

          <section className="profile-panel">
            <h2>Доставка</h2>
            <div className="choice-list">
              <label
                className={`choice${form.deliveryMethod === 'courier' ? ' is-on' : ''}`}
              >
                <input
                  checked={form.deliveryMethod === 'courier'}
                  name="deliveryMethod"
                  onChange={changeField}
                  type="radio"
                  value="courier"
                />
                <span>
                  <strong>Курьером</strong>
                  <small>по Минску, стоимость уточнит менеджер</small>
                </span>
              </label>
              <label
                className={`choice${form.deliveryMethod === 'pickup' ? ' is-on' : ''}`}
              >
                <input
                  checked={form.deliveryMethod === 'pickup'}
                  name="deliveryMethod"
                  onChange={changeField}
                  type="radio"
                  value="pickup"
                />
                <span>
                  <strong>Самовывоз</strong>
                  <small>со склада после подтверждения заказа</small>
                </span>
              </label>
            </div>
          </section>

          <section className="profile-panel">
            <h2>Оплата</h2>
            <div className="choice-list">
              {[
                ['card', 'Картой', 'ссылка на оплату придёт после подтверждения'],
                ['cash', 'Наличными', 'при получении заказа'],
                ['invoice', 'По счёту', 'для организаций и юридических лиц'],
              ].map(([value, title, hint]) => (
                <label
                  className={`choice${form.paymentMethod === value ? ' is-on' : ''}`}
                  key={value}
                >
                  <input
                    checked={form.paymentMethod === value}
                    name="paymentMethod"
                    onChange={changeField}
                    type="radio"
                    value={value}
                  />
                  <span>
                    <strong>{title}</strong>
                    <small>{hint}</small>
                  </span>
                </label>
              ))}
            </div>
          </section>
        </div>

        <aside className="checkout-summary">
          <h2>Ваш заказ</h2>
          <ul className="checkout-items">
            {items.map((item) => (
              <li key={item.id}>
                <span>
                  {item.name} × {item.qty}
                </span>
                <strong>{money(item.price * item.qty)}</strong>
              </li>
            ))}
          </ul>
          <div className="checkout-total">
            <span>Итого</span>
            <strong>{money(total)}</strong>
          </div>
          <p className="hint">
            Стоимость доставки и итоговую сумму подтвердит менеджер.
          </p>
          {error && (
            <div className="state error" role="alert">
              {error}
            </div>
          )}
          <button className="btn" disabled={loading} type="submit">
            {loading ? 'Оформляем…' : 'Подтвердить заказ'}
          </button>
        </aside>
      </form>
    </div>
  );
}
