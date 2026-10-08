import { test, expect } from '@playwright/test';
test('unconfigured workspace shows setup state and module navigation fits the viewport', async ({ page }) => {
  test.skip(!!process.env.RIFTBOUND_LOCAL_TEST,'Real local stack has a separate authenticated suite');
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Local setup required'})).toBeVisible();
  expect(await page.locator('html').getAttribute('lang')).toBe('en');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.keyboard.press('Tab');await expect(page.getByRole('link',{name:'Skip to content'})).toBeFocused();
  for(const [name,path]of [['Collection','/collection'],['Masterset','/masterset'],['Wishlist','/wishlist'],['Decks','/decks']]) {
    await page.getByRole('link',{name,exact:true}).click();await expect(page).toHaveURL(new RegExp(path));
    await expect(page.getByRole('heading',{name:'Local setup required'})).toBeVisible();
  }
  await page.getByRole('link',{name:'Settings',exact:true}).click();
  await expect(page.getByText('Local Supabase setup is required before signing in.')).toBeVisible();
});
