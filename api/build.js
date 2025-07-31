import chromium from 'chrome-aws-lambda';
import puppeteer from 'puppeteer-core';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  try {
    const { companyName, siteUrl, screenshotUploadPath } = req.body;

    const executablePath = await chromium.executablePath;
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.goto('https://lovable.dev', { waitUntil: 'networkidle0' });

    // Fill in the form
    await page.waitForSelector('textarea');
    await page.type('textarea', `Rebuild modern site for: ${companyName} — ${siteUrl}`);
    await page.click('button:has-text("Generate")');

    // Wait for site to build (approx 30s)
    await page.waitForSelector('iframe', { timeout: 60000 });

    // Wait for iframe to fully load
    const iframe = await page.$('iframe');
    const frame = await iframe.contentFrame();
    await frame.waitForSelector('body', { timeout: 30000 });

    // Screenshot — desktop
    const screenshotBuffer = await frame.screenshot({ type: 'png', fullPage: true });

    // Upload to Supabase
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    const { error } = await supabase.storage
      .from('website-screenshots')
      .upload(`${screenshotUploadPath}-desktop.png`, screenshotBuffer, {
        contentType: 'image/png',
        upsert: true,
      });

    await browser.close();

    if (error) {
      console.error('Supabase upload error:', error);
      return res.status(500).json({ error: 'Upload failed' });
    }

    res.status(200).json({ message: 'Screenshot uploaded successfully' });
  } catch (err) {
    console.error('Build error:', err);
    res.status(500).json({ error: err.message || 'Something went wrong' });
  }
}
