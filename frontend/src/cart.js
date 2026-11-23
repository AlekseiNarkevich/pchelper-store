/**
 * Корзина PCHelper.
 *
 * Гость хранит корзину в localStorage. После входа состав синхронизируется
 * с серверной корзиной Supabase: изменения сразу уходят на сервер,
 * а при входе данные подтягиваются на любое устройство.
 *
 * Формат позиции: { id, name, price, imageUrl, qty }.
 */

import { readAuth } from './auth.js';
import { reportError } from './errorBus.js';

const KEY = 'pchelper-cart';
const EVENT = 'pchelper-cart-change';

/** Читает корзину, переживая испорченное значение в localStorage. */
export function readCart() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Сохраняет корзину и сообщает об изменении подписчикам. */
function writeCart(items) {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(EVENT));
}

/**
 * Приводит позицию серверной корзины к локальному виду.
 *
 * @param {object} item Позиция сервера.
 * @returns {object}
 */
function toLocal(item) {
  return {
    id: item.id,
    name: item.name,
    price: Number(item.price),
    imageUrl: item.imageUrl || null,
    stock: item.stock == null ? undefined : Number(item.stock),
    qty: Number(item.qty || 1),
  };
}

/**
 * Заменяет локальную корзину данными сервера.
 *
 * @param {Array<object>} items Позиции сервера.
 */
export function replaceCart(items) {
  writeCart(items.map(toLocal));
}

/**
 * Выполняет фоновую синхронизацию с сервером.
 *
 * @param {Function} action Действие с клиентом commerce.
 * @returns {Promise<void>}
 */
async function pushToServer(action) {
  if (!readAuth().accessToken) return;
  try {
    const commerce = await import('./commerce.js');
    await action(commerce);
  } catch (error) {
    reportError(error.message);
  }
}

/** Добавляет товар или увеличивает количество уже выбранного. */
export function addToCart(product) {
  const stock = product.stock == null ? 99 : Number(product.stock);
  if (stock <= 0) {
    reportError(`Товара «${product.name}» нет на складе`);
    return false;
  }

  const items = readCart();
  const found = items.find((item) => item.id === product.id);
  if (found) {
    if (found.qty >= stock) {
      reportError(`На складе только ${stock} шт. товара «${product.name}»`);
      return false;
    }
    found.qty += 1;
  } else {
    items.push({
      id: product.id,
      name: product.name,
      price: product.price,
      imageUrl: product.imageUrl || null,
      stock,
      qty: 1,
    });
  }
  writeCart(items);
  void pushToServer((commerce) => commerce.addServerItem(product.id, 1));
  return true;
}

/**
 * Добавляет в корзину готовый набор комплектующих (сборку).
 *
 * Используется конфигуратором и сохранёнными сборками. Товары без остатка
 * пропускаются, чтобы не класть в корзину то, что нельзя купить.
 *
 * @param {Array<object>} products Комплектующие сборки.
 * @returns {{added: number, skipped: string[]}}
 */
export function addBuildToCart(products) {
  const added = [];
  const skipped = [];

  for (const product of products) {
    if (!product?.id) continue;
    if (product.stock != null && Number(product.stock) <= 0) {
      skipped.push(product.name);
      continue;
    }
    if (addToCart(product)) {
      added.push(product.name);
    } else {
      skipped.push(product.name);
    }
  }

  if (skipped.length) {
    reportError(`Нет на складе: ${skipped.join(', ')}`);
  }

  return { added: added.length, skipped };
}

/** Общее количество единиц товара. */
export function cartCount() {
  return readCart().reduce((sum, item) => sum + item.qty, 0);
}

/** Сумма корзины в рублях. */
export function cartTotal() {
  return readCart().reduce((sum, item) => sum + item.price * item.qty, 0);
}

/** Меняет количество позиции; ноль удаляет её из корзины. */
export function setQty(id, qty) {
  const items = readCart()
    .map((item) => {
      if (item.id !== id) return item;
      const max = Number(item.stock ?? 99);
      return { ...item, qty: Math.min(qty, max) };
    })
    .filter((item) => item.qty > 0);
  writeCart(items);
  void pushToServer((commerce) =>
    qty > 0 ? commerce.updateServerItem(id, qty) : commerce.removeServerItem(id),
  );
}

/** Удаляет позицию из корзины. */
export function removeItem(id) {
  writeCart(readCart().filter((item) => item.id !== id));
  void pushToServer((commerce) => commerce.removeServerItem(id));
}

/** Очищает корзину. */
export function clearCart() {
  writeCart([]);
  void pushToServer((commerce) => commerce.clearServerCart());
}

/**
 * Очищает только локальную корзину при выходе.
 *
 * Серверная корзина пользователя остаётся в Supabase и подтянется
 * при следующем входе. Это не даёт следующему пользователю на том же
 * устройстве увидеть чужие товары.
 */
export function clearLocalCart() {
  writeCart([]);
}

/**
 * Подтягивает серверную корзину после входа и объединяет её с локальной.
 *
 * Для каждой позиции берётся максимальное количество: это не даёт
 * задвоить товары, если локальная корзина уже совпадала с серверной.
 *
 * @returns {Promise<void>}
 */
export async function mergeCartWithServer() {
  if (!readAuth().accessToken) return;
  try {
    const commerce = await import('./commerce.js');
    const server = await commerce.getServerCart();
    const map = new Map(server.items.map((item) => [item.id, item]));

    for (const item of readCart()) {
      const remote = map.get(item.id);
      if (!remote) {
        await commerce.addServerItem(item.id, item.qty);
      } else if (item.qty > remote.qty) {
        await commerce.updateServerItem(item.id, item.qty);
      }
    }

    const merged = await commerce.getServerCart();
    replaceCart(merged.items);
  } catch (error) {
    reportError(error.message);
  }
}

/** Подписка на изменение корзины; возвращает функцию отписки. */
export function onCartChange(listener) {
  window.addEventListener(EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}
