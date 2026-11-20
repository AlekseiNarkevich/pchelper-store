import { expect, test } from '@playwright/test';

import CartPage from '../pages/CartPage.js';
import CatalogPage from '../pages/CatalogPage.js';
import HomePage from '../pages/HomePage.js';
import LoginPage from '../pages/LoginPage.js';
import ProductPage from '../pages/ProductPage.js';
import ProfilePage from '../pages/ProfilePage.js';
import { firstProductId, loginAs } from '../utils/helpers.js';

test.describe('PCHelper — расширенные UI-сценарии', () => {
  test('LR9-01: пустая корзина имеет h1', async ({ page }) => {
    await page.goto('/cart');
    await expect(page.locator('h1').first()).toHaveText('Корзина пуста');
  });

  test('LR9-02: PWA meta не устарел', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('meta[name="mobile-web-app-capable"]')).toHaveAttribute('content', 'yes');
  });

  test('LR9-03: авторизованный не видит форму входа', async ({ page }) => {
    await loginAs(page);
    await page.goto('/login');
    await expect(page).not.toHaveURL(/\/login$/);
  });

  test('категория фильтрует каталог', async ({ page }) => {
    const catalog = new CatalogPage(page);
    await catalog.goto('/catalog');
    await catalog.selectCategory('Корпуса');
    await expect(page).toHaveURL(/\/catalog\/case$/);
    await expect(catalog.productCards().first()).toBeVisible();
  });

  test('сортировка по убыванию цены применяется', async ({ page }) => {
    const catalog = new CatalogPage(page);
    await catalog.goto('/catalog');
    await page.locator('#catalog-sort').selectOption('price_desc');
    await expect(catalog.productCards().first()).toBeVisible();
  });

  test('фильтр по цене применяется', async ({ page }) => {
    const catalog = new CatalogPage(page);
    await catalog.goto('/catalog');
    await page.locator('#price-from').fill('100');
    await page.locator('#price-to').fill('500');
    await expect(page.locator('#price-from')).toHaveValue('100');
    await expect(page.locator('#price-to')).toHaveValue('500');
  });

  test('пагинация ведёт на вторую страницу', async ({ page }) => {
    const catalog = new CatalogPage(page);
    await catalog.goto('/catalog');
    const next = page.locator('.pagination button').last();
    await next.click();
    await expect(page.getByText(/Страница 2 из/)).toBeVisible();
  });

  test('поиск по характеристике AM5 даёт результаты', async ({ page }) => {
    const catalog = new CatalogPage(page);
    await catalog.goto('/catalog?search=AM5');
    await expect(catalog.productCards().first()).toBeVisible();
  });

  test('карточка товара показывает цену', async ({ page, request }) => {
    const id = await firstProductId(request);
    await page.goto(`/product/${id}`);
    await expect(page.locator('body')).toContainText('BYN');
  });

  test('карточка товара показывает характеристики', async ({ page, request }) => {
    const id = await firstProductId(request);
    const product = new ProductPage(page);
    await product.goto(`/product/${id}`);
    await expect(product.specs()).toBeVisible();
  });

  test('товар добавляется в корзину из карточки', async ({ page, request }) => {
    const id = await firstProductId(request);
    const product = new ProductPage(page);
    const cart = new CartPage(page);
    await product.goto(`/product/${id}`);
    await product.addToCart();
    await cart.goto('/cart');
    await expect(cart.rows()).toHaveCount(1);
  });

  test('количество меняет сумму в корзине', async ({ page }) => {
    const catalog = new CatalogPage(page);
    const cart = new CartPage(page);
    await catalog.goto('/catalog');
    await catalog.addFirstToCart();
    await cart.goto('/cart');
    const before = await cart.total().innerText();
    await cart.increaseFirstQty();
    await expect(cart.total()).not.toHaveText(before);
  });

  test('удаление позиции очищает корзину', async ({ page }) => {
    const catalog = new CatalogPage(page);
    const cart = new CartPage(page);
    await catalog.goto('/catalog');
    await catalog.addFirstToCart();
    await cart.goto('/cart');
    await cart.removeFirst();
    await expect(cart.rows()).toHaveCount(0);
  });

  test('кнопка очистки работает', async ({ page }) => {
    const catalog = new CatalogPage(page);
    const cart = new CartPage(page);
    await catalog.goto('/catalog');
    await catalog.addFirstToCart();
    await cart.goto('/cart');
    await cart.clear();
    await expect(cart.rows()).toHaveCount(0);
  });

  test('неверный пароль показывает ошибку', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto('/login');
    await login.login('demo@pchelper.by', 'wrong123', false);
    await expect(login.error()).toBeVisible();
  });

  test('регистрация нового пользователя', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto('/login');
    await login.switchToRegister();
    await login.nameInput().fill('Тестовый');
    await login.emailInput().fill(`qa-${Date.now()}@example.com`);
    await login.passwordInput().fill('secret123');
    await login.submitButton().click();
    await expect(page).not.toHaveURL(/\/login$/);
  });

  test('выход возвращает ссылку «Войти»', async ({ page }) => {
    await loginAs(page);
    const profile = new ProfilePage(page);
    await profile.goto('/profile');
    await profile.logout();
    await expect(page.getByRole('link', { name: 'Войти' })).toBeVisible();
  });

  test('профиль без токена ведёт на логин', async ({ page }) => {
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('готовые сборки показывают 7 конфигураций', async ({ page }) => {
    await page.goto('/prebuilt');
    await expect(page.locator('.product-grid .product-card').first()).toBeVisible();
    expect(await page.locator('.product-grid .product-card').count()).toBeGreaterThanOrEqual(3);
  });

  test('сборка добавляется в корзину', async ({ page }) => {
    await page.goto('/prebuilt');
    const card = page
      .locator('.product-grid .product-card:has(button:not([disabled]))')
      .first();
    if (await card.count()) {
      await card.locator('button').click();
    } else {
      await page.locator('.product-grid .product-card button').first().click();
    }
    await page.goto('/cart');
    // Готовая сборка — одна позиция, а не набор комплектующих.
    await expect(page.locator('.cart-row')).toHaveCount(1);
  });

  test('неизвестный адрес открывает 404', async ({ page }) => {
    await page.goto('/no-such-page');
    await expect(page.locator('body')).toContainText('Такой страницы нет');
  });

  test('визуальная регрессия главной страницы', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('home-chromium.png', {
      maxDiffPixelRatio: 0.08,
      animations: 'disabled',
    });
  });
});

test.describe('PCHelper — мобильный PWA', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test('мобильная главная показывает 8 категорий', async ({ page }) => {
    await page.goto('/mobile.html');
    await expect(page.locator('#home-categories .cat-card')).toHaveCount(8);
  });

  test('мобильный каталог показывает карточки', async ({ page }) => {
    await page.goto('/mobile.html');
    await page.locator('#home-categories [data-cat="cpu"]').click();
    await expect(page.locator('#catalog-list .card').first()).toBeVisible();
  });

  test('мобильный поиск даёт подсказки', async ({ page }) => {
    await page.goto('/mobile.html');
    await page.locator('#home-search-input').fill('ryzen');
    await expect(page.locator('#home-suggest .suggest-item').first()).toBeVisible();
  });

  test('мобильный товар добавляется в корзину', async ({ page }) => {
    await page.goto('/mobile.html');
    await page.locator('#home-products .card').first().click();
    await page.locator('#buy-btn').click();
    await expect(page.locator('#tab-badge')).toHaveText('1');
  });

  test('мобильная корзина меняет количество', async ({ page }) => {
    await page.goto('/mobile.html');
    await page.locator('#home-products .card').first().click();
    await page.locator('#buy-btn').click();
    await page.locator('.tab[data-screen="cart"]').click();
    await page.locator('.cart-row .qty button').last().click();
    await expect(page.locator('.cart-row .qty span')).toHaveText('2');
  });
});
