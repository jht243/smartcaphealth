const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// Determine Database URL
const dbPath = process.env.DATABASE_URL || path.join(__dirname, 'waitlist.db');

// Initialize database
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database ', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        db.run(`CREATE TABLE IF NOT EXISTS leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            ab_variant TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS page_views (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip_address TEXT,
            user_agent TEXT,
            referrer TEXT,
            utm_source TEXT,
            utm_medium TEXT,
            utm_campaign TEXT,
            page_url TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    }
});

// API Endpoints

// Waitlist Submission
app.post('/api/waitlist', (req, res) => {
    const { name, email, ab_headline_variant } = req.body;

    if (!name || !email) {
        return res.status(400).json({ success: false, message: 'Name and email are required.' });
    }

    const stmt = db.prepare(`INSERT INTO leads (name, email, ab_variant) VALUES (?, ?, ?)`);
    stmt.run([name, email, ab_headline_variant], function (err) {
        if (err) {
            console.error('Error inserting lead:', err.message);
            return res.status(500).json({ success: false, message: 'Internal server error.' });
        }
        const leadId = this.lastID;
        res.json({ success: true, message: 'Successfully joined waitlist.', leadId });

        // Trigger Resend email notification asynchronously
        if (process.env.RESEND_API_KEY && process.env.NOTIFICATION_EMAIL) {
            resend.emails.send({
                from: 'SmartCap Alerts <onboarding@resend.dev>',
                to: process.env.NOTIFICATION_EMAIL,
                subject: `New Waitlist Signup: ${name}`,
                text: `You just received a new SmartCap waitlist signup!\n\nName: ${name}\nEmail: ${email}\nA/B Variant Seen: ${ab_headline_variant || 'None'}\n\nLog in to your dashboard to view all your leads.`
            }).then(() => {
                console.log('Resend notification email queued successfully.');
            }).catch((err) => {
                console.error('Failed to send Resend notification:', err);
            });
        }
    });
    stmt.finalize();
});

// Page View Tracking
app.post('/api/pageview', (req, res) => {
    const ip_address = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const user_agent = req.get('User-Agent') || '';
    const { referrer, utm_source, utm_medium, utm_campaign, page_url } = req.body;

    const stmt = db.prepare(`INSERT INTO page_views (ip_address, user_agent, referrer, utm_source, utm_medium, utm_campaign, page_url) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    stmt.run([ip_address, user_agent, referrer, utm_source, utm_medium, utm_campaign, page_url], function (err) {
        if (err) {
            console.error('Error inserting page view:', err.message);
            return res.status(500).json({ success: false, message: 'Internal server error.' });
        }
        res.json({ success: true, viewId: this.lastID });
    });
    stmt.finalize();
});

// Analytics Stats
app.get('/api/stats', (req, res) => {
    const stats = {
        totalLeads: 0,
        totalPageViews: 0,
        variants: {},
        recentLeads: [],
        recentPageViews: []
    };

    // Parallel queries
    let completed = 0;
    const respondIfDone = () => {
        completed++;
        if (completed === 5) {
            res.json(stats);
        }
    };

    db.get(`SELECT COUNT(*) as count FROM leads`, (err, row) => {
        if (!err && row) stats.totalLeads = row.count;
        respondIfDone();
    });

    db.get(`SELECT COUNT(*) as count FROM page_views`, (err, row) => {
        if (!err && row) stats.totalPageViews = row.count;
        respondIfDone();
    });

    db.all(`SELECT ab_variant, COUNT(*) as count FROM leads GROUP BY ab_variant`, (err, rows) => {
        if (!err && rows) {
            rows.forEach(r => {
                if (r.ab_variant) {
                    stats.variants[r.ab_variant] = r.count;
                }
            });
        }
        respondIfDone();
    });

    db.all(`SELECT * FROM leads ORDER BY created_at DESC LIMIT 50`, (err, rows) => {
        if (!err && rows) stats.recentLeads = rows;
        respondIfDone();
    });

    db.all(`SELECT * FROM page_views ORDER BY created_at DESC LIMIT 50`, (err, rows) => {
        if (!err && rows) stats.recentPageViews = rows;
        respondIfDone();
    });
});

// Serve frontend routes explicitly if needed, but static acts as fallback
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Graceful Shutdown
process.on('SIGINT', () => {
    console.log('Closing SQLite database connection...');
    db.close((err) => {
        if (err) {
            console.error(err.message);
        }
        console.log('Database connection closed.');
        process.exit(0);
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
