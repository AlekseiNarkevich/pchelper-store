/**
 * Базовый Page Object: общая навигация и ожидание загрузки.
 * Проверки (expect) в Page Objects не делаем — только в тестах.
 */
export default class BasePage {
  constructor(page) {
    this.page = page;
  }

  async goto(path = '/') {
    await this.page.goto(path);
    await this.page.waitForLoadState('networkidle');
  }

  async waitForText(text) {
    await this.page.getByText(text).first().waitFor({ state: 'visible' });
  }

  heading() {
    return this.page.locator('h1, .h1').first();
  }
}
