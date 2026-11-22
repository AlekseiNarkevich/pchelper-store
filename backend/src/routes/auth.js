/**
 * PCHelper (курсовая) — маршруты аутентификации и профиля.
 *
 *   POST  /api/v1/auth/register  регистрация
 *   POST  /api/v1/auth/login     вход
 *   POST  /api/v1/auth/refresh   обновление токенов
 *   POST  /api/v1/auth/logout    выход
 *   GET   /api/v1/auth/me        профиль по access-токену
 *   PATCH /api/v1/auth/profile   изменение имени, телефона и адреса
 *   DELETE /api/v1/auth/account  удаление своего аккаунта
 */
import { Router } from 'express';

import {
  deleteOwnAccount,
  login,
  logout,
  publicUser,
  refresh,
  register,
  updateProfile,
  userFromAccess,
} from '../services/auth.service.js';

const router = Router();

/**
 * Оборачивает обработчик, чтобы ошибка (в том числе из Promise)
 * попала в middleware Express.
 *
 * @param {Function} handler Обработчик.
 * @returns {Function}
 */
function handle(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

/**
 * Проверяет заголовок Authorization: Bearer <access>.
 *
 * @param {object} req Запрос.
 * @param {object} res Ответ.
 * @param {Function} next Следующий middleware.
 */
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Требуется access-токен' },
    });
  }

  try {
    const user = await userFromAccess(token);
    if (!user) {
      throw new Error('Пользователь не найден');
    }
    if (user.blocked) {
      return res.status(403).json({
        error: {
          code: 'USER_BLOCKED',
          message: `${
            user.blockReason
              ? `Аккаунт заблокирован: ${user.blockReason}`
              : 'Аккаунт заблокирован администратором'
          }. Обратитесь в поддержку: pchelper.shop@gmail.com`,
        },
      });
    }
    if (user.deleted) {
      return res.status(403).json({
        error: {
          code: 'ACCOUNT_DELETED',
          message:
            'Аккаунт удалён. Вход невозможен. Обратитесь в поддержку: pchelper.shop@gmail.com',
        },
      });
    }
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Токен недействителен или истёк' },
    });
  }
}

/**
 * Проверяет access-токен и роль администратора.
 *
 * @param {object} req Запрос.
 * @param {object} res Ответ.
 * @param {Function} next Следующий middleware.
 */
export async function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Требуется access-токен' },
    });
  }

  try {
    const user = await userFromAccess(token);
    if (!user || user.role !== 'admin' || user.blocked) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Требуется роль администратора' },
      });
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
  handle(async (req, res) => {
    const result = await register(req.body || {});
    res.status(201).json(result);
  }),
);

router.post(
  '/auth/login',
  handle(async (req, res) => {
    res.status(200).json(await login(req.body || {}));
  }),
);

router.post(
  '/auth/refresh',
  handle(async (req, res) => {
    const token = String((req.body || {}).refreshToken || '');
    if (!token) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Требуется refreshToken' },
      });
    }
    return res.status(200).json(await refresh(token));
  }),
);

router.post(
  '/auth/logout',
  handle(async (req, res) => {
    const token = String((req.body || {}).refreshToken || '');
    if (token) await logout(token);
    res.status(204).end();
  }),
);

router.get('/auth/me', requireAuth, (req, res) => {
  res.status(200).json({ user: publicUser(req.user) });
});

router.patch(
  '/auth/profile',
  requireAuth,
  handle(async (req, res) => {
    const user = await updateProfile(req.user.id, req.body || {});
    res.status(200).json({ user });
  }),
);

router.delete(
  '/auth/account',
  requireAuth,
  handle(async (req, res) => {
    res.status(200).json(await deleteOwnAccount(req.user.id));
  }),
);

export default router;
