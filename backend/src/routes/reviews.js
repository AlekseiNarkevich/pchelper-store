/**
 * PCHelper — отзывы товаров.
 *
 *   GET  /api/v1/products/:id/reviews  опубликованные отзывы и средняя оценка
 *   GET  /api/v1/products/:id/reviews/mine  свой отзыв (нужен вход)
 *   POST /api/v1/products/:id/reviews  новый отзыв или замена своего (нужен вход)
 */
import { Router } from 'express';

import {
  createReview,
  getMyReview,
  listApproved,
} from '../repositories/reviews.repository.js';
import { requireAuth } from './auth.js';

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

router.get(
  '/products/:id/reviews',
  asyncHandler(async (req, res) => {
    res.status(200).json(await listApproved(req.params.id));
  }),
);

router.get(
  '/products/:id/reviews/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.status(200).json({ review: await getMyReview(req.user.id, req.params.id) });
  }),
);

router.post(
  '/products/:id/reviews',
  requireAuth,
  asyncHandler(async (req, res) => {
    const review = await createReview(req.user.id, req.params.id, req.body || {});
    res.status(201).json({ review });
  }),
);

export default router;
