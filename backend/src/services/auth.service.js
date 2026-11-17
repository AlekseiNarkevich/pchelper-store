/**
 * PCHelper (ЛР8) — сервис аутентификации.
 *
 * Пока пользователи хранятся в памяти процесса: этого достаточно для
 * демонстрации JWT/сессий и герметичных тестов без реальных секретов.
 * В курсовой работе хранилище заменяется на таблицу `Пользователи`
 * Supabase — контракт API от этого не меняется.
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-me';
const ACCESS_TTL = '15m';
const REFRESH_TTL = '7d';

/** Пользователи демонстрационного режима. */
const users = new Map();

/** Действующие refresh-токены (в курсовой — таблица `ОбновительныеТокены`). */
const refreshTokens = new Set();

/**
 * Хэширует пароль через scrypt: соль и хэш разделены двоеточием.
 *
 * @param {string} password Пароль.
 * @returns {string} Строка «соль:хэш».
 */
function hashPassword(password) {
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
function verifyPassword(password, stored) {
  const [salt, key] = String(stored || '').split(':');
  if (!salt || !key) return false;
  const expected = Buffer.from(key, 'hex');
  const actual = scryptSync(password, salt, expected.length || 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Демо-пользователь для локальной проверки и тестов. */
users.set('demo@pchelper.by', {
  id: 'user-demo',
  email: 'demo@pchelper.by',
  name: 'Демо-пользователь',
  role: 'user',
  passwordHash: hashPassword('demo1234'),
});

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
 * Публичный вид пользователя — без хэша пароля.
 *
 * @param {object} user Пользователь.
 * @returns {object}
 */
export function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

/**
 * Регистрирует пользователя.
 *
 * @param {{email: string, password: string, name?: string}} data Данные формы.
 * @returns {{user: object, accessToken: string, refreshToken: string}}
 */
export function register(data) {
  const email = normalizeEmail(data.email);
  const password = String(data.password || '');

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw validation('Некорректный адрес электронной почты');
  }
  if (password.length < 6) {
    throw validation('Пароль должен содержать не менее 6 символов');
  }
  if (users.has(email)) {
    throw apiError(409, 'EMAIL_EXISTS', 'Пользователь с таким e-mail уже существует');
  }

  const user = {
    id: `user-${randomBytes(6).toString('hex')}`,
    email,
    name: String(data.name || '').trim() || email.split('@')[0],
    role: 'user',
    passwordHash: hashPassword(password),
  };
  users.set(email, user);
  return issueTokens(user);
}

/**
 * Проверяет логин и пароль.
 *
 * @param {{email: string, password: string}} data Данные формы.
 * @returns {{user: object, accessToken: string, refreshToken: string}}
 */
export function login(data) {
  const email = normalizeEmail(data.email);
  const password = String(data.password || '');
  const user = users.get(email);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw apiError(401, 'INVALID_CREDENTIALS', 'Неверный e-mail или пароль');
  }
  return issueTokens(user);
}

/**
 * Выдаёт access- и refresh-токены.
 *
 * @param {object} user Пользователь.
 * @returns {{user: object, accessToken: string, refreshToken: string}}
 */
function issueTokens(user) {
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
  refreshTokens.add(refreshToken);
  return { user: publicUser(user), accessToken, refreshToken };
}

/**
 * Обновляет пару токенов по refresh-токену.
 *
 * @param {string} token Refresh-токен.
 * @returns {{user: object, accessToken: string, refreshToken: string}}
 */
export function refresh(token) {
  const payload = verify(token, 'refresh');
  if (!refreshTokens.has(token)) {
    throw apiError(401, 'REFRESH_INVALID', 'Refresh-токен не найден или отозван');
  }

  refreshTokens.delete(token);
  const user = findUserById(payload.sub);
  if (!user) {
    throw apiError(401, 'REFRESH_INVALID', 'Пользователь не найден');
  }
  return issueTokens(user);
}

/**
 * Отзывает refresh-токен при выходе.
 *
 * @param {string} token Refresh-токен.
 */
export function logout(token) {
  refreshTokens.delete(token);
}

/**
 * Проверяет access-токен и возвращает пользователя.
 *
 * @param {string} token Access-токен.
 * @returns {object|null}
 */
export function userFromAccess(token) {
  const payload = verify(token, 'access');
  return findUserById(payload.sub);
}

/**
 * Находит пользователя по идентификатору.
 *
 * @param {string} id Идентификатор.
 * @returns {object|null}
 */
export function findUserById(id) {
  for (const user of users.values()) {
    if (user.id === id) return user;
  }
  return null;
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

/**
 * Ошибка валидации формы.
 *
 * @param {string} message Сообщение.
 * @returns {Error & {status: number, code: string}}
 */
function validation(message) {
  return apiError(400, 'VALIDATION_ERROR', message);
}

/**
 * Ошибка API с заданным статусом.
 *
 * @param {number} status HTTP-статус.
 * @param {string} code Машиночитаемый код.
 * @param {string} message Сообщение.
 * @returns {Error & {status: number, code: string}}
 */
function apiError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}
