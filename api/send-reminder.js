const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const rateLimitBuckets = new Map();
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  const rawIp = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  return rawIp?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
}

function isRateLimited(ip) {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(ip);

  if (!bucket || now - bucket.startedAt >= RATE_LIMIT_WINDOW_MS) {
    rateLimitBuckets.set(ip, { startedAt: now, count: 1 });
    return false;
  }

  bucket.count += 1;
  for (const [key, value] of rateLimitBuckets) {
    if (now - value.startedAt >= RATE_LIMIT_WINDOW_MS) {
      rateLimitBuckets.delete(key);
    }
  }
  return bucket.count > RATE_LIMIT_MAX_REQUESTS;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeItem(rawItem) {
  if (!rawItem || typeof rawItem !== 'object') return null;

  const name = String(rawItem.name || '').trim();
  const price = String(rawItem.price || '').trim();
  const productUrl = String(rawItem.productUrl || '').trim();

  if (!name || !price || !productUrl) return null;

  try {
    const parsedUrl = new URL(productUrl);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) return null;
  } catch {
    return null;
  }

  return { name, price, productUrl };
}

export default async function handler(req, res) {
  // Setup CORS for Vercel
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-ShadowCart-Secret, X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const reminderSecret = process.env.REMINDER_SECRET;
  if (!reminderSecret) {
    return res.status(500).json({ error: 'Reminder secret is not configured' });
  }

  if (req.headers['x-shadowcart-secret'] !== reminderSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const clientIp = getClientIp(req);
  if (isRateLimited(clientIp)) {
    return res.status(429).json({ error: 'Too many reminder requests. Please try again later.' });
  }

  const { email, item } = req.body || {};
  const normalizedEmail = String(email || '').trim();
  const normalizedItem = normalizeItem(item);

  if (!normalizedEmail || !normalizedItem) {
    return res.status(400).json({ error: 'Missing email or item details' });
  }

  if (!EMAIL_REGEX.test(normalizedEmail)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  const safeItemName = escapeHtml(normalizedItem.name);
  const safeItemPrice = escapeHtml(normalizedItem.price);
  const safeProductUrl = escapeHtml(normalizedItem.productUrl);

  try {
    const fromEmail = process.env.FROM_EMAIL || process.env.SENDER_EMAIL;
    if (!fromEmail) {
      console.error('Email Send Error: FROM_EMAIL environment variable is not set');
      return res.status(500).json({ error: 'Sender email (FROM_EMAIL) is not configured on server' });
    }

    const emailData = {
      sender: {
        name: process.env.FROM_NAME || 'ShadowCart Ghost',
        email: fromEmail
      },
      to: [
        { email: normalizedEmail }
      ],
      subject: `Thinking about ${normalizedItem.name}? \uD83D\uDC7B`,
      htmlContent: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; background: #ffffff; padding: 30px; border-radius: 12px; color: #333; border: 1px solid #eaeaea;">
          <p style="font-size: 16px; margin-top: 0;">Hey,</p>
          <p style="font-size: 16px; line-height: 1.5;">You added some items to your cart earlier and they're still waiting for you.</p>
          <p style="font-size: 16px; line-height: 1.5;">If you're still interested, you can complete your purchase anytime.</p>
          
          <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 25px 0; text-align: center;">
            <h3 style="color: #333; margin: 0 0 10px 0;">${safeItemName}</h3>
            <p style="color: #6c63ff; font-weight: bold; font-size: 18px; margin: 0;">${safeItemPrice}</p>
          </div>

          <a href="${safeProductUrl}" style="display: block; width: 100%; padding: 15px 0; background: #6c63ff; color: #fff; text-align: center; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
            View My Cart
          </a>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eaeaea; font-size: 11px; color: #999; text-align: center;">
            <p style="margin: 0 0 5px 0;">Sent with \u2764\ufe0f by ShadowCart Ghost</p>
            <p style="margin: 0;">123 Ghost Street, Digital City, 00000</p>
            <p style="margin: 10px 0 0 0;"><a href="#" style="color: #999; text-decoration: underline;">Unsubscribe from these alerts</a></p>
          </div>
        </div>
      `,
      textContent: `Hey,\n\nYou added some items to your cart earlier and they're still waiting for you.\n\nIf you're still interested, you can complete your purchase anytime.\n\nView My Cart: ${normalizedItem.productUrl}\n\nThanks for shopping with us!`
    };

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Brevo API error: ${errorText}`);
    }
    
    const data = await response.json();

    console.info(`Email successfully sent for item ${normalizedItem.name}`);
    res.status(200).json({ success: true, messageId: data.messageId });
  } catch (err) {
    console.error('Email Send Error:', err);
    res.status(500).json({ 
      error: 'Failed to send email via Brevo',
      details: err.message
    });
  }
}
