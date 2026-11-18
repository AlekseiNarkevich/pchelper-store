import { expect, test } from '@playwright/test';

import CartPage from '../pages/CartPage.js';
import CatalogPage from '../pages/CatalogPage.js';
import HomePage from '../pages/HomePage.js';
import LoginPage from '../pages/LoginPage.js';
import ProfilePage from '../pages/ProfilePage.js';

test.describe('PCHelper — критические пользовательские сценарии', () => {
  test('главная показывает категории и витрину', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto('/');

    await expect(home.categoryCards()).toHaveCount(8);
    await expect(home.productCards()).toHaveCount(9);
  });

  test('каталог показывает карточки и чипы категорий', async ({ page }) => {
    const catalog = new CatalogPage(page);
    await catalog.goto('/catalog');

    await expect(catalog.productCards()).toHaveCount(12);
    await expect(catalog.categoryChips().first()).toBeVisible();
  });

  test('поиск показывает подсказки после двух символов', async ({ page }) => {
    const catalog = new CatalogPage(page);
    await catalog.goto('/catalog');
    await catalog.searchInput().fill('ryzen');

    await expect(page.locator('.search-drop')).toBeVisible();
    await expect(page.locator('.search-item').first()).toBeVisible();
  });

  test('демо-пользователь может войти и открыть профиль', async ({ page }) => {
    const login = new LoginPage(page);
    const profile = new ProfilePage(page);

    await login.goto('/login');
    await login.login('demo@pchelper.by', 'demo1234');
    await profile.goto('/profile');

    await expect(profile.heading()).toHaveText('Личный кабинет');
    await expect(profile.emailText()).toContainText('demo@pchelper.by');
  });

  test('товар добавляется в корзину, сумма видна', async ({ page }) => {
    const catalog = new CatalogPage(page);
    const cart = new CartPage(page);

    await catalog.goto('/catalog');
    await catalog.addFirstToCart();
    await cart.goto('/cart');

    await expect(cart.rows()).toHaveCount(1);
    await expect(cart.total()).toBeVisible();
  });
});
