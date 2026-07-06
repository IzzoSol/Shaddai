const puppeteer = require('puppeteer');

(async () => {
  try {
    console.log('[TEST] Launching browser...');
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    
    // Capture console
    page.on('console', msg => {
      const msgText = msg.text();
      if (msgText.includes('[')) console.log('[BROWSER]' + msgText);
    });
    
    console.log('[TEST] Loading game page...');
    await page.goto('http://localhost:3000/games/gridiron-prospect.html', { waitUntil: 'networkidle2', timeout: 10000 });
    
    console.log('[TEST] Waiting for UI to render...');
    await page.waitForSelector('#ui-layer', { timeout: 5000 });
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Get button text
    const newGameBtn = await page.$eval('#btn-new-game', el => el.textContent);
    const loadGameBtn = await page.$eval('#btn-load-game', el => el.textContent);
    const title = await page.$eval('h1', el => el.textContent);
    const subtitle = await page.$eval('p', el => el.textContent);
    
    console.log('\n=== UI VERIFICATION ===');
    console.log('Title: "' + title + '"');
    console.log('Subtitle: "' + subtitle + '"');
    console.log('NEW GAME button: "' + newGameBtn + '"');
    console.log('LOAD GAME button: "' + loadGameBtn + '"');
    
    // Verify styles
    const newGameStyle = await page.$eval('#btn-new-game', el => window.getComputedStyle(el).background);
    const loadGameStyle = await page.$eval('#btn-load-game', el => window.getComputedStyle(el).borderColor);
    console.log('\nNEW GAME background contains gradient: ' + (newGameStyle.includes('rgb') ? 'YES' : newGameStyle));
    console.log('LOAD GAME border is orange: ' + (loadGameStyle.includes('255, 170') ? 'YES' : loadGameStyle));
    
    // Test NEW GAME click
    console.log('\n[TEST] Clicking NEW GAME button...');
    await page.click('#btn-new-game');
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check game state
    const currentScreen = await page.evaluate(() => window.gameState.currentScreen);
    console.log('Current screen after click: ' + currentScreen);
    
    console.log('\n=== TEST PASSED ===');
    
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error('[ERROR]', err.message);
    process.exit(1);
  }
})();
