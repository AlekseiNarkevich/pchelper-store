/**
 * PCHelper — подвал сайта: описание, разделы, адрес пункта выдачи,
 * телефон и почта. Подвал закреплён внизу окна и виден при скролле.
 */

import { Link } from 'react-router-dom';
import React from 'react';

/** Контакты магазина. */
const ADDRESS = 'г. Минск, пер. Корженевского, 6, пом. 1';
const PHONE = '+375 44 710-60-50';
const PHONE_HREF = 'tel:+375447106050';
const EMAIL = 'pchelper.shop@gmail.com';
const MAP_URL = `https://yandex.by/maps/?text=${encodeURIComponent(ADDRESS)}`;

/** Подвал: описание, навигация и контакты. */
export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <div className="footer-top">
          <div className="footer-about">
            <strong>PCHelper</strong> — подбор комплектующих, готовые сборки и расчёт
            мощности блока питания. Доставка по Минску и Минскому району.
          </div>

          <nav aria-label="Разделы в подвале" className="footer-links">
            <Link to="/catalog">Каталог</Link>
            <Link to="/prebuilt">Готовые ПК</Link>
            <Link to="/builder">Конфигуратор</Link>
            <Link to="/psu">Калькулятор БП</Link>
            <Link to="/diagnostics">Диагностика</Link>
          </nav>
        </div>

        <div className="footer-bottom">
          <span className="footer-copy">
            © 2026 PCHelper. Все права защищены. · v1.1.0
          </span>

          <div className="footer-contacts">
            <a href={MAP_URL} rel="noreferrer" target="_blank">
              {ADDRESS}
            </a>
            <span aria-hidden="true">·</span>
            <a href={PHONE_HREF}>{PHONE}</a>
            <span aria-hidden="true">·</span>
            <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
