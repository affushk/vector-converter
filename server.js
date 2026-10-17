const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');
const ImageTracer = require('./public/imagetracer_v1.2.6.js');
const { Worker } = require('worker_threads');

const app = express();

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  next();
});
const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'users.json');
const SESSION_SECRET = process.env.SESSION_SECRET || 'CHANGE_ME_BEFORE_PRODUCTION_' + crypto.createHash('sha256').update(__dirname).digest('hex');
const OWNER_EMAIL = String(process.env.OWNER_EMAIL || '').trim().toLowerCase();
const RAZORPAY_KEY_ID = String(process.env.RAZORPAY_KEY_ID || '').trim();
const RAZORPAY_KEY_SECRET = String(process.env.RAZORPAY_KEY_SECRET || '').trim();
const PRO_PRICE_PAISE = Math.max(100, Number(process.env.PRO_PRICE_PAISE || 19900));
const PRO_DAYS = Math.max(1, Number(process.env.PRO_DAYS || 30));
const VECTORIZER_API_ID = String(process.env.VECTORIZER_API_ID || '').trim();
const VECTORIZER_API_SECRET = String(process.env.VECTORIZER_API_SECRET || '').trim();
const VECTORIZER_MODE_RAW = String(process.env.VECTORIZER_MODE || 'test').trim().toLowerCase();
const VECTORIZER_MODE = ['production','preview','test','test_preview'].includes(VECTORIZER_MODE_RAW) ? VECTORIZER_MODE_RAW : 'test';
const vectorizerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 }
});
const serverTraceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 1 }
});
const serverTraceHits = new Map();
function serverTraceLimit(req,res,next){
  const key=req.ip||req.socket.remoteAddress||'unknown';
  const now=Date.now();
  const item=serverTraceHits.get(key)||{start:now,count:0};
  if(now-item.start>60*60*1000){item.start=now;item.count=0}
  item.count++;
  serverTraceHits.set(key,item);
  if(item.count>30)return res.status(429).json({error:'Server trace limit reached. Try again later.'});
  next();
}

function ensureDb() {
  const dir = path.dirname(DATA_FILE);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ users: {}, payments: {}, orders: {} }, null, 2));
}
function readDb() {
  ensureDb();
  try {
    const db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    db.users ||= {};
    db.payments ||= {};
    db.orders ||= {};
    return db;
  } catch {
    return { users: {}, payments: {}, orders: {} };
  }
}
function writeDb(db) {
  ensureDb();
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}
function normalizeEmail(v) { return String(v || '').trim().toLowerCase(); }
function b64url(v) { return Buffer.from(v).toString('base64url'); }
function signToken(email) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { email, iat: now, exp: now + 60 * 60 * 24 * 30 };
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return body + '.' + sig;
}
function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  if (!sig || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (!payload.email || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}
function safeUser(email, row) {
  const now = Date.now();
  const expires = Number(row.proExpiresAt || 0);
  const role = OWNER_EMAIL && email === OWNER_EMAIL ? 'owner' : (expires > now ? 'pro' : 'free');
  return {
    email,
    role,
    proExpiresAt: role === 'owner' ? null : (expires || null),
    createdAt: row.createdAt || null
  };
}
function auth(req, res, next) {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  try {
    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ error: 'Login required' });
    const db = readDb();
    const row = db.users[payload.email];
    if (!row) return res.status(401).json({ error: 'Account not found' });
    req.auth = { email: payload.email, row, db, user: safeUser(payload.email, row) };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid session' });
  }
}
function ownerOnly(req, res, next) {
  if (req.auth?.user?.role !== 'owner') return res.status(403).json({ error: 'Owner access required' });
  next();
}
const authAttempts = new Map();
function authLimit(req, res, next) {
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const item = authAttempts.get(key) || { start: now, count: 0 };
  if (now - item.start > 10 * 60 * 1000) { item.start = now; item.count = 0; }
  item.count++;
  authAttempts.set(key, item);
  if (item.count > 40) return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  next();
}
function razorpayAuth() {
  return 'Basic ' + Buffer.from(RAZORPAY_KEY_ID + ':' + RAZORPAY_KEY_SECRET).toString('base64');
}

function traceInNodeWorker(imgd, options, timeoutMs) {
  return new Promise((resolve, reject) => {
    const id = Date.now() + Math.random();
    const worker = new Worker(path.join(__dirname, 'server-trace.worker.js'));
    let finished = false;
    const finish = (err, value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { worker.terminate(); } catch {}
      if (err) reject(err); else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error('SERVER_TRACE_TIMEOUT')), Math.max(5000, timeoutMs || 15000));
    worker.on('message', (d) => {
      if (!d || d.id !== id) return;
      if (d.ok) finish(null, d.svg);
      else finish(new Error(d.error || 'Server trace failed'));
    });
    worker.on('error', (err) => finish(err));
    const copy = new Uint8ClampedArray(imgd.data);
    worker.postMessage({ id, width: imgd.width, height: imgd.height, data: copy.buffer, options }, [copy.buffer]);
  });
}

async function decodeForTrace(buffer, targetLong) {
  const meta = await sharp(buffer).metadata();
  const ow = meta.width || 1, oh = meta.height || 1, long = Math.max(ow, oh);
  const target = Math.max(64, Math.min(long, targetLong || long));
  const sc = target / long;
  const w = Math.max(1, Math.round(ow * sc)), h = Math.max(1, Math.round(oh * sc));
  const out = await sharp(buffer)
    .resize(w, h, { kernel: 'nearest', fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    width: out.info.width,
    height: out.info.height,
    data: new Uint8ClampedArray(out.data)
  };
}

app.post('/api/register', express.json(), authLimit, (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Valid email required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password minimum 8 characters' });
  const db = readDb();
  if (db.users[email]) return res.status(409).json({ error: 'Account already exists' });
  const hp = hashPassword(password);
  db.users[email] = { salt: hp.salt, passwordHash: hp.hash, proExpiresAt: 0, createdAt: new Date().toISOString() };
  writeDb(db);
  res.json({ token: signToken(email), user: safeUser(email, db.users[email]) });
});

app.post('/api/login', express.json(), authLimit, (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || '');
  const db = readDb();
  const row = db.users[email];
  if (!row) return res.status(401).json({ error: 'Email or password incorrect' });
  const hp = hashPassword(password, row.salt);
  const a = Buffer.from(hp.hash, 'hex');
  const b = Buffer.from(row.passwordHash || '', 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'Email or password incorrect' });
  res.json({ token: signToken(email), user: safeUser(email, row) });
});

app.get('/api/me', auth, (req, res) => res.json({ user: req.auth.user }));

app.get('/api/config', (req, res) => {
  res.json({
    proPricePaise: PRO_PRICE_PAISE,
    proDays: PRO_DAYS,
    paymentsEnabled: Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET),
    razorpayKeyId: RAZORPAY_KEY_ID || null,
    vectorizerEnabled: Boolean(VECTORIZER_API_ID && VECTORIZER_API_SECRET),
    vectorizerMode: VECTORIZER_MODE
  });
});

app.post('/api/payments/create-order', express.json(), auth, async (req, res) => {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) return res.status(503).json({ error: 'Payment gateway is not configured yet' });
  try {
    const receipt = 'vectryz_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: razorpayAuth() },
      body: JSON.stringify({
        amount: PRO_PRICE_PAISE,
        currency: 'INR',
        receipt,
        notes: { product: 'Vectryz Pro', account: req.auth.email, days: String(PRO_DAYS) }
      })
    });
    const order = await response.json();
    if (!response.ok) return res.status(502).json({ error: order?.error?.description || 'Could not create payment order' });
    const db = readDb();
    db.orders ||= {};
    db.orders[order.id] = { email: req.auth.email, amount: Number(order.amount), currency: order.currency, createdAt: new Date().toISOString(), used: false };
    writeDb(db);
    res.json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: RAZORPAY_KEY_ID });
  } catch (e) {
    res.status(502).json({ error: 'Payment service unavailable' });
  }
});

app.post('/api/payments/verify', express.json(), auth, async (req, res) => {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) return res.status(503).json({ error: 'Payment gateway is not configured yet' });
  const orderId = String(req.body?.razorpay_order_id || '');
  const paymentId = String(req.body?.razorpay_payment_id || '');
  const signature = String(req.body?.razorpay_signature || '');
  if (!orderId || !paymentId || !signature) return res.status(400).json({ error: 'Payment details missing' });

  const expected = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET).update(orderId + '|' + paymentId).digest('hex');
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return res.status(400).json({ error: 'Payment signature invalid' });
  }

  try {
    const dbBefore = readDb();
    const storedOrder = dbBefore.orders?.[orderId];
    if (!storedOrder || storedOrder.email !== req.auth.email || storedOrder.used) {
      return res.status(400).json({ error: 'Payment order does not belong to this account or was already used' });
    }
    if (Number(storedOrder.amount) !== PRO_PRICE_PAISE || storedOrder.currency !== 'INR') {
      return res.status(400).json({ error: 'Stored payment order mismatch' });
    }
    const paymentRes = await fetch('https://api.razorpay.com/v1/payments/' + encodeURIComponent(paymentId), {
      headers: { authorization: razorpayAuth() }
    });
    let payment = await paymentRes.json();
    if (!paymentRes.ok) return res.status(502).json({ error: 'Could not confirm payment' });
    if (payment.order_id !== orderId || Number(payment.amount) !== PRO_PRICE_PAISE || payment.currency !== 'INR') {
      return res.status(400).json({ error: 'Payment amount/order mismatch' });
    }
    if (!['authorized', 'captured'].includes(payment.status)) return res.status(400).json({ error: 'Payment is not successful yet' });
    if (payment.status === 'authorized') {
      const captureRes = await fetch('https://api.razorpay.com/v1/payments/' + encodeURIComponent(paymentId) + '/capture', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: razorpayAuth() },
        body: JSON.stringify({ amount: PRO_PRICE_PAISE, currency: 'INR' })
      });
      payment = await captureRes.json();
      if (!captureRes.ok || payment.status !== 'captured') return res.status(502).json({ error: 'Payment could not be captured' });
    }

    const db = readDb();
    if (!db.users[req.auth.email]) return res.status(404).json({ error: 'Account not found' });
    if (!db.payments[paymentId]) {
      const current = Math.max(Date.now(), Number(db.users[req.auth.email].proExpiresAt || 0));
      db.users[req.auth.email].proExpiresAt = current + PRO_DAYS * 24 * 60 * 60 * 1000;
      db.payments[paymentId] = { email: req.auth.email, orderId, amount: payment.amount, at: new Date().toISOString() };
      db.orders ||= {};
      if (db.orders[orderId]) db.orders[orderId].used = true;
      writeDb(db);
    }
    res.json({ ok: true, user: safeUser(req.auth.email, db.users[req.auth.email]) });
  } catch {
    res.status(502).json({ error: 'Could not verify payment' });
  }
});



app.options('/api/server-trace', (req,res) => {
  const origin=String(req.headers.origin||'');
  if (/^https:\/\/raw\.githack\.com$/i.test(origin) || /^https:\/\/vectryz-secure\.onrender\.com$/i.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary','Origin');
  }
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  return res.sendStatus(204);
});

app.post('/api/server-trace', serverTraceLimit, serverTraceUpload.single('image'), async (req,res) => {
  const origin=String(req.headers.origin||'');
  if (/^https:\/\/raw\.githack\.com$/i.test(origin) || /^https:\/\/vectryz-secure\.onrender\.com$/i.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary','Origin');
  }
  if(!req.file?.buffer)return res.status(400).json({error:'PNG/JPG image required'});
  try{
    let options={};
    try{options=JSON.parse(String(req.body?.options||'{}'))}catch{}
    const safe={
      colorsampling:0,
      numberofcolors:Math.max(2,Math.min(32,Number(options.numberofcolors)||8)),
      colorquantcycles:1,
      mincolorratio:0,
      layering:Number(options.layering)===1?1:0,
      pathomit:Math.max(0,Math.min(8,Number(options.pathomit)||0)),
      rightangleenhance:false,
      strokewidth:0,
      linefilter:false,
      scale:1,
      roundcoords:Math.max(1,Math.min(5,Number(options.roundcoords)||3)),
      viewbox:true,
      desc:false,
      blurradius:0,
      blurdelta:20,
      ltres:Math.max(.05,Math.min(3,Number(options.ltres)||.2)),
      qtres:Math.max(.05,Math.min(3,Number(options.qtres)||.35))
    };
    if(Array.isArray(options.pal)){
      safe.pal=options.pal.slice(0,32).map(c=>({
        r:Math.max(0,Math.min(255,Number(c.r)||0)),
        g:Math.max(0,Math.min(255,Number(c.g)||0)),
        b:Math.max(0,Math.min(255,Number(c.b)||0)),
        a:255
      }));
      safe.numberofcolors=safe.pal.length||safe.numberofcolors;
    }

    const attempts=[
      { long: 820, timeout: 18000, pathomit: Math.max(safe.pathomit,1), lt:.16, qt:.30 },
      { long: 560, timeout: 14000, pathomit: Math.max(safe.pathomit,2), lt:.24, qt:.42 },
      { long: 380, timeout: 10000, pathomit: Math.max(safe.pathomit,3), lt:.34, qt:.58 }
    ];

    let lastErr=null;
    for(let i=0;i<attempts.length;i++){
      const a=attempts[i];
      try{
        const imgd=await decodeForTrace(req.file.buffer,a.long);
        const opts={...safe,pathomit:a.pathomit,ltres:Math.max(safe.ltres,a.lt),qtres:Math.max(safe.qtres,a.qt)};
        const started=Date.now();
        const svg=await traceInNodeWorker(imgd,opts,a.timeout);
        res.setHeader('content-type','image/svg+xml; charset=utf-8');
        res.setHeader('x-trace-ms',String(Date.now()-started));
        res.setHeader('x-trace-width',String(imgd.width));
        res.setHeader('x-trace-height',String(imgd.height));
        res.setHeader('x-trace-attempt',String(i+1));
        return res.send(svg);
      }catch(err){
        lastErr=err;
        console.warn('server trace attempt failed',i+1,err&&err.message);
      }
    }
    return res.status(504).json({error:'Server trace timed out on this artwork after safe fallbacks'});
  }catch(e){
    console.error('server-trace',e);
    res.status(500).json({error:'Server trace failed: '+(e.message||String(e))});
  }
});

app.post('/api/vectorizer/vectorize', auth, vectorizerUpload.single('image'), async (req, res) => {
  if (!VECTORIZER_API_ID || !VECTORIZER_API_SECRET) {
    return res.status(503).json({ error: 'Vectorizer.AI API credentials are not configured yet' });
  }
  if (!req.file || !req.file.buffer) return res.status(400).json({ error: 'Image file required' });
  const allowed = new Set(['image/png','image/jpeg','image/webp','image/gif','image/bmp','image/tiff']);
  if (!allowed.has(String(req.file.mimetype || '').toLowerCase())) {
    return res.status(400).json({ error: 'Unsupported image type' });
  }

  const paidMode = !['test','test_preview'].includes(VECTORIZER_MODE);
  if (paidMode && !['pro','owner'].includes(req.auth.user.role)) {
    return res.status(403).json({ error: 'Vectorizer.AI paid mode requires Pro or Owner access' });
  }

  const format = String(req.query.format || 'svg').toLowerCase();
  if (!['svg','eps','pdf','dxf','png'].includes(format)) {
    return res.status(400).json({ error: 'Unsupported output format' });
  }

  try {
    const form = new FormData();
    form.append('image', new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname || 'upload.png');
    form.append('mode', VECTORIZER_MODE);
    form.append('output.file_format', format);
    if (format === 'svg') {
      form.append('output.svg.version', 'svg_1_1');
      form.append('output.svg.adobe_compatibility_mode', 'true');
      form.append('output.svg.fixed_size', 'false');
    }

    const authHeader = 'Basic ' + Buffer.from(VECTORIZER_API_ID + ':' + VECTORIZER_API_SECRET).toString('base64');
    const upstream = await fetch('https://api.vectorizer.ai/api/v1/vectorize', {
      method: 'POST',
      headers: { authorization: authHeader },
      body: form
    });

    const body = Buffer.from(await upstream.arrayBuffer());
    if (!upstream.ok) {
      let message = body.toString('utf8').slice(0, 1200) || ('Vectorizer.AI error ' + upstream.status);
      try {
        const parsed = JSON.parse(message);
        message = parsed.error || parsed.message || message;
      } catch {}
      return res.status(upstream.status).json({ error: String(message) });
    }

    res.setHeader('content-type', upstream.headers.get('content-type') || (
      format === 'svg' ? 'image/svg+xml' :
      format === 'png' ? 'image/png' :
      'application/octet-stream'
    ));
    res.setHeader('content-disposition', 'inline; filename="vectryz-ai.' + format + '"');
    const calculated = upstream.headers.get('x-credits-calculated');
    if (calculated) res.setHeader('x-vectorizer-credits-calculated', calculated);
    res.setHeader('x-vectorizer-mode', VECTORIZER_MODE);
    res.send(body);
  } catch (e) {
    res.status(502).json({ error: 'Vectorizer.AI service unavailable' });
  }
});

app.post('/api/admin/grant-pro', express.json(), auth, ownerOnly, (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const days = Math.max(1, Math.min(3650, Number(req.body?.days || 30)));
  const db = readDb();
  if (!db.users[email]) return res.status(404).json({ error: 'User must register first' });
  const current = Math.max(Date.now(), Number(db.users[email].proExpiresAt || 0));
  db.users[email].proExpiresAt = current + days * 24 * 60 * 60 * 1000;
  writeDb(db);
  res.json({ ok: true, user: safeUser(email, db.users[email]) });
});

app.post('/api/admin/revoke-pro', express.json(), auth, ownerOnly, (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const db = readDb();
  if (!db.users[email]) return res.status(404).json({ error: 'User not found' });
  db.users[email].proExpiresAt = 0;
  writeDb(db);
  res.json({ ok: true, user: safeUser(email, db.users[email]) });
});

app.get('/api/admin/users', auth, ownerOnly, (req, res) => {
  const db = readDb();
  const users = Object.entries(db.users).map(([email, row]) => safeUser(email, row));
  res.json({ users });
});

app.get('/api/health', (req, res) => res.json({ ok: true, paymentsEnabled: Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET), vectorizerEnabled: Boolean(VECTORIZER_API_ID && VECTORIZER_API_SECRET), vectorizerMode: VECTORIZER_MODE }));
app.get('/secure', (req, res) => res.sendFile(path.join(__dirname, 'public', 'vectryz-v69-secure.html')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'vectryz-v69.html')));
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log('Vectryz server running on port ' + PORT);
  if (!OWNER_EMAIL) console.warn('OWNER_EMAIL is not set; no account will receive Owner role.');
  if (!process.env.SESSION_SECRET) console.warn('SESSION_SECRET is not set; configure it before production.');
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) console.warn('Razorpay keys are not set; payments stay disabled.');
  if (!VECTORIZER_API_ID || !VECTORIZER_API_SECRET) console.warn('Vectorizer.AI credentials are not set; AI vectorization stays disabled.');
});
