/**
 * PCHelper — защищённые маршруты администратора.
 *
 * Служебные маршруты приложения:
 *   GET /api/v1/health       — проверка работоспособности;
 *   GET /api/v1/hello        — служебное приветствие;
 *   GET /api/v1/hello/db     — проверка подключения к базе данных;
 *   GET /api/v1/admin/orders — защищённый маршрут администратора.
 */

import { Router } from 'express';

const router = Router();

/**
 * GET /api/v1/admin/orders
 * Пример защищённого маршрута: доступен только с ролью manager.
 * Проверка роли выполняется middleware в app.js — здесь сам маршрут.
 */
router.get('/orders', (req, res) => {
  res.status(200).json({
    items: [],
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    note: 'Заглушка: полноценный модуль заказов реализуется в курсовой работе.',
  });
});

export default router;
