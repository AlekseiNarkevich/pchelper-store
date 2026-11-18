import BasePage from './BasePage.js';

/** Главная страница витрины. */
export default class HomePage extends BasePage {
  categoryCards() {
    return this.page.locator('.feature');
  }

  productCards() {
    return this.page.locator('.product-card');
  }

  async openCatalog() {
    await this.page.getByRole('link', { name: 'Каталог' }).click();
  }

  async openPrebuilt() {
    await this.page.getByRole('link', { name: 'Готовые ПК' }).click();
  }

  async openLogin() {
    await this.page.getByRole('link', { name: 'Войти' }).click();
  }
}
