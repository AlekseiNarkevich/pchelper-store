import LoginPage from '../pages/LoginPage.js';

const API = process.env.API_URL || 'http://127.0.0.1:3001/api/v1';

/** Логинится демо-пользователем и возвращает страницу. */
export async function loginAs(page, email = 'demo@pchelper.by', password = 'demo1234') {
  const login = new LoginPage(page);
  await login.goto('/login');
  await login.login(email, password);
  return page;
}

/**
 * Возвращает id первого доступного товара.
 *
 * В CI backend работает на фикстуре без Supabase, поэтому жёстко заданный
 * `cpu:1` может отсутствовать. Берём id из API — тест работает и на фикстуре,
 * и на реальной базе.
 */
export async function firstProductId(request) {
  const response = await request.get(`${API}/products?limit=1`);
  const body = await response.json();
  return body.items[0].id;
}
