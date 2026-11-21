-- PCHelper — удаление аккаунтов.
--
-- Полное удаление строки невозможно: на «Пользователи» ссылаются заказы
-- (ON DELETE RESTRICT), а историю заказов терять нельзя. Поэтому аккаунт
-- помечается удалённым и обезличивается: e-mail, имя, телефон, адрес
-- и пароль очищаются, вход запрещён. Заказы остаются с ссылкой на
-- обезличенную запись.
--
-- Выполнить в Supabase Dashboard → SQL Editor → New query → Run.

ALTER TABLE "Пользователи"
  ADD COLUMN IF NOT EXISTS "удалён" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "удалён_в" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_deleted
  ON "Пользователи"(удалён)
  WHERE удалён = true;
