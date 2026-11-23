/**
 * PCHelper — страница товара в E2E-тестах: характеристики и покупка.
 */

import BasePage from "./BasePage.js";

/** Карточка товара. */
export default class ProductPage extends BasePage {
  async addToCart() {
    await this.page.getByRole("button", { name: "Добавить в корзину" }).click();
  }

  specs() {
    return this.page.locator(".spec-table");
  }
}
