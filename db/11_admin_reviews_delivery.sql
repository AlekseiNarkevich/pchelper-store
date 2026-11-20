-- =====================================================================
--  PCHelper — курсовая работа 4 курса
--  Администратор, блокировка пользователей, доставка, отзывы, письма.
--
--  Применение: Supabase Dashboard → SQL Editor → New query → Run.
--  Миграция безопасна для повторного запуска.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Пользователи: блокировка и причина
-- ---------------------------------------------------------------------
ALTER TABLE "Пользователи"
  ADD COLUMN IF NOT EXISTS "заблокирован" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Пользователи"
  ADD COLUMN IF NOT EXISTS "причина_блокировки" TEXT;

-- ---------------------------------------------------------------------
-- 2. Заказы: доставка
--    способ_доставки остаётся 'pickup' | 'courier'; зона уточняет,
--    в пределах МКАД или за МКАД.
-- ---------------------------------------------------------------------
ALTER TABLE "Заказы"
  ADD COLUMN IF NOT EXISTS "стоимость_доставки" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Заказы"
  ADD COLUMN IF NOT EXISTS "зона_доставки" TEXT;
ALTER TABLE "Заказы"
  ADD COLUMN IF NOT EXISTS "расстояние_км" NUMERIC(6, 1);
ALTER TABLE "Заказы"
  ADD COLUMN IF NOT EXISTS "эл_почта" TEXT;

-- ---------------------------------------------------------------------
-- 3. Отзывы и рейтинги товаров
--    Один пользователь — один отзыв на товар. Отзыв появляется на
--    странице товара только после одобрения администратором.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "Отзывы" (
  id              SERIAL PRIMARY KEY,
  пользователь_id INTEGER      NOT NULL REFERENCES "Пользователи"(id) ON DELETE CASCADE,
  товар_категория TEXT         NOT NULL,
  товар_id        INTEGER      NOT NULL,
  оценка          SMALLINT     NOT NULL CHECK (оценка BETWEEN 1 AND 5),
  текст           TEXT,
  статус          TEXT         NOT NULL DEFAULT 'на модерации'
                  CHECK (статус IN ('на модерации', 'опубликован', 'отклонён')),
  создан_в        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_review_author_item
    UNIQUE (пользователь_id, товар_категория, товар_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_product
  ON "Отзывы"(товар_категория, товар_id, статус);
CREATE INDEX IF NOT EXISTS idx_reviews_status
  ON "Отзывы"(статус);

-- ---------------------------------------------------------------------
-- 4. Письма: журнал уведомлений о заказах
--    Если SMTP не настроен, письмо сохраняется со статусом «не отправлено».
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "Письма" (
  id         SERIAL PRIMARY KEY,
  заказ_id   INTEGER     REFERENCES "Заказы"(id) ON DELETE SET NULL,
  email      TEXT        NOT NULL,
  тема       TEXT        NOT NULL,
  текст      TEXT        NOT NULL,
  отправлено BOOLEAN     NOT NULL DEFAULT false,
  ошибка     TEXT,
  создан_в   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "Отзывы" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Письма" ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 5. Администратор
--    Логин: admin@pchelper.by
--    Пароль: admin2026
-- ---------------------------------------------------------------------
INSERT INTO "Пользователи" (email, password_hash, имя, роль, заблокирован)
VALUES (
  'admin@pchelper.by',
  'a9f36aa4199a1a77c244ac21ef77112f:53f91410d0d05e0a52851cdcf530abe801bc57f9c41f8d7e6e1aafe4eee8b1a8b559fd4bbcbfdebe59d9b5cacf56585399c3e4cc0f856db863a91e2cbbe32ced',
  'Администратор',
  'admin',
  false
)
ON CONFLICT (email) DO UPDATE
  SET роль = 'admin',
      password_hash = EXCLUDED.password_hash,
      имя = EXCLUDED.имя,
      заблокирован = false;

COMMIT;
