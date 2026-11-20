/**
 * PCHelper — административные маршруты.
 *
 * Доступ: JWT пользователя с ролью admin либо служебный ADMIN_TOKEN
 * (последний оставлен для старых проверок и CI).
 *
 *   GET    /api/v1/admin/summary
 *   GET    /api/v1/admin/orders
 *   GET    /api/v1/admin/orders/:id/positions
 *   PATCH  /api/v1/admin/orders/:id
 *   GET    /api/v1/admin/users
 *   PATCH  /api/v1/admin/users/:id
 *   GET    /api/v1/admin/products?category=cpu
 *   POST   /api/v1/admin/products
 *   PUT    /api/v1/admin/products/:category/:id
 *   DELETE /api/v1/admin/products/:category/:id
 *   GET    /api/v1/admin/reviews
 *   PATCH  /api/v1/admin/reviews/:id
 */
import { Router } from 'express';

import {
  createProduct,
  deleteProduct,
  getSummary,
  listOrderHistory,
  listOrderPositions,
  listOrders,
  listProducts,
  listUsers,
  updateOrder,
  updateProduct,
  updateUser,
} from '../repositories/admin.repository.js';
import { listAll, moderate } from '../repositories/reviews.repository.js';
import { sendOrderStatusEmail } from '../services/mail.service.js';
import { requireAdmin } from './auth.js';

const router = Router();

/**
 * Оборачивает асинхронный обработчик.
 *
 * @param {Function} handler Обработчик.
 * @returns {Function}
 */
function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

/**
 * Пропускает администратора по JWT или по служебному токену.
 *
 * @param {object} req Запрос.
 * @param {object} res Ответ.
 * @param {Function} next Следующий middleware.
 */
function adminAccess(req, res, next) {
  const provided = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const serviceToken = process.env.ADMIN_TOKEN || 'dev-admin-token';
  if (provided && provided === serviceToken) {
    req.serviceAdmin = true;
    return next();
  }
  return requireAdmin(req, res, next);
}

router.use(adminAccess);

router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    res.status(200).json(await getSummary());
  }),
);

router.get(
  '/orders',
  asyncHandler(async (req, res) => {
    res.status(200).json(await listOrders());
  }),
);

router.get(
  '/orders/:id/positions',
  asyncHandler(async (req, res) => {
    const items = await listOrderPositions(req.params.id);
    res.status(200).json({ items, total: items.length });
  }),
);

router.get(
  '/orders/:id/history',
  asyncHandler(async (req, res) => {
    res.status(200).json(await listOrderHistory(req.params.id));
  }),
);

router.patch(
  '/orders/:id',
  asyncHandler(async (req, res) => {
    const order = await updateOrder(req.params.id, req.body || {}, req.user?.id);
    if (order.email) {
      void sendOrderStatusEmail({
        to: order.email,
        order,
        status: order.status,
        comment: order.comment,
      });
    }
    res.status(200).json(order);
  }),
);

router.get(
  '/users',
  asyncHandler(async (req, res) => {
    res.status(200).json(await listUsers());
  }),
);

router.patch(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const adminId = req.user?.id || '';
    res.status(200).json(await updateUser(req.params.id, req.body || {}, adminId));
  }),
);

router.get(
  '/products',
  asyncHandler(async (req, res) => {
    const category = String(req.query.category || '');
    res.status(200).json(await listProducts(category));
  }),
);

router.post(
  '/products',
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const category = String(body.category || '');
    const data = body.data || body;
    res.status(201).json({ item: await createProduct(category, data) });
  }),
);

router.put(
  '/products/:category/:id',
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const data = body.data || body;
    res
      .status(200)
      .json({ item: await updateProduct(req.params.category, req.params.id, data) });
  }),
);

router.delete(
  '/products/:category/:id',
  asyncHandler(async (req, res) => {
    await deleteProduct(req.params.category, req.params.id);
    res.status(204).end();
  }),
);

router.get(
  '/reviews',
  asyncHandler(async (req, res) => {
    const status = req.query.status ? String(req.query.status) : '';
    res.status(200).json(await listAll(status));
  }),
);

router.patch(
  '/reviews/:id',
  asyncHandler(async (req, res) => {
    const status = String((req.body || {}).status || '');
    res.status(200).json(await moderate(req.params.id, status));
  }),
);

export default router;
