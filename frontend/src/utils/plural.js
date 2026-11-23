/**
 * PCHelper — русское склонение существительных после числа.
 *
 * Пример: plural(1, 'товар', 'товара', 'товаров') → «товар»,
 * plural(3, ...) → «товара», plural(11, ...) → «товаров».
 *
 * @param {number} count Количество.
 * @param {string} one Форма для 1.
 * @param {string} few Форма для 2–4.
 * @param {string} many Форма для 5+ и 11–14.
 * @returns {string}
 */
export function plural(count, one, few, many) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
