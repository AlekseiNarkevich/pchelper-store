/**
 * PCHelper — Калькулятор мощности блока питания.
 *
 * Слева выбираются процессор и видеокарта (с фотографиями и характеристиками),
 * затем сервер считает рекомендуемую мощность и показывает подходящие БП.
 * «Собрать ПК» доступна при наличии CPU и GPU/встроенной графики; БП
 * можно выбрать сразу или подобрать позже в конфигураторе.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { getProducts, money } from '../api.js';
import { calculatePsu } from '../builds.js';
import { hasIntegratedGraphics } from '../productFields.js';

/**
 * Список комплектующих с фото и выбором строки.
 *
 * @param {object} props Свойства.
 * @param {Array<object>} props.items Товары.
 * @param {string} props.selectedId Выбранный идентификатор.
 * @param {Function} props.onPick Выбор товара.
 * @param {string} props.emptyText Текст при пустом списке.
 * @returns {React.ReactElement}
 */
function ProductList({ items, selectedId, onPick, emptyText }) {
  if (!items.length) return <div className="state">{emptyText}</div>;

  return (
    <div className="picker-wrap psu-list">
      <table className="picker">
        <thead>
          <tr>
            <th aria-label="Выбор" />
            <th>Название</th>
            <th>Характеристики</th>
            <th>Цена</th>
          </tr>
        </thead>
        <tbody>
          {items.map((product) => {
            const selected = product.id === selectedId;
            const outOfStock = Number(product.stock ?? 0) <= 0;
            const specs = (product.specs || [])
              .slice(0, 2)
              .map((spec) => `${spec.label}: ${spec.value}`)
              .join(' · ');

            return (
              <tr
                aria-selected={selected}
                className={`${selected ? 'is-on' : ''}${outOfStock ? ' is-out' : ''}`}
                key={product.id}
                onClick={() => onPick(product)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onPick(product);
                  }
                }}
                title={
                  outOfStock
                    ? 'Нет в наличии — можно выбрать для расчёта, но не для сборки'
                    : undefined
                }
                tabIndex={0}
              >
                <td>
                  <span className="picker-check" aria-hidden="true">
                    {selected ? '✓' : ''}
                  </span>
                </td>
                <td className="picker-name">
                  <div className="picker-product">
                    {product.imageUrl ? (
                      <img
                        alt=""
                        className="picker-thumb"
                        loading="lazy"
                        src={product.imageUrl}
                      />
                    ) : (
                      <span className="picker-thumb picker-thumb-empty">фото</span>
                    )}
                    <span className="picker-name-text">
                      <Link
                        className="picker-link"
                        onClick={(event) => event.stopPropagation()}
                        to={`/product/${product.id}`}
                      >
                        {product.name}
                      </Link>
                      {outOfStock && <span className="picker-out">нет в наличии</span>}
                    </span>
                  </div>
                </td>
                <td className="small faint">{specs || '—'}</td>
                <td className="picker-price">{money(product.price)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Калькулятор мощности блока питания.
 */
export default function PsuCalculator() {
  const [cpus, setCpus] = useState([]);
  const [gpus, setGpus] = useState([]);
  const [cpuId, setCpuId] = useState('');
  const [gpuId, setGpuId] = useState('');
  const [psuId, setPsuId] = useState('');
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const resultRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [cpuList, gpuList] = await Promise.all([
          getProducts({ category: 'cpu', limit: 100, sort: 'price_asc' }),
          getProducts({ category: 'gpu', limit: 100, sort: 'price_asc' }),
        ]);
        if (!alive) return;
        setCpus(cpuList.items);
        setGpus(gpuList.items);
        if (cpuList.items[0]) setCpuId(cpuList.items[0].id);
        if (gpuList.items[0]) setGpuId(gpuList.items[0].id);
      } catch (reason) {
        if (alive) setError(reason.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const selectedCpu = useMemo(
    () => cpus.find((product) => product.id === cpuId) || null,
    [cpus, cpuId],
  );
  const integrated = hasIntegratedGraphics(selectedCpu);

  // Если у процессора нет встроенной графики, видеокарта обязательна.
  useEffect(() => {
    if (!integrated && !gpuId && gpus[0]) setGpuId(gpus[0].id);
  }, [integrated, gpuId, gpus]);

  const selectedPsu = result?.items.find((item) => item.id === psuId) || null;
  const selectedGpu = useMemo(
    () => gpus.find((product) => product.id === gpuId) || null,
    [gpus, gpuId],
  );
  const unavailable = [selectedCpu, selectedGpu, selectedPsu].filter(
    (product) => product && Number(product.stock ?? 0) <= 0,
  );
  const selectionComplete = Boolean(cpuId && (gpuId || integrated));
  const canBuild = selectionComplete && unavailable.length === 0;

  function pickCpu(product) {
    // Повторный клик по выбранной строке снимает выбор.
    setCpuId((current) => (current === product.id ? '' : product.id));
    setResult(null);
    setPsuId('');
  }

  function pickGpu(product) {
    setGpuId((current) => (current === product.id ? '' : product.id));
    setResult(null);
    setPsuId('');
  }

  function useIntegrated() {
    setGpuId('');
    setResult(null);
    setPsuId('');
  }

  async function handleCalculate() {
    setError('');
    setPsuId('');
    setCalculating(true);
    try {
      setResult(await calculatePsu(cpuId, integrated && !gpuId ? null : gpuId));
    } catch (reason) {
      setError(reason.message);
    } finally {
      setCalculating(false);
    }
  }

  // После расчёта подводим пользователя к результату и списку БП:
  // на 2K они могут быть ниже первого экрана.
  useEffect(() => {
    if (!result || !resultRef.current) return;
    resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [result]);

  // Передаём выбранные детали в конфигуратор через query-параметры.
  // БП не обязателен: без него откроем конфигуратор с CPU и видеокартой.
  function buildPc() {
    if (!canBuild) return;
    const params = new URLSearchParams({ cpu: cpuId });
    if (gpuId) params.set('gpu', gpuId);
    if (psuId) params.set('psu', psuId);
    navigate(`/builder?${params.toString()}`);
  }

  return (
    <div className="container">
      <div className="breadcrumbs">
        <Link to="/">Главная</Link>
        <span>Калькулятор БП</span>
      </div>

      <div className="builder-head">
        <div>
          <div className="h1" style={{ fontSize: 26 }}>
            Калькулятор мощности БП
          </div>
          <div className="sub">
            Выберите процессор, видеокарту и блок питания — расчёт с запасом 25%
          </div>
        </div>
      </div>

      {loading ? (
        <div className="state">Загружаем комплектующие…</div>
      ) : (
        <>
          <div className="psu-pickers">
            <section className="profile-panel psu-picker-panel">
              <div className="panel-head">
                <h2>Процессор</h2>
                {selectedCpu && (
                  <span className="small faint">
                    TDP{' '}
                    {selectedCpu.specs?.find((s) => s.label === 'TDP')?.value || '—'}
                  </span>
                )}
              </div>
              <ProductList
                emptyText="Процессоры не найдены."
                items={cpus}
                onPick={pickCpu}
                selectedId={cpuId}
              />
            </section>

            <section className="profile-panel psu-picker-panel">
              <div className="panel-head">
                <h2>Видеокарта</h2>
                <div className="psu-panel-meta">
                  {selectedGpu && (
                    <span className="small faint">
                      TDP{' '}
                      {selectedGpu.specs?.find((s) => s.label === 'TDP')?.value || '—'}
                    </span>
                  )}
                  {integrated && (
                    <button
                      className={`btn btn-sm ${gpuId ? 'btn-secondary' : ''}`}
                      onClick={useIntegrated}
                      type="button"
                    >
                      Без дискретной
                    </button>
                  )}
                </div>
              </div>
              <ProductList
                emptyText="Видеокарты не найдены."
                items={gpus}
                onPick={pickGpu}
                selectedId={gpuId}
              />
            </section>
          </div>

          <div className="psu-calc-row">
            <button
              className="btn"
              disabled={calculating || !cpuId}
              onClick={handleCalculate}
              type="button"
            >
              {calculating ? 'Считаем…' : 'Рассчитать мощность'}
            </button>
            <button
              className="btn"
              disabled={!canBuild}
              onClick={buildPc}
              title={
                canBuild
                  ? psuId
                    ? 'Открыть конфигуратор с выбранными деталями'
                    : 'Открыть конфигуратор с процессором и видеокартой — блок питания выберете там'
                  : selectionComplete
                    ? 'В выбранной сборке есть товары не в наличии — расчёт доступен, собрать ПК нельзя'
                    : 'Сначала выберите процессор и видеокарту'
              }
              type="button"
            >
              Собрать ПК
            </button>
            {unavailable.length > 0 && (
              <span className="psu-stock-warning">
                Нет в наличии: {unavailable.map((item) => item.name).join(', ')}. Расчёт
                доступен, но собрать ПК нельзя.
              </span>
            )}
            <span className="small faint">
              {selectedCpu?.name || 'Процессор не выбран'}
              {' · '}
              {gpuId
                ? gpus.find((gpu) => gpu.id === gpuId)?.name
                : integrated
                  ? 'встроенная графика'
                  : 'видеокарта не выбрана'}
            </span>
          </div>
        </>
      )}

      {error && (
        <div className="state error" role="alert">
          {error}
        </div>
      )}

      {result && (
        <>
          <div className="psu-result" ref={resultRef}>
            <div>
              <span>Процессор</span>
              <strong>
                {result.cpu.name} · {result.cpu.tdp} Вт
              </strong>
            </div>
            <div>
              <span>Видеокарта</span>
              <strong>
                {result.gpu
                  ? `${result.gpu.name} · ${result.gpu.tdp} Вт`
                  : 'встроенная'}
              </strong>
            </div>
            <div className="psu-total">
              <span>Рекомендуемая мощность</span>
              <strong>{result.recommendation.recommendedWatts} Вт</strong>
              <small>запас {result.recommendation.reservePercent}%</small>
            </div>
          </div>

          <div className="panel-head">
            <h3>Подходящие блоки питания</h3>
            {selectedPsu && (
              <span className="small faint">Выбран: {selectedPsu.name}</span>
            )}
          </div>
          <p className="hint">
            Выберите блок питания, чтобы сразу перенести его в конфигуратор. Можно не
            выбирать — тогда откроем конфигуратор с процессором и видеокартой, а БП
            подберёте там.
          </p>

          {result.items.length === 0 ? (
            <div className="state">В каталоге нет блоков питания такой мощности.</div>
          ) : (
            <div className="picker-wrap psu-list">
              <table className="picker">
                <thead>
                  <tr>
                    <th aria-label="Выбор" />
                    <th>Название</th>
                    <th>Мощность</th>
                    <th>80 PLUS</th>
                    <th>Модульный</th>
                    <th>PCIe 5.0</th>
                    <th>Цена</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((item) => {
                    const selected = item.id === psuId;
                    const outOfStock = Number(item.stock ?? 0) <= 0;
                    return (
                      <tr
                        className={`${selected ? 'is-on' : ''}${outOfStock ? ' is-out' : ''}`}
                        key={item.id}
                        onClick={() => setPsuId(selected ? '' : item.id)}
                        title={
                          outOfStock
                            ? 'Нет в наличии — можно выбрать для расчёта, но не для сборки'
                            : undefined
                        }
                        tabIndex={0}
                      >
                        <td>
                          <span className="picker-check" aria-hidden="true">
                            {selected ? '✓' : ''}
                          </span>
                        </td>
                        <td className="picker-name">
                          <div className="picker-product">
                            {item.imageUrl ? (
                              <img
                                alt=""
                                className="picker-thumb"
                                loading="lazy"
                                src={item.imageUrl}
                              />
                            ) : (
                              <span className="picker-thumb picker-thumb-empty">
                                фото
                              </span>
                            )}
                            <span className="picker-name-text">
                              <Link
                                className="picker-link"
                                onClick={(event) => event.stopPropagation()}
                                to={`/product/${item.id}`}
                              >
                                {item.name}
                              </Link>
                              {outOfStock && (
                                <span className="picker-out">нет в наличии</span>
                              )}
                            </span>
                          </div>
                        </td>
                        <td>{item.watts} Вт</td>
                        <td>{item.certificate || '—'}</td>
                        <td>{item.modular ? 'да' : 'нет'}</td>
                        <td>{item.pcieGen5 ? 'да' : 'нет'}</td>
                        <td className="picker-price">{money(item.price)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
