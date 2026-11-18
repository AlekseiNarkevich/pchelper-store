import BasePage from './BasePage.js';

/** Каталог: чипы, поиск, фильтры и карточки товаров. */
export default class CatalogPage extends BasePage {
  productCards() {
    return this.page.locator('.product-card');
  }

  categoryChips() {
    return this.page.locator('.chip');
  }

  searchInput() {
    return this.page.getByLabel('Поиск по каталогу');
  }

  async selectCategory(name) {
    await this.page.locator('.chip', { hasText: name }).first().click();
  }

  async openFirstProduct() {
    await this.productCards().first().locator('a.name').click();
  }

  async addFirstToCart() {
    await this.productCards().first().getByRole('button').last().click();
  }
}
