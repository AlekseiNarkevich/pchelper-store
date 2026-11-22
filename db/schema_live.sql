-- PCHelper: структура базы public из Supabase.
-- Снято: 2026-11-22
-- Команда: cd backend && npm run db:schema
-- Данные не включены.




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."delivery_method" AS ENUM (
    'pickup',
    'courier'
);


ALTER TYPE "public"."delivery_method" OWNER TO "postgres";


CREATE TYPE "public"."order_status" AS ENUM (
    'Новый',
    'В обработке',
    'Собран',
    'Отправлен',
    'Доставлен',
    'Отменён',
    'Готов к выдаче',
    'Завершён'
);


ALTER TYPE "public"."order_status" OWNER TO "postgres";


CREATE TYPE "public"."payment_method" AS ENUM (
    'card',
    'cash',
    'invoice'
);


ALTER TYPE "public"."payment_method" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'customer',
    'manager',
    'admin'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."БлокиПитания" (
    "id" integer NOT NULL,
    "название" character varying(255),
    "мощность_в_ваттах" integer,
    "pcie_gen5" boolean,
    "количество_pcie" integer,
    "количество_cpu" integer,
    "количество_sata" integer,
    "стандарт_блока_питания" character varying(50),
    "сертификат_80plus" character varying(50),
    "сертификат_cybenetics" character varying(50),
    "модульный" boolean,
    "цена" integer,
    "фото_url" character varying(255),
    "количество" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."БлокиПитания" OWNER TO "postgres";


ALTER TABLE "public"."БлокиПитания" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."БлокиПитания_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."Видеокарты" (
    "id" integer NOT NULL,
    "название" character varying(255),
    "производитель" character varying(50),
    "объем_памяти" integer,
    "длина" integer,
    "tdp" integer,
    "количество_вентиляторов" integer,
    "толщина_в_слотах" numeric(2,1),
    "цена" integer,
    "фото_url" character varying(255),
    "количество" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."Видеокарты" OWNER TO "postgres";


ALTER TABLE "public"."Видеокарты" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."Видеокарты_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ГотовыеКонфигурации" (
    "id" integer NOT NULL,
    "процессор_id" integer,
    "материнская_плата_id" integer,
    "озу_id" integer,
    "видеокарта_id" integer,
    "блокпитания_id" integer,
    "корпус_id" integer,
    "охлаждение_id" integer,
    "название" character varying(255),
    "задачи" character varying(255),
    "фото_url" character varying(255),
    "количество" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."ГотовыеКонфигурации" OWNER TO "postgres";


ALTER TABLE "public"."ГотовыеКонфигурации" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ГотовыеКонфигурации_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."Заказ_Позиции" (
    "id" integer NOT NULL,
    "заказ_id" integer NOT NULL,
    "тип_компонента" "text" NOT NULL,
    "идентификатор" integer NOT NULL,
    "название" "text" NOT NULL,
    "цена_за_единицу" integer NOT NULL,
    "количество" integer NOT NULL,
    "сумма" integer NOT NULL,
    CONSTRAINT "Заказ_Позиции_количество_check" CHECK ((("количество" >= 1) AND ("количество" <= 10))),
    CONSTRAINT "Заказ_Позиции_сумма_check" CHECK (("сумма" >= 0)),
    CONSTRAINT "Заказ_Позиции_цена_за_единицу_check" CHECK (("цена_за_единицу" >= 0))
);


ALTER TABLE "public"."Заказ_Позиции" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."Заказ_Позиции_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."Заказ_Позиции_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."Заказ_Позиции_id_seq" OWNED BY "public"."Заказ_Позиции"."id";



CREATE TABLE IF NOT EXISTS "public"."Заказы" (
    "id" integer NOT NULL,
    "номер" "text" NOT NULL,
    "пользователь_id" integer NOT NULL,
    "статус" "public"."order_status" DEFAULT 'Новый'::"public"."order_status" NOT NULL,
    "способ_доставки" "public"."delivery_method" NOT NULL,
    "адрес_доставки" "text",
    "телефон" "text" NOT NULL,
    "способ_оплаты" "public"."payment_method" NOT NULL,
    "итоговая_сумма" integer NOT NULL,
    "скидка" integer DEFAULT 0 NOT NULL,
    "трек_номер" "text",
    "комментарий_менеджера" "text",
    "создан_в" timestamp with time zone DEFAULT "now"() NOT NULL,
    "обновлён_в" timestamp with time zone DEFAULT "now"() NOT NULL,
    "стоимость_доставки" integer DEFAULT 0 NOT NULL,
    "зона_доставки" "text",
    "расстояние_км" numeric(6,1),
    "эл_почта" "text",
    CONSTRAINT "Заказы_итоговая_сумма_check" CHECK (("итоговая_сумма" >= 0))
);


ALTER TABLE "public"."Заказы" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."Заказы_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."Заказы_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."Заказы_id_seq" OWNED BY "public"."Заказы"."id";



CREATE TABLE IF NOT EXISTS "public"."ЗапросыНаПоступление" (
    "id" integer NOT NULL,
    "товар_категория" "text" NOT NULL,
    "товар_id" integer NOT NULL,
    "пользователь_id" integer,
    "email" "text",
    "телефон" "text",
    "статус" "text" DEFAULT 'новый'::"text" NOT NULL,
    "создан_в" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ЗапросыНаПоступление_статус_check" CHECK (("статус" = ANY (ARRAY['новый'::"text", 'обработан'::"text"])))
);


ALTER TABLE "public"."ЗапросыНаПоступление" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."ЗапросыНаПоступление_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."ЗапросыНаПоступление_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."ЗапросыНаПоступление_id_seq" OWNED BY "public"."ЗапросыНаПоступление"."id";



CREATE TABLE IF NOT EXISTS "public"."ИсторияЗаказов" (
    "id" integer NOT NULL,
    "заказ_id" integer NOT NULL,
    "статус" "text" NOT NULL,
    "комментарий" "text",
    "администратор_id" integer,
    "создан_в" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ИсторияЗаказов" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."ИсторияЗаказов_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."ИсторияЗаказов_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."ИсторияЗаказов_id_seq" OWNED BY "public"."ИсторияЗаказов"."id";



CREATE TABLE IF NOT EXISTS "public"."КонфигурацияНакопители" (
    "id" integer NOT NULL,
    "конфигурация_id" integer,
    "накопитель_id" integer
);


ALTER TABLE "public"."КонфигурацияНакопители" OWNER TO "postgres";


ALTER TABLE "public"."КонфигурацияНакопители" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."КонфигурацияНакопители_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."Корзина_Позиции" (
    "id" integer NOT NULL,
    "корзина_id" integer NOT NULL,
    "количество" integer DEFAULT 1 NOT NULL,
    "цена" integer NOT NULL,
    "процессор_id" integer,
    "материнская_плата_id" integer,
    "озу_id" integer,
    "видеокарта_id" integer,
    "охлаждение_id" integer,
    "накопитель_id" integer,
    "блокпитания_id" integer,
    "корпус_id" integer,
    "добавлен_в" timestamp with time zone DEFAULT "now"() NOT NULL,
    "готовая_конфигурация_id" integer,
    CONSTRAINT "Корзина_Позиции_количество_check" CHECK ((("количество" >= 1) AND ("количество" <= 10))),
    CONSTRAINT "Корзина_Позиции_цена_check" CHECK (("цена" >= 0))
);


ALTER TABLE "public"."Корзина_Позиции" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."Корзина_Позиции_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."Корзина_Позиции_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."Корзина_Позиции_id_seq" OWNED BY "public"."Корзина_Позиции"."id";



CREATE TABLE IF NOT EXISTS "public"."Корзины" (
    "id" integer NOT NULL,
    "пользователь_id" integer NOT NULL,
    "обновлена" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."Корзины" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."Корзины_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."Корзины_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."Корзины_id_seq" OWNED BY "public"."Корзины"."id";



CREATE TABLE IF NOT EXISTS "public"."Корпуса" (
    "id" integer NOT NULL,
    "название" character varying(255),
    "форм_фактор" character varying(50),
    "макс_длина_gpu" integer,
    "макс_высота_кулера" integer,
    "поддержка_сжо" boolean,
    "макс_длина_радиатора" integer,
    "вентиляторы_в_комплекте" character varying(255),
    "цена" integer,
    "фото_url" character varying(255),
    "количество" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."Корпуса" OWNER TO "postgres";


ALTER TABLE "public"."Корпуса" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."Корпуса_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."МатеринскиеПлаты" (
    "id" integer NOT NULL,
    "название" character varying(255),
    "сокет" character varying(50),
    "тип_памяти" character varying(50),
    "форм_фактор" character varying(50),
    "чипсет" character varying(50),
    "фазы_питания" character varying(50),
    "макс_объем_памяти" integer,
    "m2_слоты" integer,
    "sata_порты" integer,
    "цена" integer,
    "фото_url" character varying(255),
    "количество" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."МатеринскиеПлаты" OWNER TO "postgres";


ALTER TABLE "public"."МатеринскиеПлаты" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."МатеринскиеПлаты_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."Накопители" (
    "id" integer NOT NULL,
    "название" character varying(255),
    "объем_в_гб" integer,
    "скорость_чтения_записи" json,
    "драм_буфер" boolean,
    "радиатор_охлаждения" boolean,
    "тип" character varying(50),
    "интерфейс" character varying(50),
    "цена" integer,
    "фото_url" character varying(255),
    "количество" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."Накопители" OWNER TO "postgres";


ALTER TABLE "public"."Накопители" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."Накопители_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ОЗУ" (
    "id" integer NOT NULL,
    "название" character varying(255),
    "объем" integer,
    "частота" integer,
    "тип" character varying(50),
    "профили_разгона" boolean,
    "тайминги" character varying(50),
    "цена" integer,
    "фото_url" character varying(255),
    "количество" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."ОЗУ" OWNER TO "postgres";


ALTER TABLE "public"."ОЗУ" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ОЗУ_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ОбновительныеТокены" (
    "id" integer NOT NULL,
    "пользователь_id" integer NOT NULL,
    "token_hash" character varying(128) NOT NULL,
    "истекает_в" timestamp with time zone NOT NULL,
    "отозван" boolean DEFAULT false NOT NULL,
    "создан_в" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ОбновительныеТокены" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."ОбновительныеТокены_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."ОбновительныеТокены_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."ОбновительныеТокены_id_seq" OWNED BY "public"."ОбновительныеТокены"."id";



CREATE TABLE IF NOT EXISTS "public"."Отзывы" (
    "id" integer NOT NULL,
    "пользователь_id" integer NOT NULL,
    "товар_категория" "text" NOT NULL,
    "товар_id" integer NOT NULL,
    "оценка" smallint NOT NULL,
    "текст" "text",
    "статус" "text" DEFAULT 'на модерации'::"text" NOT NULL,
    "создан_в" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "Отзывы_оценка_check" CHECK ((("оценка" >= 1) AND ("оценка" <= 5))),
    CONSTRAINT "Отзывы_статус_check" CHECK (("статус" = ANY (ARRAY['на модерации'::"text", 'опубликован'::"text", 'отклонён'::"text"])))
);


ALTER TABLE "public"."Отзывы" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."Отзывы_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."Отзывы_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."Отзывы_id_seq" OWNED BY "public"."Отзывы"."id";



CREATE TABLE IF NOT EXISTS "public"."Письма" (
    "id" integer NOT NULL,
    "заказ_id" integer,
    "email" "text" NOT NULL,
    "тема" "text" NOT NULL,
    "текст" "text" NOT NULL,
    "отправлено" boolean DEFAULT false NOT NULL,
    "ошибка" "text",
    "создан_в" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."Письма" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."Письма_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."Письма_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."Письма_id_seq" OWNED BY "public"."Письма"."id";



CREATE TABLE IF NOT EXISTS "public"."Пользователи" (
    "id" integer NOT NULL,
    "email" "text" NOT NULL,
    "password_hash" "text",
    "имя" "text" NOT NULL,
    "телефон" "text",
    "роль" "public"."user_role" DEFAULT 'customer'::"public"."user_role" NOT NULL,
    "создан_в" timestamp with time zone DEFAULT "now"() NOT NULL,
    "обновлён_в" timestamp with time zone DEFAULT "now"() NOT NULL,
    "адрес_доставки" "text",
    "заблокирован" boolean DEFAULT false NOT NULL,
    "причина_блокировки" "text",
    "удалён" boolean DEFAULT false NOT NULL,
    "удалён_в" timestamp with time zone
);


ALTER TABLE "public"."Пользователи" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."Пользователи_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."Пользователи_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."Пользователи_id_seq" OWNED BY "public"."Пользователи"."id";



CREATE TABLE IF NOT EXISTS "public"."Процессоры" (
    "id" integer NOT NULL,
    "название" character varying(255),
    "производитель" character varying(50),
    "сокет" character varying(50),
    "ядра_потоки" json,
    "частота" json,
    "tdp" integer,
    "встроенная_графика" character varying(100),
    "поддержка_памяти" character varying(50),
    "цена" integer,
    "фото_url" character varying(255),
    "количество" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."Процессоры" OWNER TO "postgres";


ALTER TABLE "public"."Процессоры" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."Процессоры_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."Сборка_Компоненты" (
    "id" integer NOT NULL,
    "сборка_id" integer NOT NULL,
    "количество" integer DEFAULT 1 NOT NULL,
    "процессор_id" integer,
    "материнская_плата_id" integer,
    "озу_id" integer,
    "видеокарта_id" integer,
    "охлаждение_id" integer,
    "накопитель_id" integer,
    "блокпитания_id" integer,
    "корпус_id" integer,
    CONSTRAINT "chk_build_one_component" CHECK (("num_nonnulls"("процессор_id", "материнская_плата_id", "озу_id", "видеокарта_id", "охлаждение_id", "накопитель_id", "блокпитания_id", "корпус_id") = 1)),
    CONSTRAINT "Сборка_Компоненты_количество_check" CHECK (("количество" > 0))
);


ALTER TABLE "public"."Сборка_Компоненты" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."Сборка_Компоненты_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."Сборка_Компоненты_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."Сборка_Компоненты_id_seq" OWNED BY "public"."Сборка_Компоненты"."id";



CREATE TABLE IF NOT EXISTS "public"."Сборки" (
    "id" integer NOT NULL,
    "пользователь_id" integer NOT NULL,
    "название" character varying(150) NOT NULL,
    "общая_стоимость" integer DEFAULT 0 NOT NULL,
    "заметка" "text",
    "создан_в" timestamp with time zone DEFAULT "now"() NOT NULL,
    "обновлён_в" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "Сборки_общая_стоимость_check" CHECK (("общая_стоимость" >= 0))
);


ALTER TABLE "public"."Сборки" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."Сборки_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."Сборки_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."Сборки_id_seq" OWNED BY "public"."Сборки"."id";



CREATE TABLE IF NOT EXISTS "public"."СистемыОхлаждения" (
    "id" integer NOT NULL,
    "название" character varying(255),
    "тип" character varying(50),
    "tdp" integer,
    "высота" integer,
    "длина_радиатора" integer,
    "шум_макс" integer,
    "цена" integer,
    "фото_url" character varying(255),
    "количество" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."СистемыОхлаждения" OWNER TO "postgres";


ALTER TABLE "public"."СистемыОхлаждения" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."СистемыОхлаждения_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE ONLY "public"."Заказ_Позиции" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."Заказ_Позиции_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."Заказы" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."Заказы_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."ЗапросыНаПоступление" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."ЗапросыНаПоступление_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."ИсторияЗаказов" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."ИсторияЗаказов_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."Корзина_Позиции" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."Корзина_Позиции_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."Корзины" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."Корзины_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."ОбновительныеТокены" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."ОбновительныеТокены_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."Отзывы" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."Отзывы_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."Письма" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."Письма_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."Пользователи" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."Пользователи_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."Сборка_Компоненты" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."Сборка_Компоненты_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."Сборки" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."Сборки_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."Корзины"
    ADD CONSTRAINT "uq_cart_user" UNIQUE ("пользователь_id");



ALTER TABLE ONLY "public"."ОбновительныеТокены"
    ADD CONSTRAINT "uq_refresh_token" UNIQUE ("token_hash");



ALTER TABLE ONLY "public"."Отзывы"
    ADD CONSTRAINT "uq_review_author_item" UNIQUE ("пользователь_id", "товар_категория", "товар_id");



ALTER TABLE ONLY "public"."БлокиПитания"
    ADD CONSTRAINT "БлокиПитания_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."Видеокарты"
    ADD CONSTRAINT "Видеокарты_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ГотовыеКонфигурации"
    ADD CONSTRAINT "ГотовыеКонфигурации_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."Заказ_Позиции"
    ADD CONSTRAINT "Заказ_Позиции_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."Заказы"
    ADD CONSTRAINT "Заказы_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."Заказы"
    ADD CONSTRAINT "Заказы_номер_key" UNIQUE ("номер");



ALTER TABLE ONLY "public"."ЗапросыНаПоступление"
    ADD CONSTRAINT "ЗапросыНаПоступление_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ИсторияЗаказов"
    ADD CONSTRAINT "ИсторияЗаказов_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."КонфигурацияНакопители"
    ADD CONSTRAINT "КонфигурацияНакопители_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."Корзина_Позиции"
    ADD CONSTRAINT "Корзина_Позиции_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."Корзины"
    ADD CONSTRAINT "Корзины_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."Корпуса"
    ADD CONSTRAINT "Корпуса_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."МатеринскиеПлаты"
    ADD CONSTRAINT "МатеринскиеПлаты_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."Накопители"
    ADD CONSTRAINT "Накопители_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ОЗУ"
    ADD CONSTRAINT "ОЗУ_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ОбновительныеТокены"
    ADD CONSTRAINT "ОбновительныеТокены_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."Отзывы"
    ADD CONSTRAINT "Отзывы_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."Письма"
    ADD CONSTRAINT "Письма_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."Пользователи"
    ADD CONSTRAINT "Пользователи_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."Пользователи"
    ADD CONSTRAINT "Пользователи_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."Процессоры"
    ADD CONSTRAINT "Процессоры_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."Сборка_Компоненты"
    ADD CONSTRAINT "Сборка_Компоненты_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."Сборки"
    ADD CONSTRAINT "Сборки_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."СистемыОхлаждения"
    ADD CONSTRAINT "СистемыОхлаждения_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_build_components_build" ON "public"."Сборка_Компоненты" USING "btree" ("сборка_id");



CREATE INDEX "idx_builds_user" ON "public"."Сборки" USING "btree" ("пользователь_id");



CREATE INDEX "idx_cart_prebuilt" ON "public"."Корзина_Позиции" USING "btree" ("готовая_конфигурация_id");



CREATE INDEX "idx_order_history_order" ON "public"."ИсторияЗаказов" USING "btree" ("заказ_id", "создан_в");



CREATE INDEX "idx_refresh_user" ON "public"."ОбновительныеТокены" USING "btree" ("пользователь_id");



CREATE INDEX "idx_reviews_product" ON "public"."Отзывы" USING "btree" ("товар_категория", "товар_id", "статус");



CREATE INDEX "idx_reviews_status" ON "public"."Отзывы" USING "btree" ("статус");



CREATE INDEX "idx_stock_requests_status" ON "public"."ЗапросыНаПоступление" USING "btree" ("статус", "создан_в");



CREATE INDEX "idx_users_deleted" ON "public"."Пользователи" USING "btree" ("удалён") WHERE ("удалён" = true);



ALTER TABLE ONLY "public"."ГотовыеКонфигурации"
    ADD CONSTRAINT "ГотовыеКонфигу_материнская_пл_fkey" FOREIGN KEY ("материнская_плата_id") REFERENCES "public"."МатеринскиеПлаты"("id");



ALTER TABLE ONLY "public"."ГотовыеКонфигурации"
    ADD CONSTRAINT "ГотовыеКонфигура_блокпитания_id_fkey" FOREIGN KEY ("блокпитания_id") REFERENCES "public"."БлокиПитания"("id");



ALTER TABLE ONLY "public"."ГотовыеКонфигурации"
    ADD CONSTRAINT "ГотовыеКонфигурац_видеокарта_id_fkey" FOREIGN KEY ("видеокарта_id") REFERENCES "public"."Видеокарты"("id");



ALTER TABLE ONLY "public"."ГотовыеКонфигурации"
    ADD CONSTRAINT "ГотовыеКонфигурац_охлаждение_id_fkey" FOREIGN KEY ("охлаждение_id") REFERENCES "public"."СистемыОхлаждения"("id");



ALTER TABLE ONLY "public"."ГотовыеКонфигурации"
    ADD CONSTRAINT "ГотовыеКонфигураци_процессор_id_fkey" FOREIGN KEY ("процессор_id") REFERENCES "public"."Процессоры"("id");



ALTER TABLE ONLY "public"."ГотовыеКонфигурации"
    ADD CONSTRAINT "ГотовыеКонфигурации_корпус_id_fkey" FOREIGN KEY ("корпус_id") REFERENCES "public"."Корпуса"("id");



ALTER TABLE ONLY "public"."ГотовыеКонфигурации"
    ADD CONSTRAINT "ГотовыеКонфигурации_озу_id_fkey" FOREIGN KEY ("озу_id") REFERENCES "public"."ОЗУ"("id");



ALTER TABLE ONLY "public"."Заказ_Позиции"
    ADD CONSTRAINT "Заказ_Позиции_заказ_id_fkey" FOREIGN KEY ("заказ_id") REFERENCES "public"."Заказы"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Заказы"
    ADD CONSTRAINT "Заказы_пользователь_id_fkey" FOREIGN KEY ("пользователь_id") REFERENCES "public"."Пользователи"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ЗапросыНаПоступление"
    ADD CONSTRAINT "ЗапросыНаПоступ_пользователь_id_fkey" FOREIGN KEY ("пользователь_id") REFERENCES "public"."Пользователи"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ИсторияЗаказов"
    ADD CONSTRAINT "ИсторияЗаказов_администратор_id_fkey" FOREIGN KEY ("администратор_id") REFERENCES "public"."Пользователи"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ИсторияЗаказов"
    ADD CONSTRAINT "ИсторияЗаказов_заказ_id_fkey" FOREIGN KEY ("заказ_id") REFERENCES "public"."Заказы"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."КонфигурацияНакопители"
    ADD CONSTRAINT "КонфигурацияНак_конфигурация_id_fkey" FOREIGN KEY ("конфигурация_id") REFERENCES "public"."ГотовыеКонфигурации"("id");



ALTER TABLE ONLY "public"."КонфигурацияНакопители"
    ADD CONSTRAINT "КонфигурацияНакоп_накопитель_id_fkey" FOREIGN KEY ("накопитель_id") REFERENCES "public"."Накопители"("id");



ALTER TABLE ONLY "public"."Корзина_Позиции"
    ADD CONSTRAINT "Корзина_Позиции_блокпитания_id_fkey" FOREIGN KEY ("блокпитания_id") REFERENCES "public"."БлокиПитания"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Корзина_Позиции"
    ADD CONSTRAINT "Корзина_Позиции_видеокарта_id_fkey" FOREIGN KEY ("видеокарта_id") REFERENCES "public"."Видеокарты"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Корзина_Позиции"
    ADD CONSTRAINT "Корзина_Позиции_готовая_конфиг_fkey" FOREIGN KEY ("готовая_конфигурация_id") REFERENCES "public"."ГотовыеКонфигурации"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Корзина_Позиции"
    ADD CONSTRAINT "Корзина_Позиции_корзина_id_fkey" FOREIGN KEY ("корзина_id") REFERENCES "public"."Корзины"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Корзина_Позиции"
    ADD CONSTRAINT "Корзина_Позиции_корпус_id_fkey" FOREIGN KEY ("корпус_id") REFERENCES "public"."Корпуса"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Корзина_Позиции"
    ADD CONSTRAINT "Корзина_Позиции_материнская_пл_fkey" FOREIGN KEY ("материнская_плата_id") REFERENCES "public"."МатеринскиеПлаты"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Корзина_Позиции"
    ADD CONSTRAINT "Корзина_Позиции_накопитель_id_fkey" FOREIGN KEY ("накопитель_id") REFERENCES "public"."Накопители"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Корзина_Позиции"
    ADD CONSTRAINT "Корзина_Позиции_озу_id_fkey" FOREIGN KEY ("озу_id") REFERENCES "public"."ОЗУ"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Корзина_Позиции"
    ADD CONSTRAINT "Корзина_Позиции_охлаждение_id_fkey" FOREIGN KEY ("охлаждение_id") REFERENCES "public"."СистемыОхлаждения"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Корзина_Позиции"
    ADD CONSTRAINT "Корзина_Позиции_процессор_id_fkey" FOREIGN KEY ("процессор_id") REFERENCES "public"."Процессоры"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Корзины"
    ADD CONSTRAINT "Корзины_пользователь_id_fkey" FOREIGN KEY ("пользователь_id") REFERENCES "public"."Пользователи"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ОбновительныеТокены"
    ADD CONSTRAINT "ОбновительныеТо_пользователь_id_fkey" FOREIGN KEY ("пользователь_id") REFERENCES "public"."Пользователи"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Отзывы"
    ADD CONSTRAINT "Отзывы_пользователь_id_fkey" FOREIGN KEY ("пользователь_id") REFERENCES "public"."Пользователи"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Письма"
    ADD CONSTRAINT "Письма_заказ_id_fkey" FOREIGN KEY ("заказ_id") REFERENCES "public"."Заказы"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."Сборка_Компоненты"
    ADD CONSTRAINT "Сборка_Компонен_материнская_пл_fkey" FOREIGN KEY ("материнская_плата_id") REFERENCES "public"."МатеринскиеПлаты"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Сборка_Компоненты"
    ADD CONSTRAINT "Сборка_Компонент_блокпитания_id_fkey" FOREIGN KEY ("блокпитания_id") REFERENCES "public"."БлокиПитания"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Сборка_Компоненты"
    ADD CONSTRAINT "Сборка_Компоненты_видеокарта_id_fkey" FOREIGN KEY ("видеокарта_id") REFERENCES "public"."Видеокарты"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Сборка_Компоненты"
    ADD CONSTRAINT "Сборка_Компоненты_корпус_id_fkey" FOREIGN KEY ("корпус_id") REFERENCES "public"."Корпуса"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Сборка_Компоненты"
    ADD CONSTRAINT "Сборка_Компоненты_накопитель_id_fkey" FOREIGN KEY ("накопитель_id") REFERENCES "public"."Накопители"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Сборка_Компоненты"
    ADD CONSTRAINT "Сборка_Компоненты_озу_id_fkey" FOREIGN KEY ("озу_id") REFERENCES "public"."ОЗУ"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Сборка_Компоненты"
    ADD CONSTRAINT "Сборка_Компоненты_охлаждение_id_fkey" FOREIGN KEY ("охлаждение_id") REFERENCES "public"."СистемыОхлаждения"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Сборка_Компоненты"
    ADD CONSTRAINT "Сборка_Компоненты_процессор_id_fkey" FOREIGN KEY ("процессор_id") REFERENCES "public"."Процессоры"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Сборка_Компоненты"
    ADD CONSTRAINT "Сборка_Компоненты_сборка_id_fkey" FOREIGN KEY ("сборка_id") REFERENCES "public"."Сборки"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."Сборки"
    ADD CONSTRAINT "Сборки_пользователь_id_fkey" FOREIGN KEY ("пользователь_id") REFERENCES "public"."Пользователи"("id") ON DELETE CASCADE;



ALTER TABLE "public"."БлокиПитания" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."Видеокарты" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ГотовыеКонфигурации" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."Заказ_Позиции" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."Заказы" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ЗапросыНаПоступление" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ИсторияЗаказов" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."КонфигурацияНакопители" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."Корзина_Позиции" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."Корзины" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."Корпуса" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."МатеринскиеПлаты" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."Накопители" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ОЗУ" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ОбновительныеТокены" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."Отзывы" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."Письма" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."Пользователи" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."Процессоры" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."Сборка_Компоненты" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."Сборки" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."СистемыОхлаждения" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON TABLE "public"."БлокиПитания" TO "anon";
GRANT ALL ON TABLE "public"."БлокиПитания" TO "authenticated";
GRANT ALL ON TABLE "public"."БлокиПитания" TO "service_role";



GRANT ALL ON SEQUENCE "public"."БлокиПитания_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."БлокиПитания_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."БлокиПитания_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."Видеокарты" TO "anon";
GRANT ALL ON TABLE "public"."Видеокарты" TO "authenticated";
GRANT ALL ON TABLE "public"."Видеокарты" TO "service_role";



GRANT ALL ON SEQUENCE "public"."Видеокарты_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."Видеокарты_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."Видеокарты_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ГотовыеКонфигурации" TO "anon";
GRANT ALL ON TABLE "public"."ГотовыеКонфигурации" TO "authenticated";
GRANT ALL ON TABLE "public"."ГотовыеКонфигурации" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ГотовыеКонфигурации_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ГотовыеКонфигурации_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ГотовыеКонфигурации_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."Заказ_Позиции" TO "anon";
GRANT ALL ON TABLE "public"."Заказ_Позиции" TO "authenticated";
GRANT ALL ON TABLE "public"."Заказ_Позиции" TO "service_role";



GRANT ALL ON SEQUENCE "public"."Заказ_Позиции_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."Заказ_Позиции_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."Заказ_Позиции_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."Заказы" TO "anon";
GRANT ALL ON TABLE "public"."Заказы" TO "authenticated";
GRANT ALL ON TABLE "public"."Заказы" TO "service_role";



GRANT ALL ON SEQUENCE "public"."Заказы_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."Заказы_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."Заказы_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ЗапросыНаПоступление" TO "anon";
GRANT ALL ON TABLE "public"."ЗапросыНаПоступление" TO "authenticated";
GRANT ALL ON TABLE "public"."ЗапросыНаПоступление" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ЗапросыНаПоступление_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ЗапросыНаПоступление_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ЗапросыНаПоступление_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ИсторияЗаказов" TO "anon";
GRANT ALL ON TABLE "public"."ИсторияЗаказов" TO "authenticated";
GRANT ALL ON TABLE "public"."ИсторияЗаказов" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ИсторияЗаказов_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ИсторияЗаказов_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ИсторияЗаказов_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."КонфигурацияНакопители" TO "anon";
GRANT ALL ON TABLE "public"."КонфигурацияНакопители" TO "authenticated";
GRANT ALL ON TABLE "public"."КонфигурацияНакопители" TO "service_role";



GRANT ALL ON SEQUENCE "public"."КонфигурацияНакопители_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."КонфигурацияНакопители_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."КонфигурацияНакопители_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."Корзина_Позиции" TO "anon";
GRANT ALL ON TABLE "public"."Корзина_Позиции" TO "authenticated";
GRANT ALL ON TABLE "public"."Корзина_Позиции" TO "service_role";



GRANT ALL ON SEQUENCE "public"."Корзина_Позиции_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."Корзина_Позиции_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."Корзина_Позиции_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."Корзины" TO "anon";
GRANT ALL ON TABLE "public"."Корзины" TO "authenticated";
GRANT ALL ON TABLE "public"."Корзины" TO "service_role";



GRANT ALL ON SEQUENCE "public"."Корзины_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."Корзины_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."Корзины_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."Корпуса" TO "anon";
GRANT ALL ON TABLE "public"."Корпуса" TO "authenticated";
GRANT ALL ON TABLE "public"."Корпуса" TO "service_role";



GRANT ALL ON SEQUENCE "public"."Корпуса_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."Корпуса_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."Корпуса_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."МатеринскиеПлаты" TO "anon";
GRANT ALL ON TABLE "public"."МатеринскиеПлаты" TO "authenticated";
GRANT ALL ON TABLE "public"."МатеринскиеПлаты" TO "service_role";



GRANT ALL ON SEQUENCE "public"."МатеринскиеПлаты_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."МатеринскиеПлаты_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."МатеринскиеПлаты_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."Накопители" TO "anon";
GRANT ALL ON TABLE "public"."Накопители" TO "authenticated";
GRANT ALL ON TABLE "public"."Накопители" TO "service_role";



GRANT ALL ON SEQUENCE "public"."Накопители_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."Накопители_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."Накопители_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ОЗУ" TO "anon";
GRANT ALL ON TABLE "public"."ОЗУ" TO "authenticated";
GRANT ALL ON TABLE "public"."ОЗУ" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ОЗУ_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ОЗУ_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ОЗУ_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ОбновительныеТокены" TO "anon";
GRANT ALL ON TABLE "public"."ОбновительныеТокены" TO "authenticated";
GRANT ALL ON TABLE "public"."ОбновительныеТокены" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ОбновительныеТокены_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ОбновительныеТокены_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ОбновительныеТокены_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."Отзывы" TO "anon";
GRANT ALL ON TABLE "public"."Отзывы" TO "authenticated";
GRANT ALL ON TABLE "public"."Отзывы" TO "service_role";



GRANT ALL ON SEQUENCE "public"."Отзывы_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."Отзывы_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."Отзывы_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."Письма" TO "anon";
GRANT ALL ON TABLE "public"."Письма" TO "authenticated";
GRANT ALL ON TABLE "public"."Письма" TO "service_role";



GRANT ALL ON SEQUENCE "public"."Письма_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."Письма_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."Письма_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."Пользователи" TO "anon";
GRANT ALL ON TABLE "public"."Пользователи" TO "authenticated";
GRANT ALL ON TABLE "public"."Пользователи" TO "service_role";



GRANT ALL ON SEQUENCE "public"."Пользователи_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."Пользователи_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."Пользователи_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."Процессоры" TO "anon";
GRANT ALL ON TABLE "public"."Процессоры" TO "authenticated";
GRANT ALL ON TABLE "public"."Процессоры" TO "service_role";



GRANT ALL ON SEQUENCE "public"."Процессоры_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."Процессоры_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."Процессоры_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."Сборка_Компоненты" TO "anon";
GRANT ALL ON TABLE "public"."Сборка_Компоненты" TO "authenticated";
GRANT ALL ON TABLE "public"."Сборка_Компоненты" TO "service_role";



GRANT ALL ON SEQUENCE "public"."Сборка_Компоненты_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."Сборка_Компоненты_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."Сборка_Компоненты_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."Сборки" TO "anon";
GRANT ALL ON TABLE "public"."Сборки" TO "authenticated";
GRANT ALL ON TABLE "public"."Сборки" TO "service_role";



GRANT ALL ON SEQUENCE "public"."Сборки_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."Сборки_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."Сборки_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."СистемыОхлаждения" TO "anon";
GRANT ALL ON TABLE "public"."СистемыОхлаждения" TO "authenticated";
GRANT ALL ON TABLE "public"."СистемыОхлаждения" TO "service_role";



GRANT ALL ON SEQUENCE "public"."СистемыОхлаждения_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."СистемыОхлаждения_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."СистемыОхлаждения_id_seq" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";








