import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { getProduct, getProducts, money } from '../api.js';
import ProductCard from '../components/ProductCard.jsx';
import { readAuth } from '../auth.js';
import { addToCart } from '../cart.js';
import { createReview, getReviews } from '../reviews.js';
import { requestStock } from '../stock.js';
import React from 'react';

/**
 * Карточка товара: фото, цена, характеристики и похожие позиции.
 *
 * Товар запрашивается по составному идентификатору из адреса
 * (/product/cpu:1). Если такого товара нет, показывается понятное
 * сообщение, а не пустой экран.
 */
/**
 * Склоняет слово «отзыв».
 *
 * @param {number} count Количество.
 * @returns {string}
 */
function reviewsWord(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'отзыв';
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) {
    return 'отзыва';
  }
  return 'отзывов';
}

export default function Product() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [added, setAdded] = useState(false);
  const [reviews, setReviews] = useState({ items: [], average: 0, count: 0 });
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [reviewNotice, setReviewNotice] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [reviewsLoadError, setReviewsLoadError] = useState('');
  const [stockForm, setStockForm] = useState({ email: '', phone: '' });
  const [stockNotice, setStockNotice] = useState('');
  const [stockError, setStockError] = useState('');
  const stock = Number(product?.stock ?? 0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    setProduct(null);
    setRelated([]);

    getProduct(id)
      .then((data) => {
        if (alive) setProduct(data);
      })
      .catch((reason) => {
        if (alive) setError(reason.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    if (!product) return undefined;
    let alive = true;
    getProducts({ category: product.category, limit: 5 })
      .then((data) => {
        if (alive) setRelated(data.items.filter((item) => item.id !== product.id));
      })
      .catch(() => {
        if (alive) setRelated([]);
      });
    return () => {
      alive = false;
    };
  }, [product]);

  useEffect(() => {
    let alive = true;
    setReviewsLoadError('');
    getReviews(id)
      .then((data) => {
        if (alive) setReviews(data);
      })
      .catch((reason) => {
        if (alive) {
          setReviews({ items: [], average: 0, count: 0 });
          setReviewsLoadError(reason.message);
        }
      });
    return () => {
      alive = false;
    };
  }, [id]);

  function add() {
    if (stock <= 0) return;
    addToCart(product);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  async function submitStockRequest(event) {
    event.preventDefault();
    setStockNotice('');
    setStockError('');
    try {
      await requestStock(id, stockForm);
      setStockNotice('Сообщим, когда товар появится на складе');
      setStockForm({ email: '', phone: '' });
    } catch (reason) {
      setStockError(reason.message);
    }
  }

  async function submitReview(event) {
    event.preventDefault();
    setReviewNotice('');
    setReviewError('');
    try {
      await createReview(id, {
        rating: Number(reviewRating),
        text: reviewText,
      });
      setReviewNotice('Спасибо! Отзыв отправлен на модерацию.');
      setReviewText('');
    } catch (reason) {
      setReviewError(reason.message);
    }
  }

  if (loading) {
    return (
      <div className="container">
        <div className="skeleton" style={{ height: 420 }} />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="container">
        <div className="state error">
          {error || 'Товар не найден'}
          <br />
          <Link className="btn" to="/catalog">
            Вернуться в каталог
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="breadcrumbs">
        <Link to="/">Главная</Link>
        <span>
          <Link to="/catalog">Каталог</Link>
        </span>
        <span>
          <Link to={`/catalog/${product.category}`}>{product.categoryName}</Link>
        </span>
        <span>{product.name}</span>
      </div>

      <div className="product-hero">
        <div className="photo-box">
          {product.imageUrl ? (
            <img alt={product.name} src={product.imageUrl} />
          ) : (
            <span>фото товара</span>
          )}
        </div>
        <div>
          <div className="h1" style={{ fontSize: 26 }}>
            {product.name}
          </div>
          <div className="small faint" style={{ marginTop: 6 }}>
            {product.categoryName}
          </div>
          <div className="price-block">
            <span className="value">{money(product.price)}</span>
          </div>
          <div className={`stock-line${stock <= 0 ? ' is-out' : ''}`}>
            {stock > 0 ? `В наличии: ${stock} шт.` : 'Нет в наличии'}
          </div>
          <p className="muted" style={{ fontSize: 14 }}>
            {product.description}
          </p>
          <div style={{ display: 'flex', gap: 10, margin: '16px 0 22px' }}>
            <button className="btn" disabled={stock <= 0} onClick={add} type="button">
              {stock <= 0
                ? 'Нет в наличии'
                : added
                  ? 'Добавлено ✓'
                  : 'Добавить в корзину'}
            </button>
            <Link className="btn btn-secondary" to="/catalog">
              Продолжить покупки
            </Link>
          </div>

          {stock <= 0 && (
            <form className="stock-request" onSubmit={submitStockRequest}>
              <div className="h3">Сообщить о поступлении</div>
              <p className="muted">
                Оставьте контакт — администратор увидит запрос и сообщит, когда товар
                появится.
              </p>
              <label className="field">
                <span>E-mail</span>
                <input
                  onChange={(event) =>
                    setStockForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  type="email"
                  value={stockForm.email}
                />
              </label>
              <label className="field">
                <span>Телефон</span>
                <input
                  onChange={(event) =>
                    setStockForm((current) => ({
                      ...current,
                      phone: event.target.value,
                    }))
                  }
                  type="tel"
                  value={stockForm.phone}
                />
              </label>
              {stockNotice && <div className="state success">{stockNotice}</div>}
              {stockError && <div className="state error">{stockError}</div>}
              <button className="btn" type="submit">
                Отправить запрос
              </button>
            </form>
          )}

          <div className="h3" style={{ marginBottom: 12 }}>
            Характеристики
          </div>
          <dl className="spec-table">
            {product.specs.map((spec) => (
              <div key={spec.label}>
                <dt>{spec.label}</dt>
                <dd>{spec.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <section className="section reviews-section">
        <div className="reviews-head">
          <h3>Отзывы покупателей</h3>
          <div className="reviews-rating">
            {reviews.count > 0
              ? `${reviews.average} из 5 · ${reviews.count} ${reviewsWord(reviews.count)}`
              : 'Пока нет оценок'}
          </div>
        </div>

        {reviewsLoadError && (
          <div className="state error">
            Не удалось загрузить отзывы: {reviewsLoadError}
          </div>
        )}

        {reviews.items.length > 0 && (
          <div className="reviews-list">
            {reviews.items.map((item) => (
              <article className="review" key={item.id}>
                <header>
                  <strong>{item.author}</strong>
                  <span className="review-stars">{'★'.repeat(item.rating)}</span>
                  <span className="small faint">
                    {new Date(item.createdAt).toLocaleDateString('ru-RU')}
                  </span>
                </header>
                {item.text && <p>{item.text}</p>}
              </article>
            ))}
          </div>
        )}

        {readAuth().accessToken ? (
          <form className="review-form" onSubmit={submitReview}>
            <div className="h3">Оставить отзыв</div>
            <label className="field">
              <span>Оценка</span>
              <select
                onChange={(event) => setReviewRating(event.target.value)}
                value={reviewRating}
              >
                {[5, 4, 3, 2, 1].map((value) => (
                  <option key={value} value={value}>
                    {value} — {'★'.repeat(value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Комментарий</span>
              <textarea
                maxLength={2000}
                onChange={(event) => setReviewText(event.target.value)}
                placeholder="Что понравилось или не понравилось"
                rows={3}
                value={reviewText}
              />
            </label>
            {reviewNotice && <div className="state success">{reviewNotice}</div>}
            {reviewError && <div className="state error">{reviewError}</div>}
            <button className="btn" type="submit">
              Отправить на модерацию
            </button>
          </form>
        ) : (
          <p className="muted">
            <Link to="/login">Войдите</Link>, чтобы оставить отзыв.
          </p>
        )}
      </section>

      {related.length > 0 && (
        <section className="section">
          <div className="h3" style={{ marginBottom: 12 }}>
            С этой категорией смотрят
          </div>
          <div className="product-grid">
            {related.slice(0, 4).map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
