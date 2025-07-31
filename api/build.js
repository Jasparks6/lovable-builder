import chromium from 'chrome-aws-lambda';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const { companyName, siteUrl, screenshotUploadPath } = req.body;

  if (!companyName || !siteUrl || !screenshotUploadPath) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Fetch website_data from Supabase leads table
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('website_data')
    .eq('company_name', companyName)
    .single();

  if (leadError || !lead || !lead.website_data) {
    return res.status(404).json({ error: 'Lead not found or missing website_data' });
  }

  const websiteCopy = lead.website_data;

  const screenshotUrl = `https://zhsugflqgcloittbpiye.supabasecdn.com/storage/v1/object/public/screenshots/${screenshotUploadPath}/desktop.png`;

  const prompt = `
You are creating a brand new, modern, SEO-optimized, mobile-friendly, lead-generating website for a local business using their existing branding and copy as a base.

🔗 BRAND & CONTENT SOURCE
Use this existing website for brand colors, logo, and visual inspiration:
${siteUrl}

Use this copy as the content source for the new site (optimize it for clarity and SEO, but maintain original taglines, testimonials, and contact info):

${websiteCopy}

🧠 OBJECTIVES
Rebuild the site to look 10x more modern, sleek, and professional

Ensure the site is:

SEO-optimized (especially homepage headlines and meta structure)

Mobile-responsive

High-converting (strong CTAs, trust elements, and optimized layout)

Built specifically to generate and qualify leads with an in-depth AI powered quote calculator.

🖥️ PAGE STRUCTURE & DESIGN ELEMENTS
1. Header & Navigation
Floating transparent/blurred navigation bar (50% page width)
Use high-quality, modern fonts (e.g., DM Sans or similar)
Navigation items: Home | About | Services | Reviews | FAQ | Contact

2. Hero Section
Strong, benefit-driven headline (SEO optimized)
Subheadline that clearly explains what they do and for who
Clear CTA: “See Pricing” or “Request a Quote”
High-quality background image or local business photo (if available)

3. Services Section
Highlight 2–6 core services with icons or illustrations
Each service should have a short, benefit-driven blurb

4. Reviews Section
Use the Google “G” logo to represent Google reviews
Pull in review snippets or placeholder 5-star reviews if none are available

5. About Section
Use the “About Us” copy from the original site
Include a friendly photo or illustration and a quote from the founder if possible

6. FAQ Section
Add a toggle-style FAQ area with common questions (add filler if none provided)

7. Contact Form
Include fields: Name, Email, Phone, Message
Place the form in a clean, accessible section with a visible CTA

8. Footer
Include contact info, business hours, and social icons (if available)

🔁 FLOATING CTA BAR (BOTTOM OF SCREEN)
Add a floating sticky bar at the bottom of the page:

Text:
“Love This Website? Buy It Now – Pay What You Want”

Button:
“Buy Now” → Forward to this link:
https://www.vynyrd.com/checkout?name=${companyName}&business_name=${companyName}&image_url=${encodeURIComponent(screenshotUrl)}

✅ ADDITIONAL NOTES
Use subtle animations for smooth transitions (e.g., fade-ins, hover effects)
Prioritize performance: fast loading, optimized images, mobile first
Be creative, clean, and modern—but keep it simple and accessible
`;

  const browser = await chromium.puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath,
    headless: chromium.headless,
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    await page.setCookie({
      name: 'session',
      value: process.env.LOVABLE_SESSION_COOKIE,
      domain: '.lovable.dev',
      path: '/',
      httpOnly: true,
      secure: true,
    });

    await page.goto('https://app.lovable.dev/new', { waitUntil: 'networkidle2' });
    await page.waitForSelector('textarea');
    await page.type('textarea', prompt);

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('button:has-text("Generate Website")'),
    ]);

    await page.waitForSelector('iframe');
    const iframe = await page.$('iframe');
    const frame = await iframe.contentFrame();

    await frame.setViewport({ width: 1280, height: 800 });
    const desktopScreenshot = await frame.screenshot({ fullPage: true });

    await frame.setViewport({ width: 390, height: 844, isMobile: true });
    const mobileScreenshot = await frame.screenshot({ fullPage: true });

    const basePath = `${screenshotUploadPath}/${companyName}`;
    const upload = async (name, buffer) => {
      const { error } = await supabase.storage
        .from('screenshots')
        .upload(`${basePath}/${name}`, buffer, {
          contentType: 'image/png',
          upsert: true,
        });
      if (error) throw error;
    };

    await upload('desktop.png', desktopScreenshot);
    await upload('mobile.png', mobileScreenshot);

    await browser.close();
    return res.status(200).json({ success: true, screenshotUrl });
  } catch (err) {
    await browser.close();
    console.error('❌ Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
