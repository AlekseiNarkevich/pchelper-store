/**
 * PCHelper — E2E-проверки публичного API: каталог, сборки, здоровье.
 */

import { expect, test } from "@playwright/test";

const API = process.env.API_URL || "http://127.0.0.1:3001/api/v1";

test.describe("PCHelper — API (интеграционные тесты)", () => {
  test("categories возвращает 8 категорий", async ({ request }) => {
    const response = await request.get(`${API}/categories`);
    expect(response.ok()).toBeTruthy();
    expect((await response.json()).total).toBe(8);
  });

  test("products поддерживает фильтр по категории", async ({ request }) => {
    const response = await request.get(`${API}/products?category=cpu&limit=5`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items[0].category).toBe("cpu");
  });

  test("неизвестная категория даёт 400", async ({ request }) => {
    const response = await request.get(`${API}/products?category=teapot`);
    expect(response.status()).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  });

  test("неизвестный товар даёт 404", async ({ request }) => {
    const response = await request.get(`${API}/products/no-such:999`);
    expect(response.status()).toBe(404);
  });

  test("prebuilt возвращает сборки", async ({ request }) => {
    const response = await request.get(`${API}/prebuilt`);
    expect(response.ok()).toBeTruthy();
    expect((await response.json()).total).toBeGreaterThan(0);
  });

  test("логин возвращает access и refresh токены", async ({ request }) => {
    const response = await request.post(`${API}/auth/login`, {
      data: { email: "demo@pchelper.by", password: "demo1234" },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
  });

  test("неверный пароль даёт 401", async ({ request }) => {
    const response = await request.post(`${API}/auth/login`, {
      data: { email: "demo@pchelper.by", password: "wrong" },
    });
    expect(response.status()).toBe(401);
  });

  test("корзина требует авторизацию", async ({ request }) => {
    const response = await request.get(`${API}/cart`);
    expect(response.status()).toBe(401);
  });
});
