/**
 * PCHelper — расширенные E2E-проверки API: расчёты, ошибки, границы.
 */

import { expect, test } from "@playwright/test";

const API = process.env.API_URL || "http://127.0.0.1:3001/api/v1";

test.describe("PCHelper — дополнительные API-проверки", () => {
  test("health возвращает ok", async ({ request }) => {
    const response = await request.get(`${API}/health`);
    expect(response.ok()).toBeTruthy();
    expect((await response.json()).status).toBe("ok");
  });

  test("limit вне диапазона даёт 400", async ({ request }) => {
    const response = await request.get(`${API}/products?limit=1000`);
    expect(response.status()).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  });
});
