const puppeteer = require('puppeteer');

(async () => {
    try {
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();

        page.on('console', msg => console.log('BROWSER_CONSOLE:', msg.text()));
        page.on('pageerror', error => console.log('BROWSER_ERROR:', error.message));

        // Use domcontentloaded instead of networkidle0
        await page.goto('http://localhost:4200', { waitUntil: 'domcontentloaded', timeout: 10000 });

        // wait for 2 seconds to let angular initialize
        await new Promise(r => setTimeout(r, 2000));

        console.log('Page loaded successfully');
        await browser.close();
    } catch (e) {
        console.error('SCRIPT_ERROR:', e.message);
        process.exit(1);
    }
})();
