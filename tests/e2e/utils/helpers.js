/**
 * PCHelper — общие помощники E2E: вход под тестовым покупателем.
 */

import LoginPage from "../pages/LoginPage.js";

const API = process.env.API_URL || "http://127.0.0.1:3001/api/v1";

/** Логинится демо-пользователем и возвращает страницу. */
export async function loginAs(
  page,
  email = "demo@pchelper.by",
  password = "demo1234",
) {
  const login = new LoginPage(page);
  await login.goto("/login");
  await login.login(email, password);
  return page;
}

/**
 * Возвращает id товара с нужным остатком.
 *
 * В CI backend работает на фикстуре без Supabase, поэтому жёстко заданный
 * `cpu:1` может отсутствовать. Берём id из API — тест работает и на фикстуре,
 * и на реальной базе, где часть товаров специально без остатка.
 *
 * @param {import('@playwright/test').APIRequestContext} request Контекст запросов.
 * @param {number} minStock Минимальный остаток.
 * @returns {Promise<string>}
 */
export async function productIdWithStock(request, minStock = 1) {
  const response = await request.get(`${API}/products?limit=100`);
  const body = await response.json();
  const items = body.items || [];
  const found = items.find((item) => Number(item.stock ?? 0) >= minStock);
  return (found || items[0]).id;
}

/** Возвращает id первого товара, который есть в наличии. */
export async function firstProductId(request) {
  return productIdWithStock(request, 1);
}
