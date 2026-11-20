/**
 * PCHelper — конфигурация Express-приложения.
 *
 * Сервис отдаёт REST API интернет-магазина: каталог и готовые сборки,
 * регистрацию и профиль, корзину и заказы, сохранённые сборки,
 * калькулятор мощности блока питания.
 */

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';

import helloRouter from './routes/hello.js';
import authRouter from './routes/auth.js';
import commerceRouter from './routes/commerce.js';
import adminRouter from './routes/admin.js';
import buildsRouter from './routes/builds.js';
import catalogRouter from './routes/catalog.js';
import psuRouter from './routes/psu.js';
import reviewsRouter from './routes/reviews.js';

// Момент запуска — чтобы в ответе /api/v1/hello показывать время работы процесса.
const STARTED_AT = Date.now();

// Собранный веб-клиент. В обычном API-режиме статика не раздаётся:
// её отдают Vite в разработке или nginx в Docker. Флаг SERVE_WEB=1
// включает «один сервер» для desktop-версии и локальной проверки.
const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIST = resolve(CURRENT_DIR, '../../frontend/dist');

/**
 * Создаёт и настраивает Express-приложение.
 *
 * Вынесено в отдельную функцию, а не в module scope, чтобы тесты могли
 * создать приложение в памяти (без прослушивания порта) и обращаться к нему
 * через supertest.
 *
 * @returns {import('express').Express} Готовое к запуску приложение.
 */
export function createApp() {
  const app = express();

  // --- Базовая обвязка ---
  app.use(express.json()); // разбор тела запроса в JSON

  // --- Маршруты ---
  // Служебный маршрут проверки работоспособности.
  app.get('/api/v1/health', (req, res) => {
    res.status(200).json({
      status: 'ok',
      version: '1.0.0',
      uptimeSeconds: Math.floor((Date.now() - STARTED_AT) / 1000),
      timestamp: new Date().toISOString(),
    });
  });

  // Служебный маршрут «Hello World».
  app.use('/api/v1', helloRouter);

  // --- Аутентификация и профиль ---
  app.use('/api/v1', authRouter);

  // --- Серверная корзина и заказы ---
  app.use('/api/v1', commerceRouter);

  // --- Сохранённые сборки, калькулятор БП и отзывы ---
  app.use('/api/v1', buildsRouter);
  app.use('/api/v1', psuRouter);
  app.use('/api/v1', reviewsRouter);

  // --- Каталог ---
  // Товары, категории и готовые сборки. Данные берутся из Supabase,
  // а при отсутствии переменных окружения — из демонстрационной фикстуры.
  app.use('/api/v1', catalogRouter);

  // Защищённый админ-модуль: доступ проверяет middleware выше по цепочке.
  app.use('/api/v1/admin', adminRouter);

  // --- Статика веб-клиента для desktop-версии ---
  // Включается только по флагу, чтобы тесты и чистый API не получали HTML.
  if (process.env.SERVE_WEB === '1' && existsSync(FRONTEND_DIST)) {
    app.use(express.static(FRONTEND_DIST));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      return res.sendFile(join(FRONTEND_DIST, 'index.html'));
    });
  }

  // --- Корневой маршрут ---
  // Без него GET / возвращает 404, и при первом открытии адреса
  // развёрнутого сервиса кажется, что деплой сломан. Отдаём
  // короткую «визитку» со списком доступных маршрутов.
  app.get('/', (req, res) => {
    res.status(200).json({
      service: 'PCHelper API',
      description: 'Интернет-магазин комплектующих PCHelper: каталог, сборки, заказы',
      version: process.env.APP_VERSION || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      endpoints: {
        health: 'GET /api/v1/health',
        hello: 'GET /api/v1/hello',
        database: 'GET /api/v1/hello/db',
        auth: 'POST /api/v1/auth/register, /login, /refresh, /logout; GET /auth/me',
        cart: 'GET /api/v1/cart; POST /cart/items; PATCH/DELETE /cart/items/:id',
        orders: 'GET /api/v1/orders; POST /orders',
        builds:
          'GET/POST /api/v1/builds; POST /builds/check; GET/PUT/DELETE /builds/:id',
        psu: 'GET /api/v1/psu?cpu=cpu:1&gpu=gpu:1',
        adminOrders: 'GET /api/v1/admin/orders (нужен токен)',
      },
      note: 'Спецификация REST API — файл api/openapi.yaml',
    });
  });

  // --- Единый формат ошибок (требование NFR-09) ---
  // 404: неизвестный маршрут. Express по умолчанию отдал бы HTML-страницу,
  // но клиенту нужен JSON того же вида, что и у остальных ошибок.
  app.use((req, res) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: `Маршрут ${req.method} ${req.originalUrl} не найден`,
      },
    });
  });

  // 500: необработанная ошибка в одном из маршрутов.
  // Обработчик ошибок Express обязан принимать ровно четыре аргумента
  // (err, req, res, next) — иначе Express не признает его обработчиком.
  // Сам next здесь не нужен, поэтому он назван с подчёркиванием:
  // правило no-unused-vars разрешает неиспользуемые аргументы,
  // начинающиеся с «_».
  //
  // Ошибки с явно заданным статусом (например, 400 от валидации каталога)
  // отдаются клиенту с этим статусом: иначе любая опечатка в query
  // выглядела бы как сбой сервера.
  app.use((err, req, res, _next) => {
    const status = Number(err.status) || 500;
    if (status >= 500) {
      console.error('[api] необработанная ошибка:', err.message);
    }
    res.status(status).json({
      error: {
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'Ошибка сервера',
      },
    });
  });

  return app;
}
