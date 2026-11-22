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
 * Фотографии приходят из Supabase Storage; если ссылки нет, показывается
 * подпись «фото» — как в макетах ЛР5.
 */
export default function ProductCard({ product, onAdded }) {
  const vendor =
    product.specs?.find((spec) => spec.label === 'Производитель')?.value ||
    product.categoryName;
  const stock = Number(product.stock ?? 0);

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
