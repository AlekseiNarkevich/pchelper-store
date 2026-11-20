-- =====================================================================
--  PCHelper — курсовая работа 4 курса
--  Пользователи (профиль), обновительные токены, сохранённые сборки.
--
--  Применение: Supabase Dashboard → SQL Editor → New query → Run.
--  Миграция безопасна для повторного запуска (IF NOT EXISTS).
--
--  Таблицы каталога, корзин и заказов уже созданы миграцией
--  db/09_supabase_commerce.sql.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Профиль пользователя: адрес доставки
-- ---------------------------------------------------------------------
ALTER TABLE "Пользователи"
  ADD COLUMN IF NOT EXISTS "адрес_доставки" TEXT;

-- ---------------------------------------------------------------------
-- 2. Обновительные токены
--    В базе лежит только SHA-256 от токена: украденная таблица не даёт
--    возможности войти. Сам JWT клиенту выдаётся один раз.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ОбновительныеТокены" (
  id              SERIAL PRIMARY KEY,
  пользователь_id INTEGER      NOT NULL REFERENCES "Пользователи"(id) ON DELETE CASCADE,
  token_hash      VARCHAR(128) NOT NULL,
  истекает_в      TIMESTAMPTZ  NOT NULL,
  отозван         BOOLEAN      NOT NULL DEFAULT false,
  создан_в        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_refresh_token UNIQUE (token_hash)
);

-- ---------------------------------------------------------------------
-- 3. Сохранённые сборки пользователя
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "Сборки" (
  id              SERIAL PRIMARY KEY,
  пользователь_id INTEGER      NOT NULL REFERENCES "Пользователи"(id) ON DELETE CASCADE,
  название        VARCHAR(150) NOT NULL,
  общая_стоимость INTEGER      NOT NULL DEFAULT 0 CHECK (общая_стоимость >= 0),
  заметка         TEXT,
  создан_в        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  обновлён_в      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Состав сборки: каждая строка — один компонент, ровно одна из восьми
-- ссылок заполнена. Накопителей может быть несколько строк.
CREATE TABLE IF NOT EXISTS "Сборка_Компоненты" (
  id                   SERIAL PRIMARY KEY,
  сборка_id            INTEGER NOT NULL REFERENCES "Сборки"(id) ON DELETE CASCADE,
  количество           INTEGER NOT NULL DEFAULT 1 CHECK (количество > 0),
  процессор_id         INTEGER REFERENCES "Процессоры"(id)          ON DELETE CASCADE,
  материнская_плата_id INTEGER REFERENCES "МатеринскиеПлаты"(id)     ON DELETE CASCADE,
  озу_id               INTEGER REFERENCES "ОЗУ"(id)                  ON DELETE CASCADE,
  видеокарта_id        INTEGER REFERENCES "Видеокарты"(id)           ON DELETE CASCADE,
  охлаждение_id        INTEGER REFERENCES "СистемыОхлаждения"(id)    ON DELETE CASCADE,
  накопитель_id        INTEGER REFERENCES "Накопители"(id)           ON DELETE CASCADE,
  блокпитания_id       INTEGER REFERENCES "БлокиПитания"(id)         ON DELETE CASCADE,
  корпус_id            INTEGER REFERENCES "Корпуса"(id)              ON DELETE CASCADE
);

-- Ровно один компонент в строке.
DO $$ BEGIN
  ALTER TABLE "Сборка_Компоненты"
    ADD CONSTRAINT chk_build_one_component
    CHECK (num_nonnulls(
      процессор_id, материнская_плата_id, озу_id, видеокарта_id,
      охлаждение_id, накопитель_id, блокпитания_id, корпус_id
    ) = 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- 4. Индексы
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_builds_user
  ON "Сборки"(пользователь_id);
CREATE INDEX IF NOT EXISTS idx_build_components_build
  ON "Сборка_Компоненты"(сборка_id);
CREATE INDEX IF NOT EXISTS idx_refresh_user
  ON "ОбновительныеТокены"(пользователь_id);

-- ---------------------------------------------------------------------
-- 5. RLS: доступ только серверному ключу (он обходит политики)
-- ---------------------------------------------------------------------
ALTER TABLE "ОбновительныеТокены" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Сборки"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Сборка_Компоненты"   ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 6. Демо-пользователь: пароль demo1234 (scrypt, соль:хэш)
-- ---------------------------------------------------------------------
UPDATE "Пользователи"
   SET password_hash = '565726bc71b3c2ceef3cd762706e0b4f:96e1f01e84d186d12bb3764e71b8296c8950670d38dc58362531cb50162c9d96c333e761f1f577acbb32076f39cc2328de341b6449f10cf4a2a98cdd78e9a4fb',
       обновлён_в   = now()
 WHERE email = 'demo@pchelper.by'
   AND password_hash IS NULL;

COMMIT;
