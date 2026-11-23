/**
 * PCHelper — Карточка товара в каталоге: фото, категория,
 * остаток на складе, цена и кнопка добавления в корзину.
 */

import { Link } from 'react-router-dom';

import { addToCart } from '../cart.js';
import { money } from '../api.js';
import ImageWithStatus from './ImageWithStatus.jsx';
import React from 'react';

/**
 * Карточка товара в сетке каталога.
 *
 * Фотографии теперь локальные (frontend/public/images), но компонент
 * также переживает ссылки из Supabase Storage. Если ссылки нет,
 * показывается подпись «фото» — как в макетах ЛР5.
 */
/**
 * Короткая строка характеристик для карточки каталога.
 *
 * Показываем 2–3 ключевых параметра, чтобы товар можно было сравнить
 * без перехода на страницу. Для карточки важен не весь список, а то,
 * что помогает выбрать: сокет, TDP, память, мощность.
 *
 * @param {object} product Товар API.
 * @returns {string}
 */
function shortSpecs(product) {
  const data = product.data || {};
  const parts = [];
  const add = (value, suffix = '') => {
    if (value !== undefined && value !== null && value !== '') {
      parts.push(`${value}${suffix}`);
    }
  };

  switch (product.category) {
    case 'cpu':
      add(data.сокет);
      add(data.tdp, ' Вт');
      break;
    case 'motherboard':
      add(data.сокет);
      add(data.чипсет);
      add(data.тип_памяти);
      break;
    case 'ram':
      add(data.тип);
      add(data.объем, ' ГБ');
      add(data.частота, ' МГц');
      break;
    case 'gpu':
      add(data.объем_памяти, ' ГБ');
      add(data.tdp, ' Вт');
      break;
    case 'psu':
      add(data.мощность_в_ваттах, ' Вт');
      add(data.сертификат_80plus);
      break;
    case 'storage':
      add(data.тип);
      add(data.объем_в_гб, ' ГБ');
      break;
    case 'case':
      add(data.форм_фактор);
      add(data.макс_длина_gpu, ' мм');
      break;
    case 'cooling':
      add(data.тип);
      add(data.tdp, ' Вт');
      break;
    default:
      break;
  }

  return parts.slice(0, 3).join(' · ');
}

export default function ProductCard({ product, onAdded }) {
  const vendor =
    product.specs?.find((spec) => spec.label === 'Производитель')?.value ||
    product.categoryName;
  const stock = Number(product.stock ?? 0);
  const specs = shortSpecs(product);

  function add() {
    if (stock <= 0) return;
    addToCart(product);
    if (onAdded) onAdded(product);
  }

  return (
    <article className="product-card">
      <Link className="photo" to={`/product/${product.id}`}>
        <ImageWithStatus alt={product.name} loading="lazy" src={product.imageUrl} />
      </Link>
      <Link className="name" to={`/product/${product.id}`}>
        {product.name}
      </Link>
      <div className="vendor">{vendor}</div>
      <div className="card-specs">{specs}</div>
      <div className={`stock-line${stock <= 0 ? ' is-out' : ''}`}>
        {stock > 0 ? `В наличии: ${stock}` : 'Нет в наличии'}
      </div>
      <div className="bottom">
        <div className="price">
          {money(product.price)} <small />
        </div>
        <button
          className="btn btn-sm"
          disabled={stock <= 0}
          onClick={add}
          type="button"
        >
          {stock > 0 ? '+ В корзину' : 'Нет в наличии'}
        </button>
      </div>
    </article>
  );
}
