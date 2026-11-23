/**
 * PCHelper — модальное подтверждение действия.
 *
 * Заменяет системный window.confirm: одинаково выглядит в браузере
 * и Electron, поддерживает пояснение и красную кнопку для удаления.
 */

import React, { useEffect, useState } from 'react';

/**
 * Модальное подтверждение действия вместо системного window.confirm.
 *
 * Окно не закрывается по клику вне его: только кнопки «Отмена»
 * и подтверждения. Так случайное нажатие не отменяет действие.
 *
 * @param {object} props Свойства.
 * @param {boolean} props.open Показывать диалог.
 * @param {string} props.title Заголовок.
 * @param {string} [props.text] Пояснение.
 * @param {string} [props.confirmLabel] Текст кнопки подтверждения.
 * @param {boolean} [props.danger] Красная кнопка для удаления.
 * @param {{word: string, label?: string}} [props.requireText] Требовать ввод слова.
 * @param {Function} props.onConfirm Подтверждение.
 * @param {Function} props.onCancel Отмена.
 * @returns {React.ReactElement|null}
 */
export default function ConfirmDialog({
  open,
  title,
  text,
  confirmLabel = 'Удалить',
  danger = true,
  requireText,
  onConfirm,
  onCancel,
}) {
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (!open) setTyped('');
  }, [open]);

  if (!open) return null;

  const ready = !requireText || typed.trim() === requireText.word;

  return (
    <div className="modal-backdrop">
      <div
        aria-labelledby="confirm-title"
        aria-modal="true"
        className="modal"
        role="dialog"
      >
        <h3 id="confirm-title">{title}</h3>
        {text && <p className="muted">{text}</p>}
        {requireText && (
          <label className="field">
            <span>
              {requireText.label || `Введите «${requireText.word}» для подтверждения`}
            </span>
            <input
              autoFocus
              onChange={(event) => setTyped(event.target.value)}
              type="text"
              value={typed}
            />
          </label>
        )}
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onCancel} type="button">
            Отмена
          </button>
          <button
            className={danger ? 'btn btn-danger' : 'btn'}
            disabled={!ready}
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
