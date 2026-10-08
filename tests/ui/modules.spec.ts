import {test,expect} from '@playwright/test';
const api=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const first='f3000000-0000-4000-8000-000000000001';
const second='f3000000-0000-4000-8000-000000000002';
const card='f2000000-0000-4000-8000-000000000001';
const password='Local-test-only-Password-123!';
test('real local Auth, collection, wishlist, dashboard and physical deck lifecycle',async({page,request},info)=>{
  test.skip(!process.env.RIFTBOUND_LOCAL_TEST,'Requires npm run test:local disposable real service harness');
  test.setTimeout(180000);
  const email=`test-${info.project.name}-${Date.now()}@example.test`;
  // Auth is real GoTrue; auto-confirm is enabled only in the disposable harness.
  await page.goto('/settings');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Create account',exact:true}).click();
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
  await page.getByRole('link',{name:'Dashboard',exact:true}).click();
  await expect(page.getByText('TEST ONLY DATA',{exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Collection',exact:true}).click();
  const firstRow=()=>page.getByTestId('collection-card').filter({has:page.getByRole('link',{name:'TEST Card 01',exact:true})});
  await expect(page.getByTestId('collection-card')).toHaveCount(24);
  await expect(page.getByTestId('collection-card').first()).toContainText('OGN 001');
  await firstRow().getByRole('spinbutton').fill('2');await firstRow().getByRole('button',{name:'Save quantity',exact:true}).click();
  await expect(page.getByText('Saved successfully.',{exact:true})).toBeVisible();
  await page.reload();await expect(firstRow().getByRole('spinbutton')).toHaveValue('2');
  // Real API session check: a second identity sees no private inventory.
  const login=await request.post(`${api}/auth/v1/token?grant_type=password`,{headers:{apikey:key!},data:{email,password}});
  expect(login.ok()).toBe(true);const session=await login.json();
  const other=await request.post(`${api}/auth/v1/signup`,{headers:{apikey:key!},data:{email:`other-${email}`,password}});expect(other.ok()).toBe(true);
  const otherSession=await other.json();
  const otherSnapshot=await request.post(`${api}/rest/v1/rpc/workspace_snapshot`,{headers:{apikey:key!,Authorization:`Bearer ${otherSession.access_token}`},data:{}});
  expect(otherSnapshot.ok()).toBe(true);expect((await otherSnapshot.json()).inventory).toHaveLength(0);
  // Sorting before paging and persistent reset, plus unchanged quantities.
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.getByTestId('collection-card').first()).toContainText('OGN 025');
  const pageTwo=await page.getByTestId('collection-card').allTextContents();
  expect(pageTwo.findIndex(text=>text.includes('SFD'))).toBe(9); // OGN 25..32 plus unresolved PG number.
  await page.getByRole('combobox',{name:'Sort by',exact:true}).selectOption('name');
  await expect(page.getByTestId('collection-card').first()).toContainText('TEST Card 01');
  await page.getByRole('combobox',{name:'Direction',exact:true}).selectOption('desc');
  await expect(page.getByTestId('collection-card').first()).toContainText('TEST PG unresolved');
  await page.getByRole('button',{name:'Reset to default',exact:true}).click();
  await expect(page.getByTestId('collection-card').first()).toContainText('OGN 001');
  await page.getByRole('button',{name:'List',exact:true}).click();await expect(firstRow().getByRole('spinbutton')).toHaveValue('2');
  await firstRow().getByRole('button',{name:'Add missing to wishlist',exact:true}).click();
  await page.getByRole('link',{name:'Wishlist',exact:true}).click();
  const wish=page.getByTestId('wish-card').filter({has:page.getByRole('link',{name:'TEST Card 01',exact:true})});
  await expect(wish).toContainText('Goal 3 · Owned 2 · Remaining 1');
  await wish.getByLabel('Manual total ownership goal',{exact:true}).fill('4');await wish.getByRole('textbox',{name:'Note',exact:true}).fill('Keep manual intention');
  await wish.getByRole('button',{name:'Save wishlist entry',exact:true}).click();await expect(wish).toContainText('Goal 4 · Owned 2 · Remaining 2');
  // The same saved derived reason cannot duplicate the entry.
  const write=async(action:string,payload:object)=>{
    const r=await request.post(`${api}/rest/v1/rpc/mutate_workspace`,{headers:{apikey:key!,Authorization:`Bearer ${session.access_token}`},data:{action,payload}});
    expect(r.ok()).toBe(true);return await r.json();
  };
  await write('add_wishlist_reason',{printing_id:first,reason:'Masterset'});await page.reload();await expect(wish).toHaveCount(1);
  await write('set_owned',{printing_id:first,quantity:3});await page.reload();await expect(wish).toContainText('Goal 4 · Owned 3 · Remaining 1');
  await expect(wish.getByRole('textbox',{name:'Note',exact:true})).toHaveValue('Keep manual intention');
  await page.getByRole('link',{name:'Decks',exact:true}).click();
  await page.locator('.create-deck > summary').click();
  const deckView=async()=>{const tab=page.getByRole('button',{name:/^Deck ·/});if(await tab.isVisible())await tab.click();};
  const actions=async()=>{const details=page.locator('.deck-details');if(!await details.evaluate(el=>(el as HTMLDetailsElement).open))await details.locator(':scope > summary').click();};
  const lineControls=async()=>{await deckView();const details=page.locator('.line-controls').first();if(!await details.evaluate(el=>(el as HTMLDetailsElement).open))await details.locator(':scope > summary').click();};
  const create=page.locator('details').filter({has:page.getByRole('heading',{name:'Create a deck',exact:true})}).first();
  await create.getByLabel('Deck name',{exact:true}).fill('Physical A');await create.getByRole('combobox',{name:'Mode',exact:true}).selectOption('physical');await create.getByRole('button',{name:'Create deck',exact:true}).click();
  await deckView();await expect(page.getByRole('heading',{name:'Physical A',exact:true})).toBeVisible();await actions();
  const add=page.locator('section').filter({has:page.getByRole('heading',{name:'Add or update a card line',exact:true})}).last();
  await add.getByRole('combobox',{name:'Card identity',exact:true}).selectOption(card);await add.getByRole('combobox',{name:'Planned printing',exact:true}).selectOption(first);await add.getByLabel('Required quantity',{exact:true}).fill('2');await add.getByRole('button',{name:'Save card line',exact:true}).click();
  const line=page.getByTestId('deck-line');await expect(line).toHaveCount(1);await lineControls();await line.getByLabel('Allocation quantity',{exact:true}).fill('2');await line.getByRole('button',{name:'Save allocation',exact:true}).click();
  await expect(line).toContainText('Required 2 · Allocated 2');await expect(page.getByText('Legality',{exact:true}).first()).toBeVisible();
  // Reserved copies cannot be removed; error identifies the affected deck.
  await page.getByRole('link',{name:'Collection',exact:true}).click();await firstRow().getByRole('spinbutton').fill('1');await firstRow().getByRole('button',{name:'Save quantity',exact:true}).click();await expect(page.getByRole('main').getByRole('alert')).toContainText('Physical A');
  await page.reload();await expect(firstRow().getByRole('spinbutton')).toHaveValue('3');
  await page.getByRole('link',{name:'Decks',exact:true}).click();await actions();await page.getByRole('button',{name:'Duplicate as theorycraft',exact:true}).click();await deckView();await expect(page.getByRole('heading',{name:'Physical A copy',exact:true})).toBeVisible();await lineControls();await expect(page.getByTestId('deck-line')).toContainText('Allocated 0');
  await page.getByRole('button',{name:'Physical A · physical',exact:true}).click();await actions();await page.getByRole('button',{name:'Switch to theorycraft & release reservations',exact:true}).click();await lineControls();await expect(page.getByTestId('deck-line')).toContainText('Allocated 0');
  await page.getByRole('button',{name:'Export text list',exact:true}).click();
  await expect(page.getByLabel('Deck list',{exact:true})).toContainText('Riftbound Hub TSV v1');
  await page.getByRole('button',{name:'Preview import',exact:true}).click();
  await expect(page.getByRole('heading',{name:'1 resolved lines',exact:true})).toBeVisible();
  await page.getByLabel('Imported deck name',{exact:true}).fill('Imported round trip');
  await page.getByRole('button',{name:'Import as theorycraft',exact:true}).click();
  await deckView();await expect(page.getByRole('heading',{name:'Imported round trip',exact:true})).toBeVisible();await lineControls();
  await expect(page.getByTestId('deck-line')).toContainText('Allocated 0');
  // The available inventory is restored, and masterset ownership stays fixed.
  const restored=await request.post(`${api}/rest/v1/rpc/workspace_snapshot`,{headers:{apikey:key!,Authorization:`Bearer ${session.access_token}`},data:{}});
  const snapshot=await restored.json();expect(snapshot.inventory.find((i:{printing_id:string})=>i.printing_id===first).reserved).toBe(0);
  expect(snapshot.inventory.find((i:{printing_id:string})=>i.printing_id===first).owned).toBe(3);
  await page.getByRole('link',{name:'Masterset',exact:true}).click();await expect(page.getByRole('heading',{name:'Masterset progress',exact:true})).toBeVisible();await expect(page.getByText(/entries have pending targets/)).toBeVisible();
  await page.getByRole('combobox',{name:'Product checklist',exact:true}).selectOption('f4000000-0000-4000-8000-000000000001');await expect(page.getByTestId('collection-card')).toHaveCount(2);
  await page.getByRole('link',{name:'TEST Card 01',exact:true}).click();await expect(page.getByRole('heading',{name:'Printed text',exact:true})).toBeVisible();await expect(page.getByText('No image available',{exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Dashboard',exact:true}).click();await expect(page.getByRole('link',{name:'Owned copies 3',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`/tmp/riftbound-p123-${info.project.name}.png`,fullPage:true});
  // Changing browser accounts must not reuse another user's private route data.
  await page.getByRole('link',{name:'Settings',exact:true}).click();
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await page.getByLabel('Email',{exact:true}).fill(`other-${email}`);await page.getByLabel('Password',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByText(`Signed in as other-${email}`)).toBeVisible();
  await page.getByRole('link',{name:'Collection',exact:true}).click();await expect(firstRow().getByRole('spinbutton')).toHaveValue('0');
  // Illegal fractions fail through real RPC even without frontend validation.
  const invalid=await request.post(`${api}/rest/v1/rpc/mutate_workspace`,{headers:{apikey:key!,Authorization:`Bearer ${session.access_token}`},data:{action:'set_owned',payload:{printing_id:second,quantity:1.5}}});expect(invalid.ok()).toBe(false);
});
