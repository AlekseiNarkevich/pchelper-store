/**
 * PCHelper — Админ-панель: заказы, товары, готовые ПК, запросы
 * на поступление, журнал писем, пользователи и модерация отзывов.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { getCategories, money } from '../api.js';
import { readAuth } from '../auth.js';
import { checkCompatibility } from '../builds.js';
import { onDataChanged } from '../dataBus.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { useAutoRefresh } from '../useAutoRefresh.js';
import {
  createPrebuilt,
  createProduct,
  deleteEmail,
  deleteEmailsBulk,
  deleteOrder,
  deleteOrdersBulk,
  deletePrebuilt,
  deleteProduct,
  deleteReview,
  deleteStockRequest,
  deleteStockRequestsBulk,
  deleteUser,
  getEmails,
  getOrders,
  getPrebuilts,
  getProducts,
  getReviews,
  getStockRequests,
  getSummary,
  getUsers,
  moderateReview,
  resendEmail,
  sendTestEmail,
  updateOrder,
  updatePrebuilt,
  updateProduct,
  updateStockRequest,
  updateUser,
  uploadProductImage,
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

/** Русские подписи полей товара для формы админки. */
const FIELD_LABELS = {
  название: 'Название',
  производитель: 'Производитель',
  сокет: 'Сокет',
  ядра_потоки: 'Ядра / потоки',
  частота: 'Частота',
  tdp: 'TDP, Вт',
  встроенная_графика: 'Встроенная графика',
  поддержка_памяти: 'Поддержка памяти',
  цена: 'Цена, BYN',
  фото_url: 'Ссылка на фото',
  тип_памяти: 'Тип памяти',
  форм_фактор: 'Форм-фактор',
  чипсет: 'Чипсет',
  фазы_питания: 'Фазы питания',
  макс_объем_памяти: 'Макс. объём памяти, ГБ',
  m2_слоты: 'M.2 слоты',
  sata_порты: 'SATA порты',
  объем: 'Объём, ГБ',
  профили_разгона: 'Профили разгона',
  тайминги: 'Тайминги',
  объем_памяти: 'Объём памяти, ГБ',
  длина: 'Длина, мм',
  количество_вентиляторов: 'Кол-во вентиляторов',
  толщина_в_слотах: 'Толщина, слотов',
  мощность_в_ваттах: 'Мощность, Вт',
  стандарт_блока_питания: 'Стандарт БП',
  сертификат_80plus: 'Сертификат 80 PLUS',
  сертификат_cybenetics: 'Сертификат Cybenetics',
  модульный: 'Модульный',
  pcie_gen5: 'PCIe 5.0',
  количество_pcie: 'Разъёмы PCIe',
  количество_cpu: 'Разъёмы CPU',
  количество_sata: 'Разъёмы SATA',
  объем_в_гб: 'Объём, ГБ',
  интерфейс: 'Интерфейс',
  скорость_чтения_записи: 'Скорость чтения / записи',
  драм_буфер: 'DRAM-буфер',
  радиатор_охлаждения: 'Радиатор',
  макс_длина_gpu: 'Макс. длина GPU, мм',
  макс_высота_кулера: 'Макс. высота кулера, мм',
  поддержка_сжо: 'Поддержка СЖО',
  макс_длина_радиатора: 'Макс. длина радиатора, мм',
  вентиляторы_в_комплекте: 'Вентиляторы в комплекте',
  тип: 'Тип',
  высота: 'Высота, мм',
  длина_радиатора: 'Длина радиатора, мм',
  шум_макс: 'Макс. шум, дБ',
  количество: 'Количество на складе',
};

/** Статусы заказа.
 *
 * «Отправлен» не используется: для ПВЗ достаточно «Готов к выдаче»,
 * для курьера — «Доставлен», а «Завершён» ставится после получения.
 */
const ORDER_STATUSES = [
  'Новый',
  'В обработке',
  'Собран',
  'Готов к выдаче',
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

/** Русские названия ролей пользователей. */
const ROLE_LABELS = {
  customer: 'Покупатель',
  manager: 'Менеджер',
  admin: 'Администратор',
};

/** Русские названия категорий для запросов на поступление:
 *  в базе хранится служебный id вроде «motherboard:9». */
const CATEGORY_LABELS = {
  cpu: 'Процессор',
  motherboard: 'Материнская плата',
  ram: 'Оперативная память',
  gpu: 'Видеокарта',
  psu: 'Блок питания',
  storage: 'Накопитель',
  case: 'Корпус',
  cooling: 'Охлаждение',
};

/** Русские подписи статусов отзыва. */
const REVIEW_STATUS_LABELS = {
  'на модерации': 'На модерации',
  опубликован: 'Опубликован',
  отклонён: 'Отклонён',
};

/** Русские подписи статусов запросов на поступление. */
const REQUEST_STATUS_LABELS = {
  новый: 'Новый',
  обработан: 'Обработан',
};

/**
 * Категории, из которых собирается готовый ПК в админке.
 * Порядок совпадает с порядком полей в форме.
 */
const PREBUILT_CATEGORIES = [
  ['cpu', 'Процессор'],
  ['motherboard', 'Материнская плата'],
  ['ram', 'Оперативная память'],
  ['gpu', 'Видеокарта'],
  ['cooling', 'Система охлаждения'],
  ['storage', 'Накопитель'],
  ['psu', 'Блок питания'],
  ['case', 'Корпус'],
];

/**
 * Значение строки для сортировки таблицы.
 *
 * @param {string} kind Какая таблица: prebuilt, products или users.
 * @param {object} row Строка.
 * @param {string} field Поле сортировки.
 * @returns {string|number}
 */
function sortValue(kind, row, field) {
  if (kind === 'products') {
    if (field === 'name') return row['название'] || '';
    if (field === 'price') return Number(row['цена'] || 0);
    return Number(row.id || 0);
  }
  if (kind === 'users') {
    if (field === 'role') return ROLE_LABELS[row.role] || row.role || '';
    if (field === 'status') {
      return row.deleted ? 'удалён' : row.blocked ? 'заблокирован' : 'активен';
    }
    return row.name || row.email || '';
  }
  if (field === 'price') return Number(row.price || 0);
  if (field === 'stock') return Number(row.stock || 0);
  if (field === 'name') return row.name || '';
  return Number(row.id || 0);
}

/**
 * Сортировка строк таблицы по клику на заголовок.
 *
 * Повторный клик по тому же полю меняет направление. Сортировка
 * выполняется на клиенте: списки в админке небольшие.
 *
 * @param {object[]} items Строки.
 * @param {string} kind Тип таблицы.
 * @param {string} initialField Поле по умолчанию.
 * @returns {{sorted: object[], sort: object, onSort: Function}}
 */
function useTableSort(items, kind, initialField) {
  const [sort, setSort] = useState({ field: initialField, direction: 'asc' });

  function onSort(field) {
    setSort((current) =>
      current.field === field
        ? { field, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { field, direction: 'asc' },
    );
  }

  const sorted = useMemo(() => {
    const list = [...items];
    list.sort((a, b) => {
      const left = sortValue(kind, a, sort.field);
      const right = sortValue(kind, b, sort.field);
      const result =
        typeof left === 'number' && typeof right === 'number'
          ? left - right
          : String(left).localeCompare(String(right), 'ru', { numeric: true });
      return sort.direction === 'asc' ? result : -result;
    });
    return list;
  }, [items, kind, sort]);

  return { sorted, sort, onSort };
}

/**
 * Заголовок таблицы с кнопкой сортировки.
 *
 * @param {object} props Свойства.
 * @returns {React.ReactElement}
 */
function SortHeader({ label, field, sort, onSort }) {
  const active = sort.field === field;
  return (
    <th
      aria-sort={
        active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'
      }
    >
      <button
        className={`sort-head${active ? ' is-on' : ''}`}
        onClick={() => onSort(field)}
        type="button"
      >
        {label}
        <span aria-hidden="true">
          {active ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
    </th>
  );
}

/**
 * Пустая форма готовой сборки.
 *
 * @returns {object}
 */
function emptyPrebuilt() {
  return {
    name: '',
    task: '',
    photoUrl: '',
    stock: 0,
    cpu: '',
    motherboard: '',
    ram: '',
    gpu: '',
    cooling: '',
    storage: '',
    psu: '',
    case: '',
  };
}

/**
 * Собирает идентификаторы компонентов для проверки совместимости.
 *
 * @param {object} form Поля формы сборки.
 * @returns {object} Например, { cpu: 'cpu:1', storage: ['storage:2'] }.
 */
function prebuiltComponentIds(form) {
  const components = {};
  for (const [category] of PREBUILT_CATEGORIES) {
    const value = form[category];
    if (!value) continue;
    if (category === 'storage') components.storage = [`storage:${value}`];
    else components[category] = `${category}:${value}`;
  }
  return components;
}

/**
 * Название позиции по служебному id вида «motherboard:9».
 *
 * @param {string} productId Идентификатор из запроса на поступление.
 * @returns {string}
 */
function productRef(productId) {
  const [category, id] = String(productId || '').split(':');
  return `${CATEGORY_LABELS[category] || category || 'Товар'} #${id || '—'}`;
}

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
 * Модальное окно с обязательной причиной действия.
 *
 * Используется для блокировки, разблокировки, удаления аккаунта,
 * смены роли и модерации отзывов: причина уходит пользователю письмом.
 *
 * @param {object} props Свойства.
 * @returns {React.ReactElement|null}
 */
function ActionReasonDialog({
  open,
  title,
  text,
  label = 'Комментарий',
  placeholder = 'Укажите причину',
  confirmLabel = 'Подтвердить',
  danger = false,
  busy = false,
  value,
  onChange,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <div
        aria-labelledby="action-reason-title"
        aria-modal="true"
        className="modal"
        role="dialog"
      >
        <h3 id="action-reason-title">{title}</h3>
        {text && <p className="muted">{text}</p>}
        <label className="field">
          <span>{label}</span>
          <textarea
            autoFocus
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            rows={3}
            value={value}
          />
          <span className="small faint">
            Текст уйдёт пользователю письмом и сохранится в истории.
          </span>
        </label>
        <div className="modal-actions">
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            Отмена
          </button>
          <button
            className={danger ? 'btn btn-danger' : 'btn'}
            disabled={busy || !value.trim()}
            onClick={onConfirm}
            type="button"
          >
            {busy ? 'Сохраняем…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
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

  // Сводка перечитывается после действий в любой вкладке и при возврате
  // в окно: иначе после удаления заказа цифра остаётся старой.
  useEffect(() => {
    let alive = true;
    const load = () => {
      getSummary()
        .then((data) => {
          if (alive) setSummary(data);
        })
        .catch((reason) => {
          if (alive) setError(reason.message);
        });
    };
    load();
    const stop = onDataChanged(load);
    return () => {
      alive = false;
      stop();
    };
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
      {summary ? (
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
          <div className="summary-wide">
            <span>Выручка за всё время</span>
            <strong>{money(summary.revenue)}</strong>
          </div>
          <div>
            <span>Заказов сегодня</span>
            <strong>{summary.ordersToday}</strong>
          </div>
          <div>
            <span>Нет в наличии</span>
            <strong>{summary.outOfStock}</strong>
          </div>
        </div>
      ) : (
        <div className="state">Загружаем сводку…</div>
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
  const [cancelIntent, setCancelIntent] = useState('cancel');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [bulkOpen, setBulkOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    getOrders()
      .then((data) => {
        if (alive) setOrders(data.items);
      })
      .catch((error) => onError(error.message))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [onError]);

  // Тихо перечитываем заказы после действий в другой вкладке админки.
  useAutoRefresh(() => {
    getOrders()
      .then((data) => setOrders(data.items))
      .catch(() => {});
  });

  // При смене фильтра сбрасываем выбор: скрытые заказы не должны
  // случайно удалиться вместе с видимыми.
  useEffect(() => {
    setSelected([]);
  }, [filter]);

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
      const next = draft(order);
      const updated = await updateOrder(order.id, next);
      setOrders((current) =>
        current.map((item) =>
          item.id === updated.id ? { ...item, ...updated } : item,
        ),
      );
      clearDraft(order.id);

      // Завершённый заказ уходит из «Активных»: показываем, куда он делся.
      if (next.status === 'Завершён' && order.status !== 'Завершён') {
        setFilter('completed');
      }
      onFlash(
        next.status === 'Завершён'
          ? `Заказ ${order.number} завершён и перенесён в «Завершённые»`
          : `Заказ ${order.number} обновлён`,
      );
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
  // status — только отменить, delete — отменить и сразу удалить.
  function openCancel(order, intent = 'cancel') {
    setCancelTarget(order);
    setCancelIntent(intent);
    setReason('');
  }

  function closeCancel() {
    if (busy) return;
    setCancelTarget(null);
    setCancelIntent('cancel');
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

      if (cancelIntent === 'delete') {
        setOrders((current) =>
          current.map((item) =>
            item.id === updated.id ? { ...item, ...updated } : item,
          ),
        );
        await deleteOrder(cancelTarget.id);
        setOrders((current) => current.filter((item) => item.id !== cancelTarget.id));
        clearDraft(cancelTarget.id);
        onFlash(
          `Заказ ${cancelTarget.number} отменён и удалён — покупателю отправлено письмо с причиной`,
        );
      } else {
        setOrders((current) =>
          current.map((item) =>
            item.id === updated.id ? { ...item, ...updated } : item,
          ),
        );
        clearDraft(cancelTarget.id);
        // Сразу показываем отменённый заказ в соответствующем фильтре,
        // чтобы он не выглядел «исчезнувшим».
        setFilter('cancelled');
        onFlash(
          `Заказ ${cancelTarget.number} отменён — письмо отправлено, заказ в разделе «Отменённые»`,
        );
      }

      setCancelTarget(null);
      setCancelIntent('cancel');
      setReason('');
    } catch (error) {
      onError(error.message);
    } finally {
      setBusy(false);
    }
  }

  // Финальные заказы удаляем сразу: письмо и причина не нужны.
  async function removeFinal(order) {
    try {
      await deleteOrder(order.id);
      setOrders((current) => current.filter((item) => item.id !== order.id));
      clearDraft(order.id);
      onFlash(`Заказ ${order.number} удалён из списка`);
    } catch (error) {
      onError(error.message);
    }
  }

  function toggleSelect(id) {
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  function toggleAll() {
    const ids = visibleOrders.map((order) => order.id);
    setSelected((current) => (current.length === ids.length ? [] : ids));
  }

  async function removeSelected() {
    if (!selected.length) return;
    try {
      const result = await deleteOrdersBulk(selected);
      setSelected([]);
      setBulkOpen(false);
      const fresh = await getOrders();
      setOrders(fresh.items);
      onFlash(
        result.skipped
          ? `Удалено заказов: ${result.deleted}. Пропущено: ${result.skipped} — сначала отмените или завершите их.`
          : `Удалено заказов: ${result.deleted}`,
      );
    } catch (error) {
      onError(error.message);
    }
  }

  const visibleOrders = orders.filter((order) => {
    // Финальные заказы не забивают активный список. Они доступны
    // в отдельных вкладках «Отменённые» и «Завершённые».
    if (filter === 'cancelled') return order.status === 'Отменён';
    if (filter === 'completed') return order.status === 'Завершён';
    if (filter === 'all') return true;
    return !['Отменён', 'Завершён'].includes(order.status);
  });

  if (loading) return <div className="state">Загружаем заказы…</div>;
  if (!orders.length) return <div className="state">Заказов пока нет.</div>;

  return (
    <>
      {/* Отменённые заказы не забивают список, но остаются доступны. */}
      <div className="chips order-filter" role="group" aria-label="Фильтр заказов">
        {[
          ['active', 'Активные'],
          ['cancelled', 'Отменённые'],
          ['completed', 'Завершённые'],
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
          <div className="bulk-bar">
            <label className="bulk-all">
              <input
                checked={
                  visibleOrders.length > 0 && selected.length === visibleOrders.length
                }
                onChange={toggleAll}
                type="checkbox"
              />
              Выбрать все
            </label>
            <button
              className="btn btn-danger btn-sm"
              disabled={!selected.length}
              onClick={() => setBulkOpen(true)}
              type="button"
            >
              Удалить выбранные ({selected.length})
            </button>
          </div>

          {visibleOrders.map((order) => (
            <article className="admin-order" key={order.id}>
              <header>
                <label className="bulk-check">
                  <input
                    aria-label={`Выбрать заказ ${order.number}`}
                    checked={selected.includes(order.id)}
                    onChange={() => toggleSelect(order.id)}
                    type="checkbox"
                  />
                </label>
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
                      ['Отменён', 'Завершён'].includes(order.status)
                        ? removeFinal(order)
                        : openCancel(order, 'delete')
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

              {order.customerComment && (
                <div className="order-comment">
                  Комментарий покупателя: {order.customerComment}
                </div>
              )}

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
        <div className="modal-backdrop">
          <div
            aria-labelledby="cancel-order-title"
            aria-modal="true"
            className="modal"
            role="dialog"
          >
            <h3 id="cancel-order-title">
              {cancelIntent === 'delete'
                ? `Удалить заказ ${cancelTarget.number}?`
                : `Отменить заказ ${cancelTarget.number}?`}
            </h3>
            <p className="muted">
              {cancelIntent === 'delete'
                ? 'Заказ получит статус «Отменён», покупателю уйдёт письмо с причиной, после чего заказ будет удалён из базы.'
                : 'Заказ получит статус «Отменён» и останется в разделе «Отменённые». Покупателю уйдёт письмо с причиной.'}
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
                {busy
                  ? 'Сохраняем…'
                  : cancelIntent === 'delete'
                    ? 'Отменить и удалить'
                    : 'Отменить заказ'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        onCancel={() => setBulkOpen(false)}
        onConfirm={removeSelected}
        open={bulkOpen}
        text={`Выбрано заказов: ${selected.length}. Активные заказы удалены не будут — сначала отмените или завершите их.`}
        title="Удалить выбранные заказы?"
      />
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
  const [loading, setLoading] = useState(true);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);
  const { sorted: sortedItems, sort, onSort } = useTableSort(items, 'products', 'id');

  useEffect(() => {
    getCategories()
      .then((data) => setCategories(data.items))
      .catch((reason) => onError(reason.message));
  }, [onError]);

  // Загрузка товаров выбранной категории; форма редактирования справа.
  function load(nextCategory = category) {
    setLoading(true);
    getProducts(nextCategory)
      .then((data) => setItems(data.items))
      .catch((reason) => onError(reason.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    setForm({});
    setEditingId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  // Список товаров мог измениться в другой вкладке; форму не трогаем.
  useAutoRefresh(() => {
    getProducts(category)
      .then((data) => setItems(data.items))
      .catch(() => {});
  });

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

  // Фото можно не искать в интернете, а загрузить файлом: backend кладёт
  // его в Supabase Storage и возвращает публичную ссылку в фото_url.
  async function uploadPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPhotoBusy(true);
    try {
      const result = await uploadProductImage(file);
      setForm((current) => ({ ...current, фото_url: result.url }));
      onFlash('Фото загружено — ссылка подставлена в форму');
    } catch (reason) {
      onError(reason.message);
    } finally {
      setPhotoBusy(false);
    }
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
            throw new Error(`Поле «${FIELD_LABELS[key] || key}»: некорректный JSON`);
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

  async function remove() {
    const row = removeTarget;
    if (!row) return;
    try {
      await deleteProduct(category, row.id);
      setRemoveTarget(null);
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
            {loading ? (
              <div className="state">Загружаем товары…</div>
            ) : (
              <table className="picker">
                <thead>
                  <tr>
                    <SortHeader field="id" label="ID" onSort={onSort} sort={sort} />
                    <SortHeader
                      field="name"
                      label="Название"
                      onSort={onSort}
                      sort={sort}
                    />
                    <SortHeader
                      field="price"
                      label="Цена"
                      onSort={onSort}
                      sort={sort}
                    />
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {sortedItems.map((row) => (
                    <tr key={row.id}>
                      <td>{row.id}</td>
                      <td className="picker-name">{row['название']}</td>
                      <td>{money(row['цена'])}</td>
                      <td>
                        <div className="admin-row-actions">
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => startEdit(row)}
                            type="button"
                          >
                            Изменить
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => setRemoveTarget(row)}
                            type="button"
                          >
                            Удалить
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <form className="admin-editor" onSubmit={save}>
          <div className="panel-head">
            <h3>{editingId ? `Товар #${editingId}` : 'Новый товар'}</h3>
            {editingId && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={startCreate}
                type="button"
              >
                Отменить
              </button>
            )}
          </div>

          <div className="admin-fields">
            {fields.map(([key, type]) => (
              <React.Fragment key={key}>
                <label className="field">
                  <span>{FIELD_LABELS[key] || key}</span>
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

                {/* Загрузка фото прямо в форму: ссылка и предпросмотр. */}
                {key === 'фото_url' && (
                  <div className="admin-photo">
                    <input
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      disabled={photoBusy}
                      onChange={uploadPhoto}
                      type="file"
                    />
                    <span className="small faint">
                      {photoBusy
                        ? 'Загружаем фото…'
                        : 'Файл до 5 МБ: JPG, PNG, WebP или GIF. Ссылка заполнится сама.'}
                    </span>
                    {form[key] && (
                      <img
                        alt="Предпросмотр товара"
                        className="admin-photo-preview"
                        src={form[key]}
                      />
                    )}
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>

          <button className="btn" type="submit">
            {editingId ? 'Сохранить товар' : 'Добавить товар'}
          </button>
        </form>
      </div>

      <ConfirmDialog
        onCancel={() => setRemoveTarget(null)}
        onConfirm={remove}
        open={Boolean(removeTarget)}
        text="Товар исчезнет из каталога и корзины. Уже оформленные заказы не изменятся."
        title={`Удалить товар «${removeTarget?.['название'] || ''}»?`}
      />
    </div>
  );
}

/** Готовые компьютеры: состав, остаток, добавление и удаление. */
function PrebuiltStockPanel({ onError, onFlash }) {
  const [items, setItems] = useState([]);
  const [options, setOptions] = useState({});
  const [form, setForm] = useState(emptyPrebuilt);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState(null);
  const [checking, setChecking] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);
  const { sorted: sortedItems, sort, onSort } = useTableSort(items, 'prebuilt', 'name');

  // Кроме сборок нужны каталоги всех категорий: из них выбирается состав.
  function load() {
    setLoading(true);
    Promise.all([
      getPrebuilts(),
      ...PREBUILT_CATEGORIES.map(([category]) => getProducts(category)),
    ])
      .then(([list, ...productLists]) => {
        setItems(list.items);
        const next = {};
        productLists.forEach((data, index) => {
          next[PREBUILT_CATEGORIES[index][0]] = data.items;
        });
        setOptions(next);
      })
      .catch((reason) => onError(reason.message))
      .finally(() => setLoading(false));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  // Сборки могли изменить в соседней вкладке; форму не сбрасываем.
  useAutoRefresh(() => {
    getPrebuilts()
      .then((data) => setItems(data.items))
      .catch(() => {});
  });

  function startCreate() {
    setEditingId(null);
    setForm(emptyPrebuilt());
  }

  function startEdit(item) {
    setEditingId(item.id);
    const next = emptyPrebuilt();
    next.name = item.name || '';
    next.task = item.task || '';
    next.photoUrl = item.photoUrl || '';
    next.stock = item.stock ?? 0;
    for (const [category] of PREBUILT_CATEGORIES) {
      const value =
        category === 'storage' ? item.storage?.[0] : item.components?.[category];
      next[category] = value ? String(value) : '';
    }
    setForm(next);
  }

  function changeField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  // Мини-конфигуратор: после каждого изменения проверяем совместимость
  // тем же серверным правилом, что и основной сборщик. Запрос с задержкой,
  // чтобы не отправлять его на каждую нажатую клавишу.
  useEffect(() => {
    const ids = prebuiltComponentIds(form);
    if (!Object.keys(ids).length) {
      setCheck(null);
      setChecking(false);
      return undefined;
    }

    let alive = true;
    setChecking(true);
    const timer = setTimeout(() => {
      checkCompatibility(ids)
        .then((result) => {
          if (alive) setCheck(result);
        })
        .catch(() => {
          if (alive) setCheck(null);
        })
        .finally(() => {
          if (alive) setChecking(false);
        });
    }, 350);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [form]);

  async function save(event) {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) {
      onError('Укажите название сборки');
      return;
    }

    const ids = prebuiltComponentIds(form);
    if (!Object.keys(ids).length) {
      onError('Выберите комплектующие для сборки');
      return;
    }

    const components = {};
    for (const [category] of PREBUILT_CATEGORIES) {
      const value = form[category];
      if (!value) continue;
      if (category === 'storage') components.storage = [Number(value)];
      else components[category] = Number(value);
    }

    const data = {
      name,
      task: form.task.trim(),
      photoUrl: form.photoUrl.trim(),
      stock: Number(form.stock) || 0,
      components,
    };

    setBusy(true);
    try {
      // Несовместимую сборку нельзя сохранить: в магазине она станет
      // готовым ПК, который заведомо не заработает.
      const result = await checkCompatibility(ids);
      setCheck(result);
      if (!result.compatible) {
        onError(`Сборка несовместима: ${result.errors.join(' ')}`);
        return;
      }

      if (editingId) {
        await updatePrebuilt(editingId, data);
        onFlash(`Сборка «${name}» сохранена`);
      } else {
        await createPrebuilt(data);
        onFlash(`Сборка «${name}» добавлена`);
      }
      startCreate();
      load();
    } catch (reason) {
      onError(reason.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const item = removeTarget;
    if (!item) return;
    try {
      await deletePrebuilt(item.id);
      if (editingId === item.id) startCreate();
      setRemoveTarget(null);
      load();
      onFlash('Сборка удалена');
    } catch (reason) {
      onError(reason.message);
    }
  }

  return (
    <div className="admin-products">
      <div className="admin-products-grid">
        <div>
          <div className="panel-head">
            <h3>Готовые сборки</h3>
            <button className="btn btn-sm" onClick={startCreate} type="button">
              + Добавить
            </button>
          </div>

          <div className="picker-wrap">
            {loading ? (
              <div className="state">Загружаем сборки…</div>
            ) : !items.length ? (
              <div className="state">Сборок пока нет. Добавьте первую.</div>
            ) : (
              <table className="picker">
                <thead>
                  <tr>
                    <SortHeader
                      field="name"
                      label="Сборка"
                      onSort={onSort}
                      sort={sort}
                    />
                    <SortHeader
                      field="price"
                      label="Цена"
                      onSort={onSort}
                      sort={sort}
                    />
                    <SortHeader
                      field="stock"
                      label="На складе"
                      onSort={onSort}
                      sort={sort}
                    />
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {sortedItems.map((item) => (
                    <tr key={item.id}>
                      <td className="picker-name">
                        {item.name}
                        {item.task && <div className="small faint">{item.task}</div>}
                      </td>
                      <td>{money(item.price)}</td>
                      <td>{item.stock}</td>
                      <td>
                        <div className="admin-row-actions">
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => startEdit(item)}
                            type="button"
                          >
                            Изменить
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => setRemoveTarget(item)}
                            type="button"
                          >
                            Удалить
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <form className="admin-editor" onSubmit={save}>
          <div className="panel-head">
            <h3>{editingId ? `Сборка #${editingId}` : 'Новая сборка'}</h3>
            {editingId && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={startCreate}
                type="button"
              >
                Отменить
              </button>
            )}
          </div>

          <div className="admin-fields">
            <label className="field">
              <span>Название</span>
              <input name="name" onChange={changeField} required value={form.name} />
            </label>

            <label className="field">
              <span>Для каких задач</span>
              <input
                name="task"
                onChange={changeField}
                placeholder="Офис, учёба, игры"
                value={form.task}
              />
            </label>

            <label className="field">
              <span>Ссылка на фото</span>
              <input
                name="photoUrl"
                onChange={changeField}
                placeholder="/images/products/..."
                value={form.photoUrl}
              />
            </label>

            <label className="field">
              <span>На складе, шт.</span>
              <input
                min="0"
                name="stock"
                onChange={changeField}
                type="number"
                value={form.stock}
              />
            </label>

            {PREBUILT_CATEGORIES.map(([category, label]) => {
              const selected = (options[category] || []).find(
                (product) => String(product.id) === String(form[category]),
              );
              const selectedStock = Number(selected?.['количество'] ?? 0);
              return (
                <label className="field" key={category}>
                  <span>{label}</span>
                  <select name={category} onChange={changeField} value={form[category]}>
                    <option value="">— не выбрано —</option>
                    {(options[category] || []).map((product) => (
                      <option key={product.id} value={String(product.id)}>
                        {product['название']} — {money(product['цена'])}
                      </option>
                    ))}
                  </select>
                  {selected && (
                    <span className="small faint">
                      {selectedStock > 0
                        ? `В наличии: ${selectedStock} шт.`
                        : 'Нет в наличии'}
                    </span>
                  )}
                </label>
              );
            })}
          </div>

          {checking && <div className="small faint">Проверяем совместимость…</div>}
          {check && (
            <>
              <div className={`compat-badge${check.compatible ? ' is-ok' : ' is-bad'}`}>
                {check.compatible
                  ? 'Сборка совместима'
                  : `Найдено проблем: ${check.errors.length}`}
              </div>
              {check.errors?.length > 0 && (
                <ul className="compat-errors">
                  {check.errors.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
              )}
              {check.warnings?.length > 0 && (
                <ul className="compat-warnings">
                  {check.warnings.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
              )}
              <div className="small faint">
                Стоимость комплектующих: {money(check.total)}
              </div>
            </>
          )}

          <button className="btn" disabled={busy || checking} type="submit">
            {busy ? 'Сохраняем…' : editingId ? 'Сохранить сборку' : 'Добавить сборку'}
          </button>
        </form>
      </div>

      <ConfirmDialog
        onCancel={() => setRemoveTarget(null)}
        onConfirm={remove}
        open={Boolean(removeTarget)}
        text="Сборка исчезнет из каталога и корзин покупателей. Уже оформленные заказы сохранят состав."
        title={`Удалить сборку «${removeTarget?.name || ''}»?`}
      />
    </div>
  );
}

/** Запросы на поступление товара. */
function StockRequestsPanel({ onError, onFlash }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [selected, setSelected] = useState([]);
  const [bulkOpen, setBulkOpen] = useState(false);

  function load() {
    setLoading(true);
    getStockRequests()
      .then((data) => setItems(data.items))
      .catch((reason) => onError(reason.message))
      .finally(() => setLoading(false));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  useAutoRefresh(() => {
    getStockRequests()
      .then((data) => setItems(data.items))
      .catch(() => {});
  });

  async function mark(request) {
    try {
      await updateStockRequest(request.id, 'обработан');
      load();
      onFlash('Запрос отмечен обработанным');
    } catch (reason) {
      onError(reason.message);
    }
  }

  async function remove() {
    const request = removeTarget;
    if (!request) return;
    try {
      await deleteStockRequest(request.id);
      setRemoveTarget(null);
      load();
      onFlash('Запрос удалён');
    } catch (reason) {
      onError(reason.message);
    }
  }

  function toggleSelect(id) {
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  function toggleAll() {
    setSelected((current) =>
      current.length === items.length ? [] : items.map((item) => item.id),
    );
  }

  async function removeSelected() {
    if (!selected.length) return;
    try {
      const result = await deleteStockRequestsBulk(selected);
      setSelected([]);
      setBulkOpen(false);
      load();
      onFlash(
        result.skipped
          ? `Удалено: ${result.deleted}. Пропущено: ${result.skipped} — сначала ответьте покупателю.`
          : `Удалено запросов: ${result.deleted}`,
      );
    } catch (reason) {
      onError(reason.message);
    }
  }

  if (loading) return <div className="state">Загружаем запросы…</div>;
  if (!items.length) return <div className="state">Запросов нет.</div>;

  return (
    <div className="admin-list">
      <div className="bulk-bar">
        <label className="bulk-all">
          <input
            checked={items.length > 0 && selected.length === items.length}
            onChange={toggleAll}
            type="checkbox"
          />
          Выбрать все
        </label>
        <button
          className="btn btn-danger btn-sm"
          disabled={!selected.length}
          onClick={() => setBulkOpen(true)}
          type="button"
        >
          Удалить выбранные ({selected.length})
        </button>
      </div>

      {items.map((request) => (
        <article className="admin-order" key={request.id}>
          <header>
            <label className="bulk-check">
              <input
                aria-label={`Выбрать запрос «${request.productName}»`}
                checked={selected.includes(request.id)}
                onChange={() => toggleSelect(request.id)}
                type="checkbox"
              />
            </label>
            <div>
              <h3>{request.productName}</h3>
              <div className="small faint">
                {productRef(request.productId)} · {request.email || 'без e-mail'} ·{' '}
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
              {REQUEST_STATUS_LABELS[request.status] || request.status}
            </span>
          </header>
          {request.status === 'новый' ? (
            <div className="admin-row-actions">
              <button
                className="btn btn-sm"
                onClick={() => mark(request)}
                type="button"
              >
                Отметить обработанным
              </button>
              <span className="small faint">Удалить можно после ответа покупателю</span>
            </div>
          ) : (
            <button
              className="btn btn-danger btn-sm"
              onClick={() => setRemoveTarget(request)}
              type="button"
            >
              Удалить
            </button>
          )}
        </article>
      ))}

      <ConfirmDialog
        onCancel={() => setRemoveTarget(null)}
        onConfirm={remove}
        open={Boolean(removeTarget)}
        text="Запись исчезнет из списка. Покупатель уже получил ответ о поступлении товара."
        title={`Удалить запрос на «${removeTarget?.productName || ''}»?`}
      />

      <ConfirmDialog
        onCancel={() => setBulkOpen(false)}
        onConfirm={removeSelected}
        open={bulkOpen}
        text={`Выбрано запросов: ${selected.length}. Необработанные удалены не будут — сначала ответьте покупателю.`}
        title="Удалить выбранные запросы?"
      />
    </div>
  );
}

/** Журнал писем и повторная отправка. */
function EmailsPanel({ onError, onFlash }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [configured, setConfigured] = useState(false);
  const [to, setTo] = useState(readAuth()?.user?.email || '');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [selected, setSelected] = useState([]);
  const [bulkOpen, setBulkOpen] = useState(false);

  function load() {
    setLoading(true);
    getEmails(500)
      .then((data) => {
        setItems(data.items);
        setTotal(data.total);
        setConfigured(data.configured);
      })
      .catch((reason) => onError(reason.message))
      .finally(() => setLoading(false));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  useAutoRefresh(() => {
    getEmails(500)
      .then((data) => {
        setItems(data.items);
        setTotal(data.total);
        setConfigured(data.configured);
      })
      .catch(() => {});
  });

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

  async function remove() {
    const item = removeTarget;
    if (!item) return;
    try {
      await deleteEmail(item.id);
      setRemoveTarget(null);
      load();
      onFlash('Письмо удалено из журнала');
    } catch (reason) {
      onError(reason.message);
    }
  }

  function toggleSelect(id) {
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  function toggleAll() {
    setSelected((current) =>
      current.length === items.length ? [] : items.map((item) => item.id),
    );
  }

  async function removeSelected() {
    if (!selected.length) return;
    try {
      const result = await deleteEmailsBulk(selected);
      setSelected([]);
      setBulkOpen(false);
      load();
      onFlash(`Удалено писем: ${result.deleted}`);
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

      <div className="bulk-bar">
        <label className="bulk-all">
          <input
            checked={items.length > 0 && selected.length === items.length}
            onChange={toggleAll}
            type="checkbox"
          />
          Выбрать все
        </label>
        <span className="small faint">
          Показано {items.length} из {total}
          {total > items.length ? ' — удаляются только показанные' : ''}
        </span>
        <button
          className="btn btn-danger btn-sm"
          disabled={!selected.length}
          onClick={() => setBulkOpen(true)}
          type="button"
        >
          Удалить выбранные ({selected.length})
        </button>
      </div>

      {loading ? (
        <div className="state">Загружаем письма…</div>
      ) : (
        !items.length && <div className="state">Писем пока нет.</div>
      )}

      {items.map((item) => (
        <article className="admin-order" key={item.id}>
          <header>
            <label className="bulk-check">
              <input
                aria-label={`Выбрать письмо «${item.subject}»`}
                checked={selected.includes(item.id)}
                onChange={() => toggleSelect(item.id)}
                type="checkbox"
              />
            </label>
            <div>
              <h3>{item.subject}</h3>
              <div className="small faint">
                {item.email} · {new Date(item.createdAt).toLocaleString('ru-RU')}
              </div>
              {item.error && <div className="small faint">Ошибка: {item.error}</div>}
            </div>
            <span className={`status-badge ${item.sent ? 'is-done' : 'is-progress'}`}>
              {item.sent ? 'Отправлено' : 'Не отправлено'}
            </span>
          </header>
          <div className="admin-row-actions">
            {!item.sent && (
              <button
                className="btn btn-sm"
                onClick={() => sendAgain(item)}
                type="button"
              >
                Отправить снова
              </button>
            )}
            <button
              className="btn btn-danger btn-sm"
              onClick={() => setRemoveTarget(item)}
              type="button"
            >
              Удалить
            </button>
          </div>
        </article>
      ))}

      <ConfirmDialog
        onCancel={() => setRemoveTarget(null)}
        onConfirm={remove}
        open={Boolean(removeTarget)}
        text="Удаляется только запись журнала. Письмо, уже отправленное получателю, не отзывается."
        title={`Удалить письмо «${removeTarget?.subject || ''}»?`}
      />

      <ConfirmDialog
        onCancel={() => setBulkOpen(false)}
        onConfirm={removeSelected}
        open={bulkOpen}
        text={`Будет удалено записей журнала: ${selected.length}. Уже отправленные письма у получателей останутся.`}
        title="Удалить выбранные письма?"
      />
    </div>
  );
}

/** Пользователи: роли, блокировка и удаление с причиной. */
function UsersPanel({ onError, onFlash }) {
  const [users, setUsers] = useState([]);
  const { sorted: sortedUsers, sort, onSort } = useTableSort(users, 'users', 'name');
  const [dialog, setDialog] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const currentId = readAuth().user?.id;

  function load() {
    setLoading(true);
    getUsers()
      .then((data) => setUsers(data.items))
      .catch((error) => onError(error.message))
      .finally(() => setLoading(false));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  useAutoRefresh(() => {
    getUsers()
      .then((data) => setUsers(data.items))
      .catch(() => {});
  });

  function openAction(user, type, role) {
    const defaults = {
      block: 'Нарушение правил магазина',
      unblock: 'Аккаунт разблокирован администратором',
      delete: '',
      role: 'Изменение роли аккаунта',
    };
    setDialog({ user, type, role });
    setReason(defaults[type] || '');
  }

  function closeAction() {
    if (busy) return;
    setDialog(null);
    setReason('');
  }

  // Любое действие с аккаунтом требует причины и уходит пользователю письмом.
  async function confirmAction() {
    if (!dialog || !reason.trim()) return;
    const { user, type, role } = dialog;
    setBusy(true);
    try {
      if (type === 'delete') {
        await deleteUser(user.id, reason.trim());
      } else if (type === 'role') {
        await updateUser(user.id, { role, reason: reason.trim() });
      } else {
        await updateUser(user.id, {
          blocked: type === 'block',
          reason: reason.trim(),
        });
      }
      load();
      const messages = {
        block: `Аккаунт ${user.email} заблокирован — письмо отправлено`,
        unblock: `Аккаунт ${user.email} разблокирован — письмо отправлено`,
        delete: `Аккаунт ${user.email} удалён — письмо отправлено`,
        role: `Роль ${user.email} изменена — письмо отправлено`,
      };
      onFlash(messages[type]);
      setDialog(null);
      setReason('');
    } catch (error) {
      onError(error.message);
    } finally {
      setBusy(false);
    }
  }

  const dialogConfig =
    dialog?.type === 'block'
      ? {
          title: `Заблокировать ${dialog.user.email}?`,
          text: 'Пользователь не сможет войти в аккаунт. Причина уйдёт ему письмом.',
          label: 'Причина блокировки',
          confirmLabel: 'Заблокировать',
          danger: true,
        }
      : dialog?.type === 'unblock'
        ? {
            title: `Разблокировать ${dialog.user.email}?`,
            text: 'Вход снова станет доступен. Комментарий уйдёт пользователю письмом.',
            label: 'Комментарий',
            confirmLabel: 'Разблокировать',
            danger: false,
          }
        : dialog?.type === 'delete'
          ? {
              title: `Удалить аккаунт ${dialog.user.email}?`,
              text: 'Аккаунт будет обезличен, заказы останутся без контактов. Причина уйдёт письмом до удаления.',
              label: 'Причина удаления',
              confirmLabel: 'Удалить аккаунт',
              danger: true,
            }
          : dialog?.type === 'role'
            ? {
                title: `Сменить роль на «${ROLE_LABELS[dialog.role] || dialog.role}»?`,
                text: 'Пользователь получит письмо о новой роли и комментарий.',
                label: 'Комментарий',
                confirmLabel: 'Сменить роль',
                danger: false,
              }
            : null;

  if (loading) return <div className="state">Загружаем пользователей…</div>;

  return (
    <>
      <div className="admin-users-wrap">
        <table className="admin-users">
          <thead>
            <tr>
              <SortHeader
                field="name"
                label="Пользователь"
                onSort={onSort}
                sort={sort}
              />
              <SortHeader field="role" label="Роль" onSort={onSort} sort={sort} />
              <SortHeader field="status" label="Статус" onSort={onSort} sort={sort} />
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {sortedUsers.map((user) => (
              <tr className={user.id === currentId ? 'is-self' : ''} key={user.id}>
                <td>
                  <div className="admin-user-main">
                    <strong>
                      {user.name && user.name !== user.email ? user.name : 'Без имени'}
                    </strong>
                    <span className="admin-user-email">{user.email}</span>
                    <small>
                      ID {user.id}
                      {user.createdAt
                        ? ` · ${new Date(user.createdAt).toLocaleDateString('ru-RU')}`
                        : ''}
                    </small>
                  </div>
                </td>
                <td>
                  {user.id === currentId ? (
                    <span className="status-badge is-done">Администратор</span>
                  ) : (
                    <select
                      aria-label={`Роль ${user.email}`}
                      className="admin-role"
                      onChange={(event) => {
                        if (event.target.value !== user.role) {
                          openAction(user, 'role', event.target.value);
                        }
                      }}
                      value={user.role}
                    >
                      <option value="customer">Покупатель</option>
                      {/* Роль manager осталась в базе, но отдельных прав не даёт:
                          в интерфейсе показываем её только у старых записей. */}
                      {user.role === 'manager' && (
                        <option value="manager">Менеджер (без прав)</option>
                      )}
                      <option value="admin">Администратор</option>
                    </select>
                  )}
                </td>
                <td>
                  <span
                    className={`status-badge ${user.blocked ? 'is-cancel' : 'is-done'}`}
                  >
                    {user.blocked ? 'Заблокирован' : 'Активен'}
                  </span>
                  {user.blocked && user.blockReason && (
                    <div className="admin-user-reason">{user.blockReason}</div>
                  )}
                </td>
                <td>
                  <div className="admin-user-actions">
                    {user.role === 'admin' ? (
                      <span className="small faint">Аккаунт защищён</span>
                    ) : (
                      <>
                        <button
                          className={`btn btn-sm ${user.blocked ? 'btn-secondary' : 'btn-warn'}`}
                          onClick={() =>
                            openAction(user, user.blocked ? 'unblock' : 'block')
                          }
                          type="button"
                        >
                          {user.blocked ? 'Разблокировать' : 'Заблокировать'}
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => openAction(user, 'delete')}
                          type="button"
                        >
                          Удалить
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ActionReasonDialog
        busy={busy}
        confirmLabel={dialogConfig?.confirmLabel}
        danger={dialogConfig?.danger}
        label={dialogConfig?.label}
        onChange={setReason}
        onCancel={closeAction}
        onConfirm={confirmAction}
        open={Boolean(dialogConfig)}
        text={dialogConfig?.text}
        title={dialogConfig?.title || ''}
        value={reason}
      />
    </>
  );
}

/** Отзывы: модерация и удаление с письмом автору. */
function ReviewsPanel({ onError, onFlash }) {
  const [reviews, setReviews] = useState([]);
  const [status, setStatus] = useState('на модерации');
  const [dialog, setDialog] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  function load(next = status) {
    setLoading(true);
    getReviews(next)
      .then((data) => setReviews(data.items))
      .catch((error) => onError(error.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load(status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useAutoRefresh(() => {
    getReviews(status)
      .then((data) => setReviews(data.items))
      .catch(() => {});
  });

  function openAction(review, action) {
    const defaults = {
      publish: 'Отзыв соответствует правилам магазина.',
      reject: '',
      delete: '',
    };
    setDialog({ review, action });
    setReason(defaults[action] || '');
  }

  function closeAction() {
    if (busy) return;
    setDialog(null);
    setReason('');
  }

  async function confirmAction() {
    if (!dialog || !reason.trim()) return;
    const { review, action } = dialog;
    setBusy(true);
    try {
      let result;
      if (action === 'delete') {
        result = await deleteReview(review.id, reason.trim());
      } else {
        result = await moderateReview(
          review.id,
          action === 'publish' ? 'опубликован' : 'отклонён',
          reason.trim(),
        );
      }
      load(status);
      const messages = {
        publish: 'Отзыв опубликован',
        reject: 'Отзыв отклонён',
        delete: 'Отзыв удалён',
      };
      onFlash(
        result?.emailSent
          ? `${messages[action]} — автору отправлено письмо`
          : `${messages[action]} — письмо не отправлено: ${
              result?.emailError || 'у автора не указан e-mail'
            }`,
      );
      setDialog(null);
      setReason('');
    } catch (error) {
      onError(error.message);
    } finally {
      setBusy(false);
    }
  }

  const dialogConfig =
    dialog?.action === 'publish'
      ? {
          title: 'Опубликовать отзыв?',
          text: 'Отзыв появится на странице товара. Автор получит письмо с комментарием.',
          label: 'Комментарий модератора',
          confirmLabel: 'Опубликовать',
          danger: false,
        }
      : dialog?.action === 'reject'
        ? {
            title: 'Отклонить отзыв?',
            text: 'Отзыв не будет показан. Автор получит письмо с причиной.',
            label: 'Причина отклонения',
            confirmLabel: 'Отклонить',
            danger: true,
          }
        : dialog?.action === 'delete'
          ? {
              title: 'Удалить отзыв?',
              text: 'Отзыв будет удалён безвозвратно. Автор получит письмо с причиной.',
              label: 'Причина удаления',
              confirmLabel: 'Удалить отзыв',
              danger: true,
            }
          : null;

  return (
    <div>
      <div className="admin-categories">
        {[
          ['на модерации', 'На модерации'],
          ['опубликован', 'Опубликованные'],
          ['отклонён', 'Отклонённые'],
          ['', 'Все'],
        ].map(([value, label]) => (
          <button
            className={`chip${status === value ? ' is-on' : ''}`}
            key={value || 'all'}
            onClick={() => setStatus(value)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="state">Загружаем отзывы…</div>
      ) : (
        !reviews.length && <div className="state">Отзывов нет.</div>
      )}

      <div className="admin-list">
        {reviews.map((review) => (
          <article className="admin-order" key={review.id}>
            <header>
              <div>
                <h3>
                  {review.productName || review.productId} · {review.rating} / 5
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
                {REVIEW_STATUS_LABELS[review.status] || review.status}
              </span>
            </header>
            <p>{review.text || 'Без текста'}</p>
            <div className="admin-actions">
              {review.status !== 'опубликован' && (
                <button
                  className="btn btn-sm"
                  onClick={() => openAction(review, 'publish')}
                  type="button"
                >
                  Опубликовать
                </button>
              )}
              {review.status !== 'отклонён' && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => openAction(review, 'reject')}
                  type="button"
                >
                  Отклонить
                </button>
              )}
              <button
                className="btn btn-danger btn-sm"
                onClick={() => openAction(review, 'delete')}
                type="button"
              >
                Удалить
              </button>
            </div>
          </article>
        ))}
      </div>

      <ActionReasonDialog
        busy={busy}
        confirmLabel={dialogConfig?.confirmLabel}
        danger={dialogConfig?.danger}
        label={dialogConfig?.label}
        onChange={setReason}
        onCancel={closeAction}
        onConfirm={confirmAction}
        open={Boolean(dialogConfig)}
        text={dialogConfig?.text}
        title={dialogConfig?.title || ''}
        value={reason}
      />
    </div>
  );
}
