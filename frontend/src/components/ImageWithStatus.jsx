/**
 * PCHelper — изображение товара с понятным состоянием загрузки.
 *
 * Фото каталога лежат локально, новые загрузки — в Supabase Storage.
 * Пока файл не загружен, на его месте видно «Загрузка…», а не пустой
 * белый прямоугольник. Ошибка загрузки показывает «Нет фото».
 */

import React, { useEffect, useState } from 'react';

/**
 * Картинка с подписью состояния.
 *
 * @param {object} props Свойства.
 * @param {string} [props.src] Адрес изображения.
 * @param {string} [props.alt] Альтернативный текст.
 * @param {string} [props.className] Дополнительный класс обёртки.
 * @returns {React.ReactElement}
 */
export default function ImageWithStatus({ src, alt = '', className = '', ...rest }) {
  const [status, setStatus] = useState(src ? 'loading' : 'empty');

  useEffect(() => {
    setStatus(src ? 'loading' : 'empty');
  }, [src]);

  return (
    <span className={`image-status is-${status}${className ? ` ${className}` : ''}`}>
      {status !== 'loaded' && (
        <span className="image-status-text">
          {status === 'loading' ? 'Загрузка…' : 'Нет фото'}
        </span>
      )}
      {src && (
        <img
          alt={alt}
          onError={() => setStatus('error')}
          onLoad={() => setStatus('loaded')}
          src={src}
          {...rest}
        />
      )}
    </span>
  );
}
