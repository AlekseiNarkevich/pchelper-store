/**
 * PCHelper — рекомендации «с этим товаром часто покупают».
 *
 * Смотрим позиции прошлых заказов: если товар из корзины уже встречался
 * в заказе, считаем, какие товары покупали вместе с ним. Если истории
 * ещё нет — добираем популярные товары из каталога.
 */

import { getProduct, listProducts } from './catalog.repository.js';
import { supabase } from '../services/supabase.service.js';

/**
 * Превращает «cpu:1,case:2» в список категорий и числовых id.
 *
 * @param {string[]} rawIds Идентификаторы из корзины.
 * @returns {Array<{key: string, category: string, id: number}>}
 */
function parseIds(rawIds) {
  const result = [];
  for (const raw of rawIds || []) {
    const [category, value] = String(raw).split(':');
    const id = Number(value);
    if (!category || !Number.isInteger(id) || id <= 0) continue;
    result.push({ key: `${category}:${id}`, category, id });
  }
  return result;
}

/**
 * Подбирает товары для блока рекомендаций.
 *
 * @param {string[]} rawIds Товары в корзине.
 * @param {number} [limit] Сколько рекомендаций вернуть.
 * @returns {Promise<{items: object[], total: number}>}
 */
export async function recommendForCart(rawIds, limit = 4, client = supabase) {
  const targets = parseIds(rawIds);
  const targetKeys = new Set(targets.map((item) => item.key));
  const safeLimit = Math.min(Math.max(Number(limit) || 4, 1), 8);
  const items = [];

  if (client && targets.length) {
    const { data, error } = await client
      .from('Заказ_Позиции')
      .select('заказ_id,тип_компонента,идентификатор');
    if (error) {
      console.error('[recommendations] позиции заказов:', error.message);
    } else {
      const orderIds = new Set();
      for (const row of data || []) {
        const key = `${row['тип_компонента']}:${row['идентификатор']}`;
        if (targetKeys.has(key)) orderIds.add(row['заказ_id']);
      }

      const counts = new Map();
      for (const row of data || []) {
        if (!orderIds.has(row['заказ_id'])) continue;
        const key = `${row['тип_компонента']}:${row['идентификатор']}`;
        if (targetKeys.has(key)) continue;
        counts.set(key, (counts.get(key) || 0) + 1);
      }

      const ranked = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, safeLimit * 3);

      for (const [key] of ranked) {
        const product = await getProduct(key);
        if (!product || Number(product.stock ?? 0) <= 0) continue;
        if (items.some((item) => item.id === product.id)) continue;
        items.push(product);
      }
    }
  }

  // Если истории не хватило, показываем товары из каталога: сначала
  // из других категорий, чтобы набор выглядел разнообразнее.
  if (items.length < safeLimit) {
    const catalog = await listProducts({ limit: 100 });
    const cartCategories = new Set(targets.map((item) => item.category));
    const fallback = catalog.items
      .filter(
        (product) =>
          !targetKeys.has(product.id) &&
          Number(product.stock ?? 0) > 0 &&
          !items.some((item) => item.id === product.id),
      )
      .sort((a, b) => {
        const aOther = cartCategories.has(a.category) ? 1 : 0;
        const bOther = cartCategories.has(b.category) ? 1 : 0;
        return aOther - bOther;
      });

    for (const product of fallback) {
      items.push(product);
      if (items.length >= safeLimit) break;
    }
  }

  return { items: items.slice(0, safeLimit), total: items.length };
}
