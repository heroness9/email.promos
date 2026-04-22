/**
 * PerfectGrass — Notification Server
 * ─────────────────────────────────────────────────────────────
 * Handles subscriber signups and sends notifications via:
 *   • Email  → Nodemailer (Gmail SMTP or any provider)
 *   • SMS    → Twilio
 *
 * SETUP:
 *   1. npm install
 *   2. Fill in your credentials in the CONFIG section below
 *   3. node server.js
 *
 * TO SEND A NOTIFICATION TO ALL SUBSCRIBERS:
 *   POST http://localhost:3000/notify
 *   Body: { "subject": "New Deal!", "message": "20% off this week!" }
 *   (Use curl, Postman, or the notify.js helper script)
 * ─────────────────────────────────────────────────────────────
 */

const express    = require('express');
const cors       = require('cors');
const fs         = require('fs');
const nodemailer = require('nodemailer');
const twilio     = require('twilio');

const app = express();
app.use(cors());
app.use(express.json());

// ═══════════════════════════════════════════════════════════════
// CONFIG — fill these in before running
// ═══════════════════════════════════════════════════════════════
const CONFIG = {
  // ── EMAIL (Gmail example) ──────────────────────────────────
  // For Gmail: enable "App Passwords" in your Google account,
  // then paste the 16-character app password below (not your real password).
  email: {
    from:     'your@gmail.com',      // sender address
    user:     'your@gmail.com',      // your Gmail address
    password: 'xxxx xxxx xxxx xxxx', // Gmail App Password
  },

  // ── SMS (Twilio) ───────────────────────────────────────────
  // Sign up free at twilio.com, get your credentials from the Console.
  twilio: {
    accountSid: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    authToken:  'your_auth_token',
    fromNumber: '+1234567890', // your Twilio phone number
  },

  // ── SERVER ─────────────────────────────────────────────────
  port: 3000,

  // ── NOTIFY SECRET ──────────────────────────────────────────
  // A simple password to protect the /notify endpoint so only
  // you can trigger notifications.
  notifySecret: 'change-this-to-something-secret',
};
// ═══════════════════════════════════════════════════════════════

// ── Storage (flat JSON file — simple and easy to inspect) ──
const DB_FILE = './subscribers.json';

function loadSubscribers() {
  if (!fs.existsSync(DB_FILE)) return [];
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveSubscribers(subs) {
  fs.writeFileSync(DB_FILE, JSON.stringify(subs, null, 2));
}

// ── Email transporter ──
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: CONFIG.email.user,
    pass: CONFIG.email.password,
  },
});

// ── Twilio client ──
const twilioClient = twilio(CONFIG.twilio.accountSid, CONFIG.twilio.authToken);

// ─────────────────────────────────────────────────────────────
// POST /subscribe
// Body: { email?: string, phone?: string }
// ─────────────────────────────────────────────────────────────
app.post('/subscribe', (req, res) => {
  const { email, phone } = req.body;

  if (!email && !phone) {
    return res.status(400).json({ error: 'Provide at least an email or phone number.' });
  }

  const subs = loadSubscribers();

  // Avoid duplicates
  const alreadyExists = subs.some(s =>
    (email && s.email === email) || (phone && s.phone === phone)
  );

  if (!alreadyExists) {
    subs.push({
      email:     email || null,
      phone:     phone || null,
      createdAt: new Date().toISOString(),
    });
    saveSubscribers(subs);
    console.log(`✅ New subscriber — email: ${email || '—'}, phone: ${phone || '—'}`);
  } else {
    console.log(`ℹ️  Already subscribed — email: ${email || '—'}, phone: ${phone || '—'}`);
  }

  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────
// POST /notify
// Body: { secret: string, subject: string, message: string }
// Call this whenever you add a new deal to index.html
// ─────────────────────────────────────────────────────────────
app.post('/notify', async (req, res) => {
  const { secret, subject, message } = req.body;

  if (secret !== CONFIG.notifySecret) {
    return res.status(403).json({ error: 'Invalid secret.' });
  }

  if (!subject || !message) {
    return res.status(400).json({ error: 'Provide subject and message.' });
  }

  const subs = loadSubscribers();
  const results = { emailsSent: 0, smsSent: 0, errors: [] };

  await Promise.all(subs.map(async (sub) => {

    // ── Send email ──
    if (sub.email) {
      try {
        await transporter.sendMail({
          from:    `PerfectGrass <${CONFIG.email.from}>`,
          to:      sub.email,
          subject: subject,
          text:    message,
          html:    `
            <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:2rem;">
              <h2 style="color:#1a3320;font-size:1.4rem;">${subject}</h2>
              <p style="color:#4a4a44;line-height:1.6;">${message}</p>
              <hr style="border:none;border-top:1px solid #eee;margin:1.5rem 0;">
              <p style="color:#888;font-size:0.8rem;">
                You're receiving this because you subscribed to PerfectGrass deals.<br>
                To unsubscribe, reply STOP.
              </p>
            </div>
          `,
        });
        results.emailsSent++;
      } catch (err) {
        results.errors.push({ type: 'email', to: sub.email, error: err.message });
      }
    }

    // ── Send SMS ──
    if (sub.phone) {
      try {
        // Normalise AU mobile numbers to E.164 format (e.g. 0412... → +61412...)
        let to = sub.phone.replace(/\s/g, '');
        if (to.startsWith('0')) to = '+61' + to.slice(1);

        await twilioClient.messages.create({
          from: CONFIG.twilio.fromNumber,
          to,
          body: `PerfectGrass 🌿\n${subject}\n\n${message}\n\nReply STOP to unsubscribe.`,
        });
        results.smsSent++;
      } catch (err) {
        results.errors.push({ type: 'sms', to: sub.phone, error: err.message });
      }
    }
  }));

  console.log(`📣 Notification sent — ${results.emailsSent} emails, ${results.smsSent} SMS`);
  if (results.errors.length) console.error('Errors:', results.errors);

  res.json({ success: true, ...results });
});

// ── GET /subscribers (optional — to see your list) ──
app.get('/subscribers', (req, res) => {
  const { secret } = req.query;
  if (secret !== CONFIG.notifySecret) return res.status(403).json({ error: 'Invalid secret.' });
  res.json(loadSubscribers());
});

app.listen(CONFIG.port, () => {
  console.log(`\n🌿 PerfectGrass server running on http://localhost:${CONFIG.port}`);
  console.log(`   Subscribers stored in: ${DB_FILE}`);
  console.log(`   POST /notify to send a deal alert\n`);
});
