import BasePage from './BasePage.js';

/** Профиль пользователя. */
export default class ProfilePage extends BasePage {
  emailText() {
    return this.page.locator('.auth-card p.muted').first();
  }

  async logout() {
    await this.page.getByRole('button', { name: 'Выйти' }).click();
  }
}
