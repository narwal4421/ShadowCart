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

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  const { email, item } = body || {};
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
        name: process.env.FROM_NAME || 'ShadowCart',
        email: fromEmail
      },
      to: [
        { email: normalizedEmail }
      ],
      subject: `Your cooling-off period for "${normalizedItem.name}" just ended`,
      htmlContent: `<div style="font-family: Arial, sans-serif; font-size: 15px; color: #222; max-width: 480px; line-height: 1.6;">
<p>Hi,</p>
<p>You added <strong>${safeItemName}</strong> (${safeItemPrice}) to your ShadowCart 48 hours ago.</p>
<p>Your cooling-off period has ended. Do you still want it?</p>
<p><a href="${normalizedItem.productUrl}" style="color: #6c63ff;">${normalizedItem.productUrl}</a></p>
<p>If you've changed your mind, you can open ShadowCart and drop it from your list.</p>
<p style="margin-top: 24px; color: #555;">— ShadowCart</p>
</div>`,
      textContent: `Hi,\n\nYou added "${normalizedItem.name}" (${normalizedItem.price}) to your ShadowCart 48 hours ago.\n\nYour cooling-off period has ended. Do you still want it?\n\n${normalizedItem.productUrl}\n\nIf you've changed your mind, open ShadowCart and drop it from your list.\n\n— ShadowCart`
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
