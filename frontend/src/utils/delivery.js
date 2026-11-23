/**
 * PCHelper — расчёт зоны доставки по точке на карте.
 *
 * Используем реальные упрощённые границы Минска и Минского района из
 * OpenStreetMap. Внутри города действует городской тариф; за городом,
 * но внутри района — 15 BYN + 3 BYN за километр от границы города.
 * За пределами района доставка недоступна.
 */

import { MINSK_CITY_RINGS, MINSK_DISTRICT_RINGS } from './minskBoundaries.js';

/** Координаты пункта выдачи (пер. Корженевского, 6). */
export const PICKUP_POINT = { lat: 53.8450073, lng: 27.5279668 };

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
 * Проверяет, лежит ли точка внутри одного многоугольника (алгоритм лучей).
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
 * Точка внутри хотя бы одного контура (у района есть небольшие exclave-ы).
 *
 * @param {number} lat Широта.
 * @param {number} lng Долгота.
 * @param {number[][][]} rings Контуры.
 * @returns {boolean}
 */
function insideAnyRing(lat, lng, rings) {
  return rings.some((ring) => insidePolygon(lat, lng, ring));
}

/**
 * Расстояние от точки до отрезка на местности, в километрах.
 *
 * @param {{lat: number, lng: number}} point Точка.
 * @param {{lat: number, lng: number}} start Начало отрезка.
 * @param {{lat: number, lng: number}} end Конец отрезка.
 * @returns {number}
 */
function distanceToSegment(point, start, end) {
  const latScale = 111.32;
  const lngScale = 111.32 * Math.cos(rad(point.lat));
  const ax = (start.lng - point.lng) * lngScale;
  const ay = (start.lat - point.lat) * latScale;
  const bx = (end.lng - point.lng) * lngScale;
  const by = (end.lat - point.lat) * latScale;
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/**
 * Минимальное расстояние до границы города.
 *
 * @param {{lat: number, lng: number}} point Точка.
 * @returns {number}
 */
function distanceToCity(point) {
  let distance = Infinity;
  for (const ring of MINSK_CITY_RINGS) {
    for (let i = 0; i < ring.length; i += 1) {
      const start = { lat: ring[i][0], lng: ring[i][1] };
      const end = {
        lat: ring[(i + 1) % ring.length][0],
        lng: ring[(i + 1) % ring.length][1],
      };
      distance = Math.min(distance, distanceToSegment(point, start, end));
    }
  }
  return distance;
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
  const inCity = insideAnyRing(lat, lng, MINSK_CITY_RINGS);
  const inDistrict = inCity || insideAnyRing(lat, lng, MINSK_DISTRICT_RINGS);

  if (!inDistrict) {
    return {
      zone: 'outside',
      distanceKm: 0,
      cost: 0,
      reachable: false,
      message: 'Доставляем только по Минску и Минскому району',
    };
  }

  if (inCity) {
    return {
      zone: 'minsk',
      distanceKm: 0,
      cost: itemsTotal >= 500 ? 0 : 10,
      reachable: true,
    };
  }

  // Точка внутри района, но за городом: считаем километры от границы.
  const rounded = Math.max(0.1, Math.round(distanceToCity(point) * 10) / 10);
  if (rounded > 50) {
    return {
      zone: 'outside',
      distanceKm: rounded,
      cost: 0,
      reachable: false,
      message: 'Доставка только по Минскому району: не более 50 км от города',
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
 * Находится ли точка внутри города Минска.
 *
 * @param {number} lat Широта.
 * @param {number} lng Долгота.
 * @returns {boolean}
 */
export function insideMkad(lat, lng) {
  return insideAnyRing(lat, lng, MINSK_CITY_RINGS);
}

export { distanceKm };
