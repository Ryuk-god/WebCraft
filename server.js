const express = require('express');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const multer = require('multer');
const fs = require('fs');
const { createWorker } = require('tesseract.js');

// --- AI SETUP & WARM-UP ---
let tesseractWorker;
(async () => {
    console.log("🤖 Warming up local AI (Tesseract.js)...");
    console.log("This might take a minute on the first run as it downloads language data...");
    tesseractWorker = await createWorker('eng');
    console.log("✅ AI is ready!");
})();

async function analyzeReceipt(imagePath, fileSize) {
    console.log('🧐 Starting receipt analysis with smarter logic...');
    const MIN_FILE_SIZE_BYTES = 20 * 1024; // 20 KB
    if (fileSize < MIN_FILE_SIZE_BYTES) {
        return { isSuspicious: true, reason: 'Image quality is too low (file is very small).' };
    }
    try {
        const { data: { text } } = await tesseractWorker.recognize(imagePath);
        const ocrText = text.toLowerCase();
        console.log('✅ OCR complete. Analyzing text...');
        const keywords = ['transaction successful', 'payment successful', 'paid to', 'sent to', 'utr', 'ref no', 'transaction id'];
        const foundKeyword = keywords.some(key => ocrText.includes(key));
        if (foundKeyword) {
            console.log('👍 Verification successful: Found receipt keywords.');
            return { isSuspicious: false, reason: 'Verified (Keywords found)' };
        } else {
            console.log('⚠️ Verification failed: No receipt keywords found.');
            return { isSuspicious: true, reason: 'Could not verify receipt content (missing keywords).' };
        }
    } catch (error) {
        console.error("Local AI Analysis Error:", error);
        return { isSuspicious: true, reason: 'AI analysis failed to process the image.' };
    }
}

// --- FILE UPLOAD SETUP ---
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'proof-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// --- DATABASE SETUP ---
let db;
(async () => {
    db = await open({ filename: path.join(__dirname, 'splitit.db'), driver: sqlite3.Database });
    await db.exec('PRAGMA foreign_keys = ON;');
    await db.exec(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, password TEXT)`);
    await db.exec(`CREATE TABLE IF NOT EXISTS groups (id INTEGER PRIMARY KEY, name TEXT NOT NULL, currency_key TEXT NOT NULL, user_id INTEGER, FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE)`);
    await db.exec(`CREATE TABLE IF NOT EXISTS group_members (id INTEGER PRIMARY KEY, group_id INTEGER, name TEXT NOT NULL, FOREIGN KEY (group_id) REFERENCES groups (id) ON DELETE CASCADE, UNIQUE(group_id, name))`);
    await db.exec(`CREATE TABLE IF NOT EXISTS expenses (id INTEGER PRIMARY KEY, group_id INTEGER, description TEXT NOT NULL, total_amount REAL NOT NULL, FOREIGN KEY (group_id) REFERENCES groups (id) ON DELETE CASCADE)`);
    await db.exec(`CREATE TABLE IF NOT EXISTS expense_payers (id INTEGER PRIMARY KEY, expense_id INTEGER, member_name TEXT NOT NULL, amount REAL NOT NULL, FOREIGN KEY (expense_id) REFERENCES expenses (id) ON DELETE CASCADE)`);
    await db.exec(`CREATE TABLE IF NOT EXISTS expense_shares (id INTEGER PRIMARY KEY, expense_id INTEGER, member_name TEXT NOT NULL, share_amount REAL NOT NULL, FOREIGN KEY (expense_id) REFERENCES expenses (id) ON DELETE CASCADE)`);
    await db.exec(`CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY, group_id INTEGER, from_member TEXT NOT NULL, to_member TEXT NOT NULL, amount REAL NOT NULL, proof_image_path TEXT, is_suspicious INTEGER DEFAULT 0, suspicion_reason TEXT, FOREIGN KEY (group_id) REFERENCES groups (id) ON DELETE CASCADE)`);
})();

// --- EXPRESS APP & MIDDLEWARE ---
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({ secret: 'a-very-secret-key', resave: false, saveUninitialized: false, cookie: { maxAge: 24 * 60 * 60 * 1000 } }));
app.use(passport.initialize());
app.use(passport.session());

// --- PASSPORT AUTHENTICATION ---
passport.use(new LocalStrategy(async (username, password, done) => { try { const user = await db.get('SELECT * FROM users WHERE username = ?', username); if (!user) { return done(null, false); } const isMatch = await bcrypt.compare(password, user.password); if (!isMatch) { return done(null, false); } return done(null, user); } catch (err) { return done(err); } }));
passport.serializeUser((user, done) => { done(null, user.id); });
passport.deserializeUser(async (id, done) => { try { const user = await db.get('SELECT id, username FROM users WHERE id = ?', id); done(null, user); } catch (err) { done(err, null); } });
const isLoggedIn = (req, res, next) => req.isAuthenticated() ? next() : res.status(401).json({ error: 'User not authenticated' });

// --- CORE & AUTH ROUTES ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.post('/register', async (req, res) => { const { username, password } = req.body; if (!username || !password) { return res.status(400).send('Missing credentials.'); } try { const hashedPassword = await bcrypt.hash(password, 10); await db.run('INSERT INTO users (username, password) VALUES (?, ?)', username, hashedPassword); res.redirect('/'); } catch (e) { res.status(400).send('Username already exists.'); } });
app.post('/login', passport.authenticate('local', { successRedirect: '/', failureRedirect: '/' }));
app.get('/logout', (req, res, next) => { req.logout(err => { if (err) { return next(err); } res.redirect('/'); }); });
app.get('/api/auth/current_user', (req, res) => res.json(req.user || null));

// --- API ROUTES ---
app.get('/api/groups', isLoggedIn, async (req, res) => { const groups = await db.all('SELECT * FROM groups WHERE user_id = ?', req.user.id); res.json(groups); });
app.post('/api/groups', isLoggedIn, async (req, res) => { const { name, currencyKey } = req.body; const result = await db.run('INSERT INTO groups (name, currency_key, user_id) VALUES (?, ?, ?)', name, currencyKey, req.user.id); res.status(201).json({ id: result.lastID, name, currencyKey }); });
app.get('/api/groups/:groupId', isLoggedIn, async (req, res) => { const { groupId } = req.params; const group = await db.get('SELECT * FROM groups WHERE id = ? AND user_id = ?', groupId, req.user.id); if (!group) { return res.status(404).json({ error: "Group not found" }); } group.members = (await db.all('SELECT name FROM group_members WHERE group_id = ?', groupId)).map(m => m.name); group.expenses = await db.all('SELECT * FROM expenses WHERE group_id = ?', groupId); group.payments = await db.all('SELECT * FROM payments WHERE group_id = ?', groupId); for (const expense of group.expenses) { expense.paidBy = await db.all('SELECT member_name as member, amount FROM expense_payers WHERE expense_id = ?', expense.id); const shares = await db.all('SELECT member_name, share_amount FROM expense_shares WHERE expense_id = ?', expense.id); expense.shares = shares.reduce((acc, s) => ({ ...acc, [s.member_name]: s.share_amount }), {}); } res.json(group); });
app.post('/api/groups/:groupId/members', isLoggedIn, async (req, res) => { const { groupId } = req.params; const { name } = req.body; await db.run('INSERT OR IGNORE INTO group_members (group_id, name) VALUES (?, ?)', groupId, name); res.status(201).json({ name }); });
app.post('/api/groups/:groupId/expenses', isLoggedIn, async (req, res) => { const { groupId } = req.params; const { description, totalAmount, paidBy, shares } = req.body; try { await db.run('BEGIN TRANSACTION'); const expenseResult = await db.run('INSERT INTO expenses (group_id, description, total_amount) VALUES (?, ?, ?)', groupId, description, totalAmount); const expenseId = expenseResult.lastID; for (const payer of paidBy) { await db.run('INSERT INTO expense_payers (expense_id, member_name, amount) VALUES (?, ?, ?)', expenseId, payer.member, payer.amount); } for (const member in shares) { await db.run('INSERT INTO expense_shares (expense_id, member_name, share_amount) VALUES (?, ?, ?)', expenseId, member, shares[member]); } await db.run('COMMIT'); res.status(201).json({ id: expenseId }); } catch (e) { await db.run('ROLLBACK'); res.status(500).json({ error: "Failed to add expense" }); } });
app.post('/api/groups/:groupId/payments', isLoggedIn, upload.single('proofImage'), async (req, res) => {
    try {
        const { groupId } = req.params;
        const { from, to, amount } = req.body;
        
        let analysis = { isSuspicious: false, reason: null };
        let publicPath = null;

        if (req.file) {
            const imagePath = req.file.path;
            const fileSize = req.file.size;
            publicPath = path.join('/uploads', req.file.filename);
            analysis = await analyzeReceipt(imagePath, fileSize);
        }

        await db.run(`INSERT INTO payments (group_id, from_member, to_member, amount, proof_image_path, is_suspicious, suspicion_reason) VALUES (?, ?, ?, ?, ?, ?, ?)`, groupId, from, to, amount, publicPath, analysis.isSuspicious ? 1 : 0, analysis.reason);
        res.status(201).json({ message: 'Payment recorded successfully', analysis });
    } catch (err) {
        console.error("❌ FAILED TO PROCESS PAYMENT:", err);
        res.status(500).json({ error: 'Server error during AI analysis.', details: err.message });
    }
});

// --- SERVER START ---
app.listen(PORT, () => {
    console.log(`✅ Server is running at http://localhost:${PORT}`);
    console.log("🤖 Local AI (Tesseract.js) is active.");
});