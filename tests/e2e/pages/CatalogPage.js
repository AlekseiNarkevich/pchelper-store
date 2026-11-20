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
    // Для сценариев покупки берём товар, который есть на складе:
    // у отсутствующего кнопка «В корзину» отключена.
    const available = this.page.locator(
      '.product-card:has(button:not([disabled])) a.name',
    );
    if (await available.count()) {
      await available.first().click();
      return;
    }
    await this.productCards().first().locator('a.name').click();
  }

  async addFirstToCart() {
    await this.page
      .locator('.product-card button:not([disabled])')
      .first()
      .click();
  }
}
