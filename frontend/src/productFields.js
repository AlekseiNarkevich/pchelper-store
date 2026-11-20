/**
 * Чтение характеристик товара в браузере.
 *
 * API отдаёт исходную строку таблицы (`data`) и список подписей (`specs`).
 * В демонстрационном режиме доступны только подписи, поэтому функции
 * понимают оба источника — так конфигуратор работает и без Supabase.
 */

/**
 * Читает текстовую характеристику.
 *
 * @param {object|null} product Товар.
 * @param {string} field Поле таблицы.
 * @param {string} label Подпись характеристики.
 * @returns {string}
 */
export function textOf(product, field, label) {
  const raw = product?.data?.[field];
  if (raw !== undefined && raw !== null) return String(raw);
  const spec = product?.specs?.find((item) => item.label === label);
  return spec ? String(spec.value) : '';
}

/**
 * Читает числовую характеристику без единиц измерения.
 *
 * @param {object|null} product Товар.
 * @param {string} field Поле таблицы.
 * @param {string} label Подпись характеристики.
 * @returns {number}
 */
export function numberOf(product, field, label) {
  const text = textOf(product, field, label).replace(',', '.');
  const match = text.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

/**
 * Читает логическую характеристику («да», true, 1, «есть»).
 *
 * @param {object|null} product Товар.
 * @param {string} field Поле таблицы.
 * @param {string} label Подпись характеристики.
 * @returns {boolean}
 */
export function booleanOf(product, field, label) {
  const raw = product?.data?.[field];
  if (typeof raw === 'boolean') return raw;
  const text = textOf(product, field, label).trim().toLowerCase();
  return ['да', 'true', '1', 'есть', 'yes'].includes(text);
}

/**
 * Проверяет, есть ли у процессора встроенная графика.
 *
 * @param {object|null} product Процессор.
 * @returns {boolean}
 */
export function hasIntegratedGraphics(product) {
  const raw = product?.data?.['встроенная_графика'];
  if (typeof raw === 'boolean') return raw;
  const text = textOf(product, 'встроенная_графика', 'Встроенная графика')
    .trim()
    .toLowerCase();
  return !['', 'нет', 'false', '0', 'no', 'none', 'null', '—'].includes(text);
}

/** Ранги форм-фактора. */
const FORM_RANK = {
  ATX: 3,
  EATX: 4,
  MATX: 2,
  'MICRO-ATX': 2,
  ITX: 1,
  'MINI-ITX': 1,
};

/**
 * Приводит форм-фактор к опорному виду.
 *
 * @param {unknown} value Значение.
 * @returns {string}
 */
export function normalizeFormFactor(value) {
  const text = String(value || '')
    .trim()
    .toUpperCase();
  if (!text) return '';
  if (text.includes('EATX') || text.includes('E-ATX')) return 'EATX';
  if (text.includes('MICRO') || text.includes('MATX') || text.includes('M-ATX')) {
    return 'MATX';
  }
  if (text.includes('MINI') || text.includes('ITX')) return 'ITX';
  if (text.includes('ATX')) return 'ATX';
  return text;
}

/**
 * Возвращает ранг форм-фактора.
 *
 * @param {unknown} value Значение.
 * @returns {number}
 */
export function formRank(value) {
  const key = normalizeFormFactor(value);
  return FORM_RANK[key] ?? 2;
}
