/**
 * PCHelper — общий сигнал об изменении данных.
 *
 * Админка и страницы пользователя загружают данные один раз при открытии.
 * После изменения (заказ, товар, пользователь, отзыв) нужно перечитать
 * сводку и списки, иначе на экране остаются старые цифры.
 *
 * Событие отправляется после успешных POST/PATCH/DELETE в admin.js.
 * Подписчики также перечитывают данные при возврате в окно/вкладку.
 */

const EVENT = 'pchelper:data-changed';

/**
 * Сообщает приложению, что данные изменились.
 *
 * @param {string} [scope] Область изменения: admin, orders и т.п.
 */
export function notifyDataChanged(scope = 'all') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { scope } }));
}

/**
 * Подписывает на изменения данных и на возврат фокуса в окно.
 *
 * @param {(scope: string) => void} handler Что перечитать.
 * @returns {() => void} Отписка.
 */
export function onDataChanged(handler) {
  if (typeof window === 'undefined') return () => {};

  const onEvent = (event) => handler(event.detail?.scope || 'all');
  const onFocus = () => handler('focus');

  window.addEventListener(EVENT, onEvent);
  window.addEventListener('focus', onFocus);
  return () => {
    window.removeEventListener(EVENT, onEvent);
    window.removeEventListener('focus', onFocus);
  };
}
