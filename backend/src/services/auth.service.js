/**
 * PCHelper (курсовая) — сервис аутентификации.
 *
 * Пользователи хранятся в Supabase (таблица «Пользователи»), refresh-токены —
 * в «ОбновительныхТокенах». Без переменных окружения сервис переходит на
 * память процесса: этого достаточно для герметичных тестов и CI.
 * Контракт API от источника данных не зависит.
 *
 * @version 2.0
 */
import { randomBytes } from 'node:crypto';

import jwt from 'jsonwebtoken';

import { apiError, validation } from '../domain/errors.js';
import {
  createUser,
  findByEmail,
  findById,
  isRefreshTokenActive,
  revokeRefreshToken,
  storeRefreshToken,
  updateUser,
} from '../repositories/users.repository.js';
import { hashPassword, verifyPassword } from './password.js';

const SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-me';
const ACCESS_TTL = '15m';
const REFRESH_TTL = '7d';

/**
 * Приводит e-mail к нижнему регистру.
 *
 * @param {unknown} value Значение из запроса.
 * @returns {string}
 */
function normalizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

/**
 * Публичный вид пользователя — без хэша пароля и служебных полей.
 *
 * @param {object} user Пользователь.
 * @returns {object}
 */
export function publicUser(user) {
  return {
    id: String(user.id),
    email: user.email,
    name: user.name,
    role: user.role,
    phone: user.phone || '',
    address: user.address || '',
  };
}

/**
 * Проверяет поля профиля.
 *
 * @param {{name?: unknown, phone?: unknown, address?: unknown}} data Данные формы.
 * @returns {{name: string, phone: string, address: string}}
 */
function profileFields(data) {
  const name = String(data.name ?? '').trim();
  if (!name) throw validation('Укажите имя');
  if (name.length > 100) throw validation('Имя длиннее 100 символов');

  const phone = String(data.phone ?? '').trim();
  if (phone && !/^[+()\d\s-]{7,30}$/.test(phone)) {
    throw validation('Телефон содержит недопустимые символы');
  }

  const address = String(data.address ?? '').trim();
  if (address.length > 300) throw validation('Адрес длиннее 300 символов');

  return { name, phone, address };
}

/**
 * Регистрирует пользователя.
 *
 * @param {{email: string, password: string, name?: string, phone?: string, address?: string}} data Данные формы.
 * @returns {Promise<{user: object, accessToken: string, refreshToken: string}>}
 */
export async function register(data) {
  const email = normalizeEmail(data.email);
  const password = String(data.password || '');

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw validation('Некорректный адрес электронной почты');
  }
  if (password.length < 6) {
    throw validation('Пароль должен содержать не менее 6 символов');
  }

  const profile = profileFields({
    name: data.name || email.split('@')[0],
    phone: data.phone,
    address: data.address,
  });

  const user = await createUser({
    email,
    passwordHash: hashPassword(password),
    ...profile,
  });
  return issueTokens(user);
}

/**
 * Проверяет логин и пароль.
 *
 * @param {{email: string, password: string}} data Данные формы.
 * @returns {Promise<{user: object, accessToken: string, refreshToken: string}>}
 */
export async function login(data) {
  const email = normalizeEmail(data.email);
  const password = String(data.password || '');
  const user = await findByEmail(email);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw apiError(401, 'INVALID_CREDENTIALS', 'Неверный e-mail или пароль');
  }
  return issueTokens(user);
}

/**
 * Выдаёт access- и refresh-токены и сохраняет refresh в хранилище.
 *
 * @param {object} user Пользователь.
 * @returns {Promise<{user: object, accessToken: string, refreshToken: string}>}
 */
async function issueTokens(user) {
  const accessToken = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'access',
      jti: randomBytes(8).toString('hex'),
    },
    SECRET,
    { expiresIn: ACCESS_TTL },
  );
  const refreshToken = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      type: 'refresh',
      jti: randomBytes(8).toString('hex'),
    },
    SECRET,
    { expiresIn: REFRESH_TTL },
  );

  const payload = jwt.decode(refreshToken);
  await storeRefreshToken(user.id, refreshToken, Number(payload.exp) * 1000);

  return { user: publicUser(user), accessToken, refreshToken };
}

/**
 * Обновляет пару токенов по refresh-токену.
 *
 * @param {string} token Refresh-токен.
 * @returns {Promise<{user: object, accessToken: string, refreshToken: string}>}
 */
export async function refresh(token) {
  const payload = verify(token, 'refresh');
  if (!(await isRefreshTokenActive(token))) {
    throw apiError(401, 'REFRESH_INVALID', 'Refresh-токен не найден или отозван');
  }

  await revokeRefreshToken(token);
  const user = await findById(payload.sub);
  if (!user) {
    throw apiError(401, 'REFRESH_INVALID', 'Пользователь не найден');
  }
  return issueTokens(user);
}

/**
 * Отзывает refresh-токен при выходе.
 *
 * @param {string} token Refresh-токен.
 * @returns {Promise<void>}
 */
export async function logout(token) {
  await revokeRefreshToken(token);
}

/**
 * Проверяет access-токен и возвращает пользователя.
 *
 * @param {string} token Access-токен.
 * @returns {Promise<object|null>}
 */
export function userFromAccess(token) {
  const payload = verify(token, 'access');
  return findById(payload.sub);
}

/**
 * Обновляет профиль по идентификатору пользователя.
 *
 * @param {string} userId Идентификатор.
 * @param {{name: string, phone: string, address: string}} data Поля.
 * @returns {Promise<object>}
 */
export async function updateProfile(userId, data) {
  const profile = profileFields(data);
  const user = await updateUser(userId, profile);
  if (!user) {
    throw apiError(404, 'USER_NOT_FOUND', 'Пользователь не найден');
  }
  return publicUser(user);
}

/**
 * Проверяет JWT и его тип.
 *
 * @param {string} token Токен.
 * @param {'access'|'refresh'} expectedType Ожидаемый тип.
 * @returns {object} Payload.
 */
function verify(token, expectedType) {
  try {
    const payload = jwt.verify(token, SECRET);
    if (payload.type !== expectedType) {
      throw new Error('Неверный тип токена');
    }
    return payload;
  } catch {
    throw apiError(401, 'UNAUTHORIZED', 'Токен недействителен или истёк');
  }
}
