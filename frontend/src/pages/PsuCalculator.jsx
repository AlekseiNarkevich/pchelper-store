/**
 * PCHelper — Калькулятор мощности блока питания.
 *
 * Слева выбираются процессор и видеокарта (с фотографиями и характеристиками),
 * затем сервер считает рекомендуемую мощность и показывает подходящие БП.
 * Кнопка «Собрать ПК» активна только после выбора процессора, видеокарты
 * (или встроенной графики) и конкретного блока питания.
 */

import React, { useEffect, useMemo, useState } from 'react';
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
                className={`${selected ? 'is-on' : ''}${outOfStock ? ' is-out' : ''}`}
                key={product.id}
                onClick={() => {
                  if (!outOfStock) onPick(product);
                }}
                tabIndex={outOfStock ? -1 : 0}
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
  const canBuild = Boolean(cpuId && psuId && (gpuId || integrated));

  function pickCpu(product) {
    setCpuId(product.id);
    setResult(null);
    setPsuId('');
  }

  function pickGpu(product) {
    setGpuId(product.id);
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

  // Передаём выбранные детали в конфигуратор через query-параметры.
  function buildPc() {
    if (!canBuild) return;
    const params = new URLSearchParams({ cpu: cpuId, psu: psuId });
    if (gpuId) params.set('gpu', gpuId);
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
        <button
          className="btn"
          disabled={!canBuild}
          onClick={buildPc}
          title={
            canBuild
              ? 'Открыть конфигуратор с выбранными деталями'
              : 'Сначала выберите процессор, видеокарту и блок питания'
          }
          type="button"
        >
          Собрать ПК
        </button>
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
          <div className="psu-result">
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
                        onClick={() => {
                          if (!outOfStock) setPsuId(item.id);
                        }}
                        tabIndex={outOfStock ? -1 : 0}
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
