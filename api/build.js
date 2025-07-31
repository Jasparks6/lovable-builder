import puppeteer from 'puppeteer';

export default async function handler(req, res) {
  const { websiteUrl } = req.body;

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.goto(websiteUrl, { waitUntil: 'networkidle0' });

  const screenshotBuffer = await page.screenshot();

  await browser.close();

  res.setHeader('Content-Type', 'image/png');
  res.status(200).send(screenshotBuffer);
}
