/**
 * PCHelper — История заказов покупателя: список заказов, состав,
 * статусы, история переходов и подтверждение получения.
 */

import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { money } from '../api.js';
import { replaceCart } from '../cart.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import {
  completeOrder,
  getOrderHistory,
  getServerCart,
  listOrders,
  refuseOrder,
  repeatOrder,
} from '../commerce.js';
import { onDataChanged } from '../dataBus.js';

/** Класс значка по статусу заказа. */
function statusClass(status) {
  // Новый — синий, отменённый — красный, финальные — зелёные,
  // остальные промежуточные — жёлтые.
  if (status === 'Новый') return 'is-new';
  if (status === 'Отменён') return 'is-cancel';
  if (status === 'Доставлен' || status === 'Готов к выдаче' || status === 'Завершён') {
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
  const [completeTarget, setCompleteTarget] = useState(null);
  const [completing, setCompleting] = useState(false);
  const [refuseTarget, setRefuseTarget] = useState(null);
  const [refuseReason, setRefuseReason] = useState('');
  const [refusing, setRefusing] = useState(false);
  const [repeating, setRepeating] = useState(null);
  const location = useLocation();
  // Если пользователь только что оформил заказ, показываем его сверху.
  const created = location.state?.order || null;

  // Подтверждение получения доступно для «Готов к выдаче» и «Доставлен».
  // После подтверждения заказ сразу становится «Завершён», письмо уже
  // отправляет backend; администратор увидит новый статус.
  async function complete() {
    if (!completeTarget || completing) return;
    setCompleting(true);
    try {
      await completeOrder(completeTarget.id);
      setOrders((current) =>
        current.map((item) =>
          item.id === completeTarget.id
            ? {
                ...item,
                status: 'Завершён',
                managerComment: 'Получение подтверждено покупателем',
              }
            : item,
        ),
      );
      setHistory((current) => ({ ...current, [completeTarget.id]: null }));
      setNotice(`Спасибо! Заказ ${completeTarget.number} завершён`);
      setCompleteTarget(null);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setCompleting(false);
    }
  }

  // Покупатель отказался от получения: заказ отменяется, товар
  // возвращается на склад, причина сохраняется в истории.
  async function refuseToReceive() {
    const reason = refuseReason.trim();
    if (!refuseTarget || !reason || refusing) return;
    setRefusing(true);
    try {
      const updated = await refuseOrder(refuseTarget.id, reason);
      setOrders((current) =>
        current.map((item) =>
          item.id === updated.id
            ? {
                ...item,
                status: updated.status,
                managerComment: `Отказ покупателя: ${reason}`,
              }
            : item,
        ),
      );
      setHistory((current) => ({ ...current, [updated.id]: null }));
      setNotice(`Заказ ${refuseTarget.number} отменён, товар вернётся на склад`);
      setRefuseTarget(null);
      setRefuseReason('');
    } catch (error) {
      setError(error.message);
    } finally {
      setRefusing(false);
    }
  }

  function closeRefuse() {
    if (refusing) return;
    setRefuseTarget(null);
    setRefuseReason('');
  }

  // Повтор заказа: backend сам проверяет остатки и добавляет позиции
  // в серверную корзину; локальную копию синхронизируем после ответа.
  async function repeat(order) {
    setError('');
    setNotice('');
    setRepeating(order.id);
    try {
      const result = await repeatOrder(order.id);
      const cart = await getServerCart();
      replaceCart(cart.items);
      if (!result.added) {
        setError('Не удалось добавить заказ: товаров нет в наличии');
      } else if (result.skipped.length) {
        setNotice(
          `Добавлено позиций: ${result.added}. Нет в наличии: ${result.skipped.join(', ')}`,
        );
      } else {
        setNotice(`Состав заказа ${order.number} добавлен в корзину`);
      }
    } catch (reason) {
      setError(reason.message);
    } finally {
      setRepeating(null);
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
    // Перечитываем заказы после действий админа и при возврате в окно:
    // статус мог измениться в другой вкладке.
    const load = () => {
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
    };
    load();
    const stop = onDataChanged(load);
    return () => {
      alive = false;
      stop();
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

      {notice && (
        <div className="state success">
          {notice}
          {notice.includes('добавлен в корзину') && (
            <>
              {' '}
              <Link to="/cart">Перейти в корзину</Link>
            </>
          )}
        </div>
      )}
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

            {['Готов к выдаче', 'Доставлен'].includes(order.status) && (
              <div className="order-received">
                <div>
                  <strong>Товар получен?</strong>
                  <div className="small faint">
                    Подтвердите — заказ станет «Завершён», и магазин увидит, что вы его
                    забрали.
                  </div>
                </div>
                <div className="order-received-actions">
                  <button
                    className="btn btn-sm"
                    onClick={() => setCompleteTarget(order)}
                    type="button"
                  >
                    Всё устраивает, товар получен
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setRefuseTarget(order);
                      setRefuseReason('');
                    }}
                    type="button"
                  >
                    Отказаться от получения
                  </button>
                </div>
              </div>
            )}

            <div className="order-actions">
              {['Завершён', 'Отменён'].includes(order.status) && (
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={repeating === order.id}
                  onClick={() => repeat(order)}
                  type="button"
                >
                  {repeating === order.id ? 'Добавляем…' : 'Повторить заказ'}
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

      {/* Подтверждение получения: после «Да» заказ сразу становится
          «Завершён», без ручной правки статуса администратором. */}
      <ConfirmDialog
        confirmLabel={completing ? 'Завершаем…' : 'Да, всё в порядке'}
        danger={false}
        onCancel={() => {
          if (!completing) setCompleteTarget(null);
        }}
        onConfirm={complete}
        open={Boolean(completeTarget)}
        text="Если товар у вас и всё в порядке, подтвердите получение. Заказ сразу станет «Завершён»."
        title={
          completeTarget
            ? `Заказ ${completeTarget.number} получен?`
            : 'Подтвердить получение?'
        }
      />

      {/* Отказ от получения: причина обязательна, заказ становится
          «Отменён», а товар возвращается на склад. */}
      {refuseTarget && (
        <div className="modal-backdrop" onClick={closeRefuse} role="presentation">
          <div
            aria-labelledby="refuse-title"
            aria-modal="true"
            className="modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <h3 id="refuse-title">Отказаться от заказа {refuseTarget.number}?</h3>
            <p className="muted">
              Заказ станет «Отменён», товар вернётся на склад. Причина уйдёт в магазин и
              сохранится в истории заказа.
            </p>
            <label className="field">
              <span>Причина отказа</span>
              <textarea
                onChange={(event) => setRefuseReason(event.target.value)}
                placeholder="Например: товар не подошёл"
                rows={3}
                value={refuseReason}
              />
            </label>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                disabled={refusing}
                onClick={closeRefuse}
                type="button"
              >
                Не отказываться
              </button>
              <button
                className="btn btn-danger"
                disabled={refusing || !refuseReason.trim()}
                onClick={refuseToReceive}
                type="button"
              >
                {refusing ? 'Отменяем…' : 'Отказаться и отменить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
