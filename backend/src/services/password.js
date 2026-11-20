/**
 * PCHelper (курсовая) — пароли пользователей.
 *
 * Пароль не хранится и не шифруется обратимо: в базе лежит scrypt-хэш
 * с индивидуальной солью. Формат строки — «соль:хэш» в hex.
 */

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Хэширует пароль через scrypt.
 *
 * @param {string} password Пароль.
 * @returns {string} Строка «соль:хэш».
 */
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

/**
 * Проверяет пароль против сохранённого хэша.
 *
 * @param {string} password Пароль из запроса.
 * @param {string} stored Хэш из хранилища.
 * @returns {boolean}
 */
export function verifyPassword(password, stored) {
  const [salt, key] = String(stored || '').split(':');
  if (!salt || !key) return false;
  const expected = Buffer.from(key, 'hex');
  const actual = scryptSync(password, salt, expected.length || 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
