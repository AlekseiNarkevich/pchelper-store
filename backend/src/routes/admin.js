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
 *   POST   /api/v1/admin/uploads
 *   GET    /api/v1/admin/reviews
 *   PATCH  /api/v1/admin/reviews/:id
 */
import { Router } from 'express';
import multer from 'multer';

import { apiError } from '../domain/errors.js';
import {
  createProduct,
  deleteOrder,
  deleteProduct,
  deleteUser,
  getSummary,
  listOrderHistory,
  listOrderPositions,
  listOrders,
  listPrebuiltStock,
  listProducts,
  listUsers,
  updatePrebuiltStock,
  updateOrder,
  updateProduct,
  updateUser,
} from '../repositories/admin.repository.js';
import { deleteReview, listAll, moderate } from '../repositories/reviews.repository.js';
import {
  listRequests as listStockRequests,
  updateRequest as updateStockRequest,
} from '../repositories/stock.repository.js';
import {
  listEmails,
  resendEmail,
  sendTestEmail,
} from '../repositories/mail.repository.js';
import {
  sendAccountBlockedEmail,
  sendAccountDeletedEmail,
  sendAccountUnblockedEmail,
  sendOrderStatusEmail,
  sendReviewDeletedEmail,
  sendReviewModeratedEmail,
  sendRoleChangedEmail,
} from '../services/mail.service.js';
import { uploadProductImage } from '../services/storage.service.js';
import { requireAdmin } from './auth.js';

const router = Router();

// Файл держим в памяти: он сразу уходит в Supabase Storage,
// на диск сервера ничего не пишем.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

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

// Загрузка фото товара в Supabase Storage. Отдельный маршрут,
// потому что здесь не JSON, а файл multipart/form-data.
router.post(
  '/uploads',
  (req, res, next) => {
    upload.single('file')(req, res, (error) => {
      if (!error) return next();
      if (error.code === 'LIMIT_FILE_SIZE') {
        return next(apiError(400, 'FILE_TOO_LARGE', 'Файл больше 5 МБ'));
      }
      return next(
        apiError(400, 'UPLOAD_ERROR', 'Не удалось прочитать файл изображения'),
      );
    });
  },
  asyncHandler(async (req, res) => {
    res.status(201).json(await uploadProductImage(req.file));
  }),
);

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

router.delete(
  '/orders/:id',
  asyncHandler(async (req, res) => {
    res.status(200).json(await deleteOrder(req.params.id));
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
    const data = req.body || {};
    const user = await updateUser(req.params.id, data, adminId);

    // Каждое действие с аккаунтом сопровождается письмом с причиной.
    if (user.email) {
      if (data.blocked === true) {
        void sendAccountBlockedEmail({
          to: user.email,
          name: user.name,
          reason: user.blockReason || data.reason,
        });
      } else if (data.blocked === false) {
        void sendAccountUnblockedEmail({
          to: user.email,
          name: user.name,
          comment: data.reason,
        });
      } else if (data.role) {
        void sendRoleChangedEmail({
          to: user.email,
          name: user.name,
          role: user.role,
          comment: data.reason,
        });
      }
    }

    res.status(200).json(user);
  }),
);

router.delete(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const adminId = req.user?.id || '';
    const reason = String((req.body || {}).reason || 'Решение администрации').trim();
    const user = await deleteUser(req.params.id, adminId, reason);
    if (user.email) {
      void sendAccountDeletedEmail({
        to: user.email,
        name: user.name,
        reason,
      });
    }
    res.status(200).json(user);
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
  '/prebuilt-stock',
  asyncHandler(async (req, res) => {
    res.status(200).json(await listPrebuiltStock());
  }),
);

router.patch(
  '/prebuilt-stock/:id',
  asyncHandler(async (req, res) => {
    res
      .status(200)
      .json(await updatePrebuiltStock(req.params.id, (req.body || {}).stock));
  }),
);

router.get(
  '/stock-requests',
  asyncHandler(async (req, res) => {
    res.status(200).json(await listStockRequests());
  }),
);

router.patch(
  '/stock-requests/:id',
  asyncHandler(async (req, res) => {
    const status = String((req.body || {}).status || '');
    res.status(200).json(await updateStockRequest(req.params.id, status));
  }),
);

router.get(
  '/emails',
  asyncHandler(async (req, res) => {
    res.status(200).json(await listEmails(Number(req.query.limit) || 100));
  }),
);

router.post(
  '/emails/test',
  asyncHandler(async (req, res) => {
    const to = String((req.body || {}).to || req.user?.email || '');
    res.status(200).json(await sendTestEmail(to));
  }),
);

router.post(
  '/emails/:id/resend',
  asyncHandler(async (req, res) => {
    res.status(200).json(await resendEmail(req.params.id));
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
    const body = req.body || {};
    const reason = String(body.reason || '').trim();
    const review = await moderate(req.params.id, String(body.status || ''));
    if (review.email) {
      void sendReviewModeratedEmail({
        to: review.email,
        name: review.author,
        productId: review.productId,
        productName: review.productName,
        status: review.status,
        comment: reason,
      });
    }
    res.status(200).json(review);
  }),
);

router.delete(
  '/reviews/:id',
  asyncHandler(async (req, res) => {
    const reason = String((req.body || {}).reason || '').trim();
    const review = await deleteReview(req.params.id);
    if (review.email) {
      void sendReviewDeletedEmail({
        to: review.email,
        name: review.author,
        productId: review.productId,
        productName: review.productName,
        comment: reason || 'Решение модератора',
      });
    }
    res.status(200).json(review);
  }),
);

export default router;
