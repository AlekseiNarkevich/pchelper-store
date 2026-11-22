/**
 * PCHelper — Диагностика неисправностей: восемь типовых ситуаций
 * и пошаговые инструкции, что проверить в каждом случае.
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';

import { TROUBLE_ITEMS } from '../data/troubleshooting.js';

/**
 * Рекомендации по диагностике типовых неисправностей ПК.
 */
export default function Diagnostics() {
  // Слева список ситуаций, справа — выбранная инструкция.
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
          <div className="sub">Восемь типовых ситуаций и порядок проверки</div>
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
              {item.steps.map((step) => (
                <li key={step.title}>
                  <strong>{step.title}</strong>
                  <ul>
                    {step.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>

            <div className="diagnostics-extra">
              <h3>Вопросы для самопроверки</h3>
              <ul>
                <li>Повторяется ли проблема после полной перезагрузки компьютера?</li>
                <li>
                  Появилась ли она после установки новой детали, драйвера или обновления
                  Windows?
                </li>
                <li>
                  Можно ли проверить подозрительную деталь на другом компьютере или
                  заменить её на заведомо рабочую?
                </li>
              </ul>

              <h3>Когда обращаться в сервис</h3>
              <p>
                Если после проверок проблема повторяется, появляются запах гари, искры,
                вздутые конденсаторы или компьютер выключается под нагрузкой — не
                разбирайте блок питания и обратитесь в сервисный центр.
              </p>
            </div>

            <div className="diagnostics-tip">
              <strong>Важно:</strong> перед разборкой обесточьте компьютер, снимите
              статическое электричество и не прикасайтесь к контактам плат без
              необходимости. Если не уверены в своих действиях — доверьте диагностику
              специалисту.
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
