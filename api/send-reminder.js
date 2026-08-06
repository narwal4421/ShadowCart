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
      subject: `Reminder: "${normalizedItem.name}" is ready for your decision`,
      htmlContent: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:4px;border:1px solid #e0e0e0;overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="padding:24px 32px 20px;border-bottom:1px solid #eeeeee;">
            <span style="font-size:16px;font-weight:700;color:#111111;letter-spacing:-0.3px;">👻 ShadowCart</span>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:28px 32px 8px;">
            <p style="margin:0 0 16px;font-size:15px;color:#333333;line-height:1.6;">Hi,</p>
            <p style="margin:0 0 20px;font-size:15px;color:#333333;line-height:1.6;">
              Your 48-hour cooling-off period for the item below has ended. Time to make a call — do you still want it, or are you ready to let it go?
            </p>
          </td>
        </tr>

        <!-- Item card -->
        <tr>
          <td style="padding:0 32px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:1px solid #e8e8e8;border-radius:4px;">
              <tr>
                <td style="padding:16px 20px;">
                  <p style="margin:0 0 4px;font-size:13px;color:#888888;text-transform:uppercase;letter-spacing:0.5px;">Item saved</p>
                  <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#111111;">${safeItemName}</p>
                  <p style="margin:0 0 12px;font-size:14px;color:#555555;">Price: <strong>${safeItemPrice}</strong></p>
                  <a href="${normalizedItem.productUrl}" style="font-size:14px;color:#6c63ff;text-decoration:none;font-weight:500;">View item →</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- CTA text -->
        <tr>
          <td style="padding:0 32px 28px;">
            <p style="margin:0 0 8px;font-size:14px;color:#555555;line-height:1.6;">
              If you still want it, head to the link above and complete your purchase. If not, open ShadowCart and drop it — your wallet will thank you.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;border-top:1px solid #eeeeee;background:#fafafa;">
            <p style="margin:0;font-size:12px;color:#999999;line-height:1.6;">
              This is an automated reminder from ShadowCart, the mindful shopping extension you installed. You're receiving this because you enabled email reminders for this item.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
      textContent: `Hi,\n\nYour 48-hour cooling-off period for "${normalizedItem.name}" has ended.\n\nItem: ${normalizedItem.name}\nPrice: ${normalizedItem.price}\nLink: ${normalizedItem.productUrl}\n\nIf you still want it, head to the link above. If not, open ShadowCart and drop it.\n\n— ShadowCart`
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
