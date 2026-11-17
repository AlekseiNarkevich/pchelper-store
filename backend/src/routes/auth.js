/**
 * PCHelper (ЛР8) — маршруты аутентификации.
 *
 *   POST /api/v1/auth/register  регистрация
 *   POST /api/v1/auth/login     вход
 *   POST /api/v1/auth/refresh   обновление токенов
 *   POST /api/v1/auth/logout    выход
 *   GET  /api/v1/auth/me        профиль по access-токену
 */
import { Router } from 'express';

import {
  login,
  logout,
  publicUser,
  refresh,
  register,
  userFromAccess,
} from '../services/auth.service.js';

const router = Router();

/**
 * Оборачивает обработчик, чтобы ошибка попала в middleware Express.
 *
 * @param {Function} handler Обработчик.
 * @returns {Function}
 */
function handle(handler) {
  return (req, res, next) => {
    try {
      handler(req, res);
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Проверяет заголовок Authorization: Bearer <access>.
 *
 * @param {object} req Запрос.
 * @param {object} res Ответ.
 * @param {Function} next Следующий middleware.
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Требуется access-токен' },
    });
  }

  try {
    const user = userFromAccess(token);
    if (!user) {
      throw new Error('Пользователь не найден');
    }
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Токен недействителен или истёк' },
    });
  }
}

router.post(
  '/auth/register',
  handle((req, res) => {
    const result = register(req.body || {});
    res.status(201).json(result);
  }),
);

router.post(
  '/auth/login',
  handle((req, res) => {
    res.status(200).json(login(req.body || {}));
  }),
);

router.post(
  '/auth/refresh',
  handle((req, res) => {
    const token = String((req.body || {}).refreshToken || '');
    if (!token) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Требуется refreshToken' },
      });
    }
    return res.status(200).json(refresh(token));
  }),
);

router.post(
  '/auth/logout',
  handle((req, res) => {
    const token = String((req.body || {}).refreshToken || '');
    if (token) logout(token);
    res.status(204).end();
  }),
);

router.get('/auth/me', requireAuth, (req, res) => {
  res.status(200).json({ user: publicUser(req.user) });
});

export default router;
