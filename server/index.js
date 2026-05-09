require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

let sendpulseToken = null;
let tokenExpiresAt = 0;

// Authenticate with SendPulse
async function getSendPulseToken() {
  if (sendpulseToken && Date.now() < tokenExpiresAt) {
    return sendpulseToken;
  }

  try {
    const response = await axios.post('https://api.sendpulse.com/oauth/access_token', {
      grant_type: 'client_credentials',
      client_id: process.env.SENDPULSE_CLIENT_ID,
      client_secret: process.env.SENDPULSE_CLIENT_SECRET
    });
    
    sendpulseToken = response.data.access_token;
    // Token usually expires in 3600 seconds. Subtract 60 seconds for buffer.
    tokenExpiresAt = Date.now() + (response.data.expires_in - 60) * 1000;
    return sendpulseToken;
  } catch (err) {
    console.error('SendPulse Auth Error:', err.response?.data || err.message);
    throw new Error('Failed to authenticate with SendPulse');
  }
}

app.post('/api/send-reminder', async (req, res) => {
  const { email, item } = req.body;

  if (!email || !item) {
    return res.status(400).json({ error: 'Missing email or item details' });
  }

  try {
    const token = await getSendPulseToken();

    const emailData = {
      email: {
        html: `
          <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; background: #ffffff; padding: 30px; border-radius: 12px; color: #333; border: 1px solid #eaeaea;">
            <p style="font-size: 16px; margin-top: 0;">Hey,</p>
            <p style="font-size: 16px; line-height: 1.5;">You added some items to your cart earlier and they're still waiting for you.</p>
            <p style="font-size: 16px; line-height: 1.5;">If you're still interested, you can complete your purchase anytime.</p>
            
            <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 25px 0; text-align: center;">
              <h3 style="color: #333; margin: 0 0 10px 0;">${item.name}</h3>
              <p style="color: #6c63ff; font-weight: bold; font-size: 18px; margin: 0;">${item.price}</p>
            </div>

            <a href="${item.productUrl}" style="display: block; width: 100%; padding: 15px 0; background: #6c63ff; color: #fff; text-align: center; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
              View My Cart
            </a>
            
            <p style="font-size: 16px; margin-top: 25px;">Thanks for shopping with us!</p>
          </div>
        `,
        text: `Hey,\n\nYou added some items to your cart earlier and they're still waiting for you.\n\nIf you're still interested, you can complete your purchase anytime.\n\nView My Cart: ${item.productUrl}\n\nThanks for shopping with us!`,
        subject: `Don’t forget your cart items 🛒`,
        from: {
          name: process.env.FROM_NAME || 'ShadowCart Ghost',
          email: process.env.FROM_EMAIL
        },
        to: [
          {
            email: email
          }
        ]
      }
    };

    const response = await axios.post('https://api.sendpulse.com/smtp/emails', emailData, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    console.log(`Email successfully sent to ${email} for item ${item.name}`);
    res.json({ success: true, result: response.data });
  } catch (err) {
    console.error('Email Send Error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to send email via SendPulse' });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`\n👻 ShadowCart Mini-Backend running on http://localhost:${PORT}`);
  console.log(`Waiting for reminders to send...`);
});
