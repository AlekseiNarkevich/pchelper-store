/**
 * PCHelper — модальное подтверждение действия.
 *
 * Заменяет системный window.confirm: одинаково выглядит в браузере
 * и Electron, поддерживает пояснение и красную кнопку для удаления.
 */

import React from 'react';

/**
 * Модальное подтверждение действия вместо системного window.confirm.
 *
 * @param {object} props Свойства.
 * @param {boolean} props.open Показывать диалог.
 * @param {string} props.title Заголовок.
 * @param {string} [props.text] Пояснение.
 * @param {string} [props.confirmLabel] Текст кнопки подтверждения.
 * @param {boolean} [props.danger] Красная кнопка для удаления.
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
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onCancel} role="presentation">
      <div
        aria-labelledby="confirm-title"
        aria-modal="true"
        className="modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <h3 id="confirm-title">{title}</h3>
        {text && <p className="muted">{text}</p>}
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onCancel} type="button">
            Отмена
          </button>
          <button
            className={danger ? 'btn btn-danger' : 'btn'}
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
