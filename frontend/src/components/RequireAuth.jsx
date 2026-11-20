import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { onAuthChange, readAuth } from '../auth.js';

/**
 * Ограничивает маршрут для неавторизованных пользователей.
 *
 * Подписывается на изменение сессии: если refresh-токен отозван или истёк
 * во время работы, пользователь сразу попадает на страницу входа,
 * а не остаётся на форме с сообщением об ошибке.
 *
 * @param {{children: React.ReactNode}} props Дочерние элементы.
 */
export default function RequireAuth({ children }) {
  const location = useLocation();
  const [token, setToken] = useState(() => readAuth().accessToken);

  useEffect(
    () => onAuthChange(() => setToken(readAuth().accessToken)),
    [],
  );

  if (!token) {
    return <Navigate replace state={{ from: location }} to="/login" />;
  }
  return children;
}
