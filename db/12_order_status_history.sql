-- =====================================================================
--  PCHelper — история статусов заказов.
--
--  Дополняет заказы: каждый перевод статуса сохраняется с комментарием
--  администратора. Статус «Готов к выдаче» добавлен для самовывоза.
--
--  Применение: Supabase Dashboard → SQL Editor → New query → Run.
-- =====================================================================

ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'Готов к выдаче';

CREATE TABLE IF NOT EXISTS "ИсторияЗаказов" (
  id               SERIAL PRIMARY KEY,
  заказ_id         INTEGER     NOT NULL REFERENCES "Заказы"(id) ON DELETE CASCADE,
  статус           TEXT        NOT NULL,
  комментарий      TEXT,
  администратор_id INTEGER     REFERENCES "Пользователи"(id) ON DELETE SET NULL,
  создан_в         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_history_order
  ON "ИсторияЗаказов"(заказ_id, создан_в);

ALTER TABLE "ИсторияЗаказов" ENABLE ROW LEVEL SECURITY;
