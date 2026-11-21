/**
 * PCHelper — Калькулятор мощности блока питания: суммирует
 * TDP процессора и видеокарты и добавляет запас 25%.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { getProducts, money } from '../api.js';
import { calculatePsu } from '../builds.js';
import { hasIntegratedGraphics } from '../productFields.js';

/**
 * Калькулятор мощности блока питания.
 *
 * Сервер считает рекомендуемую мощность по TDP процессора и видеокарты
 * с запасом 25% и возвращает только подходящие модели.
 */
export default function PsuCalculator() {
  const [cpus, setCpus] = useState([]);
  const [gpus, setGpus] = useState([]);
  const [cpuId, setCpuId] = useState('');
  const [gpuId, setGpuId] = useState('');
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  // Списки процессоров и видеокарт загружаются один раз.
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

  useEffect(() => {
    if (!integrated && !gpuId && gpus[0]) setGpuId(gpus[0].id);
  }, [integrated, gpuId, gpus]);

  // Расчёт делает сервер: он же подбирает подходящие блоки питания.
  async function handleCalculate() {
    setError('');
    setCalculating(true);
    try {
      setResult(await calculatePsu(cpuId, integrated && !gpuId ? null : gpuId));
    } catch (reason) {
      setError(reason.message);
    } finally {
      setCalculating(false);
    }
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
          <div className="sub">Расчёт по TDP процессора и видеокарты с запасом 25%</div>
        </div>
        <Link className="btn btn-secondary" to="/builder">
          Собрать ПК
        </Link>
      </div>

      {loading ? (
        <div className="state">Загружаем комплектующие…</div>
      ) : (
        <div className="psu-form">
          <label className="field">
            <span>Процессор</span>
            <select
              onChange={(event) => {
                setCpuId(event.target.value);
                setResult(null);
              }}
              value={cpuId}
            >
              {cpus.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Видеокарта</span>
            <select
              onChange={(event) => {
                setGpuId(event.target.value);
                setResult(null);
              }}
              value={gpuId}
            >
              {integrated && <option value="">Без дискретной видеокарты</option>}
              {gpus.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </label>

          <button
            className="btn"
            disabled={calculating || !cpuId}
            onClick={handleCalculate}
            type="button"
          >
            {calculating ? 'Считаем…' : 'Рассчитать'}
          </button>
        </div>
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
                {result.gpu ? `${result.gpu.name} · ${result.gpu.tdp} Вт` : 'нет'}
              </strong>
            </div>
            <div className="psu-total">
              <span>Рекомендуемая мощность</span>
              <strong>{result.recommendation.recommendedWatts} Вт</strong>
              <small>запас {result.recommendation.reservePercent}%</small>
            </div>
          </div>

          <h3>Подходящие блоки питания</h3>
          {result.items.length === 0 ? (
            <div className="state">В каталоге нет блоков питания такой мощности.</div>
          ) : (
            <div className="picker-wrap">
              <table className="picker">
                <thead>
                  <tr>
                    <th>Название</th>
                    <th>Мощность</th>
                    <th>80 PLUS</th>
                    <th>Модульный</th>
                    <th>PCIe 5.0</th>
                    <th>Цена</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <Link to={`/product/${item.id}`}>{item.name}</Link>
                      </td>
                      <td>{item.watts} Вт</td>
                      <td>{item.certificate || '—'}</td>
                      <td>{item.modular ? 'да' : 'нет'}</td>
                      <td>{item.pcieGen5 ? 'да' : 'нет'}</td>
                      <td className="picker-price">{money(item.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
