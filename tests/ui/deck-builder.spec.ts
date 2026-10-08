import { test, expect, type Page } from '@playwright/test';
const api=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const printing='f3000000-0000-4000-8000-000000000001';
const card='f2000000-0000-4000-8000-000000000001';
async function deckView(page:Page) {const tab=page.getByRole('button',{name:/^Deck ·/});if(await tab.isVisible())await tab.click();}
async function libraryView(page:Page) {const tab=page.getByRole('button',{name:'Library',exact:true});if(await tab.isVisible())await tab.click();}
async function drag(page:Page,source:ReturnType<Page['locator']>,target:ReturnType<Page['locator']>) {
  await source.scrollIntoViewIfNeeded();const from=await source.boundingBox();expect(from).toBeTruthy();
  await page.mouse.move(from!.x+from!.width/2,from!.y+from!.height/2);await page.mouse.down();await page.mouse.move(from!.x+from!.width/2+12,from!.y+from!.height/2,{steps:4});
  await target.scrollIntoViewIfNeeded();const to=await target.boundingBox();expect(to).toBeTruthy();await page.mouse.move(to!.x+to!.width/2,to!.y+to!.height/2,{steps:15});await page.mouse.up();
}
test('Deck Builder v2: real mutations, pointer/keyboard/tap alternatives, filters, conflicts and responsive screenshots',async({page,request},info)=>{
  test.skip(!process.env.RIFTBOUND_LOCAL_TEST,'Requires the disposable real GoTrue/PostgREST/PostgreSQL harness');
  test.setTimeout(180000);
  const email=`builder-${info.project.name}-${Date.now()}@example.test`,password='Local-test-only-Password-123!';
  await page.goto('/settings');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Create account',exact:true}).click();await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
  const login=await request.post(`${api}/auth/v1/token?grant_type=password`,{headers:{apikey:key!},data:{email,password}});expect(login.ok()).toBe(true);const session=await login.json();
  const rpc=async(action:string,payload:object)=>request.post(`${api}/rest/v1/rpc/mutate_workspace`,{headers:{apikey:key!,Authorization:`Bearer ${session.access_token}`},data:{action,payload}});
  const created=await rpc('create_deck',{name:'TEST ONLY · Builder v2',mode:'theorycraft'});expect(created.ok()).toBe(true);const deckId=await created.json();
  await page.goto(`/decks?deck=${deckId}`);await page.getByLabel('Search cards',{exact:true}).fill('OGN 001');
  await expect(page.getByTestId('library-card')).toHaveCount(1);
  const libraryCard=page.getByTestId('library-card');const add=libraryCard.getByRole('button',{name:/^Add TEST Card 01/});
  if(info.project.name==='desktop') {
    await drag(page,libraryCard.getByRole('button',{name:/^Drag TEST Card 01/}),page.getByTestId('deck-section-main'));
  } else {await add.tap();}
  await expect(page.getByRole('status').filter({hasText:'Added one TEST Card 01'})).toBeVisible();await deckView(page);
  const line=page.getByTestId('builder-deck-card');await expect(line).toHaveCount(1);await expect(line.getByLabel('TEST Card 01 quantity')).toHaveText('1');
  await line.getByRole('button',{name:'Increase TEST Card 01',exact:true}).click();await expect(line.getByLabel('TEST Card 01 quantity')).toHaveText('2');await line.getByRole('button',{name:'Decrease TEST Card 01',exact:true}).click();await expect(line.getByLabel('TEST Card 01 quantity')).toHaveText('1');
  await expect(page.getByText('No inventory required. This deck never reserves physical copies.')).toBeVisible();
  await libraryView(page);
  if(info.project.name==='desktop') {
    await drag(page,libraryCard.getByRole('button',{name:/^Drag TEST Card 01/}),page.getByTestId('deck-section-legend'));
    await expect(page.getByRole('alert').filter({hasText:'Invalid destination'})).toBeVisible();await expect(line.getByLabel('TEST Card 01 quantity')).toHaveText('1');
    const handle=libraryCard.getByRole('button',{name:/^Drag TEST Card 01/});await handle.focus();await page.keyboard.press('Space');await page.keyboard.press('ArrowDown');await page.keyboard.press('Space');await expect(line.getByLabel('TEST Card 01 quantity')).toHaveText('2');
  }
  // Server action failure: cancel the outgoing POST before it reaches the server.
  await page.route('**/decks*',async route=>{if(route.request().method()==='POST')await route.abort('failed');else await route.continue();});
  await add.click();await expect(page.getByRole('alert').filter({hasText:/not confirmed|unavailable/}).first()).toBeVisible();await page.unroute('**/decks*');
  await page.reload();await deckView(page);await expect(line.getByLabel('TEST Card 01 quantity')).toHaveText(info.project.name==='desktop'?'2':'1');
  await libraryView(page);await page.getByLabel('Search cards',{exact:true}).fill('OGN 001');await page.getByLabel('Owned only',{exact:true}).check();await expect(page.getByTestId('library-card')).toHaveCount(0);await page.getByLabel('Owned only',{exact:true}).uncheck();
  await page.locator('.library-filter-details > summary').click();await page.getByLabel('Rarity',{exact:true}).selectOption('Epic');await expect(page.getByTestId('library-card')).toHaveCount(0);await page.getByRole('button',{name:'Reset filters',exact:true}).click();
  // Reserve the sole physical copy in another deck. UI cannot manufacture it.
  expect((await rpc('set_owned',{printing_id:printing,quantity:1})).ok()).toBe(true);
  const rival=await rpc('create_deck',{name:'Reserved elsewhere',mode:'physical'});const rivalId=await rival.json();
  const rivalLine=await rpc('set_line',{deck_id:rivalId,card_id:card,section:'main',quantity:1,printing_id:printing});const rivalLineId=await rivalLine.json();
  const snapshot=await request.post(`${api}/rest/v1/rpc/workspace_snapshot`,{headers:{apikey:key!,Authorization:`Bearer ${session.access_token}`},data:{}});const state=await snapshot.json();const entry=state.inventory.find((i:{printing_id:string})=>i.printing_id===printing).id;
  expect((await rpc('allocate',{deck_card_id:rivalLineId,collection_entry_id:entry,quantity:1})).ok()).toBe(true);
  expect((await rpc('set_mode',{deck_id:deckId,mode:'physical'})).ok()).toBe(true);await page.reload();await libraryView(page);await page.getByLabel('Search cards',{exact:true}).fill('OGN 001');await expect(libraryCard).toContainText('Available 0');await page.getByLabel('Available only',{exact:true}).check();await expect(page.getByTestId('library-card')).toHaveCount(0);await page.getByLabel('Available only',{exact:true}).uncheck();
  await deckView(page);await line.locator('.line-controls > summary').click();await line.getByLabel('Allocation quantity',{exact:true}).fill('1');await line.getByRole('button',{name:'Save allocation',exact:true}).click();await expect(page.getByRole('main').getByRole('alert').filter({hasText:'Insufficient available copies'}).first()).toBeVisible();await expect(line).toContainText('Allocated 0');
  const confirmed=await request.post(`${api}/rest/v1/rpc/workspace_snapshot`,{headers:{apikey:key!,Authorization:`Bearer ${session.access_token}`},data:{}});const final=await confirmed.json();expect(final.inventory.find((i:{printing_id:string})=>i.printing_id===printing).owned).toBe(1);expect(final.inventory.find((i:{printing_id:string})=>i.printing_id===printing).reserved).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await line.locator('.line-controls > summary').click();
  if(info.project.name==='desktop') {
    const left=await page.locator('.builder-library').boundingBox(),right=await page.locator('.builder-editor').boundingBox();expect(left!.x+left!.width).toBeLessThan(right!.x);await expect(page.getByRole('heading',{name:'Card library',exact:false})).toBeVisible();
    await page.screenshot({path:info.outputPath('deck-builder-desktop.png'),fullPage:true});
  } else {
    await page.screenshot({path:info.outputPath('deck-builder-mobile-deck.png'),fullPage:true});await libraryView(page);await page.screenshot({path:info.outputPath('deck-builder-mobile-library.png'),fullPage:true});
    // Real touch sensor in the narrow split layout; mobile uses tap across views.
    await page.setViewportSize({width:900,height:1100});await page.getByLabel('Search cards',{exact:true}).fill('OGN 001');const handle=libraryCard.getByRole('button',{name:/^Drag TEST Card 01/});const target=page.getByTestId('deck-section-main');await target.scrollIntoViewIfNeeded();await handle.scrollIntoViewIfNeeded();const from=await handle.boundingBox();const to=await target.boundingBox();expect(from).toBeTruthy();expect(to).toBeTruthy();
    {const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:from!.x+20,y:from!.y+20}]});await page.waitForTimeout(250);await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:to!.x+to!.width/2,y:to!.y+to!.height/2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(line.getByLabel('TEST Card 01 quantity')).toHaveText('2');await cdp.detach();}
  }
});
