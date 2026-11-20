-- =====================================================================
--  PCHelper — складской учёт и запросы на поступление.
--
--  Количество хранится отдельно у каждого товара каталога и у готовых
--  конфигураций: это разные товарные позиции.
--
--  Применение: Supabase Dashboard → SQL Editor → New query → Run.
-- =====================================================================

BEGIN;

ALTER TABLE "Процессоры"          ADD COLUMN IF NOT EXISTS "количество" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "МатеринскиеПлаты"    ADD COLUMN IF NOT EXISTS "количество" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ОЗУ"                 ADD COLUMN IF NOT EXISTS "количество" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Видеокарты"          ADD COLUMN IF NOT EXISTS "количество" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "БлокиПитания"        ADD COLUMN IF NOT EXISTS "количество" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Накопители"          ADD COLUMN IF NOT EXISTS "количество" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Корпуса"             ADD COLUMN IF NOT EXISTS "количество" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "СистемыОхлаждения"   ADD COLUMN IF NOT EXISTS "количество" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ГотовыеКонфигурации" ADD COLUMN IF NOT EXISTS "количество" INTEGER NOT NULL DEFAULT 0;

-- Демонстрационные остатки: часть позиций специально с нулём,
-- чтобы проверить «Нет в наличии» и запрос на поступление.
UPDATE "Процессоры" SET "количество" = ((id * 7) % 11) WHERE "количество" = 0;
UPDATE "МатеринскиеПлаты" SET "количество" = ((id * 5) % 9) WHERE "количество" = 0;
UPDATE "ОЗУ" SET "количество" = ((id * 3) % 8) WHERE "количество" = 0;
UPDATE "Видеокарты" SET "количество" = ((id * 2) % 7) WHERE "количество" = 0;
UPDATE "БлокиПитания" SET "количество" = ((id * 4) % 8) WHERE "количество" = 0;
UPDATE "Накопители" SET "количество" = ((id * 3) % 10) WHERE "количество" = 0;
UPDATE "Корпуса" SET "количество" = ((id * 2) % 6) WHERE "количество" = 0;
UPDATE "СистемыОхлаждения" SET "количество" = ((id * 5) % 7) WHERE "количество" = 0;
UPDATE "ГотовыеКонфигурации" SET "количество" = 3 WHERE "количество" = 0;

CREATE TABLE IF NOT EXISTS "ЗапросыНаПоступление" (
  id              SERIAL PRIMARY KEY,
  товар_категория TEXT        NOT NULL,
  товар_id        INTEGER     NOT NULL,
  пользователь_id INTEGER     REFERENCES "Пользователи"(id) ON DELETE SET NULL,
  email           TEXT,
  телефон         TEXT,
  статус          TEXT        NOT NULL DEFAULT 'новый'
                  CHECK (статус IN ('новый', 'обработан')),
  создан_в        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_requests_status
  ON "ЗапросыНаПоступление"(статус, создан_в);

ALTER TABLE "ЗапросыНаПоступление" ENABLE ROW LEVEL SECURITY;

COMMIT;
