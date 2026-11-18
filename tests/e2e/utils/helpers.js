import LoginPage from '../pages/LoginPage.js';

/** Логинится демо-пользователем и возвращает страницу. */
export async function loginAs(page, email = 'demo@pchelper.by', password = 'demo1234') {
  const login = new LoginPage(page);
  await login.goto('/login');
  await login.login(email, password);
  return page;
}
