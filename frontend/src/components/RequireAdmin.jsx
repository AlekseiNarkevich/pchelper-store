import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { onAuthChange, readAuth } from '../auth.js';

/**
 * Пропускает только администратора.
 *
 * @param {{children: React.ReactNode}} props Дочерние элементы.
 */
export default function RequireAdmin({ children }) {
  const location = useLocation();
  const [user, setUser] = useState(() => readAuth().user);

  useEffect(() => onAuthChange(() => setUser(readAuth().user)), []);

  if (!readAuth().accessToken || !user) {
    return <Navigate replace state={{ from: location }} to="/login" />;
  }
  if (user.role !== 'admin') {
    return <Navigate replace to="/" />;
  }
  return children;
}
