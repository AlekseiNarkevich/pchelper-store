import BasePage from './BasePage.js';

/** Страницы входа и регистрации. */
export default class LoginPage extends BasePage {
  emailInput() {
    return this.page.getByLabel('Электронная почта');
  }

  passwordInput() {
    return this.page.getByLabel('Пароль');
  }

  nameInput() {
    return this.page.getByLabel('Имя');
  }

  submitButton() {
    return this.page.locator('form.auth-form button[type="submit"]');
  }

  error() {
    return this.page.locator('.state.error');
  }

  async login(email, password) {
    await this.emailInput().fill(email);
    await this.passwordInput().fill(password);
    await this.submitButton().click();
    await this.page.waitForURL((url) => !url.pathname.endsWith('/login'));
  }

  async switchToRegister() {
    await this.page.getByRole('button', { name: 'Зарегистрироваться' }).click();
  }
}
