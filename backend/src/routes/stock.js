/**
 * PCHelper — запрос на поступление товара.
 *
 *   POST /api/v1/products/:id/stock-request
 */
import { Router } from 'express';

import { createRequest } from '../repositories/stock.repository.js';

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

router.post(
  '/products/:id/stock-request',
  asyncHandler(async (req, res) => {
    const request = await createRequest(req.params.id, req.body || {});
    res.status(201).json({ request });
  }),
);

export default router;
