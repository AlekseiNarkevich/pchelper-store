/**
 * PCHelper — Корзина: позиции из localStorage и Supabase, изменение
 * количества, удаление, итоговая сумма и переход к оформлению.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { getRecommendations, money } from '../api.js';
import { readAuth } from '../auth.js';
import ImageWithStatus from '../components/ImageWithStatus.jsx';
import ProductCard from '../components/ProductCard.jsx';
import { onCartChange, readCart, removeItem, setQty } from '../cart.js';
import React from 'react';

/** Русское склонение для счётчика позиций и единиц. */
function plural(count, one, few, many) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/**
 * Корзина: локальная копия для мгновенного отображения, а изменения
 * сразу уходят в серверную корзину Supabase.
 */
export default function Cart() {
  const [items, setItems] = useState(readCart);
  const [recommendations, setRecommendations] = useState([]);
  const user = readAuth().user;

  // Подписка нужна, чтобы корзина обновилась после синхронизации с сервером.
  useEffect(() => onCartChange(() => setItems(readCart())), []);

  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const units = items.reduce((sum, item) => sum + item.qty, 0);
  const idsKey = items
    .map((item) => item.id)
    .sort()
    .join(',');

  // Рекомендации пересчитываются при изменении состава корзины.
  useEffect(() => {
    if (!idsKey) {
      setRecommendations([]);
      return undefined;
    }
    let alive = true;
    getRecommendations(idsKey.split(','), 4)
      .then((data) => {
        if (alive) setRecommendations(data.items);
      })
      .catch(() => {
        if (alive) setRecommendations([]);
      });
    return () => {
      alive = false;
    };
  }, [idsKey]);

  // Количество ограничено остатком; ноль удаляет позицию.
  function changeQty(id, delta) {
    const item = items.find((entry) => entry.id === id);
    if (!item) return;
    setQty(id, item.qty + delta);
  }

  if (items.length === 0) {
    return (
      <div className="container">
        <div className="breadcrumbs">
          <Link to="/">Главная</Link>
          <span>Корзина</span>
        </div>
        <div className="state">
          <h1 className="h2">Корзина пуста</h1>
          <p className="muted">Добавьте товары из каталога или готовую сборку.</p>
          <Link className="btn" to="/catalog">
            Перейти в каталог
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="breadcrumbs">
        <Link to="/">Главная</Link>
        <span>Корзина</span>
      </div>

      <div className="toolbar">
        <div>
          <div className="h1" style={{ fontSize: 26 }}>
            Корзина
          </div>
          <div className="sub">
            {items.length} {plural(items.length, 'позиция', 'позиции', 'позиций')},{' '}
            {units} {plural(units, 'единица', 'единицы', 'единиц')} товара
          </div>
        </div>
        <button
          className="btn btn-secondary"
          onClick={() => {
            items.forEach((item) => removeItem(item.id));
          }}
          type="button"
        >
          Очистить
        </button>
      </div>

      {!user && (
        <div className="cart-guest">
          <div>
            <strong>Вы не вошли в аккаунт</strong>
            <div className="small faint">
              Корзина сохранится в этом браузере. Чтобы оформить заказ и получать письма
              о статусе, войдите или зарегистрируйтесь.
            </div>
          </div>
          <div className="cart-guest-actions">
            <Link
              className="btn btn-secondary"
              state={{ from: { pathname: '/checkout' } }}
              to="/login"
            >
              Войти
            </Link>
            <Link
              className="btn"
              state={{ from: { pathname: '/checkout' } }}
              to="/register"
            >
              Регистрация
            </Link>
          </div>
        </div>
      )}

      <div className="cart-page">
        {items.map((item) => (
          <div className="cart-row" key={item.id}>
            <div className="thumb">
              <ImageWithStatus
                alt={item.name}
                src={item.imageUrl || '/placeholder.jpg'}
              />
            </div>
            <div className="cart-name">
              <Link
                to={
                  item.id.startsWith('prebuilt:') ? '/prebuilt' : `/product/${item.id}`
                }
              >
                {item.name}
              </Link>
              <div className="small faint">{money(item.price)} за штуку</div>
            </div>
            <div className="qty">
              <button
                aria-label="Уменьшить количество"
                onClick={() => changeQty(item.id, -1)}
                type="button"
              >
                −
              </button>
              <span>{item.qty}</span>
              <button
                aria-label="Увеличить количество"
                disabled={item.stock != null && item.qty >= item.stock}
                onClick={() => changeQty(item.id, 1)}
                type="button"
              >
                +
              </button>
            </div>
            <div className="cart-sum">{money(item.price * item.qty)}</div>
            <button
              aria-label={`Удалить ${item.name}`}
              className="cart-remove"
              onClick={() => removeItem(item.id)}
              type="button"
            >
              ×
            </button>
          </div>
        ))}

        <div className="cart-total">
          <span>Итого</span>
          <span>{money(total)}</span>
        </div>
        <div className="cart-checkout">
          <Link className="btn" to="/checkout">
            Оформить заказ
          </Link>
          <Link className="btn btn-secondary" to="/catalog">
            Продолжить покупки
          </Link>
          <span className="small faint">Доставка и оплата — на следующем шаге</span>
        </div>
      </div>

      {recommendations.length > 0 && (
        <section className="cart-recommendations">
          <div className="h3">С этим товаром часто покупают</div>
          <div className="cart-recommendations-grid">
            {recommendations.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
