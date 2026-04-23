/**
 * notify.js — Send a deal alert to all subscribers

 */

const SECRET  = 'change-this-to-something-secret'; // must match CONFIG.notifySecret in server.js
const API_URL = 'http://localhost:3000/notify';

const [,, subject, message] = process.argv;

if (!subject || !message) {
  console.error('Usage: node notify.js "Subject" "Message body"');
  process.exit(1);
}

(async () => {
  const res  = await fetch(API_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ secret: SECRET, subject, message }),
  });
  const data = await res.json();
  console.log('Result:', data);
})();
