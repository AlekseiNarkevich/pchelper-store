/**
 * PCHelper — репозиторий администратора.
 *
 * Только серверные операции с Supabase: заказы, пользователи, товары.
 * Ошибки базы не подменяются памятью: администратор должен видеть,
 * что именно не сохранилось.
 */

import { CATEGORY_BY_ID, CATEGORIES } from '../domain/catalog.js';
import { apiError } from '../domain/errors.js';
import { getProduct, listPrebuilt } from './catalog.repository.js';
import { isDatabaseConnected, supabase } from '../services/supabase.service.js';
import { deleteAccount, findById } from './users.repository.js';
import { notifyPendingRequests } from './stock.repository.js';

/** Допустимые статусы заказа.
 *
 * «Отправлен» убран: для ПВЗ используется «Готов к выдаче»,
 * для курьера — «Доставлен», «Завершён» ставится после получения.
 */
export const ORDER_STATUSES = [
  'Новый',
  'В обработке',
  'Собран',
  'Готов к выдаче',
  'Доставлен',
  'Завершён',
  'Отменён',
];

/** Допустимые роли. */
export const USER_ROLES = ['customer', 'manager', 'admin'];

/**
 * Проверяет, что база подключена.
 */
function requireDatabase() {
  if (!isDatabaseConnected()) {
    throw apiError(
      503,
      'DATABASE_ERROR',
      'Supabase не настроен: административные действия недоступны',
    );
  }
}

/**
 * Превращает ошибку Supabase в понятную ошибку API.
 *
 * @param {string} action Действие для сообщения.
 * @param {object} error Ошибка.
 * @returns {Error & {status: number, code: string}}
 */
function databaseError(action, error) {
  console.error(`[admin] ${action}:`, error?.message || error);
  return apiError(
    502,
    'DATABASE_ERROR',
    `Не удалось ${action}: ${error?.message || 'ошибка базы данных'}`,
  );
}

/**
 * Проверяет код категории.
 *
 * @param {string} category Код.
 * @returns {object}
 */
function categoryOf(category) {
  const found = CATEGORY_BY_ID.get(category);
  if (!found) throw apiError(400, 'VALIDATION_ERROR', 'Неизвестная категория');
  return found;
}

/**
 * Приводит строку «Заказ_Позиции» к виду для интерфейса.
 *
 * @param {object} row Строка Supabase.
 * @returns {object}
 */
function mapOrderPosition(row) {
  return {
    id: String(row.id),
    category: row['тип_компонента'],
    productId: Number(row['идентификатор']),
    name: row['название'],
    price: Number(row['цена_за_единицу'] || 0),
    qty: Number(row['количество'] || 1),
    sum: Number(row['сумма'] || 0),
  };
}

/** Таблицы, где хранится остаток готовых сборок. */
const PREBUILT_TABLE = 'ГотовыеКонфигурации';

/**
 * Столбцы состава готовой сборки: код категории → поле в таблице.
 *
 * Накопителей может быть несколько, поэтому они лежат в отдельной
 * таблице связей «КонфигурацияНакопители».
 */
const PREBUILT_FIELDS = {
  cpu: 'процессор_id',
  motherboard: 'материнская_плата_id',
  ram: 'озу_id',
  gpu: 'видеокарта_id',
  psu: 'блокпитания_id',
  case: 'корпус_id',
  cooling: 'охлаждение_id',
};

/**
 * Проверяет форму готовой сборки и приводит её к строке таблицы.
 *
 * @param {object} data Данные из админки.
 * @returns {{row: object, storage: number[]}}
 */
export function prebuiltValues(data) {
  const name = String(data.name ?? '').trim();
  if (!name) throw apiError(400, 'VALIDATION_ERROR', 'Укажите название сборки');
  if (name.length > 255) {
    throw apiError(400, 'VALIDATION_ERROR', 'Название длиннее 255 символов');
  }

  const stock = Number(data.stock ?? 0);
  if (!Number.isInteger(stock) || stock < 0) {
    throw apiError(400, 'VALIDATION_ERROR', 'Количество должно быть неотрицательным');
  }

  const task = String(data.task ?? '').trim();
  if (task.length > 255) {
    throw apiError(400, 'VALIDATION_ERROR', 'Описание длиннее 255 символов');
  }

  const components =
    data.components && typeof data.components === 'object' ? data.components : {};
  const row = {
    название: name,
    задачи: task || null,
    фото_url: String(data.photoUrl ?? '').trim() || null,
    количество: stock,
  };
  for (const [category, field] of Object.entries(PREBUILT_FIELDS)) {
    const value = Number(components[category]);
    row[field] = Number.isInteger(value) && value > 0 ? value : null;
  }

  const rawStorage = components.storage;
  const storage = (Array.isArray(rawStorage) ? rawStorage : [rawStorage])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);

  return { row, storage: [...new Set(storage)] };
}

/**
 * Перезаписывает список накопителей сборки.
 *
 * @param {number} prebuiltId Номер сборки.
 * @param {number[]} storageIds Номера накопителей.
 * @returns {Promise<void>}
 */
async function writeStorageLinks(prebuiltId, storageIds) {
  const removed = await supabase
    .from('КонфигурацияНакопители')
    .delete()
    .eq('конфигурация_id', Number(prebuiltId));
  if (removed.error) {
    throw databaseError('очистить накопители сборки', removed.error);
  }
  if (!storageIds.length) return;

  const inserted = await supabase.from('КонфигурацияНакопители').insert(
    storageIds.map((id) => ({
      конфигурация_id: Number(prebuiltId),
      накопитель_id: id,
    })),
  );
  if (inserted.error) {
    throw databaseError('сохранить накопители сборки', inserted.error);
  }
}

/**
 * Список готовых сборок для админки: состав и остаток.
 *
 * @returns {Promise<{items: object[], total: number}>}
 */
export async function listPrebuiltAdmin() {
  if (!isDatabaseConnected()) return { items: [], total: 0 };

  const { items } = await listPrebuilt();
  const mapped = items.map((item) => {
    const components = {};
    const storage = [];
    for (const component of item.components || []) {
      if (component.category === 'storage') {
        storage.push(component.productId);
      } else {
        components[component.category] = component.productId;
      }
    }
    return {
      id: String(item.id),
      name: item.name,
      task: item.task || '',
      photoUrl: item.imageUrl || '',
      stock: Number(item.stock || 0),
      price: Number(item.price || 0),
      components,
      storage,
    };
  });
  return { items: mapped, total: mapped.length };
}

/**
 * Добавляет готовую сборку.
 *
 * @param {object} data Название, описание, остаток и состав.
 * @returns {Promise<{id: string}>}
 */
export async function createPrebuilt(data) {
  requireDatabase();
  const { row, storage } = prebuiltValues(data);

  const created = await supabase.from(PREBUILT_TABLE).insert(row).select('id').single();
  if (created.error) throw databaseError('добавить готовую сборку', created.error);

  await writeStorageLinks(created.data.id, storage);
  return { id: String(created.data.id) };
}

/**
 * Сохраняет изменения готовой сборки.
 *
 * @param {string} id Номер сборки.
 * @param {object} data Новые значения.
 * @returns {Promise<{id: string}>}
 */
export async function updatePrebuilt(id, data) {
  requireDatabase();
  const prebuiltId = Number(id);
  if (!Number.isInteger(prebuiltId) || prebuiltId <= 0) {
    throw apiError(400, 'VALIDATION_ERROR', 'Некорректный номер сборки');
  }

  const { data: existing, error } = await supabase
    .from(PREBUILT_TABLE)
    .select('id')
    .eq('id', prebuiltId)
    .maybeSingle();
  if (error) throw databaseError('найти готовую сборку', error);
  if (!existing) throw apiError(404, 'PREBUILT_NOT_FOUND', 'Сборка не найдена');

  const { row, storage } = prebuiltValues(data);
  const updated = await supabase.from(PREBUILT_TABLE).update(row).eq('id', prebuiltId);
  if (updated.error) throw databaseError('сохранить готовую сборку', updated.error);

  await writeStorageLinks(prebuiltId, storage);
  return { id: String(prebuiltId) };
}

/**
 * Удаляет готовую сборку и связанные записи.
 *
 * Позиции уже оформленных заказов не трогаем: в них сохранено название
 * и цена на момент покупки. Из корзин сборку убираем, чтобы не остались
 * ссылки на несуществующий товар.
 *
 * @param {string} id Номер сборки.
 * @returns {Promise<{id: string, name: string}>}
 */
export async function deletePrebuilt(id) {
  requireDatabase();
  const prebuiltId = Number(id);
  if (!Number.isInteger(prebuiltId) || prebuiltId <= 0) {
    throw apiError(400, 'VALIDATION_ERROR', 'Некорректный номер сборки');
  }

  const { data: row, error } = await supabase
    .from(PREBUILT_TABLE)
    .select('id,название')
    .eq('id', prebuiltId)
    .maybeSingle();
  if (error) throw databaseError('найти готовую сборку', error);
  if (!row) throw apiError(404, 'PREBUILT_NOT_FOUND', 'Сборка не найдена');

  const links = await supabase
    .from('КонфигурацияНакопители')
    .delete()
    .eq('конфигурация_id', prebuiltId);
  if (links.error) throw databaseError('удалить накопители сборки', links.error);

  const carts = await supabase
    .from('Корзина_Позиции')
    .delete()
    .eq('готовая_конфигурация_id', prebuiltId);
  if (carts.error) throw databaseError('убрать сборку из корзин', carts.error);

  const removal = await supabase.from(PREBUILT_TABLE).delete().eq('id', prebuiltId);
  if (removal.error) throw databaseError('удалить готовую сборку', removal.error);

  return { id: String(row.id), name: row['название'] };
}

/**
 * Меняет остатки комплектующих готовой сборки.
 *
 * Когда продаётся готовый ПК, со склада уходит не только сама сборка,
 * но и детали, из которых она собрана. При отмене заказа направление
 * меняется на обратное, поэтому остатки возвращаются.
 *
 * @param {string|number} prebuiltId Номер сборки.
 * @param {number} direction -1 — списать, 1 — вернуть.
 * @param {number} [qty=1] Сколько сборок.
 * @returns {Promise<void>}
 */
export async function adjustPrebuiltComponents(prebuiltId, direction, qty = 1) {
  if (!isDatabaseConnected()) return;

  const product = await getProduct(`prebuilt:${prebuiltId}`);
  if (!product?.components?.length) return;

  const amount = Number(qty) || 1;
  for (const component of product.components) {
    const table = CATEGORY_BY_ID.get(component.category)?.table;
    if (!table) continue;

    const read = await supabase
      .from(table)
      .select('id,количество')
      .eq('id', component.productId)
      .maybeSingle();
    if (read.error) {
      console.error(
        `[admin] комплектующая ${component.category}:${component.productId}:`,
        read.error.message,
      );
      continue;
    }
    if (!read.data) continue;

    const next = Math.max(0, Number(read.data['количество'] || 0) + direction * amount);
    const updated = await supabase
      .from(table)
      .update({ количество: next })
      .eq('id', component.productId);
    if (updated.error) {
      console.error(
        `[admin] склад комплектующей ${component.category}:${component.productId}:`,
        updated.error.message,
      );
    }
  }
}

/**
 * Меняет остаток товаров заказа: +1 при отмене, -1 при возврате в работу.
 *
 * Ошибки склада не отменяют изменение статуса: заказ важнее, а расхождение
 * остатка видно администратору и его можно исправить вручную.
 *
 * @param {string} orderId Идентификатор заказа.
 * @param {number} direction 1 — вернуть на склад, -1 — списать снова.
 * @returns {Promise<void>}
 */
export async function adjustOrderStock(orderId, direction) {
  const { data: positions, error } = await supabase
    .from('Заказ_Позиции')
    .select('*')
    .eq('заказ_id', Number(orderId));
  if (error) {
    console.error('[admin] позиции для склада:', error.message);
    return;
  }

  for (const position of positions || []) {
    const category = position['тип_компонента'];
    const table =
      category === 'prebuilt' ? PREBUILT_TABLE : CATEGORY_BY_ID.get(category)?.table;
    if (!table) continue;

    const productId = Number(position['идентификатор']);
    const qty = Number(position['количество'] || 1);
    const { data: product, error: readError } = await supabase
      .from(table)
      .select('id,количество')
      .eq('id', productId)
      .maybeSingle();
    if (readError) {
      console.error(`[admin] остаток ${category}:${productId}:`, readError.message);
      continue;
    }
    if (!product) continue;

    const next = Math.max(0, Number(product['количество'] || 0) + direction * qty);
    const updated = await supabase
      .from(table)
      .update({ количество: next })
      .eq('id', productId);
    if (updated.error) {
      console.error(`[admin] склад ${category}:${productId}:`, updated.error.message);
      continue;
    }

    // Проданная готовая сборка списывает ещё и свои комплектующие.
    if (category === 'prebuilt') {
      await adjustPrebuiltComponents(productId, direction, qty);
    }
  }
}

/**
 * Список всех заказов с данными покупателя и составом.
 *
 * @returns {Promise<{items: object[], total: number}>}
 */
export async function listOrders() {
  if (!isDatabaseConnected()) return { items: [], total: 0 };
  const { data, error } = await supabase
    .from('Заказы')
    .select('*')
    .order('создан_в', { ascending: false });
  if (error) throw databaseError('получить заказы', error);

  const [users, positions, history] = await Promise.all([
    supabase.from('Пользователи').select('id,email,имя,телефон'),
    supabase.from('Заказ_Позиции').select('*').order('id'),
    supabase
      .from('ИсторияЗаказов')
      .select('заказ_id,статус,комментарий')
      .eq('статус', 'Новый'),
  ]);
  if (users.error) throw databaseError('получить пользователей', users.error);
  if (positions.error) throw databaseError('получить позиции заказов', positions.error);
  if (history.error) throw databaseError('получить историю заказов', history.error);

  const userMap = new Map((users.data || []).map((row) => [Number(row.id), row]));
  const byOrder = new Map();
  for (const row of positions.data || []) {
    const id = Number(row['заказ_id']);
    if (!byOrder.has(id)) byOrder.set(id, []);
    byOrder.get(id).push(mapOrderPosition(row));
  }

  // Первый комментарий в истории со статусом «Новый» — это то, что
  // покупатель написал при оформлении заказа.
  const customerComments = new Map();
  for (const row of history.data || []) {
    const id = Number(row['заказ_id']);
    const text = String(row['комментарий'] || '').trim();
    if (!text || text === 'Заказ создан' || customerComments.has(id)) continue;
    customerComments.set(id, text);
  }

  const items = (data || []).map((row) => {
    const user = userMap.get(Number(row['пользователь_id'])) || {};
    const deliveryCost = Number(row['стоимость_доставки'] || 0);
    const orderPositions = byOrder.get(Number(row.id)) || [];
    return {
      id: String(row.id),
      number: row['номер'],
      userId: String(row['пользователь_id']),
      userName: user['имя'] || '',
      userEmail: user.email || '',
      status: row['статус'],
      deliveryMethod: row['способ_доставки'],
      deliveryZone: row['зона_доставки'] || '',
      address: row['адрес_доставки'] || '',
      phone: row['телефон'] || '',
      paymentMethod: row['способ_оплаты'],
      total: Number(row['итоговая_сумма'] || 0),
      deliveryCost,
      itemsTotal: Number(row['итоговая_сумма'] || 0) - deliveryCost,
      distanceKm: row['расстояние_км'] != null ? Number(row['расстояние_км']) : null,
      track: row['трек_номер'] || '',
      managerComment: row['комментарий_менеджера'] || '',
      customerComment: customerComments.get(Number(row.id)) || '',
      email: row['эл_почта'] || user.email || '',
      positionsCount: orderPositions.length,
      positions: orderPositions,
      createdAt: row['создан_в'],
    };
  });

  return { items, total: items.length };
}

/**
 * Позиции конкретного заказа.
 *
 * @param {string} orderId Идентификатор.
 * @returns {Promise<object[]>}
 */
export async function listOrderPositions(orderId) {
  if (!isDatabaseConnected()) return [];
  const { data, error } = await supabase
    .from('Заказ_Позиции')
    .select('*')
    .eq('заказ_id', Number(orderId))
    .order('id');
  if (error) throw databaseError('получить позиции заказа', error);
  return (data || []).map(mapOrderPosition);
}

/**
 * Меняет статус и служебные поля заказа.
 *
 * @param {string} orderId Идентификатор.
 * @param {{status?: string, track?: string, comment?: string}} data Данные.
 * @returns {Promise<object>}
 */
export async function updateOrder(orderId, data, adminId) {
  requireDatabase();
  const current = await supabase
    .from('Заказы')
    .select('id,статус')
    .eq('id', Number(orderId))
    .maybeSingle();
  if (current.error) throw databaseError('прочитать заказ', current.error);
  if (!current.data) throw apiError(404, 'ORDER_NOT_FOUND', 'Заказ не найден');
  const previousStatus = current.data['статус'];

  const updates = { обновлён_в: new Date().toISOString() };

  if (data.status !== undefined) {
    if (!ORDER_STATUSES.includes(data.status)) {
      throw apiError(400, 'VALIDATION_ERROR', 'Неизвестный статус заказа');
    }
    updates['статус'] = data.status;
  }
  if (data.track !== undefined) updates['трек_номер'] = String(data.track).trim();
  if (data.comment !== undefined) {
    updates['комментарий_менеджера'] = String(data.comment).trim();
  }

  const { data: row, error } = await supabase
    .from('Заказы')
    .update(updates)
    .eq('id', Number(orderId))
    .select('*')
    .maybeSingle();
  if (error) throw databaseError('обновить заказ', error);
  if (!row) throw apiError(404, 'ORDER_NOT_FOUND', 'Заказ не найден');

  const comment = String(data.comment || '').trim();
  const history = await supabase.from('ИсторияЗаказов').insert({
    заказ_id: Number(orderId),
    статус: row['статус'],
    комментарий: comment || null,
    администратор_id: Number(adminId) || null,
  });
  if (history.error) {
    console.error('[admin] история заказа:', history.error.message);
  }

  // Отмена возвращает товары на склад, возврат в работу — снова списывает.
  // Для уже доставленного или завершённого заказа склад не трогаем:
  // товар у покупателя, возврат остатка был бы ошибкой.
  const finished = ['Доставлен', 'Завершён'];
  if (data.status !== undefined && data.status !== previousStatus) {
    if (data.status === 'Отменён' && !finished.includes(previousStatus)) {
      await adjustOrderStock(orderId, 1);
    } else if (previousStatus === 'Отменён' && !finished.includes(data.status)) {
      await adjustOrderStock(orderId, -1);
    }
  }

  const user = await supabase
    .from('Пользователи')
    .select('email')
    .eq('id', Number(row['пользователь_id']))
    .maybeSingle();
  if (user.error) {
    console.error('[admin] email заказа:', user.error.message);
  }

  return {
    id: String(row.id),
    number: row['номер'],
    status: row['статус'],
    comment: row['комментарий_менеджера'] || '',
    email: user.data?.email || row['эл_почта'] || '',
    total: Number(row['итоговая_сумма'] || 0),
  };
}

/**
 * Удаляет связанные с заказами строки: состав и историю.
 *
 * Внешних ключей с каскадом в базе нет, поэтому чистим вручную.
 * Ошибка cleanup не отменяет удаление заказа: главное — убрать его
 * из списка, а «висячие» строки только логируем.
 *
 * @param {number[]} orderIds Номера заказов.
 * @returns {Promise<void>}
 */
async function deleteOrderChildren(orderIds) {
  if (!orderIds.length) return;

  const positions = await supabase
    .from('Заказ_Позиции')
    .delete()
    .in('заказ_id', orderIds);
  if (positions.error) {
    console.error('[admin] очистка позиций заказов:', positions.error.message);
  }

  const history = await supabase
    .from('ИсторияЗаказов')
    .delete()
    .in('заказ_id', orderIds);
  if (history.error) {
    console.error('[admin] очистка истории заказов:', history.error.message);
  }
}

/**
 * Удаляет финальный заказ (отменённый или завершённый) вместе с позициями.
 *
 * Активный заказ сначала нужно отменить: это защищает от случайной
 * потери заказа, который ещё в работе. Письмо при удалении не отправляется:
 * покупатель уже получил письмо об отмене или завершении.
 *
 * @param {string} orderId Идентификатор.
 * @returns {Promise<{id: string, number: string}>}
 */
export async function deleteOrder(orderId) {
  requireDatabase();
  // Защита от случайного удаления всей таблицы: id должен быть
  // положительным целым, иначе PostgREST может получить NaN.
  const id = Number(orderId);
  if (!Number.isInteger(id) || id <= 0) {
    throw apiError(400, 'INVALID_ORDER_ID', 'Некорректный номер заказа');
  }

  const { data: row, error } = await supabase
    .from('Заказы')
    .select('id,номер,статус')
    .eq('id', id)
    .maybeSingle();
  if (error) throw databaseError('получить заказ', error);
  if (!row) throw apiError(404, 'ORDER_NOT_FOUND', 'Заказ не найден');
  if (!['Отменён', 'Завершён'].includes(row['статус'])) {
    throw apiError(
      409,
      'ORDER_NOT_FINAL',
      'Удалить можно только отменённый или завершённый заказ',
    );
  }

  const removal = await supabase.from('Заказы').delete().eq('id', id);
  if (removal.error) throw databaseError('удалить заказ', removal.error);

  // Чистим состав и историю, чтобы в базе не оставалось строк без заказа.
  await deleteOrderChildren([id]);

  return { id: String(row.id), number: row['номер'] };
}

/**
 * Удаляет несколько финальных заказов.
 *
 * Активные заказы пропускаются: сначала их нужно отменить или завершить,
 * иначе потеряется заказ, который ещё в работе. Возвращаем количество
 * удалённых и пропущенных, чтобы админка объяснила причину.
 *
 * @param {Array<string|number>} ids Номера заказов.
 * @returns {Promise<{deleted: number, skipped: number}>}
 */
export async function deleteOrdersBulk(ids) {
  const clean = (Array.isArray(ids) ? ids : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);
  if (!clean.length) {
    throw apiError(400, 'VALIDATION_ERROR', 'Выберите хотя бы один заказ');
  }
  requireDatabase();

  const { data, error } = await supabase
    .from('Заказы')
    .select('id,статус')
    .in('id', clean);
  if (error) throw databaseError('прочитать выбранные заказы', error);

  const finalIds = (data || [])
    .filter((row) => ['Отменён', 'Завершён'].includes(row['статус']))
    .map((row) => Number(row.id));
  const skipped = clean.length - finalIds.length;
  if (!finalIds.length) return { deleted: 0, skipped };

  const removal = await supabase
    .from('Заказы')
    .delete()
    .in('id', finalIds)
    .select('id');
  if (removal.error) throw databaseError('удалить выбранные заказы', removal.error);

  // Позиции и история удалённых заказов тоже больше не нужны.
  await deleteOrderChildren(finalIds);

  return { deleted: (removal.data || []).length, skipped };
}

/**
 * История статусов заказа.
 *
 * @param {string} orderId Идентификатор.
 * @returns {Promise<{items: object[], total: number}>}
 */
export async function listOrderHistory(orderId) {
  if (!isDatabaseConnected()) return { items: [], total: 0 };
  const { data, error } = await supabase
    .from('ИсторияЗаказов')
    .select('*')
    .eq('заказ_id', Number(orderId))
    .order('создан_в', { ascending: false });
  if (error) throw databaseError('получить историю заказа', error);
  const items = (data || []).map((row) => ({
    id: String(row.id),
    status: row['статус'],
    comment: row['комментарий'] || '',
    createdAt: row['создан_в'],
  }));
  return { items, total: items.length };
}

/**
 * Список пользователей.
 *
 * @returns {Promise<{items: object[], total: number}>}
 */
export async function listUsers() {
  if (!isDatabaseConnected()) return { items: [], total: 0 };
  const { data, error } = await supabase.from('Пользователи').select('*').order('id');
  if (error) throw databaseError('получить пользователей', error);

  const items = (data || [])
    .filter((row) => !row['удалён'])
    .map((row) => ({
      id: String(row.id),
      email: row.email,
      name: row['имя'],
      phone: row['телефон'] || '',
      address: row['адрес_доставки'] || '',
      role: row['роль'],
      blocked: Boolean(row['заблокирован']),
      blockReason: row['причина_блокировки'] || '',
      createdAt: row['создан_в'],
    }));
  return { items, total: items.length };
}

/**
 * Блокировка, разблокировка и смена роли.
 *
 * @param {string} userId Идентификатор.
 * @param {{blocked?: boolean, reason?: string, role?: string}} data Данные.
 * @param {string} currentAdminId Идентификатор текущего администратора.
 * @returns {Promise<object>}
 */
export async function updateUser(userId, data, currentAdminId) {
  requireDatabase();
  if (String(userId) === String(currentAdminId)) {
    throw apiError(
      400,
      'VALIDATION_ERROR',
      'Нельзя менять роль или блокировать самого себя',
    );
  }

  const target = await supabase
    .from('Пользователи')
    .select('id,роль,удалён')
    .eq('id', Number(userId))
    .maybeSingle();
  if (target.error) throw databaseError('прочитать пользователя', target.error);
  if (!target.data || target.data['удалён']) {
    throw apiError(404, 'USER_NOT_FOUND', 'Пользователь не найден');
  }
  if (target.data['роль'] === 'admin') {
    if (data.blocked) {
      throw apiError(400, 'ADMIN_PROTECTED', 'Администратора нельзя заблокировать');
    }
    // Понизить другого администратора можно: себя изменить нельзя
    // (проверка выше), поэтому хотя бы один администратор остаётся.
  }

  const updates = { обновлён_в: new Date().toISOString() };
  if (data.blocked !== undefined) {
    updates['заблокирован'] = Boolean(data.blocked);
    updates['причина_блокировки'] = data.blocked
      ? String(data.reason || 'Нарушение правил магазина').trim()
      : null;
  }
  if (data.role !== undefined) {
    if (!USER_ROLES.includes(data.role)) {
      throw apiError(400, 'VALIDATION_ERROR', 'Неизвестная роль');
    }
    updates['роль'] = data.role;
  }

  const { data: row, error } = await supabase
    .from('Пользователи')
    .update(updates)
    .eq('id', Number(userId))
    .select('id,email,имя,роль,заблокирован,причина_блокировки')
    .maybeSingle();
  if (error) throw databaseError('обновить пользователя', error);
  if (!row) throw apiError(404, 'USER_NOT_FOUND', 'Пользователь не найден');
  return {
    id: String(row.id),
    email: row.email,
    name: row['имя'] || '',
    role: row['роль'],
    blocked: Boolean(row['заблокирован']),
    blockReason: row['причина_блокировки'] || '',
  };
}

/**
 * Удаляет пользователя из админки.
 *
 * @param {string} userId Кого удаляем.
 * @param {string} currentAdminId Кто удаляет.
 * @param {string} [reason] Причина для письма.
 * @returns {Promise<{id: string, deleted: true, email: string, name: string, reason: string}>}
 */
export async function deleteUser(userId, currentAdminId, reason) {
  requireDatabase();
  if (String(userId) === String(currentAdminId)) {
    throw apiError(400, 'SELF_DELETE', 'Нельзя удалить свой аккаунт');
  }

  // Данные нужны для письма: после удаления запись обезличивается.
  const target = await findById(userId);
  if (!target) throw apiError(404, 'USER_NOT_FOUND', 'Пользователь не найден');

  const result = await deleteAccount(userId);
  return {
    ...result,
    email: target.email,
    name: target.name || '',
    reason: String(reason || 'Решение администрации').trim(),
  };
}

/**
 * Строки товаров категории.
 *
 * @param {string} category Код категории.
 * @returns {Promise<{items: object[], total: number}>}
 */
export async function listProducts(category) {
  if (!isDatabaseConnected()) return { items: [], total: 0 };
  const found = categoryOf(category);
  const { data, error } = await supabase.from(found.table).select('*').order('id');
  if (error) throw databaseError('получить товары', error);
  return { items: data || [], total: (data || []).length };
}

/**
 * Убирает служебные поля перед записью.
 *
 * @param {object} data Поля формы.
 * @returns {object}
 */
function cleanProductData(data) {
  const clean = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (key === 'id' || key === 'создан_в') continue;
    if (key === 'количество' && (value === '' || value == null)) {
      clean[key] = 0;
      continue;
    }
    clean[key] = value === '' ? null : value;
  }
  return clean;
}

/**
 * Создаёт товар.
 *
 * @param {string} category Код категории.
 * @param {object} data Поля.
 * @returns {Promise<object>}
 */
export async function createProduct(category, data) {
  requireDatabase();
  const found = categoryOf(category);
  const clean = cleanProductData(data);
  if (!clean['название'] || clean['цена'] === null || clean['цена'] === undefined) {
    throw apiError(400, 'VALIDATION_ERROR', 'Нужны название и цена товара');
  }

  const { data: row, error } = await supabase
    .from(found.table)
    .insert(clean)
    .select('*')
    .single();
  if (error) throw databaseError('создать товар', error);
  return row;
}

/**
 * Обновляет товар.
 *
 * @param {string} category Код категории.
 * @param {string} productId Идентификатор.
 * @param {object} data Поля.
 * @returns {Promise<object>}
 */
export async function updateProduct(category, productId, data) {
  requireDatabase();
  const found = categoryOf(category);
  const clean = cleanProductData(data);
  if (!Object.keys(clean).length) {
    throw apiError(400, 'VALIDATION_ERROR', 'Нет полей для изменения');
  }

  const previous = await supabase
    .from(found.table)
    .select('id,количество')
    .eq('id', Number(productId))
    .maybeSingle();
  if (previous.error) throw databaseError('прочитать товар', previous.error);

  const { data: row, error } = await supabase
    .from(found.table)
    .update(clean)
    .eq('id', Number(productId))
    .select('*')
    .maybeSingle();
  if (error) throw databaseError('обновить товар', error);
  if (!row) throw apiError(404, 'PRODUCT_NOT_FOUND', 'Товар не найден');

  // Товар снова появился: сообщаем тем, кто оставил запрос. Ошибка
  // уведомления не отменяет сохранение остатка.
  const wasOut = Number(previous.data?.['количество'] ?? 0) <= 0;
  const isIn = Number(row['количество'] ?? 0) > 0;
  if (wasOut && isIn) {
    await notifyPendingRequests(category, productId);
  }

  return row;
}

/**
 * Удаляет товар.
 *
 * @param {string} category Код категории.
 * @param {string} productId Идентификатор.
 * @returns {Promise<void>}
 */
export async function deleteProduct(category, productId) {
  requireDatabase();
  const found = categoryOf(category);
  const { data, error } = await supabase
    .from(found.table)
    .delete()
    .eq('id', Number(productId))
    .select('id');
  if (error) {
    if (error.code === '23503') {
      throw apiError(
        409,
        'PRODUCT_IN_USE',
        'Товар входит в сборку или готовый ПК. Сначала уберите его оттуда, потом удаляйте.',
      );
    }
    throw databaseError(
      'удалить товар (возможно, он входит в заказ или сборку)',
      error,
    );
  }
  if (!(data || []).length) {
    throw apiError(404, 'PRODUCT_NOT_FOUND', 'Товар не найден');
  }
}

/**
 * Остатки готовых конфигураций.
 *
 * @returns {Promise<{items: object[], total: number}>}
 */
export async function listPrebuiltStock() {
  if (!isDatabaseConnected()) return { items: [], total: 0 };
  const { data, error } = await supabase
    .from('ГотовыеКонфигурации')
    .select('id,название,количество')
    .order('id');
  if (error) throw databaseError('получить остатки готовых ПК', error);
  const items = (data || []).map((row) => ({
    id: String(row.id),
    name: row['название'],
    stock: Number(row['количество'] || 0),
  }));
  return { items, total: items.length };
}

/**
 * Меняет остаток готовой конфигурации.
 *
 * @param {string} id Идентификатор.
 * @param {number} stock Количество.
 * @returns {Promise<object>}
 */
export async function updatePrebuiltStock(id, stock) {
  requireDatabase();
  const quantity = Number(stock);
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw apiError(400, 'VALIDATION_ERROR', 'Количество должно быть неотрицательным');
  }

  const previous = await supabase
    .from('ГотовыеКонфигурации')
    .select('id,количество')
    .eq('id', Number(id))
    .maybeSingle();
  if (previous.error)
    throw databaseError('прочитать остаток готового ПК', previous.error);

  const { data: row, error } = await supabase
    .from('ГотовыеКонфигурации')
    .update({ количество: quantity })
    .eq('id', Number(id))
    .select('id,название,количество')
    .maybeSingle();
  if (error) throw databaseError('обновить остаток готового ПК', error);
  if (!row) throw apiError(404, 'PREBUILT_NOT_FOUND', 'Сборка не найдена');

  if (Number(previous.data?.['количество'] ?? 0) <= 0 && quantity > 0) {
    await notifyPendingRequests('prebuilt', id);
  }

  return {
    id: String(row.id),
    name: row['название'],
    stock: Number(row['количество']),
  };
}

/**
 * Сводка для панели администратора.
 *
 * Удалённые аккаунты остаются в таблице обезличенными, но в счётчик
 * «Пользователи» не попадают — иначе цифра не совпадает со списком.
 *
 * @returns {Promise<object>}
 */
export async function getSummary() {
  if (!isDatabaseConnected()) {
    return {
      orders: 0,
      users: 0,
      pendingReviews: 0,
      products: 0,
      revenue: 0,
      ordersToday: 0,
      outOfStock: 0,
    };
  }

  const results = await Promise.all([
    supabase.from('Заказы').select('id', { count: 'exact', head: true }),
    supabase
      .from('Пользователи')
      .select('id', { count: 'exact', head: true })
      .not('удалён', 'is', true),
    supabase
      .from('Отзывы')
      .select('id', { count: 'exact', head: true })
      .eq('статус', 'на модерации'),
    ...CATEGORIES.map((category) =>
      supabase.from(category.table).select('id', { count: 'exact', head: true }),
    ),
  ]);

  for (const result of results) {
    if (result.error) throw databaseError('получить сводку', result.error);
  }

  // Выручка — сумма только завершённых заказов: отменённые и ещё
  // не полученные деньги магазина не считаются.
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const extras = await Promise.all([
    supabase.from('Заказы').select('итоговая_сумма').eq('статус', 'Завершён'),
    supabase
      .from('Заказы')
      .select('id', { count: 'exact', head: true })
      .gte('создан_в', startOfDay.toISOString()),
    ...CATEGORIES.map((category) =>
      supabase
        .from(category.table)
        .select('id', { count: 'exact', head: true })
        .eq('количество', 0),
    ),
    supabase
      .from(PREBUILT_TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('количество', 0),
  ]);

  for (const result of extras) {
    if (result.error) throw databaseError('получить расширенную сводку', result.error);
  }

  const products = results
    .slice(3)
    .reduce((sum, result) => sum + (result.count || 0), 0);
  const revenue = (extras[0].data || []).reduce(
    (sum, row) => sum + Number(row['итоговая_сумма'] || 0),
    0,
  );
  const outOfStock = extras
    .slice(2)
    .reduce((sum, result) => sum + (result.count || 0), 0);

  return {
    orders: results[0].count || 0,
    users: results[1].count || 0,
    pendingReviews: results[2].count || 0,
    products,
    revenue,
    ordersToday: extras[1].count || 0,
    outOfStock,
  };
}
