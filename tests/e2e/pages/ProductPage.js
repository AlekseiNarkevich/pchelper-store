import BasePage from './BasePage.js';

/** Карточка товара. */
export default class ProductPage extends BasePage {
  async addToCart() {
    await this.page.getByRole('button', { name: 'Добавить в корзину' }).click();
  }

  specs() {
    return this.page.locator('.spec-table');
  }
}
