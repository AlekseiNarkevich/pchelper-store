/**
 * PCHelper — расчёт зоны доставки по точке на карте.
 *
 * МКАД представлен приближённым многоугольником: для учебного проекта
 * этого достаточно, чтобы отличить Минск от области. Если точка внутри —
 * действует городской тариф; если снаружи — считается расстояние до
 * ближайшей точки кольцевой и тариф «15 BYN + 3 BYN за километр».
 */

/** Координаты пункта выдачи (пер. Корженевского, 6). */
export const PICKUP_POINT = { lat: 53.8450073, lng: 27.5279668 };

/** Приближённый контур МКАД: пары [широта, долгота]. */
const MKAD = [
  [53.975, 27.55],
  [53.965, 27.64],
  [53.935, 27.7],
  [53.895, 27.725],
  [53.855, 27.705],
  [53.82, 27.645],
  [53.8, 27.56],
  [53.815, 27.47],
  [53.85, 27.405],
  [53.89, 27.375],
  [53.935, 27.39],
  [53.965, 27.46],
];

/** Переводит градусы в радианы. */
function rad(value) {
  return (value * Math.PI) / 180;
}

/** Расстояние между двумя точками в километрах. */
function distanceKm(a, b) {
  const earth = 6371;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.sqrt(value));
}

/**
 * Проверяет, лежит ли точка внутри многоугольника (алгоритм лучей).
 *
 * @param {number} lat Широта.
 * @param {number} lng Долгота.
 * @param {number[][]} polygon Контур.
 * @returns {boolean}
 */
function insidePolygon(lat, lng, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [latI, lngI] = polygon[i];
    const [latJ, lngJ] = polygon[j];
    const intersects =
      lngI > lng !== lngJ > lng &&
      lat < ((latJ - latI) * (lng - lngI)) / (lngJ - lngI) + latI;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Расстояние от точки до отрезка на местности, в километрах.
 *
 * Для коротких расстояний используем плоскую проекцию вокруг точки — так
 * проще и точнее, чем считать сферическую геометрию для города.
 */
function distanceToSegment(point, start, end) {
  const latScale = 111.32;
  const lngScale = 111.32 * Math.cos(rad(point.lat));
  const px = 0;
  const py = 0;
  const ax = (start.lng - point.lng) * lngScale;
  const ay = (start.lat - point.lat) * latScale;
  const bx = (end.lng - point.lng) * lngScale;
  const by = (end.lat - point.lat) * latScale;
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length));
  const x = ax + t * dx;
  const y = ay + t * dy;
  return Math.hypot(x - px, y - py);
}

/**
 * Считает зону и стоимость доставки по координатам.
 *
 * @param {number} lat Широта.
 * @param {number} lng Долгота.
 * @param {number} itemsTotal Сумма товаров.
 * @returns {{zone: 'minsk'|'outside', distanceKm: number, cost: number, reachable: boolean, message?: string}}
 */
export function calculateDelivery(lat, lng, itemsTotal) {
  const point = { lat, lng };
  if (insidePolygon(lat, lng, MKAD)) {
    return {
      zone: 'minsk',
      distanceKm: 0,
      cost: itemsTotal >= 500 ? 0 : 10,
      reachable: true,
    };
  }

  let distance = Infinity;
  for (let i = 0; i < MKAD.length; i += 1) {
    const start = { lat: MKAD[i][0], lng: MKAD[i][1] };
    const end = {
      lat: MKAD[(i + 1) % MKAD.length][0],
      lng: MKAD[(i + 1) % MKAD.length][1],
    };
    distance = Math.min(distance, distanceToSegment(point, start, end));
  }

  const rounded = Math.max(0.1, Math.round(distance * 10) / 10);
  if (rounded > 50) {
    return {
      zone: 'outside',
      distanceKm: rounded,
      cost: 0,
      reachable: false,
      message: 'Доставка только по Минскому району: не более 50 км от МКАД',
    };
  }

  return {
    zone: 'outside',
    distanceKm: rounded,
    cost: 15 + 3 * Math.ceil(rounded),
    reachable: true,
  };
}

/**
 * Проверяет, находится ли точка внутри МКАД.
 *
 * @param {number} lat Широта.
 * @param {number} lng Долгота.
 * @returns {boolean}
 */
export function insideMkad(lat, lng) {
  return insidePolygon(lat, lng, MKAD);
}

export { distanceKm };
