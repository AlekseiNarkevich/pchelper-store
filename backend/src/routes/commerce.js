/**
 * PCHelper (ЛР8) — маршруты серверной корзины и заказов.
 *
 *   GET    /api/v1/cart
 *   POST   /api/v1/cart/items
 *   PATCH  /api/v1/cart/items/:id
 *   DELETE /api/v1/cart/items/:id
 *   POST   /api/v1/cart/clear
 *   GET    /api/v1/orders
 *   POST   /api/v1/orders
 *   POST   /api/v1/orders/:id/complete
 *   POST   /api/v1/orders/:id/refuse
 */
import { Router } from 'express';

import {
  sendOrderConfirmation,
  sendOrderRefusedNotice,
  sendOrderStatusEmail,
} from '../services/mail.service.js';
import { requireAuth } from './auth.js';
import { getProduct } from '../repositories/catalog.repository.js';
import {
  addItem,
  clearCart,
  completeOrder,
  createOrder,
  getCart,
  listOrderHistory,
  listOrders,
  refuseOrder,
  removeItem,
  updateItem,
} from '../repositories/commerce.repository.js';

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

router.use(['/cart', '/orders'], requireAuth);

router.get(
  '/cart',
  asyncHandler(async (req, res) => {
    const items = await getCart(req.user.id);
    res.status(200).json({
      items,
      total: items.reduce((sum, item) => sum + item.price * item.qty, 0),
      count: items.reduce((sum, item) => sum + item.qty, 0),
    });
  }),
);

router.post(
  '/cart/items',
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const id = String(body.id || body.productId || '');
    const [category, rawId] = id.split(':');
    if (!category || !rawId) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Нужен идентификатор вида «cpu:1»',
        },
      });
    }

    const product = await getProduct(id);
    if (!product) {
      return res.status(404).json({
        error: { code: 'PRODUCT_NOT_FOUND', message: `Товар «${id}» не найден` },
      });
    }

    const items = await addItem(req.user.id, {
      category,
      productId: Number(rawId),
      name: product.name,
      price: product.price,
      stock: product.stock,
      qty: body.qty || 1,
    });
    return res.status(201).json({ items });
  }),
);

router.patch(
  '/cart/items/:id',
  asyncHandler(async (req, res) => {
    const items = await updateItem(req.user.id, req.params.id, (req.body || {}).qty);
    res.status(200).json({ items });
  }),
);

router.delete(
  '/cart/items/:id',
  asyncHandler(async (req, res) => {
    const items = await removeItem(req.user.id, req.params.id);
    res.status(200).json({ items });
  }),
);

router.post(
  '/cart/clear',
  asyncHandler(async (req, res) => {
    await clearCart(req.user.id);
    res.status(204).end();
  }),
);

router.get(
  '/orders',
  asyncHandler(async (req, res) => {
    const items = await listOrders(req.user.id);
    res.status(200).json({ items, total: items.length });
  }),
);

router.get(
  '/orders/:id/history',
  asyncHandler(async (req, res) => {
    res.status(200).json(await listOrderHistory(req.user.id, req.params.id));
  }),
);

router.post(
  '/orders/:id/complete',
  asyncHandler(async (req, res) => {
    const order = await completeOrder(req.user.id, req.params.id);
    // Покупатель подтвердил получение — отправляем письмо о завершении.
    void sendOrderStatusEmail({
      to: req.user.email,
      order,
      status: order.status,
      comment: 'Получение подтверждено покупателем',
    });
    res.status(200).json(order);
  }),
);

router.post(
  '/orders/:id/refuse',
  asyncHandler(async (req, res) => {
    const reason = String((req.body || {}).reason || '').trim();
    const order = await refuseOrder(req.user.id, req.params.id, reason);
    // Покупателю — подтверждение отмены, магазину — уведомление об отказе.
    void sendOrderStatusEmail({
      to: req.user.email,
      order,
      status: order.status,
      comment: `Отказ покупателя: ${reason}`,
    });
    void sendOrderRefusedNotice({
      order,
      reason,
      customerEmail: req.user.email,
    });
    res.status(200).json(order);
  }),
);

router.post(
  '/orders',
  asyncHandler(async (req, res) => {
    const order = await createOrder(req.user.id, {
      ...(req.body || {}),
      email: req.user.email,
    });
    // Письмо не должно задерживать ответ и не отменяет заказ при ошибке.
    void sendOrderConfirmation({ to: req.user.email, order });
    res.status(201).json(order);
  }),
);

export default router;
