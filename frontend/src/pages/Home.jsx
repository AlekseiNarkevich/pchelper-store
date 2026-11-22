/**
 * PCHelper — Главная витрина: категории комплектующих, недорогие
 * товары и готовые сборки. Данные приходят из каталога и Supabase.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { getCategories, getPrebuilt, getProducts, money } from '../api.js';
import ImageWithStatus from '../components/ImageWithStatus.jsx';
import ProductCard from '../components/ProductCard.jsx';
import { useAutoRefresh } from '../useAutoRefresh.js';
import React from 'react';

/**
 * Главная страница: витрина категорий, популярные товары и готовые сборки.
 *
 * Данные загружаются тремя независимыми запросами; если один из них
 * не ответил, страница всё равно показывает остальные блоки.
 */
export default function Home() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [prebuilt, setPrebuilt] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    // Три независимых запроса идут параллельно: категории, товары, сборки.
    let alive = true;
    setLoading(true);
    setError('');

    Promise.all([
      getCategories(),
      getProducts({ limit: 8, sort: 'price_asc' }),
      getPrebuilt(),
    ])
      .then(([categoryData, productData, prebuiltData]) => {
        if (!alive) return;
        setCategories(categoryData.items);
        setProducts(productData.items);
        setPrebuilt(prebuiltData.items.slice(0, 4));
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
  }, []);

  // Тихо обновляем витрину после изменений в админке и при возврате
  // в окно: скелетоны и уже загруженный экран не мигают.
  useAutoRefresh(() => {
    Promise.all([
      getCategories(),
      getProducts({ limit: 8, sort: 'price_asc' }),
      getPrebuilt(),
    ])
      .then(([categoryData, productData, prebuiltData]) => {
        setCategories(categoryData.items);
        setProducts(productData.items);
        setPrebuilt(prebuiltData.items.slice(0, 4));
      })
      .catch(() => {});
  });
  function handleAdded(product) {
    setNotice(`«${product.name}» добавлен в корзину`);
    setTimeout(() => setNotice(''), 2500);
  }

  return (
    <div className="container">
      <section className="hero">
        <div className="h1">PCHelper — помощник ПК-энтузиасту</div>
        <p>
          Комплектующие, готовые сборки и расчёт мощности блока питания. Цены в
          белорусских рублях, характеристики — из базы магазина.
        </p>
        <div
          style={{ marginTop: 18, display: 'flex', gap: 10, justifyContent: 'center' }}
        >
          <Link className="btn" to="/catalog">
            Перейти в каталог
          </Link>
          <Link className="btn btn-secondary" to="/prebuilt">
            Готовые сборки
          </Link>
        </div>
      </section>

      {notice && <div className="state">{notice}</div>}
      {error && (
        <div className="state error">
          Не удалось загрузить данные: {error}
          <br />
          <button
            className="btn"
            onClick={() => window.location.reload()}
            type="button"
          >
            Повторить
          </button>
        </div>
      )}

      {loading && (
        <div className="state" role="status">
          Загружаем данные магазина…
        </div>
      )}

      <section className="section">
        <div className="h2" style={{ marginBottom: 14 }}>
          Категории
        </div>
        {loading ? (
          <div className="feature-grid" aria-label="Загрузка категорий">
            {Array.from({ length: 8 }, (_, index) => (
              <div className="skeleton feature-skeleton" key={index} />
            ))}
          </div>
        ) : (
          <div className="feature-grid">
            {categories.map((category) => (
              <Link
                className="feature"
                key={category.id}
                to={`/catalog/${category.id}`}
              >
                <div className="h3">{category.name}</div>
                <p>{category.description}</p>
                <div className="small faint">{category.count} товаров</div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: 14,
          }}
        >
          <div className="h2">Недорогие комплектующие</div>
          <Link className="small" to="/catalog">
            Весь каталог →
          </Link>
        </div>
        {loading ? (
          <div className="product-grid">
            <div className="skeleton" />
            <div className="skeleton" />
            <div className="skeleton" />
          </div>
        ) : (
          <div className="product-grid">
            {products.map((product) => (
              <ProductCard key={product.id} onAdded={handleAdded} product={product} />
            ))}
          </div>
        )}
      </section>

      <section className="section" id="prebuilt">
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: 14,
          }}
        >
          <div className="h2">Готовые сборки</div>
          <Link className="small" to="/prebuilt">
            Все сборки →
          </Link>
        </div>
        {loading ? (
          <div className="skeleton" />
        ) : (
          <div className="product-grid">
            {prebuilt.map((build) => (
              <article className="product-card" key={build.id}>
                <div className="photo">
                  <ImageWithStatus
                    alt={build.name}
                    loading="lazy"
                    src={build.imageUrl}
                  />
                </div>
                <div className="name">{build.name}</div>
                <div className="vendor">{build.task}</div>
                <div className="small muted" style={{ marginBottom: 10 }}>
                  {build.components
                    .slice(0, 3)
                    .map((component) => component.name)
                    .join(' · ')}
                </div>
                <div className="bottom">
                  <div className="price">{money(build.price)}</div>
                  <span className="small faint">{build.componentCount} деталей</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
