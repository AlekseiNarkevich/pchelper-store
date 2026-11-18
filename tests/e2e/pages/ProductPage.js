import BasePage from './BasePage.js';

/** Карточка товара. */
export default class ProductPage extends BasePage {
  async addToCart() {
    await this.page.getByRole('button', { name: /в корзину/i }).click();
  }

  specs() {
    return this.page.locator('.spec-table');
  }
}
