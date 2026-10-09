import {test,expect} from '@playwright/test';
test('real community catalog preview: six sets, Radiance base cards and responsive deck library',async({page},info)=>{
  test.skip(!process.env.RIFTBOUND_REAL_CATALOG_TEST,'Requires a verified pinned snapshot in the disposable harness');
  const email=`real-catalog-${info.project.name}-${Date.now()}@example.test`;
  await page.goto('/settings');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill('Local-test-only-Password-123!');
  await page.getByRole('button',{name:'Create account',exact:true}).click();await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
  await page.getByRole('link',{name:'Dashboard',exact:true}).click();
  await expect(page.getByText('Last catalog import: partial · v2026-10-08',{exact:true})).toBeVisible();
  await expect(page.getByText(/24 unresolved editions/)).toBeVisible();
  await page.getByRole('link',{name:'Collection',exact:true}).click();
  await expect(page.getByTestId('collection-card')).toHaveCount(24);
  await expect(page.getByTestId('collection-card').first()).toContainText('OGN 001-298');
  await expect(page.getByRole('combobox',{name:'Set',exact:true}).locator('option')).toHaveCount(7);
  await page.getByRole('link',{name:'Decks',exact:true}).click();await page.locator('.create-deck > summary').click();
  await page.getByLabel('Deck name',{exact:true}).fill('Radiance review · Theorycraft');await page.getByRole('button',{name:'Create deck',exact:true}).click();
  await expect(page.getByRole('button',{name:'Radiance review · Theorycraft · theorycraft',exact:true})).toBeVisible();
  await page.locator('.library-filter-details > summary').click();
  await page.getByRole('combobox',{name:'Set',exact:true}).selectOption({label:'RAD · Radiance'});
  await expect(page.getByRole('heading',{name:'Card library 138',exact:true})).toBeVisible();
  await expect(page.getByTestId('library-card')).toHaveCount(24);
  await expect(page.getByTestId('library-card').first().getByText('Previewed · Unreleased',{exact:true})).toBeVisible();
  await page.getByLabel('Search cards',{exact:true}).fill('001-167');await expect(page.getByTestId('library-card')).toHaveCount(1);
  await page.getByTestId('library-card').getByRole('button',{name:/^Add /}).click();
  const deckTab=page.getByRole('button',{name:/^Deck ·/});if(await deckTab.isVisible())await deckTab.click();
  await expect(page.getByTestId('builder-deck-card')).toHaveCount(1);await expect(page.getByTestId('builder-deck-card').getByText('Previewed · Unreleased',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath(`real-catalog-${info.project.name}.png`),fullPage:true});
  if(info.project.name==='mobile'){await page.getByRole('button',{name:'Library',exact:true}).click();await page.screenshot({path:info.outputPath('real-catalog-mobile-library.png'),fullPage:true});}
});
