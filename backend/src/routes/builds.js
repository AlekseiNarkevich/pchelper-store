/**
 * PCHelper (курсовая) — сохранённые сборки.
 *
 *   POST   /api/v1/builds/check   проверка совместимости без сохранения
 *   GET    /api/v1/builds         список сборок пользователя
 *   POST   /api/v1/builds         создать сборку
 *   GET    /api/v1/builds/:id     одна сборка с составом
 *   PUT    /api/v1/builds/:id     заменить состав и название
 *   DELETE /api/v1/builds/:id     удалить сборку
 */
import { Router } from 'express';

import {
  buildNotFound,
  checkBuild,
  createBuild,
  deleteBuild,
  getBuild,
  listBuilds,
  updateBuild,
} from '../repositories/builds.repository.js';
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

// Проверка совместимости доступна и без входа: конфигуратор показывает
// предупреждения ещё до сохранения.
router.post(
  '/builds/check',
  asyncHandler(async (req, res) => {
    const components = (req.body || {}).components || req.body || {};
    res.status(200).json(await checkBuild(components));
  }),
);

router.use('/builds', requireAuth);

router.get(
  '/builds',
  asyncHandler(async (req, res) => {
    res.status(200).json(await listBuilds(req.user.id));
  }),
);

router.post(
  '/builds',
  asyncHandler(async (req, res) => {
    const build = await createBuild(req.user.id, req.body || {});
    res.status(201).json({ build });
  }),
);

router.get(
  '/builds/:id',
  asyncHandler(async (req, res) => {
    const build = await getBuild(req.user.id, req.params.id);
    if (!build) throw buildNotFound();
    res.status(200).json({ build });
  }),
);

router.put(
  '/builds/:id',
  asyncHandler(async (req, res) => {
    const build = await updateBuild(req.user.id, req.params.id, req.body || {});
    if (!build) throw buildNotFound();
    res.status(200).json({ build });
  }),
);

router.delete(
  '/builds/:id',
  asyncHandler(async (req, res) => {
    const removed = await deleteBuild(req.user.id, req.params.id);
    if (!removed) throw buildNotFound();
    res.status(204).end();
  }),
);

export default router;
