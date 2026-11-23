/**
 * PCHelper — Оформление заказа: получатель, доставка, оплата,
 * итоговая сумма и создание заказа в Supabase.
 */

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { money } from '../api.js';
import { fetchMe, readAuth } from '../auth.js';
import DeliveryMap from '../components/DeliveryMap.jsx';
import { readCart, clearCart, onCartChange } from '../cart.js';
import { createOrder, syncCart } from '../commerce.js';
import { calculateDelivery } from '../utils/delivery.js';

/** Адрес пункта самовывоза. */
const PICKUP_ADDRESS = 'г. Минск, пер. Корженевского, 6, пом. 1';
const MAP_LINK = 'https://yandex.by/maps/?text=';

/**
 * Оформление заказа.
 *
 * Доставка: самовывоз бесплатен; курьер по Минску — бесплатно от 500 BYN,
 * иначе 10 BYN; за МКАД — 15 BYN + 3 BYN за километр.
 */
/**
 * Русское склонение для количества товаров.
 *
 * @param {number} count Количество.
 * @param {string} one Форма для 1.
 * @param {string} few Форма для 2–4.
 * @param {string} many Форма для 5+.
 * @returns {string}
 */
function plural(count, one, few, many) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export default function Checkout() {
  // Телефон и адрес подставляются из профиля, но пользователь может их изменить.
  const [items, setItems] = useState(readCart);
  const user = readAuth().user;
  const [form, setForm] = useState({
    deliveryMethod: 'courier',
    deliveryZone: 'minsk',
    distanceKm: '',
    paymentMethod: 'card',
    phone: user?.phone || '',
    address: user?.address || '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [deliveryPoint, setDeliveryPoint] = useState(null);
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const navigate = useNavigate();

  // Esc закрывает полноэкранную карту.
  useEffect(() => {
    if (!mapFullscreen) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setMapFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mapFullscreen]);

  const itemsTotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  // Доставка повторяет серверные правила, чтобы итог был виден до заказа.
  const distance = Number(form.distanceKm) || 0;
  const pointCheck = deliveryPoint
    ? calculateDelivery(deliveryPoint.lat, deliveryPoint.lng, itemsTotal)
    : null;
  const deliveryBlocked =
    form.deliveryMethod === 'courier' && Boolean(pointCheck && !pointCheck.reachable);
  const deliveryCost = deliveryBlocked
    ? 0
    : form.deliveryMethod === 'pickup'
      ? 0
      : form.deliveryZone === 'outside'
        ? 15 + 3 * Math.ceil(Math.max(0, distance))
        : itemsTotal >= 500
          ? 0
          : 10;
  const total = itemsTotal + deliveryCost;

  // Ссылка на Яндекс Карты для выбранного адреса или ПВЗ.
  const mapAddress =
    form.deliveryMethod === 'pickup'
      ? PICKUP_ADDRESS
      : form.address.trim() || PICKUP_ADDRESS;
  const mapHref = `${MAP_LINK}${encodeURIComponent(mapAddress)}`;

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

  // Корзина подтягивается с сервера после входа: подписка обновляет
  // список, иначе прямой переход на /checkout показывает «пусто».
  useEffect(() => onCartChange(() => setItems(readCart())), []);

  function changeField(event) {
    const { name, value } = event.target;
    // Ручная смена зоны или расстояния отменяет точку на карте.
    if (name === 'deliveryZone' || name === 'distanceKm') {
      setDeliveryPoint(null);
    }
    setForm((current) => ({ ...current, [name]: value }));
  }

  // Клик по карте: зона и расстояние считаются по координатам.
  function handleMapPick(lat, lng) {
    const result = calculateDelivery(lat, lng, itemsTotal);
    setDeliveryPoint({ lat, lng });
    setForm((current) => ({
      ...current,
      deliveryMethod: 'courier',
      deliveryZone: result.zone,
      distanceKm: result.zone === 'outside' ? String(result.distanceKm) : '',
    }));
    setError(result.reachable ? '' : result.message || 'Доставка недоступна');
  }

  // Ищет адрес через OpenStreetMap и ставит точку на карте.
  // Нужен, чтобы не заставлять пользователя искать дом вручную.
  async function geocodeAddress() {
    const query = form.address.trim();
    if (!query) {
      setError('Сначала введите адрес доставки');
      return;
    }
    setGeocoding(true);
    setError('');
    try {
      const search = async (value) => {
        const queryWithCountry = /беларусь/i.test(value) ? value : `${value}, Беларусь`;
        const url =
          'https://nominatim.openstreetmap.org/search?format=json&limit=1' +
          `&countrycodes=by&accept-language=ru&q=${encodeURIComponent(queryWithCountry)}`;
        const response = await fetch(url, {
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      };

      let data = await search(query);
      if (!data.length) {
        // Если дома нет в OSM, пробуем найти хотя бы улицу.
        const street = query.replace(/,?\s*\d+[а-яa-z]?\.?$/i, '').trim();
        if (street && street !== query) data = await search(street);
      }
      if (!data.length) {
        setError('Адрес не найден. Уточните улицу и номер дома.');
        return;
      }
      handleMapPick(Number(data[0].lat), Number(data[0].lon));
    } catch {
      setError('Не удалось найти адрес. Выберите точку на карте вручную.');
    } finally {
      setGeocoding(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    // Проверяем обязательные поля до запроса, чтобы не гонять сеть зря.
    const phone = form.phone.trim();
    if (phone.length < 7) {
      setError('Укажите телефон для связи');
      return;
    }
    if (form.deliveryMethod === 'courier' && !form.address.trim()) {
      setError('Для доставки курьером нужен адрес');
      return;
    }
    if (
      form.deliveryMethod === 'courier' &&
      form.deliveryZone === 'outside' &&
      distance <= 0
    ) {
      setError('Укажите расстояние за МКАД в километрах');
      return;
    }
    if (
      form.deliveryMethod === 'courier' &&
      form.deliveryZone === 'outside' &&
      distance > 50
    ) {
      setError('Доставка только по Минскому району: не более 50 км от города');
      return;
    }
    if (form.deliveryMethod === 'courier' && deliveryPoint) {
      const pointCheck = calculateDelivery(
        deliveryPoint.lat,
        deliveryPoint.lng,
        itemsTotal,
      );
      if (!pointCheck.reachable) {
        setError(pointCheck.message || 'Доставка по этой точке недоступна');
        return;
      }
    }

    setLoading(true);
    try {
      // Сначала отправляем локальные позиции на сервер, затем оформляем заказ.
      await syncCart(items);
      const order = await createOrder({
        deliveryMethod: form.deliveryMethod,
        deliveryZone: form.deliveryZone,
        distanceKm: form.deliveryZone === 'outside' ? distance : null,
        paymentMethod: form.paymentMethod,
        phone,
        address: form.address.trim(),
        email: user?.email || '',
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
            {items.reduce((sum, item) => sum + item.qty, 0)}{' '}
            {plural(
              items.reduce((sum, item) => sum + item.qty, 0),
              'единица',
              'единицы',
              'единиц',
            )}{' '}
            товара на {money(itemsTotal)}
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
              <span>E-mail для писем</span>
              <input readOnly type="email" value={user?.email || ''} />
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
                  <small>
                    по Минску бесплатно от 500 BYN, иначе 10 BYN; за МКАД — 15 BYN + 3
                    BYN/км
                  </small>
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
                  <strong>Самовывоз — бесплатно</strong>
                  <small>{PICKUP_ADDRESS}</small>
                </span>
              </label>
            </div>

            {form.deliveryMethod === 'courier' && (
              <div className="delivery-fields">
                <label className="field">
                  <span>Адрес доставки</span>
                  <div className="address-row">
                    <input
                      autoComplete="street-address"
                      name="address"
                      onChange={changeField}
                      placeholder="Минск, ул. Примерная, 1"
                      type="text"
                      value={form.address}
                    />
                    <button
                      className="btn btn-secondary btn-sm"
                      disabled={geocoding}
                      onClick={geocodeAddress}
                      type="button"
                    >
                      {geocoding ? 'Ищем…' : 'Найти на карте'}
                    </button>
                  </div>
                </label>

                <div className="choice-list">
                  <label
                    className={`choice${form.deliveryZone === 'minsk' ? ' is-on' : ''}`}
                  >
                    <input
                      checked={form.deliveryZone === 'minsk'}
                      name="deliveryZone"
                      onChange={changeField}
                      type="radio"
                      value="minsk"
                    />
                    <span>
                      <strong>В пределах МКАД</strong>
                      <small>бесплатно от 500 BYN, иначе 10 BYN</small>
                    </span>
                  </label>
                  <label
                    className={`choice${form.deliveryZone === 'outside' ? ' is-on' : ''}`}
                  >
                    <input
                      checked={form.deliveryZone === 'outside'}
                      name="deliveryZone"
                      onChange={changeField}
                      type="radio"
                      value="outside"
                    />
                    <span>
                      <strong>За МКАД</strong>
                      <small>15 BYN + 3 BYN за каждый километр</small>
                    </span>
                  </label>
                </div>

                {form.deliveryZone === 'outside' && !deliveryBlocked && (
                  <label className="field">
                    <span>Расстояние от МКАД, км</span>
                    <input
                      max="50"
                      min="0"
                      name="distanceKm"
                      onChange={changeField}
                      placeholder="Например, 8"
                      step="0.1"
                      type="number"
                      value={form.distanceKm}
                    />
                  </label>
                )}
              </div>
            )}

            <div className="delivery-map">
              <div className="delivery-map-head">
                <strong>
                  {form.deliveryMethod === 'pickup' ? 'Пункт выдачи' : 'Точка доставки'}
                </strong>
                <span className="small faint">
                  {form.deliveryMethod === 'pickup'
                    ? 'Самовывоз'
                    : deliveryBlocked
                      ? 'Доставка недоступна'
                      : form.deliveryZone === 'outside'
                        ? `За МКАД, ${form.distanceKm || 0} км`
                        : 'В пределах МКАД'}
                </span>
                <a href={mapHref} rel="noreferrer" target="_blank">
                  Открыть в Яндекс Картах
                </a>
                <button
                  className="link-button"
                  onClick={() => setMapFullscreen(true)}
                  type="button"
                >
                  На весь экран
                </button>
              </div>
              <div
                className="delivery-map-click"
                onClickCapture={(event) => {
                  if (event.target.closest('.leaflet-control')) return;
                  setMapFullscreen(true);
                }}
                role="presentation"
              >
                <DeliveryMap
                  mode={form.deliveryMethod}
                  onPick={handleMapPick}
                  pickEnabled={false}
                  point={deliveryPoint}
                />
              </div>
              <div className="delivery-map-hint">
                {form.deliveryMethod === 'pickup'
                  ? 'Пункт выдачи отмечен на карте. Нажмите на карту, чтобы открыть её на весь экран.'
                  : 'Кликните по карте, чтобы выбрать точку доставки — зона и стоимость рассчитаются автоматически. Карта откроется на весь экран.'}
              </div>
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
          <div className="checkout-line">
            <span>Товары</span>
            <strong>{money(itemsTotal)}</strong>
          </div>
          <div className="checkout-line">
            <span>
              Доставка
              {form.deliveryMethod === 'courier' &&
                form.deliveryZone === 'minsk' &&
                itemsTotal < 500 &&
                ' (до 500 BYN)'}
            </span>
            <strong>
              {deliveryBlocked
                ? 'недоступна'
                : deliveryCost === 0
                  ? 'бесплатно'
                  : money(deliveryCost)}
            </strong>
          </div>
          <div className="checkout-total">
            <span>Итого</span>
            <strong>{money(total)}</strong>
          </div>
          <p className="hint">
            Оплата демонстрационная: менеджер подтвердит заказ и пришлёт ссылку или
            примет оплату при получении.
          </p>
          {error && (
            <div className="state error" role="alert">
              {error}
            </div>
          )}
          <button className="btn" disabled={loading || deliveryBlocked} type="submit">
            {loading ? 'Оформляем…' : 'Подтвердить заказ'}
          </button>
        </aside>
      </form>

      {mapFullscreen && (
        <div
          aria-label="Карта доставки на весь экран"
          aria-modal="true"
          className="map-fullscreen"
          role="dialog"
        >
          <div className="map-fullscreen-bar">
            <div>
              <strong>
                {form.deliveryMethod === 'pickup' ? 'Пункт выдачи' : 'Точка доставки'}
              </strong>
              <span className="small faint">
                {form.deliveryMethod === 'pickup'
                  ? 'Самовывоз'
                  : deliveryBlocked
                    ? 'Доставка недоступна'
                    : form.deliveryZone === 'outside'
                      ? `За МКАД, ${form.distanceKm || 0} км`
                      : 'В пределах МКАД'}
              </span>
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setMapFullscreen(false)}
              type="button"
            >
              Закрыть карту
            </button>
          </div>
          <div className="map-fullscreen-body">
            <DeliveryMap
              mode={form.deliveryMethod}
              onPick={handleMapPick}
              point={deliveryPoint}
            />
          </div>
          <div className="map-fullscreen-hint">
            {form.deliveryMethod === 'pickup'
              ? 'Пункт выдачи отмечен синим маркером.'
              : 'Кликните по карте, чтобы выбрать точку. Зона и стоимость доставки пересчитаются автоматически.'}
          </div>
        </div>
      )}
    </div>
  );
}
