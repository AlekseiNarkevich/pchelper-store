/**
 * PCHelper — карта выбора адреса доставки.
 *
 * Карта на Leaflet и OpenStreetMap: клик по карте задаёт точку доставки,
 * а родительский компонент считает зону и стоимость. Пункт выдачи всегда
 * отмечен отдельным маркером. В режиме самовывоза клики отключены.
 */

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { PICKUP_POINT } from '../utils/delivery.js';

/** Маркер-точка без картинок, чтобы не настраивать пути ассетов Vite. */
function pinIcon(kind) {
  return L.divIcon({
    className: `map-pin map-pin-${kind}`,
    html: '<span></span>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

/**
 * Карта доставки: ПВЗ и выбранная пользователем точка.
 *
 * @param {object} props Свойства.
 * @param {'pickup'|'courier'} props.mode Способ получения.
 * @param {{lat: number, lng: number}|null} props.point Точка доставки.
 * @param {Function} props.onPick Выбор точки (lat, lng).
 * @returns {React.ReactElement}
 */
export default function DeliveryMap({ mode, point, onPick }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const deliveryRef = useRef(null);
  const modeRef = useRef(mode);
  const onPickRef = useRef(onPick);

  useEffect(() => {
    modeRef.current = mode;
    onPickRef.current = onPick;
  }, [mode, onPick]);

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return undefined;

    const map = L.map(containerRef.current, {
      center: [PICKUP_POINT.lat, PICKUP_POINT.lng],
      zoom: 10,
      scrollWheelZoom: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map);

    L.marker([PICKUP_POINT.lat, PICKUP_POINT.lng], {
      icon: pinIcon('pickup'),
    })
      .addTo(map)
      .bindTooltip('Пункт выдачи: пер. Корженевского, 6');

    // Клик по карте выбирает адрес только для курьерской доставки.
    map.on('click', (event) => {
      if (modeRef.current !== 'courier') return;
      onPickRef.current(event.latlng.lat, event.latlng.lng);
    });

    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 0);

    return () => {
      map.remove();
      mapRef.current = null;
      deliveryRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (mode !== 'courier') {
      deliveryRef.current?.remove();
      deliveryRef.current = null;
      map.flyTo([PICKUP_POINT.lat, PICKUP_POINT.lng], 13, { duration: 0.4 });
      return;
    }

    if (!point) return;
    if (deliveryRef.current) {
      deliveryRef.current.setLatLng([point.lat, point.lng]);
    } else {
      deliveryRef.current = L.marker([point.lat, point.lng], {
        icon: pinIcon('delivery'),
      }).addTo(map);
    }
    map.flyTo([point.lat, point.lng], 14, { duration: 0.4 });
  }, [mode, point]);

  return <div className="delivery-map-canvas" ref={containerRef} />;
}
