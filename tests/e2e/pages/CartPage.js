/**
 * PCHelper — страница корзины в E2E-тестах: строки, количество, очистка.
 */

import BasePage from "./BasePage.js";

/** Корзина. */
export default class CartPage extends BasePage {
  rows() {
    return this.page.locator(".cart-row");
  }

  total() {
    return this.page.locator(".cart-total");
  }

  async increaseFirstQty() {
    await this.rows().first().locator(".qty button").last().click();
  }

  async removeFirst() {
    await this.rows().first().locator(".cart-remove").click();
  }

  async clear() {
    await this.page.getByRole("button", { name: /очистить/i }).click();
  }
}
