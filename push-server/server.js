/**
 * Facto Push Notification Server
 * Simple Express backend to deliver Web Push notifications
 * on schedule, even when the PWA is closed.
 */

const express = require('express');
const webpush = require('web-push');
const cors = require('cors');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// ─── VAPID Configuration ────────────────────────────────────────────────────
// These keys are unique to your app. Never share the private key.
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BGufWaRcFo_Ck8C5M958xUP_-_qnUkfryb7fqtme3rXtploNU4q_6LA-1zjxJ3JXQ4znfoLbFyu1Ex8z-fWxa28';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '4j7PvJeoICMVq7rs7ZD2ulXJ5tpDsiZXdag5vt5cqAY';
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:facto-app@example.com';

webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// ─── Subscription Storage ────────────────────────────────────────────────────
// Stores each user's push subscription + their preferred reminder time.
// Format: { [subscriptionHash]: { subscription, reminderTime, reminderEnabled, timezone } }
const STORE_PATH = path.join(__dirname, 'subscriptions.json');

function loadStore() {
    try {
        if (fs.existsSync(STORE_PATH)) {
            return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading store:', e.message);
    }
    return {};
}

function saveStore(store) {
    try {
        fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
    } catch (e) {
        console.error('Error saving store:', e.message);
    }
}

// Simple hash to use as key (endpoint URL is unique per browser/user)
function hashEndpoint(endpoint) {
    let hash = 0;
    for (let i = 0; i < endpoint.length; i++) {
        hash = ((hash << 5) - hash) + endpoint.charCodeAt(i);
        hash |= 0;
    }
    return String(Math.abs(hash));
}

// ─── Routes ─────────────────────────────────────────────────────────────────

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', subscriptions: Object.keys(loadStore()).length });
});

// Expose the public VAPID key so the frontend can subscribe
app.get('/vapid-public-key', (req, res) => {
    res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// Register a new push subscription
app.post('/subscribe', (req, res) => {
    const { subscription, reminderTime, reminderEnabled, timezone } = req.body;
    if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ error: 'Missing subscription' });
    }

    const store = loadStore();
    const key = hashEndpoint(subscription.endpoint);
    store[key] = {
        subscription,
        reminderTime: reminderTime || '09:00',
        reminderEnabled: reminderEnabled !== false,
        timezone: timezone || 'America/Argentina/Buenos_Aires',
        createdAt: new Date().toISOString()
    };
    saveStore(store);

    console.log(`[subscribe] Total subs: ${Object.keys(store).length}`);
    res.json({ success: true, key });
});

// Update reminder time for an existing subscription
app.post('/update-time', (req, res) => {
    const { subscription, reminderTime } = req.body;
    if (!subscription || !reminderTime) {
        return res.status(400).json({ error: 'Missing params' });
    }

    const store = loadStore();
    const key = hashEndpoint(subscription.endpoint);
    if (!store[key]) {
        return res.status(404).json({ error: 'Subscription not found' });
    }

    store[key].reminderTime = reminderTime;
    saveStore(store);
    res.json({ success: true });
});

// Enable or disable reminders for a subscription
app.post('/toggle-reminder', (req, res) => {
    const { subscription, enabled } = req.body;
    if (!subscription) {
        return res.status(400).json({ error: 'Missing subscription' });
    }

    const store = loadStore();
    const key = hashEndpoint(subscription.endpoint);
    if (!store[key]) {
        return res.status(404).json({ error: 'Subscription not found' });
    }

    store[key].reminderEnabled = enabled;
    saveStore(store);
    res.json({ success: true });
});

// Remove a subscription
app.post('/unsubscribe', (req, res) => {
    const { subscription } = req.body;
    if (!subscription) {
        return res.status(400).json({ error: 'Missing subscription' });
    }

    const store = loadStore();
    const key = hashEndpoint(subscription.endpoint);
    delete store[key];
    saveStore(store);

    console.log(`[unsubscribe] Total subs: ${Object.keys(store).length}`);
    res.json({ success: true });
});

// Manual test push (send immediately to a specific subscription)
app.post('/send-test', async (req, res) => {
    const { subscription } = req.body;
    if (!subscription) {
        return res.status(400).json({ error: 'Missing subscription' });
    }

    const payload = JSON.stringify({
        title: 'Facto 🎯',
        body: '¡Hola! Las notificaciones en segundo plano están funcionando ✅',
        icon: 'icon-192.png'
    });

    try {
        await webpush.sendNotification(subscription, payload);
        res.json({ success: true });
    } catch (e) {
        console.error('Test push error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ─── Cron Job: send daily reminders ─────────────────────────────────────────
// Runs every minute, checks each stored subscription to see if it's
// showtime for them (based on their reminderTime and timezone).
cron.schedule('* * * * *', async () => {
    const store = loadStore();
    const keys = Object.keys(store);
    if (keys.length === 0) return;

    const now = new Date();
    const failedKeys = [];

    for (const key of keys) {
        const entry = store[key];
        if (!entry.reminderEnabled) continue;

        // Parse the user's reminder time in their timezone
        const [hours, minutes] = (entry.reminderTime || '09:00').split(':').map(Number);

        // Get current time in the user's timezone
        const nowInTZ = new Date(now.toLocaleString('en-US', { timeZone: entry.timezone || 'America/Argentina/Buenos_Aires' }));
        const currentHour = nowInTZ.getHours();
        const currentMin = nowInTZ.getMinutes();

        if (currentHour === hours && currentMin === minutes) {
            // Check we haven't already sent today
            const todayKey = now.toISOString().slice(0, 10);
            if (entry.lastSentDate === todayKey) continue;

            const payload = JSON.stringify({
                title: 'Facto 🎯',
                body: '¡Es hora de concentrarte en tus metas! 🔥',
                icon: 'icon-192.png',
                badge: 'icon-192.png'
            });

            try {
                await webpush.sendNotification(entry.subscription, payload);
                store[key].lastSentDate = todayKey;
                console.log(`[cron] Sent to key ${key} at ${entry.reminderTime}`);
            } catch (e) {
                console.error(`[cron] Failed for key ${key}:`, e.statusCode, e.message);
                // If subscription expired/invalid, mark for removal
                if (e.statusCode === 410 || e.statusCode === 404) {
                    failedKeys.push(key);
                }
            }
        }
    }

    // Remove expired subscriptions
    failedKeys.forEach(k => delete store[k]);
    if (failedKeys.length > 0) {
        console.log(`[cron] Removed ${failedKeys.length} expired subscription(s)`);
    }

    saveStore(store);
});

// ─── Start Server ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Facto push server running on port ${PORT}`);
    console.log(`Subscriptions stored in: ${STORE_PATH}`);
});
