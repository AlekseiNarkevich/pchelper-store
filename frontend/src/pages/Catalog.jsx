/**
 * PCHelper — Каталог: категории, поиск, фильтры по цене,
 * сортировка, пагинация и карточки товаров.
 */

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { getCategories, getProducts } from '../api.js';
import { useAutoRefresh } from '../useAutoRefresh.js';
import { plural } from '../utils/plural.js';
import ProductCard from '../components/ProductCard.jsx';
import React from 'react';

const PAGE_SIZE = 12;

/** Какие характеристики показывать в фильтрах каждой категории. */
const FILTER_LABELS = {
  cpu: [
    'Производитель',
    'Сокет',
    'Ядра / потоки',
    'Частота',
    'TDP',
    'Встроенная графика',
    'Память',
  ],
  motherboard: [
    'Сокет',
    'Чипсет',
    'Тип памяти',
    'Форм-фактор',
    'Фазы питания',
    'Максимум памяти',
    'Слоты M.2',
    'Порты SATA',
  ],
  ram: ['Тип', 'Объём', 'Частота', 'Тайминги', 'Профили разгона'],
  gpu: ['Производитель', 'Память', 'Длина', 'TDP', 'Вентиляторы', 'Толщина'],
  psu: [
    'Мощность',
    'Стандарт',
    'Сертификат 80 PLUS',
    'Cybenetics',
    'Модульный',
    'Разъёмы PCIe',
    'Разъёмы CPU',
    'PCIe 5.0',
  ],
  storage: [
    'Тип',
    'Объём',
    'Интерфейс',
    'Скорость чтения / записи',
    'DRAM-буфер',
    'Радиатор',
  ],
  case: [
    'Форм-фактор',
    'Максимальная длина видеокарты',
    'Максимальная высота кулера',
    'Поддержка СЖО',
    'Радиатор СЖО',
    'Вентиляторы в комплекте',
  ],
  cooling: [
    'Тип',
    'Рассеиваемая мощность',
    'Высота',
    'Длина радиатора',
    'Максимальный шум',
  ],
};

/** Сколько значений фильтра показывать до «Показать ещё». */
const FILTER_VISIBLE = 7;

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
  const [filterProducts, setFilterProducts] = useState([]);
  const [filterSearch, setFilterSearch] = useState({});
  const [filterExpanded, setFilterExpanded] = useState({});
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

  // При смене категории сбрасываем фильтры. Это отдельный эффект:
  // автообновление не должно стирать выбранные пользователем значения.
  useEffect(() => {
    setFilters({});
    setFilterSearch({});
    setFilterExpanded({});
  }, [category]);

  // Для выбранной категории загружаем все товары: по ним считаем
  // доступные значения фильтров и количество для каждого варианта.
  useEffect(() => {
    if (!category) {
      setFilterProducts([]);
      return undefined;
    }

    let alive = true;
    setFiltersLoading(true);
    getProducts({ category, limit: 100 })
      .then((data) => {
        if (alive) setFilterProducts(data.items);
      })
      .catch(() => {
        if (alive) setFilterProducts([]);
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

  function matchesFilters(product, values, skipLabel) {
    return Object.entries(values).every(([label, selected]) => {
      if (!selected.length || label === skipLabel) return true;
      return product.specs.some(
        (spec) => spec.label === label && selected.includes(spec.value),
      );
    });
  }

  // Считаем варианты с учётом остальных выбранных фильтров:
  // недоступные комбинации становятся серыми, но не исчезают.
  const filterGroups = (FILTER_LABELS[category] || [])
    .map((label) => {
      const counts = new Map();
      for (const product of filterProducts) {
        for (const spec of product.specs || []) {
          if (spec.label === label && spec.value && !counts.has(spec.value)) {
            counts.set(spec.value, 0);
          }
        }
      }
      for (const product of filterProducts) {
        if (!matchesFilters(product, filters, label)) continue;
        for (const spec of product.specs || []) {
          if (spec.label !== label || !spec.value) continue;
          counts.set(spec.value, (counts.get(spec.value) || 0) + 1);
        }
      }
      for (const value of filters[label] || []) {
        if (!counts.has(value)) counts.set(value, 0);
      }
      const options = [...counts.entries()].sort((a, b) =>
        String(a[0]).localeCompare(String(b[0]), 'ru', { numeric: true }),
      );
      return { label, options };
    })
    .filter((group) => group.options.length);

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
    setFilterSearch({});
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

  // Тихо перечитываем категории, фильтры и текущую страницу после
  // изменений в админке или при возврате в окно. Фильтры не сбрасываем.
  useAutoRefresh(() => {
    getCategories()
      .then((data) => setCategories(data.items))
      .catch(() => {});

    if (category) {
      getProducts({ category, limit: 100 })
        .then((data) => setFilterProducts(data.items))
        .catch(() => {});
    }

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
        setItems(data.items);
        setTotal(data.total);
      })
      .catch(() => {});
  });

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

            {!filtersLoading && !filterGroups.length && (
              <div className="small faint">Для этой категории фильтров нет.</div>
            )}

            {!filtersLoading &&
              filterGroups.map(({ label, options }) => {
                const query = (filterSearch[label] || '').toLowerCase();
                const matched = options.filter(([value]) =>
                  String(value).toLowerCase().includes(query),
                );
                const expanded = Boolean(filterExpanded[label]);
                const shown = expanded ? matched : matched.slice(0, FILTER_VISIBLE);
                const selected = filters[label] || [];

                return (
                  <div className="filter-group" key={label}>
                    <div className="filter-title">{label}</div>

                    {options.length > 4 && (
                      <input
                        aria-label={`Поиск в фильтре «${label}»`}
                        className="filter-search"
                        onChange={(event) =>
                          setFilterSearch((current) => ({
                            ...current,
                            [label]: event.target.value,
                          }))
                        }
                        placeholder="Поиск в фильтре…"
                        type="search"
                        value={filterSearch[label] || ''}
                      />
                    )}

                    {shown.map(([value, count]) => {
                      const isSelected = selected.includes(value);
                      const disabled = count === 0 && !isSelected;
                      return (
                        <label
                          className={`filter-option${disabled ? ' is-disabled' : ''}`}
                          key={value}
                        >
                          <input
                            checked={isSelected}
                            disabled={disabled}
                            onChange={() => toggleFilter(label, value)}
                            type="checkbox"
                          />
                          <span>{value}</span>
                          <span className="filter-count">{count}</span>
                        </label>
                      );
                    })}

                    {!matched.length && (
                      <div className="small faint">Ничего не найдено</div>
                    )}

                    {matched.length > FILTER_VISIBLE && (
                      <button
                        className="link-button filter-more"
                        onClick={() =>
                          setFilterExpanded((current) => ({
                            ...current,
                            [label]: !expanded,
                          }))
                        }
                        type="button"
                      >
                        {expanded
                          ? 'Свернуть'
                          : `Показать ещё ${matched.length - FILTER_VISIBLE}`}
                      </button>
                    )}
                  </div>
                );
              })}
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
                {total} {plural(total, 'товар', 'товара', 'товаров')}
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
