-- PCHelper (ЛР8) — таблицы для серверной корзины и заказов в Supabase.
-- Выполнить в Supabase Dashboard → SQL Editor → New query → Run.
-- Таблицы каталога уже есть, поэтому они здесь не создаются.

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('customer', 'manager', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('Новый', 'В обработке', 'Собран', 'Отправлен', 'Доставлен', 'Отменён');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE delivery_method AS ENUM ('pickup', 'courier');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM ('card', 'cash', 'invoice');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "Пользователи" (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  имя           TEXT NOT NULL,
  телефон       TEXT,
  роль          user_role NOT NULL DEFAULT 'customer',
  создан_в      TIMESTAMPTZ NOT NULL DEFAULT now(),
  обновлён_в    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Корзины" (
  id              SERIAL PRIMARY KEY,
  пользователь_id INTEGER NOT NULL REFERENCES "Пользователи"(id) ON DELETE CASCADE,
  обновлена       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_cart_user UNIQUE (пользователь_id)
);

CREATE TABLE IF NOT EXISTS "Корзина_Позиции" (
  id                   SERIAL PRIMARY KEY,
  корзина_id           INTEGER NOT NULL REFERENCES "Корзины"(id) ON DELETE CASCADE,
  количество           INTEGER NOT NULL DEFAULT 1 CHECK (количество BETWEEN 1 AND 10),
  цена                 INTEGER NOT NULL CHECK (цена >= 0),
  процессор_id         INTEGER REFERENCES "Процессоры"(id) ON DELETE CASCADE,
  материнская_плата_id INTEGER REFERENCES "МатеринскиеПлаты"(id) ON DELETE CASCADE,
  озу_id               INTEGER REFERENCES "ОЗУ"(id) ON DELETE CASCADE,
  видеокарта_id        INTEGER REFERENCES "Видеокарты"(id) ON DELETE CASCADE,
  охлаждение_id        INTEGER REFERENCES "СистемыОхлаждения"(id) ON DELETE CASCADE,
  накопитель_id        INTEGER REFERENCES "Накопители"(id) ON DELETE CASCADE,
  блокпитания_id       INTEGER REFERENCES "БлокиПитания"(id) ON DELETE CASCADE,
  корпус_id            INTEGER REFERENCES "Корпуса"(id) ON DELETE CASCADE,
  добавлен_в           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Заказы" (
  id                    SERIAL PRIMARY KEY,
  номер                 TEXT NOT NULL UNIQUE,
  пользователь_id       INTEGER NOT NULL REFERENCES "Пользователи"(id) ON DELETE RESTRICT,
  статус                order_status NOT NULL DEFAULT 'Новый',
  способ_доставки       delivery_method NOT NULL,
  адрес_доставки        TEXT,
  телефон               TEXT NOT NULL,
  способ_оплаты         payment_method NOT NULL,
  итоговая_сумма        INTEGER NOT NULL CHECK (итоговая_сумма >= 0),
  скидка                INTEGER NOT NULL DEFAULT 0,
  трек_номер            TEXT,
  комментарий_менеджера TEXT,
  создан_в              TIMESTAMPTZ NOT NULL DEFAULT now(),
  обновлён_в            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Заказ_Позиции" (
  id               SERIAL PRIMARY KEY,
  заказ_id         INTEGER NOT NULL REFERENCES "Заказы"(id) ON DELETE CASCADE,
  тип_компонента   TEXT NOT NULL,
  идентификатор    INTEGER NOT NULL,
  название         TEXT NOT NULL,
  цена_за_единицу  INTEGER NOT NULL CHECK (цена_за_единицу >= 0),
  количество       INTEGER NOT NULL CHECK (количество BETWEEN 1 AND 10),
  сумма            INTEGER NOT NULL CHECK (сумма >= 0)
);

-- Демо-пользователь для сценария ЛР8.
INSERT INTO "Пользователи" (id, email, имя, роль)
VALUES (1, 'demo@pchelper.by', 'Демо-пользователь', 'customer')
ON CONFLICT (id) DO NOTHING;

-- RLS включаем явно. Backend использует SERVICE_ROLE_KEY и обходит политики,
-- поэтому его запросы продолжат работать; анонимный доступ остаётся закрытым.
ALTER TABLE "Пользователи" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Корзины" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Корзина_Позиции" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Заказы" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Заказ_Позиции" ENABLE ROW LEVEL SECURITY;
