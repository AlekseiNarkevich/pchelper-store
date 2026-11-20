/**
 * PCHelper (курсовая) — репозиторий сохранённых сборок.
 *
 * Сборка хранится в Supabase: строка в «Сборки» и по строке на компонент
 * в «Сборка_Компоненты». Без переменных окружения используется память
 * процесса — контракт API не меняется.
 */

import { apiError, validation } from '../domain/errors.js';
import {
  checkCompatibility,
  COMPONENT_FIELDS,
  parseProductId,
  selectionTotal,
} from '../services/compatibility.service.js';
import { isDatabaseConnected, supabase } from '../services/supabase.service.js';
import { getProduct } from './catalog.repository.js';

/** Сборки демонстрационного режима: пользователь → сборки. */
const memoryBuilds = new Map();

let nextBuildId = 1;

/**
 * Ошибка базы данных для сборок.
 *
 * @param {string} action Действие.
 * @param {object} error Ошибка.
 * @returns {Error & {status: number, code: string}}
 */
function databaseFailure(action, error) {
  console.error(`[builds] ${action}:`, error?.message || error);
  return apiError(
    502,
    'DATABASE_ERROR',
    `Не удалось ${action}: ${error?.message || 'ошибка базы данных'}`,
  );
}

/**
 * Ключ локального хранилища.
 *
 * @param {string} userId Идентификатор.
 * @returns {string}
 */
function key(userId) {
  return String(userId);
}

/**
 * Разбирает входной объект компонентов в массив строк.
 *
 * Поддерживается вид `{ cpu: 'cpu:1', storage: ['storage:2'] }`.
 * Одна категория (кроме накопителей) может быть выбрана только один раз.
 *
 * @param {object} input Компоненты из тела запроса.
 * @returns {Array<{category: string, productId: number, quantity: number}>}
 */
export function parseComponents(input) {
  const rows = [];
  const seen = new Set();

  for (const category of Object.keys(COMPONENT_FIELDS)) {
    const raw = input?.[category];
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const item of list) {
      const parsed = parseProductId(item, category);
      if (!parsed) {
        throw validation(`Некорректный идентификатор компонента «${category}»`);
      }
      const duplicateKey = `${category}:${parsed.productId}`;
      if (seen.has(duplicateKey)) continue;
      seen.add(duplicateKey);
      rows.push({ category, productId: parsed.productId, quantity: 1 });
    }
  }

  const single = new Set();
  return rows.filter((row) => {
    if (row.category === 'storage') return true;
    if (single.has(row.category)) return false;
    single.add(row.category);
    return true;
  });
}

/**
 * Загружает товары по разобранным компонентам.
 *
 * @param {Array<{category: string, productId: number}>} rows Компоненты.
 * @returns {Promise<object>} Выбор по категориям.
 */
export async function resolveSelection(rows) {
  const selection = {
    cpu: null,
    motherboard: null,
    ram: null,
    gpu: null,
    cooling: null,
    storage: [],
    psu: null,
    case: null,
  };

  for (const row of rows) {
    const product = await getProduct(`${row.category}:${row.productId}`);
    if (!product) {
      throw validation(`Товар «${row.category}:${row.productId}» не найден`);
    }
    if (row.category === 'storage') selection.storage.push(product);
    else selection[row.category] = product;
  }

  return selection;
}

/**
 * Приводит строку «Сборки» к виду API.
 *
 * @param {object} row Строка.
 * @returns {object}
 */
function buildFromRow(row) {
  return {
    id: String(row.id),
    name: row['название'],
    note: row['заметка'] || '',
    total: Number(row['общая_стоимость'] || 0),
    createdAt: row['создан_в'],
    updatedAt: row['обновлён_в'],
  };
}

/**
 * Достаёт категорию и идентификатор из строки «Сборка_Компоненты».
 *
 * @param {object} row Строка.
 * @returns {{category: string, productId: number}|null}
 */
function componentFromRow(row) {
  for (const [category, field] of Object.entries(COMPONENT_FIELDS)) {
    if (row[field] != null) {
      return { category, productId: Number(row[field]) };
    }
  }
  return null;
}

/**
 * Преобразует компоненты в строки для Supabase.
 *
 * @param {number|string} buildId Идентификатор сборки.
 * @param {Array<{category: string, productId: number, quantity: number}>} components Компоненты.
 * @returns {object[]}
 */
function componentRows(buildId, components) {
  return components.map((component) => ({
    сборка_id: Number(buildId),
    количество: component.quantity || 1,
    [COMPONENT_FIELDS[component.category]]: Number(component.productId),
  }));
}

/**
 * Собирает полное представление сборки из строк.
 *
 * @param {object} row Сборка.
 * @param {Array<object>} rows Компоненты.
 * @returns {Promise<object>}
 */
async function expandBuild(row, rows) {
  const components = [];
  for (const componentRow of rows) {
    const found = componentFromRow(componentRow);
    if (!found) continue;
    const product = await getProduct(`${found.category}:${found.productId}`);
    if (!product) continue;
    components.push({
      category: found.category,
      productId: found.productId,
      quantity: Number(componentRow['количество'] || 1),
      product,
    });
  }

  const selection = {
    cpu: null,
    motherboard: null,
    ram: null,
    gpu: null,
    cooling: null,
    storage: [],
    psu: null,
    case: null,
  };
  for (const component of components) {
    if (component.category === 'storage') selection.storage.push(component.product);
    else selection[component.category] = component.product;
  }

  return {
    ...buildFromRow(row),
    components,
    compatibility: checkCompatibility(selection),
  };
}

/**
 * Список сборок пользователя.
 *
 * @param {string} userId Идентификатор.
 * @returns {Promise<{items: object[], total: number}>}
 */
export async function listBuilds(userId) {
  if (isDatabaseConnected()) {
    try {
      const { data, error } = await supabase
        .from('Сборки')
        .select('*')
        .eq('пользователь_id', Number(userId))
        .order('создан_в', { ascending: false });
      if (error) throw error;
      return { items: data.map(buildFromRow), total: data.length };
    } catch (error) {
      throw databaseFailure('работа со сборкой', error);
    }
  }

  const items = [...(memoryBuilds.get(key(userId))?.values() || [])].map((build) =>
    buildFromRow(build),
  );
  return { items, total: items.length };
}

/**
 * Полное представление сборки.
 *
 * @param {string} userId Идентификатор пользователя.
 * @param {string} buildId Идентификатор сборки.
 * @returns {Promise<object|null>}
 */
export async function getBuild(userId, buildId) {
  if (isDatabaseConnected()) {
    try {
      const { data, error } = await supabase
        .from('Сборки')
        .select('*')
        .eq('id', Number(buildId))
        .eq('пользователь_id', Number(userId))
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      const components = await supabase
        .from('Сборка_Компоненты')
        .select('*')
        .eq('сборка_id', Number(buildId));
      if (components.error) throw components.error;
      return expandBuild(data, components.data || []);
    } catch (error) {
      throw databaseFailure('работа со сборкой', error);
    }
  }

  const stored = memoryBuilds.get(key(userId))?.get(String(buildId));
  if (!stored) return null;
  return expandBuild(stored, stored.componentRows);
}

/**
 * Создаёт сборку.
 *
 * @param {string} userId Идентификатор пользователя.
 * @param {{name: string, note?: string, components: object}} data Данные.
 * @returns {Promise<object>}
 */
export async function createBuild(userId, data) {
  const name = String(data.name || '').trim();
  if (!name) throw validation('Укажите название сборки');
  if (name.length > 150) throw validation('Название длиннее 150 символов');

  const components = parseComponents(data.components || {});
  if (!components.length) throw validation('Выберите хотя бы один компонент');

  const selection = await resolveSelection(components);
  const total = selectionTotal(selection);
  const note = String(data.note || '')
    .trim()
    .slice(0, 1000);

  if (isDatabaseConnected()) {
    try {
      const { data: row, error } = await supabase
        .from('Сборки')
        .insert({
          пользователь_id: Number(userId),
          название: name,
          заметка: note || null,
          общая_стоимость: total,
        })
        .select('*')
        .single();
      if (error) throw error;

      const inserted = await supabase
        .from('Сборка_Компоненты')
        .insert(componentRows(row.id, components));
      if (inserted.error) throw inserted.error;

      return getBuild(userId, row.id);
    } catch (error) {
      throw databaseFailure('работа со сборкой', error);
    }
  }

  const id = String(nextBuildId++);
  const now = new Date().toISOString();
  const stored = {
    id,
    пользователь_id: Number(userId),
    название: name,
    заметка: note,
    общая_стоимость: total,
    создан_в: now,
    обновлён_в: now,
    componentRows: componentRows(id, components),
  };
  const builds = memoryBuilds.get(key(userId)) || new Map();
  builds.set(id, stored);
  memoryBuilds.set(key(userId), builds);
  return expandBuild(stored, stored.componentRows);
}

/**
 * Обновляет сборку.
 *
 * @param {string} userId Идентификатор пользователя.
 * @param {string} buildId Идентификатор сборки.
 * @param {{name: string, note?: string, components: object}} data Данные.
 * @returns {Promise<object|null>}
 */
export async function updateBuild(userId, buildId, data) {
  const current = await getBuild(userId, buildId);
  if (!current) return null;

  const name = String(data.name || '').trim();
  if (!name) throw validation('Укажите название сборки');
  if (name.length > 150) throw validation('Название длиннее 150 символов');

  const components = parseComponents(data.components || {});
  if (!components.length) throw validation('Выберите хотя бы один компонент');

  const selection = await resolveSelection(components);
  const total = selectionTotal(selection);
  const note = String(data.note || '')
    .trim()
    .slice(0, 1000);

  if (isDatabaseConnected()) {
    try {
      const updated = await supabase
        .from('Сборки')
        .update({
          название: name,
          заметка: note || null,
          общая_стоимость: total,
          обновлён_в: new Date().toISOString(),
        })
        .eq('id', Number(buildId))
        .eq('пользователь_id', Number(userId));
      if (updated.error) throw updated.error;

      const removed = await supabase
        .from('Сборка_Компоненты')
        .delete()
        .eq('сборка_id', Number(buildId));
      if (removed.error) throw removed.error;

      const inserted = await supabase
        .from('Сборка_Компоненты')
        .insert(componentRows(buildId, components));
      if (inserted.error) throw inserted.error;

      return getBuild(userId, buildId);
    } catch (error) {
      throw databaseFailure('работа со сборкой', error);
    }
  }

  const builds = memoryBuilds.get(key(userId));
  const stored = builds?.get(String(buildId));
  if (!stored) return null;
  stored['название'] = name;
  stored['заметка'] = note;
  stored['общая_стоимость'] = total;
  stored['обновлён_в'] = new Date().toISOString();
  stored.componentRows = componentRows(buildId, components);
  return expandBuild(stored, stored.componentRows);
}

/**
 * Удаляет сборку.
 *
 * @param {string} userId Идентификатор пользователя.
 * @param {string} buildId Идентификатор сборки.
 * @returns {Promise<boolean>}
 */
export async function deleteBuild(userId, buildId) {
  if (isDatabaseConnected()) {
    try {
      const { data, error } = await supabase
        .from('Сборки')
        .delete()
        .eq('id', Number(buildId))
        .eq('пользователь_id', Number(userId))
        .select('id');
      if (error) throw error;
      return (data || []).length > 0;
    } catch (error) {
      throw databaseFailure('работа со сборкой', error);
    }
  }

  const builds = memoryBuilds.get(key(userId));
  if (!builds) return false;
  return builds.delete(String(buildId));
}

/**
 * Проверяет сборку без сохранения.
 *
 * @param {object} components Компоненты из тела запроса.
 * @returns {Promise<object>}
 */
export async function checkBuild(components) {
  const rows = parseComponents(components || {});
  const selection = await resolveSelection(rows);
  const compatibility = checkCompatibility(selection);
  return {
    components: rows,
    total: selectionTotal(selection),
    ...compatibility,
  };
}

/**
 * Ошибка «сборка не найдена».
 *
 * @returns {Error & {status: number, code: string}}
 */
export function buildNotFound() {
  return apiError(404, 'BUILD_NOT_FOUND', 'Сборка не найдена');
}
