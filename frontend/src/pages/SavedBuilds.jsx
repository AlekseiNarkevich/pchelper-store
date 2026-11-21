import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { money } from '../api.js';
import { getBuild, listBuilds, removeBuild } from '../builds.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';

/** Подписи категорий в составе сборки. */
const LABELS = {
  cpu: 'Процессор',
  motherboard: 'Материнская плата',
  ram: 'Оперативная память',
  cooling: 'Охлаждение',
  gpu: 'Видеокарта',
  storage: 'Накопитель',
  psu: 'Блок питания',
  case: 'Корпус',
};

/** Состав и результат проверки одной сборки. */
function BuildDetails({ build }) {
  const compatibility = build.compatibility || {
    compatible: true,
    errors: [],
    warnings: [],
  };

  return (
    <div className="saved-detail">
      <div className="picker-wrap">
        <table className="picker">
          <thead>
            <tr>
              <th>Компонент</th>
              <th>Модель</th>
              <th>Цена</th>
            </tr>
          </thead>
          <tbody>
            {build.components.map((component) => (
              <tr key={`${component.category}:${component.productId}`}>
                <td>{LABELS[component.category] || component.category}</td>
                <td>
                  <Link to={`/product/${component.product.id}`}>
                    {component.product.name}
                  </Link>
                </td>
                <td className="picker-price">{money(component.product.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`compat-badge${compatibility.compatible ? ' is-ok' : ' is-bad'}`}>
        {compatibility.compatible
          ? 'Сборка совместима'
          : `Найдено проблем: ${compatibility.errors.length}`}
      </div>

      {compatibility.errors.length > 0 && (
        <ul className="compat-errors">
          {compatibility.errors.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      )}

      {compatibility.warnings.length > 0 && (
        <ul className="compat-warnings">
          {compatibility.warnings.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Сохранённые сборки пользователя из Supabase.
 */
export default function SavedBuilds() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [openId, setOpenId] = useState(null);
  const [details, setDetails] = useState({});
  const [removeTarget, setRemoveTarget] = useState(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    let alive = true;
    listBuilds()
      .then((data) => {
        if (alive) setItems(data.items);
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

  async function toggle(build) {
    setError('');
    if (openId === build.id) {
      setOpenId(null);
      return;
    }
    setOpenId(build.id);
    if (details[build.id]) return;
    try {
      const data = await getBuild(build.id);
      setDetails((current) => ({ ...current, [build.id]: data.build }));
    } catch (reason) {
      setError(reason.message);
    }
  }

  async function confirmRemove() {
    const build = removeTarget;
    if (!build) return;
    setError('');
    setRemoving(true);
    try {
      await removeBuild(build.id);
      setItems((current) => current.filter((item) => item.id !== build.id));
      setOpenId((current) => (current === build.id ? null : current));
      setRemoveTarget(null);
      setNotice(`Сборка «${build.name}» удалена.`);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="container">
      <div className="breadcrumbs">
        <Link to="/">Главная</Link>
        <span>Мои сборки</span>
      </div>

      <div className="builder-head">
        <div>
          <div className="h1" style={{ fontSize: 26 }}>
            Мои сборки
          </div>
          <div className="sub">Сохранены в профиле и доступны после входа</div>
        </div>
        <Link className="btn" to="/builder">
          Собрать новый ПК
        </Link>
      </div>

      {error && (
        <div className="state error" role="alert">
          {error}
        </div>
      )}
      {notice && <div className="state">{notice}</div>}

      {loading && <div className="state">Загружаем сборки…</div>}

      {!loading && items.length === 0 && (
        <div className="state">
          Пока нет сохранённых сборок.
          <br />
          <Link className="btn" to="/builder">
            Перейти в конфигуратор
          </Link>
        </div>
      )}

      <div className="saved-list">
        {items.map((build) => (
          <article className="saved-build" key={build.id}>
            <header>
              <div>
                <h3>{build.name}</h3>
                <div className="small faint">
                  {build.updatedAt
                    ? `Обновлена ${new Date(build.updatedAt).toLocaleString('ru-RU')}`
                    : ''}
                </div>
              </div>
              <strong>{money(build.total)}</strong>
            </header>

            {build.note && <p className="saved-note">{build.note}</p>}

            <div className="saved-actions">
              <button
                className="btn btn-secondary"
                onClick={() => toggle(build)}
                type="button"
              >
                {openId === build.id ? 'Свернуть' : 'Состав и совместимость'}
              </button>
              <Link className="btn btn-secondary" to={`/builder?build=${build.id}`}>
                Открыть в конфигураторе
              </Link>
              <button
                className="btn btn-secondary"
                onClick={() => setRemoveTarget(build)}
                type="button"
              >
                Удалить
              </button>
            </div>

            {openId === build.id && details[build.id] && (
              <BuildDetails build={details[build.id]} />
            )}
          </article>
        ))}
      </div>

      <ConfirmDialog
        confirmLabel={removing ? 'Удаляем…' : 'Удалить'}
        onCancel={() => setRemoveTarget(null)}
        onConfirm={confirmRemove}
        open={Boolean(removeTarget)}
        text="Состав и настройки сборки будут удалены без возможности восстановления."
        title={`Удалить сборку «${removeTarget?.name || ''}»?`}
      />
    </div>
  );
}
