/**
 * PCHelper — Каталог: категории, поиск, фильтры по цене,
 * сортировка, пагинация и карточки товаров.
 */

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { getCategories, getProducts } from '../api.js';
import ProductCard from '../components/ProductCard.jsx';
import React from 'react';

const PAGE_SIZE = 12;

/** Какие характеристики показывать в фильтрах каждой категории. */
const FILTER_LABELS = {
  cpu: ['Производитель', 'Сокет', 'Встроенная графика', 'Память'],
  motherboard: ['Сокет', 'Чипсет', 'Тип памяти', 'Форм-фактор', 'Слоты M.2'],
  ram: ['Тип', 'Объём', 'Частота'],
  gpu: ['Производитель', 'Память', 'Вентиляторы'],
  psu: ['Стандарт', 'Сертификат 80 PLUS', 'Модульный', 'PCIe 5.0'],
  storage: ['Тип', 'Интерфейс'],
  case: ['Форм-фактор', 'Поддержка СЖО'],
  cooling: ['Тип', 'Рассеиваемая мощность'],
};

/**
 * Каталог: категории, поиск, сортировка, фильтр по цене и страницы.
 *
 * Категория хранится в адресе (/catalog/cpu), поисковый запрос — в query
 * (?search=ryzen), остальные фильтры — в состоянии страницы. Так ссылку
 * на категорию можно отправить коллеге, а сортировку не обязательно
 * тащить в адрес.
 */
export default function Catalog() {
  const { category } = useParams();
  const [searchParams] = useSearchParams();
  const search = searchParams.get('search') || '';
  const navigate = useNavigate();
  const [term, setTerm] = useState(search);
  const queryKey = `${category || ''}|${search}`;
  const lastQueryRef = useRef(queryKey);

  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState('price_asc');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [filters, setFilters] = useState({});
  const [filterOptions, setFilterOptions] = useState({});
  const [filtersLoading, setFiltersLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Категории нужны для чипов и заголовка; ошибка не блокирует каталог.
  useEffect(() => {
    getCategories()
      .then((data) => setCategories(data.items))
      .catch(() => setCategories([]));
  }, []);

  // Для выбранной категории собираем доступные значения характеристик.
  useEffect(() => {
    setFilters({});
    if (!category) {
      setFilterOptions({});
      return undefined;
    }

    let alive = true;
    setFiltersLoading(true);
    getProducts({ category, limit: 100 })
      .then((data) => {
        if (!alive) return;
        const options = {};
        for (const label of FILTER_LABELS[category] || []) {
          const values = new Set();
          for (const product of data.items) {
            for (const spec of product.specs || []) {
              if (spec.label === label && spec.value) values.add(spec.value);
            }
          }
          if (values.size) {
            options[label] = [...values].sort((a, b) =>
              String(a).localeCompare(String(b), 'ru', { numeric: true }),
            );
          }
        }
        setFilterOptions(options);
      })
      .catch(() => {
        if (alive) setFilterOptions({});
      })
      .finally(() => {
        if (alive) setFiltersLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [category]);

  const filterKey = JSON.stringify(filters);
  const activeFilterCount = Object.values(filters).reduce(
    (sum, values) => sum + values.length,
    0,
  );

  function toggleFilter(label, value) {
    setFilters((current) => {
      const values = current[label] || [];
      const next = values.includes(value)
        ? values.filter((item) => item !== value)
        : [...values, value];
      const updated = { ...current, [label]: next };
      if (!next.length) delete updated[label];
      return updated;
    });
    setOffset(0);
  }

  function clearFilters() {
    setFilters({});
    setOffset(0);
  }

  // Товары перезапрашиваются при смене фильтров, сортировки или страницы.
  useEffect(() => {
    // При смене категории или поиска возвращаемся на первую страницу:
    // иначе offset от старого списка может оказаться за пределами нового.
    if (lastQueryRef.current !== queryKey) {
      lastQueryRef.current = queryKey;
      if (offset !== 0) {
        setLoading(true);
        setOffset(0);
        return undefined;
      }
    }

    let alive = true;
    setLoading(true);
    setError('');

    getProducts({
      category,
      search,
      sort,
      minPrice,
      maxPrice,
      filters: filterKey === '{}' ? '' : filterKey,
      limit: PAGE_SIZE,
      offset,
    })
      .then((data) => {
        if (!alive) return;
        setItems(data.items);
        setTotal(data.total);
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
  }, [category, search, sort, minPrice, maxPrice, offset, queryKey, filterKey]);

  const current = categories.find((item) => item.id === category);
  const title = category ? current?.name || 'Категория' : 'Все комплектующие';
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.floor(offset / PAGE_SIZE) + 1;

  useEffect(() => {
    setTerm(search);
  }, [search]);

  // Поиск в каталоге нужен на телефоне: шапка там скрывает строку поиска.
  function submitSearch(event) {
    event.preventDefault();
    const value = term.trim();
    const path = category ? `/catalog/${category}` : '/catalog';
    navigate(value ? `${path}?search=${encodeURIComponent(value)}` : path);
  }

  // Любое изменение фильтра возвращает на первую страницу.
  function resetAnd(update) {
    setOffset(0);
    update();
  }

  function handleAdded(product) {
    setNotice(`«${product.name}» добавлен в корзину`);
    setTimeout(() => setNotice(''), 2500);
  }

  return (
    <div className="container">
      <div className="breadcrumbs">
        <Link to="/">Главная</Link>
        <span>Каталог</span>
        {current && <span>{current.name}</span>}
      </div>

      <form className="catalog-mobile-search" onSubmit={submitSearch} role="search">
        <input
          aria-label="Найти товар"
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Поиск: модель, AM5, DDR5…"
          type="search"
          value={term}
        />
        <button className="btn btn-sm" type="submit">
          Найти
        </button>
      </form>

      <div className="chips">
        <Link className={`chip${!category ? ' is-on' : ''}`} to="/catalog">
          Все
        </Link>
        {categories.map((item) => (
          <Link
            className={`chip${category === item.id ? ' is-on' : ''}`}
            key={item.id}
            to={`/catalog/${item.id}`}
          >
            {item.name} · {item.count}
          </Link>
        ))}
      </div>

      <div className={`catalog-layout${category ? ' has-filters' : ''}`}>
        {category && (
          <aside className="catalog-filters" aria-label="Фильтры каталога">
            <div className="catalog-filter-head">
              <strong>Фильтры</strong>
              {activeFilterCount > 0 && (
                <button className="link-button" onClick={clearFilters} type="button">
                  Сбросить
                </button>
              )}
            </div>

            {filtersLoading && <div className="small faint">Загружаем фильтры…</div>}

            {!filtersLoading && !Object.keys(filterOptions).length && (
              <div className="small faint">Для этой категории фильтров нет.</div>
            )}

            {!filtersLoading &&
              Object.entries(filterOptions).map(([label, values]) => (
                <div className="filter-group" key={label}>
                  <div className="filter-title">{label}</div>
                  {values.slice(0, 12).map((value) => (
                    <label className="filter-option" key={value}>
                      <input
                        checked={(filters[label] || []).includes(value)}
                        onChange={() => toggleFilter(label, value)}
                        type="checkbox"
                      />
                      <span>{value}</span>
                    </label>
                  ))}
                  {values.length > 12 && (
                    <div className="small faint">ещё {values.length - 12}…</div>
                  )}
                </div>
              ))}
          </aside>
        )}

        <div className="catalog-results">
          <div className="toolbar">
            <div>
              <div className="h1" style={{ fontSize: 26 }}>
                {title}
              </div>
              <div className="sub">
                {search ? `Поиск: «${search}». ` : ''}
                {total} товаров, цены в белорусских рублях
              </div>
            </div>
            <div className="controls">
              <label className="small faint" htmlFor="price-from">
                Цена от
              </label>
              <input
                className="input-price"
                id="price-from"
                min="0"
                onChange={(event) =>
                  resetAnd(() => setMinPrice(event.target.value.replace(/\D/g, '')))
                }
                placeholder="0"
                type="number"
                value={minPrice}
              />
              <label className="small faint" htmlFor="price-to">
                до
              </label>
              <input
                className="input-price"
                id="price-to"
                min="0"
                onChange={(event) =>
                  resetAnd(() => setMaxPrice(event.target.value.replace(/\D/g, '')))
                }
                placeholder="∞"
                type="number"
                value={maxPrice}
              />
              <label className="small faint" htmlFor="catalog-sort">
                Сортировка
              </label>
              <select
                className="select"
                id="catalog-sort"
                onChange={(event) => resetAnd(() => setSort(event.target.value))}
                value={sort}
              >
                <option value="price_asc">Сначала дешевле</option>
                <option value="price_desc">Сначала дороже</option>
                <option value="name_asc">По названию</option>
              </select>
            </div>
          </div>

          {notice && <div className="state">{notice}</div>}

          {error && (
            <div className="state error">
              Не удалось загрузить товары: {error}
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
              Загружаем товары…
            </div>
          )}

          {loading && (
            <div className="product-grid">
              {[0, 1, 2, 3, 4, 5].map((key) => (
                <div className="skeleton" key={key} />
              ))}
            </div>
          )}

          {!loading && !error && items.length === 0 && (
            <div className="state">
              Ничего не найдено. Попробуйте изменить цену или категорию.
              <br />
              <Link className="btn" to="/catalog">
                Сбросить фильтры
              </Link>
            </div>
          )}

          {!loading && !error && items.length > 0 && (
            <>
              <div className="product-grid">
                {items.map((product) => (
                  <ProductCard
                    key={product.id}
                    onAdded={handleAdded}
                    product={product}
                  />
                ))}
              </div>
              {pages > 1 && (
                <div className="pagination">
                  <button
                    className="btn btn-secondary"
                    disabled={page === 1}
                    onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                    type="button"
                  >
                    ← Назад
                  </button>
                  <span className="small muted">
                    Страница {page} из {pages}
                  </span>
                  <button
                    className="btn btn-secondary"
                    disabled={page === pages}
                    onClick={() => setOffset(offset + PAGE_SIZE)}
                    type="button"
                  >
                    Вперёд →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
