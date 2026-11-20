import React, { useState } from 'react';
import { Link } from 'react-router-dom';

import { TROUBLE_ITEMS } from '../data/troubleshooting.js';

/**
 * Рекомендации по диагностике типовых неисправностей ПК.
 */
export default function Diagnostics() {
  const [activeId, setActiveId] = useState(TROUBLE_ITEMS[0]?.id);
  const item = TROUBLE_ITEMS.find((entry) => entry.id === activeId) || TROUBLE_ITEMS[0];

  return (
    <div className="container diagnostics">
      <div className="breadcrumbs">
        <Link to="/">Главная</Link>
        <span>Диагностика</span>
      </div>

      <div className="builder-head">
        <div>
          <div className="h1" style={{ fontSize: 26 }}>
            Диагностика неисправностей
          </div>
          <div className="sub">
            Восемь типовых ситуаций и порядок проверки
          </div>
        </div>
        <Link className="btn btn-secondary" to="/builder">
          Собрать ПК
        </Link>
      </div>

      <div className="diagnostics-layout">
        <div className="diagnostics-list" role="listbox" aria-label="Список проблем">
          {TROUBLE_ITEMS.map((entry) => (
            <button
              aria-selected={entry.id === activeId}
              className={`diagnostics-item${entry.id === activeId ? ' is-on' : ''}`}
              key={entry.id}
              onClick={() => setActiveId(entry.id)}
              role="option"
              type="button"
            >
              {entry.title}
            </button>
          ))}
        </div>

        {item && (
          <section className="diagnostics-detail" aria-live="polite">
            <h2>{item.title}</h2>
            <p className="problem">{item.problem}</p>
            <h3>Что проверить</h3>
            <ol className="diagnostics-steps">
              {item.steps.map((step, index) => (
                <li key={step.title}>
                  <strong>
                    {index + 1}. {step.title}
                  </strong>
                  <ul>
                    {step.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}
