-- PCHelper — готовая сборка в корзине как одна позиция.
--
-- Раньше сборка раскладывалась на комплектующие, и при заказе списывались
-- детали. Теперь готовый ПК — отдельный товар: у него своё количество
-- в «ГотовыеКонфигурации», а корзина хранит ссылку на сборку.
--
-- Выполнить в Supabase Dashboard → SQL Editor → New query → Run.

ALTER TABLE "Корзина_Позиции"
  ADD COLUMN IF NOT EXISTS "готовая_конфигурация_id" INTEGER
  REFERENCES "ГотовыеКонфигурации"(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_cart_prebuilt
  ON "Корзина_Позиции"(готовая_конфигурация_id);
