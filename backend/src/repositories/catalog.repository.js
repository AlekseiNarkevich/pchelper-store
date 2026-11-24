/**
 * PCHelper (ЛР7) — репозиторий каталога.
 *
 * Единственное место, которое знает, откуда берутся товары: из Supabase
 * или из демонстрационной фикстуры. Маршруты и тесты работают с готовыми
 * объектами и не зависят от источника данных.
 *
 * @version 1.0
 */

import { CATEGORIES, CATEGORY_BY_ID, mapRowToProduct } from '../domain/catalog.js';
import { FIXTURE_PREBUILT, FIXTURE_PRODUCTS } from '../data/catalog.fixture.js';
import { fetchTable, isDatabaseConnected } from '../services/supabase.service.js';

/**
 * Загружает товары одной категории.
 *
 * @param {object} category Описание категории.
 * @returns {Promise<object[]>} Товары в едином формате.
 */
async function loadCategory(category) {
  if (!isDatabaseConnected()) {
    return FIXTURE_PRODUCTS.filter((p) => p.category === category.id).map(
      (product) => ({ ...product, stock: Number(product.stock ?? 5) }),
    );
  }
  const rows = await fetchTable(category.table);
  return rows.map((row) => mapRowToProduct(category.id, row));
}

/**
 * Загружает товары всех категорий.
 *
 * @returns {Promise<object[]>} Плоский список товаров.
 */
async function loadAllProducts() {
  if (!isDatabaseConnected()) {
    return FIXTURE_PRODUCTS.map((product) => ({
      ...product,
      stock: Number(product.stock ?? 5),
    }));
  }
  const groups = await Promise.all(CATEGORIES.map(loadCategory));
  return groups.flat();
}

/**
 * Список категорий с количеством товаров.
 *
 * @returns {Promise<{items: object[], total: number}>}
 */
export async function listCategories() {
  const counts = new Map();
  if (isDatabaseConnected()) {
    const groups = await Promise.all(
      CATEGORIES.map(async (category) => {
        const rows = await fetchTable(category.table);
        return [category.id, rows.length];
      }),
    );
    for (const [id, count] of groups) counts.set(id, count);
  } else {
    for (const product of FIXTURE_PRODUCTS) {
      counts.set(product.category, (counts.get(product.category) || 0) + 1);
    }
  }

  const items = CATEGORIES.map((category) => ({
    id: category.id,
    name: category.name,
    description: category.description,
    count: counts.get(category.id) || 0,
  }));
  return { items, total: items.length };
}

/**
 * Приводит строку поиска к нижнему регистру и убирает лишние пробелы.
 *
 * @param {string} value Строка из запроса.
 * @returns {string}
 */
function normalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[-–—]/g, '');
}

/**
 * Понятные людям синонимы брендов и категорий.
 *
 * Люди пишут «адата», «проц», «бп», «видюха» — это не ошибка, а обычная
 * речь. Подменяем такие слова на английское название или основу слова,
 * которая встречается в каталоге. Список намеренно небольшой: ищем
 * близкое, а не «всё подряд».
 */
const SEARCH_SYNONYMS = {
  адата: 'adata',
  асус: 'asus',
  мси: 'msi',
  гигабайт: 'gigabyte',
  интел: 'intel',
  амд: 'amd',
  райзен: 'ryzen',
  корсар: 'corsair',
  кингстон: 'kingston',
  кинстон: 'kingston',
  самсунг: 'samsung',
  сигейт: 'seagate',
  вестерн: 'western',
  палит: 'palit',
  нвидиа: 'nvidia',
  джифорс: 'geforce',
  радион: 'radeon',
  сапфир: 'sapphire',
  бп: 'блок',
  озу: 'оперативная',
  проц: 'процессор',
  видюха: 'видеокарт',
  мать: 'материнск',
  матплата: 'материнск',
  ссд: 'ssd',
  хдд: 'hdd',
  кулер: 'охлажд',
  ддр4: 'ddr4',
  ддр5: 'ddr5',
};

/**
 * Разбивает запрос на слова и подставляет синонимы.
 *
 * @param {string} query Запрос.
 * @returns {string[]} Слова для поиска.
 */
function searchTokens(query) {
  return normalize(query)
    .replace(/[.,()]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => SEARCH_SYNONYMS[word] || word);
}

/**
 * Проверяет, подходит ли товар под поисковый запрос.
 *
 * Ищем не только по названию: пользователь часто помнит характеристику
 * («AM5», «DDR5», «750 Вт»), а не модель. Поэтому запрос сравнивается
 * ещё с категорией и значениями характеристик. Каждое слово запроса
 * должно найтись хотя бы в одном из этих полей.
 *
 * @param {object} product Товар.
 * @param {string} query Поисковый запрос.
 * @returns {boolean}
 */
function matchesSearch(product, query) {
  const tokens = searchTokens(query);
  if (!tokens.length) return true;

  const haystack = normalize(
    [
      product.name,
      product.categoryName,
      ...(product.specs || []).flatMap((spec) => [spec.label, spec.value]),
    ].join(' '),
  );

  return tokens.every((token) => haystack.includes(token));
}

/**
 * Фильтрует, сортирует и отдаёт страницу каталога.
 *
 * @param {object} params Параметры запроса.
 * @param {string} [params.category] Код категории.
 * @param {string} [params.search] Подстрока в названии или характеристиках.
 * @param {number} [params.minPrice] Минимальная цена.
 * @param {number} [params.maxPrice] Максимальная цена.
 * @param {Record<string, string[]>} [params.filters] Фильтры по характеристикам.
 * @param {string} [params.sort] Вариант сортировки.
 * @param {number} [params.limit] Размер страницы.
 * @param {number} [params.offset] Смещение.
 * @returns {Promise<{items: object[], total: number, limit: number, offset: number}>}
 */
export async function listProducts(params = {}) {
  const {
    category,
    search,
    minPrice,
    maxPrice,
    filters,
    sort = 'price_asc',
    limit = 20,
    offset = 0,
  } = params;

  let products = category
    ? await loadCategory(CATEGORY_BY_ID.get(category))
    : await loadAllProducts();

  if (search) {
    products = products.filter((product) => matchesSearch(product, search));
  }
  if (minPrice !== undefined) products = products.filter((p) => p.price >= minPrice);
  if (maxPrice !== undefined) products = products.filter((p) => p.price <= maxPrice);

  if (filters && Object.keys(filters).length) {
    const entries = Object.entries(filters).filter(([, values]) => values.length);
    products = products.filter((product) =>
      entries.every(([label, values]) =>
        product.specs.some(
          (spec) =>
            normalize(spec.label) === normalize(label) &&
            values.some((value) => normalize(spec.value) === normalize(value)),
        ),
      ),
    );
  }

  products.sort((a, b) => {
    if (sort === 'price_desc') return b.price - a.price;
    if (sort === 'name_asc') return a.name.localeCompare(b.name, 'ru');
    return a.price - b.price;
  });

  const total = products.length;
  const items = products.slice(offset, offset + limit);
  return { items, total, limit, offset };
}

/**
 * Находит товар по составному идентификатору «категория:номер».
 *
 * @param {string} productId Идентификатор вида «cpu:1».
 * @returns {Promise<object|null>} Товар или null.
 */
export async function getProduct(productId) {
  const [categoryId, rawId] = String(productId).split(':');
  if (categoryId === 'prebuilt') return getPrebuiltById(rawId);

  const category = CATEGORY_BY_ID.get(categoryId);
  if (!category || !rawId) return null;

  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return null;

  if (!isDatabaseConnected()) {
    const found = FIXTURE_PRODUCTS.find((p) => p.id === `${categoryId}:${id}`);
    return found ? { ...found, stock: Number(found.stock ?? 5) } : null;
  }

  const rows = await fetchTable(category.table);
  const row = rows.find((item) => Number(item.id) === id);
  return row ? mapRowToProduct(categoryId, row) : null;
}

/**
 * Собирает готовые конфигурации с названиями и ценами комплектующих.
 *
 * В базе конфигурация хранится ссылками на восемь таблиц, а цена сборки
 * отдельным полем не хранится — она складывается из цен деталей.
 * Чтобы не делать восемь запросов на каждую сборку, таблицы читаются
 * один раз и раскладываются в словари «id → название» и «id → цена».
 *
 * @returns {Promise<{items: object[], total: number}>}
 */
export async function listPrebuilt() {
  if (!isDatabaseConnected()) {
    const items = FIXTURE_PREBUILT.map((build) => ({
      ...build,
      stock: Number(build.stock ?? 3),
    }));
    return { items, total: items.length };
  }

  const rows = await fetchTable('ГотовыеКонфигурации');
  const tables = await Promise.all(
    CATEGORIES.map(async (category) => [category, await fetchTable(category.table)]),
  );
  const storageLinks = await fetchTable('КонфигурацияНакопители');

  const names = new Map();
  const prices = new Map();
  const images = new Map();
  for (const [category, list] of tables) {
    for (const row of list) {
      const key = `${category.id}:${row.id}`;
      names.set(key, row['название']);
      prices.set(key, Number(row['цена'] ?? 0));
      images.set(key, row['фото_url'] || null);
    }
  }

  const componentFields = [
    ['cpu', 'процессор_id'],
    ['motherboard', 'материнская_плата_id'],
    ['ram', 'озу_id'],
    ['gpu', 'видеокарта_id'],
    ['psu', 'блокпитания_id'],
    ['case', 'корпус_id'],
    ['cooling', 'охлаждение_id'],
  ];

  const items = rows.map((row) => {
    const components = componentFields
      .filter(([, field]) => row[field] !== null && row[field] !== undefined)
      .map(([category, field]) => ({
        category,
        productId: Number(row[field]),
        name: names.get(`${category}:${row[field]}`) || '—',
        price: prices.get(`${category}:${row[field]}`) ?? 0,
        imageUrl: images.get(`${category}:${row[field]}`) || null,
      }));

    // Накопителей у сборки может быть несколько — они лежат в отдельной
    // таблице связей, поэтому добавляются после фиксированных семи полей.
    for (const link of storageLinks) {
      if (Number(link['конфигурация_id']) !== Number(row.id)) continue;
      const key = `storage:${link['накопитель_id']}`;
      components.push({
        category: 'storage',
        productId: Number(link['накопитель_id']),
        name: names.get(key) || '—',
        price: prices.get(key) ?? 0,
        imageUrl: images.get(key) || null,
      });
    }

    const price = components.reduce((sum, c) => sum + c.price, 0);

    return {
      id: row.id,
      name: row['название'] || 'Без названия',
      task: row['задачи'] || '',
      price,
      stock: Number(row['количество'] ?? 0),
      currency: 'BYN',
      imageUrl: row['фото_url'] || null,
      components,
      componentCount: components.length,
    };
  });

  return { items, total: items.length };
}

/**
 * Находит готовую сборку по номеру и приводит её к виду товара.
 *
 * Сборка в корзине — одна позиция: цена считается по комплектующим,
 * а остаток берётся из «ГотовыеКонфигурации».
 *
 * @param {string} rawId Номер сборки.
 * @returns {Promise<object|null>}
 */
async function getPrebuiltById(rawId) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return null;

  const { items } = await listPrebuilt();
  const build = items.find((item) => Number(item.id) === id);
  if (!build) return null;

  return {
    id: `prebuilt:${id}`,
    category: 'prebuilt',
    productId: id,
    name: build.name,
    price: build.price,
    stock: Number(build.stock ?? 0),
    imageUrl: build.imageUrl || null,
    categoryName: 'Готовый ПК',
    specs: [],
    components: build.components,
  };
}
