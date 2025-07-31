import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  const { siteUrl, companyName, screenshotUploadPath } = req.body;

  if (!siteUrl || !companyName || !screenshotUploadPath) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const desktopPath = `screenshots/${screenshotUploadPath}-desktop.jpg`;
  const mobilePath = `screenshots/${screenshotUploadPath}-mobile.jpg`;

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();

    // 🌐 Load Lovable and build the site
    await page.goto('https://app.lovable.dev', { waitUntil: 'networkidle2' });

    // ✏️ Fill in Lovable prompt
    await page.waitForSelector('textarea');
    await page.type('textarea', `Rebuild a modern, mobile-friendly, SEO-optimized website for ${companyName}. Their existing site is ${siteUrl}. Use all relevant info from that site.`);

    // 🛠 Click "Generate"
    await page.click('button:has-text("Generate")');

    // ⏳ Wait for the preview to appear (adjust if needed)
    await page.waitForSelector('iframe', { timeout: 60000 });

    // 📸 Take desktop screenshot
    const frameHandle = await page.$('iframe');
    const frame = await frameHandle.contentFrame();
    await frame.setViewport({ width: 1280, height: 800 });
    const desktopBuffer = await frame.screenshot({ type: 'jpeg' });

    // 📱 Take mobile screenshot
    await frame.setViewport({ width: 390, height: 844, isMobile: true });
    const mobileBuffer = await frame.screenshot({ type: 'jpeg' });

    // ☁️ Upload to Supabase
    await supabase.storage.from('screenshots').upload(desktopPath, desktopBuffer, {
      contentType: 'image/jpeg',
      upsert: true,
    });

    await supabase.storage.from('screenshots').upload(mobilePath, mobileBuffer, {
      contentType: 'image/jpeg',
      upsert: true,
    });

    const baseUrl = `${process.env.SUPABASE_URL.replace('.supabase.co', '.supabasecdn.com')}/storage/v1/object/public/screenshots`;

    res.status(200).json({
      desktopScreenshotUrl: `${baseUrl}/${screenshotUploadPath}-desktop.jpg`,
      mobileScreenshotUrl: `${baseUrl}/${screenshotUploadPath}-mobile.jpg`,
    });
  } catch (err) {
    console.error('Error building site:', err);
    res.status(500).json({ error: err.message });
  } finally {
    await browser.close();
  }
}
