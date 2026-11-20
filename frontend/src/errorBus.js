/**
 * PCHelper — общая шина ошибок интерфейса.
 *
 * Фоновые операции (синхронизация корзины, автообновление токена) не имеют
 * своей формы, поэтому сообщают об ошибке через событие, а App показывает
 * его в правом нижнем углу.
 */

const EVENT = 'pchelper-error';

/**
 * Показывает ошибку пользователю.
 *
 * @param {string} message Текст ошибки.
 */
export function reportError(message) {
  window.dispatchEvent(
    new CustomEvent(EVENT, { detail: { message: String(message || 'Ошибка') } }),
  );
}

/**
 * Подписка на ошибки.
 *
 * @param {Function} listener Слушатель.
 * @returns {Function} Отписка.
 */
export function onError(listener) {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
