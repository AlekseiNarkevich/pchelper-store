/**
 * PCHelper (курсовая) — репозиторий пользователей.
 *
 * Единственное место, которое знает, где лежат пользователи и их токены:
 * в Supabase (таблицы «Пользователи» и «ОбновительныеТокены») или в памяти
 * процесса, когда переменные окружения не заданы (CI, локальные тесты).
 * Контракт для сервиса аутентификации от этого не меняется.
 */

import { createHash } from 'node:crypto';

import { apiError } from '../domain/errors.js';
import { isDatabaseConnected, supabase } from '../services/supabase.service.js';
import { hashPassword } from '../services/password.js';

const USER_COLUMNS =
  'id,email,password_hash,имя,телефон,адрес_доставки,роль,заблокирован,причина_блокировки,создан_в';

/** Соответствие ролей базы и API. */
const ROLE_FROM_DB = { customer: 'user', manager: 'manager', admin: 'admin' };

/** Обратное соответствие ролей API и базы. */
const ROLE_TO_DB = { user: 'customer', manager: 'manager', admin: 'admin' };

/** Пользователи демонстрационного режима. */
const memoryUsers = new Map();

/** Действующие refresh-токены демонстрационного режима. */
const memoryTokens = new Map();

let nextUserId = 2;

/**
 * Приводит строку Supabase к внутреннему виду пользователя.
 *
 * @param {object} row Строка таблицы.
 * @returns {object}
 */
function fromRow(row) {
  return {
    id: String(row.id),
    email: row.email,
    name: row['имя'] || row.email,
    phone: row['телефон'] || '',
    address: row['адрес_доставки'] || '',
    role: ROLE_FROM_DB[row['роль']] || 'user',
    blocked: Boolean(row['заблокирован']),
    blockReason: row['причина_блокировки'] || '',
    deleted: Boolean(row['удалён']),
    passwordHash: row.password_hash || null,
    createdAt: row['создан_в'] || null,
  };
}

// Демо-пользователь доступен и без базы: он нужен тестам и локальному запуску.
memoryUsers.set('demo@pchelper.by', {
  id: '1',
  email: 'demo@pchelper.by',
  name: 'Демо-пользователь',
  phone: '',
  address: '',
  role: 'user',
  blocked: false,
  blockReason: '',
  passwordHash: hashPassword('demo1234'),
  createdAt: null,
});

/**
 * Хэширует refresh-токен: в базе хранится только SHA-256.
 *
 * @param {string} token Токен.
 * @returns {string}
 */
function tokenHash(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

/**
 * Ошибка базы данных для пользовательских операций.
 *
 * @param {string} action Действие.
 * @param {object} error Ошибка.
 * @returns {Error & {status: number, code: string}}
 */
function databaseFailure(action, error) {
  console.error(`[users] ${action}:`, error?.message || error);
  return apiError(
    502,
    'DATABASE_ERROR',
    `Не удалось ${action}: ${error?.message || 'ошибка базы данных'}`,
  );
}

/**
 * Находит пользователя по e-mail.
 *
 * @param {string} email Адрес в нижнем регистре.
 * @returns {Promise<object|null>}
 */
export async function findByEmail(email) {
  if (isDatabaseConnected()) {
    try {
      const { data, error } = await supabase
        .from('Пользователи')
        .select(USER_COLUMNS)
        .eq('email', email)
        .maybeSingle();
      if (error) throw error;
      return data ? fromRow(data) : null;
    } catch (error) {
      throw databaseFailure('найти пользователя', error);
    }
  }
  return memoryUsers.get(email) || null;
}

/**
 * Находит пользователя по идентификатору.
 *
 * @param {string} id Идентификатор.
 * @returns {Promise<object|null>}
 */
export async function findById(id) {
  if (isDatabaseConnected()) {
    try {
      const numericId = Number(id);
      if (Number.isInteger(numericId) && numericId > 0) {
        const { data, error } = await supabase
          .from('Пользователи')
          .select(USER_COLUMNS)
          .eq('id', numericId)
          .maybeSingle();
        if (error) throw error;
        if (data) return fromRow(data);
        return null;
      }
    } catch (error) {
      throw databaseFailure('найти пользователя', error);
    }
  }
  for (const user of memoryUsers.values()) {
    if (user.id === String(id)) return user;
  }
  return null;
}

/**
 * Создаёт пользователя.
 *
 * @param {{email: string, passwordHash: string, name: string, phone?: string, address?: string}} data Данные.
 * @returns {Promise<object>}
 */
export async function createUser(data) {
  if (isDatabaseConnected()) {
    try {
      const { data: row, error } = await supabase
        .from('Пользователи')
        .insert({
          email: data.email,
          password_hash: data.passwordHash,
          имя: data.name,
          телефон: data.phone || null,
          адрес_доставки: data.address || null,
          роль: ROLE_TO_DB.user,
        })
        .select(USER_COLUMNS)
        .single();

      if (error) {
        if (error.code === '23505') {
          throw apiError(
            409,
            'EMAIL_EXISTS',
            'Пользователь с таким e-mail уже существует',
          );
        }
        throw error;
      }
      return fromRow(row);
    } catch (error) {
      if (error.code === 'EMAIL_EXISTS') throw error;
      throw databaseFailure('создать пользователя', error);
    }
  }

  if (memoryUsers.has(data.email)) {
    throw apiError(409, 'EMAIL_EXISTS', 'Пользователь с таким e-mail уже существует');
  }
  const user = {
    id: String(nextUserId++),
    email: data.email,
    name: data.name,
    phone: data.phone || '',
    address: data.address || '',
    role: 'user',
    blocked: false,
    blockReason: '',
    passwordHash: data.passwordHash,
    createdAt: new Date().toISOString(),
  };
  memoryUsers.set(user.email, user);
  return user;
}

/**
 * Обновляет профиль пользователя.
 *
 * @param {string} id Идентификатор.
 * @param {{name: string, phone: string, address: string}} data Поля профиля.
 * @returns {Promise<object|null>}
 */
export async function updateUser(id, data) {
  if (isDatabaseConnected()) {
    try {
      const { data: row, error } = await supabase
        .from('Пользователи')
        .update({
          имя: data.name,
          телефон: data.phone || null,
          адрес_доставки: data.address || null,
          обновлён_в: new Date().toISOString(),
        })
        .eq('id', Number(id))
        .select(USER_COLUMNS)
        .maybeSingle();
      if (error) throw error;
      return row ? fromRow(row) : null;
    } catch (error) {
      throw databaseFailure('обновить профиль', error);
    }
  }

  for (const user of memoryUsers.values()) {
    if (user.id === String(id)) {
      user.name = data.name;
      user.phone = data.phone || '';
      user.address = data.address || '';
      return user;
    }
  }
  return null;
}

/**
 * Сохраняет refresh-токен.
 *
 * @param {string} userId Идентификатор пользователя.
 * @param {string} token Токен.
 * @param {number} expiresAt Время истечения, мс.
 * @returns {Promise<void>}
 */
export async function storeRefreshToken(userId, token, expiresAt) {
  const hash = tokenHash(token);

  if (isDatabaseConnected()) {
    try {
      const { error } = await supabase.from('ОбновительныеТокены').insert({
        пользователь_id: Number(userId),
        token_hash: hash,
        истекает_в: new Date(expiresAt).toISOString(),
      });
      if (!error) return;
      throw error;
    } catch (error) {
      throw databaseFailure('сохранить refresh-токен', error);
    }
  }

  memoryTokens.set(hash, {
    userId: String(userId),
    expiresAt,
    revoked: false,
  });
}

/**
 * Проверяет, действует ли refresh-токен.
 *
 * @param {string} token Токен.
 * @returns {Promise<boolean>}
 */
export async function isRefreshTokenActive(token) {
  const hash = tokenHash(token);

  if (isDatabaseConnected()) {
    try {
      const { data, error } = await supabase
        .from('ОбновительныеТокены')
        .select('id,отозван,истекает_в')
        .eq('token_hash', hash)
        .maybeSingle();
      if (error) throw error;
      if (!data) return false;
      if (data['отозван']) return false;
      return new Date(data['истекает_в']).getTime() > Date.now();
    } catch (error) {
      throw databaseFailure('проверить refresh-токен', error);
    }
  }

  const record = memoryTokens.get(hash);
  return Boolean(record && !record.revoked && record.expiresAt > Date.now());
}

/**
 * Отзывает refresh-токен.
 *
 * @param {string} token Токен.
 * @returns {Promise<void>}
 */
export async function revokeRefreshToken(token) {
  const hash = tokenHash(token);

  if (isDatabaseConnected()) {
    try {
      const { error } = await supabase
        .from('ОбновительныеТокены')
        .update({ отозван: true })
        .eq('token_hash', hash);
      if (!error) return;
    } catch {
      /* база недоступна — используем память процесса */
    }
  }

  const record = memoryTokens.get(hash);
  if (record) record.revoked = true;
}

/**
 * Удаляет аккаунт: обезличивает пользователя и запрещает вход.
 *
 * Полностью удалить строку нельзя из-за заказов (ON DELETE RESTRICT),
 * поэтому очищаются персональные данные, пароль и токены, а заказы
 * остаются с ссылкой на обезличенную запись.
 *
 * @param {string|number} userId Идентификатор.
 * @returns {Promise<{id: string, deleted: true}>}
 */
export async function deleteAccount(userId) {
  if (isDatabaseConnected()) {
    try {
      const { data: row, error } = await supabase
        .from('Пользователи')
        .select('*')
        .eq('id', Number(userId))
        .maybeSingle();
      if (error) throw error;
      if (!row || row['удалён']) {
        throw apiError(404, 'USER_NOT_FOUND', 'Пользователь не найден');
      }
      if (row['роль'] === 'admin') {
        throw apiError(403, 'ADMIN_PROTECTED', 'Аккаунт администратора удалить нельзя');
      }

      const { data: orders, error: ordersError } = await supabase
        .from('Заказы')
        .select('id,статус')
        .eq('пользователь_id', row.id);
      if (ordersError) throw ordersError;
      const activeOrders = (orders || []).filter(
        (order) => !['Завершён', 'Отменён'].includes(order['статус']),
      );
      if (activeOrders.length) {
        throw apiError(
          409,
          'ACTIVE_ORDERS',
          `Нельзя удалить аккаунт: активных заказов ${activeOrders.length}. Сначала завершите или отмените их.`,
        );
      }

      const id = row.id;
      const updated = await supabase
        .from('Пользователи')
        .update({
          email: `deleted-${id}@pchelper.local`,
          password_hash: null,
          имя: 'Удалённый пользователь',
          телефон: null,
          адрес_доставки: null,
          заблокирован: true,
          причина_блокировки: 'Аккаунт удалён',
          удалён: true,
          удалён_в: new Date().toISOString(),
          обновлён_в: new Date().toISOString(),
        })
        .eq('id', id);
      if (updated.error) throw updated.error;

      // Связанные данные: токены, корзина, сборки, отзывы и запросы.
      await supabase
        .from('ОбновительныеТокены')
        .update({ отозван: true })
        .eq('пользователь_id', id);
      await supabase.from('Корзины').delete().eq('пользователь_id', id);
      await supabase.from('Сборки').delete().eq('пользователь_id', id);
      await supabase.from('Отзывы').delete().eq('пользователь_id', id);
      // Заказы остаются для истории, но без контактов покупателя.
      await supabase
        .from('Заказы')
        .update({ телефон: '—', адрес_доставки: null, эл_почта: null })
        .eq('пользователь_id', id);
      await supabase
        .from('ЗапросыНаПоступление')
        .update({ email: null, телефон: null, пользователь_id: null })
        .eq('пользователь_id', id);

      return { id: String(id), deleted: true };
    } catch (error) {
      if (error.status) throw error;
      throw databaseFailure('удалить аккаунт', error);
    }
  }

  for (const [email, user] of memoryUsers.entries()) {
    if (user.id !== String(userId)) continue;
    if (user.role === 'admin') {
      throw apiError(403, 'ADMIN_PROTECTED', 'Аккаунт администратора удалить нельзя');
    }
    memoryUsers.delete(email);
    return { id: String(userId), deleted: true };
  }
  throw apiError(404, 'USER_NOT_FOUND', 'Пользователь не найден');
}
