/**
 * PCHelper — автообновление данных на странице.
 *
 * Подписывается на общий сигнал dataBus и на возврат фокуса в окно.
 * Колбэк хранится в ref, поэтому всегда видит актуальные фильтры,
 * выбранную категорию и другие состояния компонента.
 *
 * Использовать для «тихого» обновления: без скелетонов и без сброса
 * формы, чтобы не мешать пользователю.
 */

import { useEffect, useRef } from 'react';

import { onDataChanged } from './dataBus.js';

/**
 * @param {() => void} callback Что перечитать.
 * @param {boolean} [enabled] Можно временно отключить.
 */
export function useAutoRefresh(callback, enabled = true) {
  const latest = useRef(callback);
  latest.current = callback;

  useEffect(() => {
    if (!enabled) return undefined;
    return onDataChanged(() => latest.current());
  }, [enabled]);
}
