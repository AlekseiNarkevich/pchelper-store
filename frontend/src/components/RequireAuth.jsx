import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { readAuth } from '../auth.js';

/**
 * Ограничивает маршрут для неавторизованных пользователей.
 *
 * @param {{children: React.ReactNode}} props Дочерние элементы.
 */
export default function RequireAuth({ children }) {
  const location = useLocation();
  const { accessToken } = readAuth();

  if (!accessToken) {
    return <Navigate replace state={{ from: location }} to="/login" />;
  }
  return children;
}
