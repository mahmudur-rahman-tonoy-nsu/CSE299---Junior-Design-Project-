require('dotenv').config();

const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { MongoClient, GridFSBucket, ObjectId } = require('mongodb');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DB_NAME = process.env.MONGODB_DB_NAME || 'parking_kothay';
const TOKEN_SECRET = process.env.JWT_SECRET;
const ROOT = __dirname;

if (!TOKEN_SECRET || TOKEN_SECRET.length < 32) {
  throw new Error('Set JWT_SECRET in .env to a random secret at least 32 characters long.');
}
if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI in .env to your MongoDB connection string.');

const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
let db;
let imagesBucket;

app.disable('x-powered-by');
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com', 'https://cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://unpkg.com'],
      fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'", 'https:'],
      frameAncestors: ["'self'"]
    }
  }
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use('/api', rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: 'draft-8', legacyHeaders: false }));
const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 8 },
  fileFilter: (_req, file, done) => {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)) {
      const error = new Error('Images must be JPEG, PNG, WebP, or GIF.');
      error.status = 400;
      return done(error);
    }
    done(null, true);
  }
});

function fail(res, status, message) {
  return res.status(status).json({ error: message });
}

function objectId(value) {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value) ? new ObjectId(value) : null;
}

function cleanUser(user) {
  return {
    id: String(user._id),
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    phone: user.phone || '',
    address: user.address || '',
    status: user.status,
    createdAt: user.createdAt
  };
}

function signToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role }, TOKEN_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    issuer: 'parking-kothay'
  });
}

function dhakaDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
}

function validMapsUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && (
      host === 'maps.app.goo.gl' || host === 'goo.gl' || host === 'google.com' || host.endsWith('.google.com')
    );
  } catch {
    return false;
  }
}

function coordinatesFromMapsUrl(mapUrl, area = '') {
  try {
    const url = new URL(mapUrl);
    const candidates = [url.href, ...url.searchParams.values()];
    for (const text of candidates) {
      const match = text.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/) ||
        text.match(/(?:q|query|destination|center)=(-?\d{1,2}\.\d+)[,%2C]+(-?\d{1,3}\.\d+)/i);
      if (match) {
        const latitude = Number(match[1]);
        const longitude = Number(match[2]);
        if (latitude >= 20 && latitude <= 27 && longitude >= 88 && longitude <= 93) return [longitude, latitude];
      }
    }
  } catch { /* The URL is checked before this helper is called. */ }
  const centers = [
    [/dhanmondi/i, [90.3742, 23.7467]], [/gulshan/i, [90.4144, 23.7937]],
    [/banani/i, [90.4048, 23.7931]], [/panthapath|bashundhara/i, [90.3914, 23.7511]],
    [/motijheel/i, [90.4172, 23.7332]], [/mirpur/i, [90.3686, 23.8067]],
    [/uttara/i, [90.3978, 23.8681]], [/mohammadpur/i, [90.3583, 23.7621]],
    [/badda/i, [90.4256, 23.7803]], [/farmgate/i, [90.3890, 23.7577]]
  ];
  return centers.find(([pattern]) => pattern.test(area))?.[1] || [90.3900, 23.7800];
}

function imageUrl(file) {
  return `/api/images/${file.id}`;
}

function publicListing(listing) {
  const images = (listing.images || []).map(image => ({
    id: String(image.id),
    name: image.name,
    contentType: image.contentType,
    url: imageUrl(image)
  }));
  return {
    id: String(listing._id),
    name: listing.name,
    area: listing.area,
    address: listing.address,
    mapUrl: listing.mapUrl,
    price: listing.price,
    daily: listing.daily || 0,
    monthly: listing.monthly || 0,
    spaces: listing.spaces,
    total: listing.total,
    rating: listing.rating || 0,
    distance: listing.distance || 1,
    verified: listing.status === 'approved',
    status: listing.status,
    vehicles: listing.vehicles || ['Car'],
    lat: listing.location?.coordinates?.[1] || 23.7800,
    lng: listing.location?.coordinates?.[0] || 90.3900,
    img: images[0]?.url || '',
    images,
    fromDatabase: true,
    ownerId: String(listing.ownerId),
    owner: listing.ownerName || '',
    description: listing.description || '',
    hours: listing.hours || '',
    security: listing.security || '',
    createdAt: listing.createdAt,
    updatedAt: listing.updatedAt
  };
}

function requireAuth(req, res, next) {
  const authorization = req.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return fail(res, 401, 'Sign in to continue.');
  try {
    const payload = jwt.verify(token, TOKEN_SECRET, { issuer: 'parking-kothay' });
    req.auth = { userId: objectId(payload.sub), role: payload.role };
    if (!req.auth.userId) return fail(res, 401, 'Invalid sign-in token.');
    next();
  } catch {
    return fail(res, 401, 'Your sign-in has expired. Please sign in again.');
  }
}

function allowRoles(...roles) {
  return (req, res, next) => roles.includes(req.auth?.role)
    ? next()
    : fail(res, 403, 'This account does not have permission for this action.');
}

async function currentUser(req, res, next) {
  try {
    const user = await db.collection('users').findOne({ _id: req.auth.userId, status: 'active' });
    if (!user) return fail(res, 401, 'This account is unavailable. Please sign in again.');
    req.user = user;
    req.auth.role = user.role;
    next();
  } catch (error) { next(error); }
}

async function saveImage(file, ownerId) {
  return new Promise((resolve, reject) => {
    const safeName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'parking-image';
    const stream = imagesBucket.openUploadStream(safeName, {
      contentType: file.mimetype,
      metadata: { ownerId: String(ownerId), uploadedAt: new Date(), contentType: file.mimetype }
    });
    stream.once('error', reject);
    stream.once('finish', () => resolve({ id: stream.id, name: safeName, contentType: file.mimetype, size: file.size }));
    stream.end(file.buffer);
  });
}

async function deleteImages(images = []) {
  await Promise.all(images.map(async image => {
    try { await imagesBucket.delete(image.id instanceof ObjectId ? image.id : new ObjectId(image.id)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }));
}

function listingFields(body, { creating = false } = {}) {
  const fields = {};
  const textFields = ['name', 'area', 'address', 'description', 'hours', 'security'];
  for (const key of textFields) {
    if (body[key] !== undefined) fields[key] = String(body[key]).trim().slice(0, key === 'description' ? 3000 : 240);
  }
  if (body.mapUrl !== undefined) {
    const mapUrl = String(body.mapUrl).trim();
    if (!validMapsUrl(mapUrl)) throw Object.assign(new Error('Add a valid HTTPS Google Maps share link.'), { status: 400 });
    fields.mapUrl = mapUrl;
    const area = body.area || '';
    fields.location = { type: 'Point', coordinates: coordinatesFromMapsUrl(mapUrl, area) };
  }
  for (const key of ['price', 'daily', 'monthly', 'spaces', 'total']) {
    if (body[key] !== undefined && body[key] !== '') {
      const value = Number(body[key]);
      if (!Number.isFinite(value) || value < 0) throw Object.assign(new Error(`${key} must be a nonnegative number.`), { status: 400 });
      fields[key] = value;
    }
  }
  if (fields.price !== undefined && fields.price > 50) throw Object.assign(new Error('Car hourly price cannot exceed ৳50.'), { status: 400 });
  if (body.vehicles !== undefined) {
    const values = Array.isArray(body.vehicles) ? body.vehicles : String(body.vehicles).split(',');
    fields.vehicles = [...new Set(values.map(item => String(item).trim()).filter(item => ['Car', 'Motorcycle', 'SUV'].includes(item)))];
    if (!fields.vehicles.length) throw Object.assign(new Error('Choose at least one supported vehicle type.'), { status: 400 });
  }
  if (creating) {
    for (const required of ['name', 'area', 'address', 'price', 'total', 'mapUrl']) {
      if (fields[required] === undefined || fields[required] === '') throw Object.assign(new Error(`${required} is required.`), { status: 400 });
    }
    if (fields.total < 1) throw Object.assign(new Error('Capacity must be at least one space.'), { status: 400 });
    if (fields.spaces === undefined) fields.spaces = fields.total;
    if (fields.spaces > fields.total) throw Object.assign(new Error('Available spaces cannot exceed total capacity.'), { status: 400 });
    if (!fields.vehicles) fields.vehicles = ['Car'];
  }
  if (fields.total !== undefined && fields.spaces !== undefined && fields.spaces > fields.total) {
    throw Object.assign(new Error('Available spaces cannot exceed total capacity.'), { status: 400 });
  }
  return fields;
}

app.get('/api/health', (_req, res) => res.json({ ok: true, database: DB_NAME }));

app.post('/api/auth/register', authLimiter, async (req, res, next) => {
  try {
    const fullName = String(req.body.fullName || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const role = String(req.body.role || '');
    if (fullName.length < 2) return fail(res, 400, 'Enter your full name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 400, 'Enter a valid email address.');
    if (password.length < 8) return fail(res, 400, 'Password must be at least 8 characters.');
    if (!['driver', 'owner'].includes(role)) return fail(res, 400, 'Choose Driver or Parking Owner. Admin accounts are created by the project administrator.');
    const users = db.collection('users');
    if (await users.findOne({ email })) return fail(res, 409, 'An account with this email already exists.');
    const now = new Date();
    const user = {
      fullName, email, passwordHash: await bcrypt.hash(password, 12), role,
      phone: String(req.body.phone || '').trim().slice(0, 40),
      address: String(req.body.address || '').trim().slice(0, 240),
      status: 'active', createdAt: now, updatedAt: now
    };
    const result = await users.insertOne(user);
    user._id = result.insertedId;
    res.status(201).json({ token: signToken(user), user: cleanUser(user) });
  } catch (error) {
    if (error.code === 11000) return fail(res, 409, 'An account with this email already exists.');
    next(error);
  }
});

app.post('/api/auth/login', authLimiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const role = String(req.body.role || '');
    if (!email || !password || !['driver', 'owner', 'admin'].includes(role)) return fail(res, 400, 'Email, password, and account type are required.');
    const user = await db.collection('users').findOne({ email, role });
    if (!user || user.status !== 'active' || !await bcrypt.compare(password, user.passwordHash)) {
      return fail(res, 401, 'Email, password, or selected account type is incorrect.');
    }
    res.json({ token: signToken(user), user: cleanUser(user) });
  } catch (error) { next(error); }
});

app.get('/api/auth/me', requireAuth, currentUser, (req, res) => res.json({ user: cleanUser(req.user) }));

app.patch('/api/users/me', requireAuth, currentUser, async (req, res, next) => {
  try {
    const allowed = {};
    for (const key of ['fullName', 'phone', 'address']) {
      if (req.body[key] !== undefined) allowed[key] = String(req.body[key]).trim().slice(0, key === 'address' ? 240 : 120);
    }
    if (allowed.fullName !== undefined && allowed.fullName.length < 2) return fail(res, 400, 'Full name must contain at least two characters.');
    if (req.body.password) {
      if (String(req.body.password).length < 8) return fail(res, 400, 'Password must be at least 8 characters.');
      allowed.passwordHash = await bcrypt.hash(String(req.body.password), 12);
    }
    allowed.updatedAt = new Date();
    await db.collection('users').updateOne({ _id: req.user._id }, { $set: allowed });
    res.json({ user: cleanUser({ ...req.user, ...allowed }) });
  } catch (error) { next(error); }
});

app.get('/api/listings', async (req, res, next) => {
  try {
    const filter = { status: 'approved' };
    if (req.query.area) filter.area = { $regex: String(req.query.area).slice(0, 80), $options: 'i' };
    if (req.query.vehicle) filter.vehicles = String(req.query.vehicle);
    if (req.query.available === 'true') filter.spaces = { $gt: 0 };
    const listings = await db.collection('listings').find(filter).sort({ createdAt: -1 }).limit(100).toArray();
    res.json({ listings: listings.map(publicListing) });
  } catch (error) { next(error); }
});

app.get('/api/owner/listings', requireAuth, currentUser, allowRoles('owner', 'admin'), async (req, res, next) => {
  try {
    const filter = req.user.role === 'admin' ? {} : { ownerId: req.user._id };
    const listings = await db.collection('listings').find(filter).sort({ createdAt: -1 }).limit(200).toArray();
    res.json({ listings: listings.map(publicListing) });
  } catch (error) { next(error); }
});

app.post('/api/owner/listings', requireAuth, currentUser, allowRoles('owner'), upload.array('images', 8), async (req, res, next) => {
  let uploaded = [];
  try {
    const fields = listingFields(req.body, { creating: true });
    for (const file of req.files || []) uploaded.push(await saveImage(file, req.user._id));
    const now = new Date();
    const listing = {
      ...fields, ownerId: req.user._id, images: uploaded,
      status: 'pending', rating: 0, distance: 1,
      createdAt: now, updatedAt: now
    };
    const result = await db.collection('listings').insertOne(listing);
    listing._id = result.insertedId;
    res.status(201).json({ listing: publicListing(listing) });
  } catch (error) {
    await deleteImages(uploaded).catch(() => {});
    next(error);
  }
});

app.patch('/api/owner/listings/:id', requireAuth, currentUser, allowRoles('owner', 'admin'), async (req, res, next) => {
  try {
    const id = objectId(req.params.id);
    if (!id) return fail(res, 400, 'Invalid listing ID.');
    const filter = req.user.role === 'admin' ? { _id: id } : { _id: id, ownerId: req.user._id };
    const fields = listingFields(req.body);
    if (!Object.keys(fields).length) return fail(res, 400, 'There are no listing changes to save.');
    fields.updatedAt = new Date();
    const result = await db.collection('listings').findOneAndUpdate(filter, { $set: fields }, { returnDocument: 'after' });
    if (!result) return fail(res, 404, 'Listing not found or you do not own it.');
    res.json({ listing: publicListing(result) });
  } catch (error) { next(error); }
});

app.delete('/api/owner/listings/:id', requireAuth, currentUser, allowRoles('owner', 'admin'), async (req, res, next) => {
  try {
    const id = objectId(req.params.id);
    if (!id) return fail(res, 400, 'Invalid listing ID.');
    const filter = req.user.role === 'admin' ? { _id: id } : { _id: id, ownerId: req.user._id };
    const listing = await db.collection('listings').findOneAndDelete(filter);
    if (!listing) return fail(res, 404, 'Listing not found or you do not own it.');
    await deleteImages(listing.images || []);
    res.json({ deleted: true, id: String(id) });
  } catch (error) { next(error); }
});

app.post('/api/owner/listings/:id/images', requireAuth, currentUser, allowRoles('owner', 'admin'), upload.array('images', 8), async (req, res, next) => {
  let uploaded = [];
  try {
    const id = objectId(req.params.id);
    if (!id) return fail(res, 400, 'Invalid listing ID.');
    const filter = req.user.role === 'admin' ? { _id: id } : { _id: id, ownerId: req.user._id };
    const listing = await db.collection('listings').findOne(filter);
    if (!listing) return fail(res, 404, 'Listing not found or you do not own it.');
    for (const file of req.files || []) uploaded.push(await saveImage(file, req.user._id));
    const result = await db.collection('listings').findOneAndUpdate(filter, {
      $push: { images: { $each: uploaded } }, $set: { updatedAt: new Date() }
    }, { returnDocument: 'after' });
    res.json({ listing: publicListing(result) });
  } catch (error) {
    await deleteImages(uploaded).catch(() => {});
    next(error);
  }
});

app.delete('/api/owner/listings/:id/images/:imageId', requireAuth, currentUser, allowRoles('owner', 'admin'), async (req, res, next) => {
  try {
    const id = objectId(req.params.id);
    const imageId = objectId(req.params.imageId);
    if (!id || !imageId) return fail(res, 400, 'Invalid listing or image ID.');
    const filter = req.user.role === 'admin' ? { _id: id } : { _id: id, ownerId: req.user._id };
    const listing = await db.collection('listings').findOne(filter);
    if (!listing) return fail(res, 404, 'Listing not found or you do not own it.');
    const image = (listing.images || []).find(item => String(item.id) === String(imageId));
    if (!image) return fail(res, 404, 'Image not found on this listing.');
    await db.collection('listings').updateOne(filter, { $pull: { images: { id: imageId } }, $set: { updatedAt: new Date() } });
    await deleteImages([image]);
    res.json({ deleted: true });
  } catch (error) { next(error); }
});

function publicBooking(booking, listing) {
  return {
    id: booking.bookingCode,
    listingId: String(booking.listingId),
    listingName: listing?.name || 'Parking listing',
    area: listing?.area || '',
    vehicle: booking.vehicle,
    date: booking.date,
    time: booking.time,
    hours: booking.hours,
    hourlyRate: booking.hourlyRate,
    total: booking.total,
    status: booking.status,
    created: booking.createdAt?.getTime?.() || Date.now()
  };
}

app.post('/api/bookings', requireAuth, currentUser, allowRoles('driver'), async (req, res, next) => {
  try {
    const listingId = objectId(req.body.listingId);
    const vehicle = String(req.body.vehicle || '');
    const date = String(req.body.date || '');
    const time = String(req.body.time || '');
    const hours = Number(req.body.hours);
    if (!listingId) return fail(res, 400, 'Choose a valid parking listing.');
    if (!['Car', 'Motorcycle', 'SUV'].includes(vehicle)) return fail(res, 400, 'Choose a supported vehicle type.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < dhakaDate()) return fail(res, 400, 'Choose today or a future booking date.');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return fail(res, 400, 'Choose a valid arrival time.');
    if (!Number.isInteger(hours) || hours < 1 || hours > 24) return fail(res, 400, 'Booking duration must be between 1 and 24 hours.');
    const listings = db.collection('listings');
    const listing = await listings.findOneAndUpdate(
      { _id: listingId, status: 'approved', spaces: { $gt: 0 }, vehicles: vehicle },
      { $inc: { spaces: -1 }, $set: { updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
    if (!listing) return fail(res, 409, 'This listing is unavailable, not approved, or does not support that vehicle.');
    const hourlyRate = vehicle === 'Motorcycle' ? 30 : Math.min(50, listing.price);
    const platformFee = 10;
    const booking = {
      bookingCode: `PK-${Date.now().toString(36).toUpperCase()}`,
      listingId,
      ownerId: listing.ownerId,
      driverId: req.user._id,
      vehicle, date, time, hours, hourlyRate, platformFee,
      total: hourlyRate * hours + platformFee,
      status: 'Upcoming',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    try {
      await db.collection('bookings').insertOne(booking);
    } catch (error) {
      await listings.updateOne({ _id: listingId }, { $inc: { spaces: 1 } });
      throw error;
    }
    res.status(201).json({ booking: publicBooking(booking, listing) });
  } catch (error) { next(error); }
});

app.get('/api/bookings/mine', requireAuth, currentUser, allowRoles('driver'), async (req, res, next) => {
  try {
    const rows = await db.collection('bookings').find({ driverId: req.user._id }).sort({ createdAt: -1 }).limit(500).toArray();
    const listings = await db.collection('listings').find({ _id: { $in: rows.map(row => row.listingId) } }).toArray();
    const byId = new Map(listings.map(listing => [String(listing._id), listing]));
    res.json({ bookings: rows.map(row => publicBooking(row, byId.get(String(row.listingId)))) });
  } catch (error) { next(error); }
});

app.get('/api/owner/bookings', requireAuth, currentUser, allowRoles('owner', 'admin'), async (req, res, next) => {
  try {
    const filter = req.user.role === 'admin' ? {} : { ownerId: req.user._id };
    const rows = await db.collection('bookings').find(filter).sort({ createdAt: -1 }).limit(1000).toArray();
    const listings = await db.collection('listings').find({ _id: { $in: rows.map(row => row.listingId) } }).toArray();
    const byId = new Map(listings.map(listing => [String(listing._id), listing]));
    res.json({ bookings: rows.map(row => publicBooking(row, byId.get(String(row.listingId)))) });
  } catch (error) { next(error); }
});

app.patch('/api/bookings/:bookingCode/cancel', requireAuth, currentUser, allowRoles('driver'), async (req, res, next) => {
  try {
    const booking = await db.collection('bookings').findOneAndUpdate(
      { bookingCode: String(req.params.bookingCode), driverId: req.user._id, status: 'Upcoming' },
      { $set: { status: 'Cancelled', updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
    if (!booking) return fail(res, 404, 'Upcoming booking not found.');
    const listing = await db.collection('listings').findOneAndUpdate(
      { _id: booking.listingId }, { $inc: { spaces: 1 }, $set: { updatedAt: new Date() } }, { returnDocument: 'after' }
    );
    res.json({ booking: publicBooking(booking, listing) });
  } catch (error) { next(error); }
});

app.patch('/api/owner/bookings/:bookingCode/status', requireAuth, currentUser, allowRoles('owner', 'admin'), async (req, res, next) => {
  try {
    const status = String(req.body.status || '');
    if (!['Checked in', 'Completed'].includes(status)) return fail(res, 400, 'Status must be Checked in or Completed.');
    const filter = { bookingCode: String(req.params.bookingCode), status: status === 'Checked in' ? 'Upcoming' : 'Checked in' };
    if (req.user.role !== 'admin') filter.ownerId = req.user._id;
    const booking = await db.collection('bookings').findOneAndUpdate(
      filter, { $set: { status, updatedAt: new Date() } }, { returnDocument: 'after' }
    );
    if (!booking) return fail(res, 404, 'Booking not found, already updated, or outside your listings.');
    const listing = await db.collection('listings').findOne({ _id: booking.listingId });
    res.json({ booking: publicBooking(booking, listing) });
  } catch (error) { next(error); }
});

app.get('/api/admin/listings', requireAuth, currentUser, allowRoles('admin'), async (req, res, next) => {
  try {
    const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : null;
    const filter = status ? { status } : {};
    const listings = await db.collection('listings').find(filter).sort({ createdAt: -1 }).limit(500).toArray();
    const ownerIds = [...new Map(listings.map(item => [String(item.ownerId), item.ownerId])).values()];
    const owners = await db.collection('users').find({ _id: { $in: ownerIds } }, { projection: { fullName: 1 } }).toArray();
    const ownerNames = new Map(owners.map(owner => [String(owner._id), owner.fullName]));
    res.json({ listings: listings.map(item => publicListing({ ...item, ownerName: ownerNames.get(String(item.ownerId)) || 'Parking Owner' })) });
  } catch (error) { next(error); }
});

app.patch('/api/admin/listings/:id/status', requireAuth, currentUser, allowRoles('admin'), async (req, res, next) => {
  try {
    const id = objectId(req.params.id);
    const status = String(req.body.status || '');
    if (!id) return fail(res, 400, 'Invalid listing ID.');
    if (!['approved', 'rejected', 'pending'].includes(status)) return fail(res, 400, 'Status must be approved, rejected, or pending.');
    const listing = await db.collection('listings').findOneAndUpdate(
      { _id: id }, { $set: { status, updatedAt: new Date(), reviewedBy: req.user._id } }, { returnDocument: 'after' }
    );
    if (!listing) return fail(res, 404, 'Listing not found.');
    res.json({ listing: publicListing(listing) });
  } catch (error) { next(error); }
});

app.get('/api/admin/users', requireAuth, currentUser, allowRoles('admin'), async (_req, res, next) => {
  try {
    const users = await db.collection('users').find({}, { projection: { passwordHash: 0 } }).sort({ createdAt: -1 }).limit(1000).toArray();
    res.json({ users: users.map(cleanUser) });
  } catch (error) { next(error); }
});

app.patch('/api/admin/users/:id', requireAuth, currentUser, allowRoles('admin'), async (req, res, next) => {
  try {
    const id = objectId(req.params.id);
    if (!id) return fail(res, 400, 'Invalid user ID.');
    const fields = {};
    for (const key of ['fullName', 'phone', 'address']) {
      if (req.body[key] !== undefined) fields[key] = String(req.body[key]).trim().slice(0, key === 'address' ? 240 : 120);
    }
    if (req.body.status !== undefined) {
      if (!['active', 'suspended'].includes(req.body.status)) return fail(res, 400, 'Status must be active or suspended.');
      if (String(id) === String(req.user._id) && req.body.status !== 'active') return fail(res, 400, 'You cannot suspend your own admin account.');
      fields.status = req.body.status;
    }
    if (req.body.role !== undefined) {
      if (!['driver', 'owner', 'admin'].includes(req.body.role)) return fail(res, 400, 'Invalid user role.');
      if (String(id) === String(req.user._id) && req.body.role !== 'admin') return fail(res, 400, 'You cannot change your own admin role.');
      fields.role = req.body.role;
    }
    if (req.body.password) {
      if (String(req.body.password).length < 8) return fail(res, 400, 'Password must be at least 8 characters.');
      fields.passwordHash = await bcrypt.hash(String(req.body.password), 12);
    }
    if (!Object.keys(fields).length) return fail(res, 400, 'There are no user changes to save.');
    fields.updatedAt = new Date();
    const user = await db.collection('users').findOneAndUpdate({ _id: id }, { $set: fields }, { returnDocument: 'after' });
    if (!user) return fail(res, 404, 'User not found.');
    res.json({ user: cleanUser(user) });
  } catch (error) { next(error); }
});

app.delete('/api/admin/users/:id', requireAuth, currentUser, allowRoles('admin'), async (req, res, next) => {
  try {
    const id = objectId(req.params.id);
    if (!id) return fail(res, 400, 'Invalid user ID.');
    if (String(id) === String(req.user._id)) return fail(res, 400, 'You cannot delete your own admin account.');
    const target = await db.collection('users').findOne({ _id: id });
    if (!target) return fail(res, 404, 'User not found.');
    const [listingCount, bookingCount] = await Promise.all([
      db.collection('listings').countDocuments({ ownerId: id }),
      db.collection('bookings').countDocuments({ $or: [{ driverId: id }, { ownerId: id }] })
    ]);
    if (listingCount || bookingCount) return fail(res, 409, 'This account has listings or bookings. Suspend it to preserve its database history.');
    const result = await db.collection('users').deleteOne({ _id: id });
    if (!result.deletedCount) return fail(res, 404, 'User not found.');
    res.json({ deleted: true, id: String(id) });
  } catch (error) { next(error); }
});

app.get('/api/images/:id', async (req, res, next) => {
  const id = objectId(req.params.id);
  if (!id) return fail(res, 400, 'Invalid image ID.');
  try {
    const file = await db.collection('parkingImages.files').findOne({ _id: id });
    if (!file) return fail(res, 404, 'Image not found.');
    res.set('Content-Type', file.contentType || file.metadata?.contentType || 'application/octet-stream');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    imagesBucket.openDownloadStream(id).on('error', next).pipe(res);
  } catch (error) { next(error); }
});

app.get('/api-docs', (_req, res) => {
  res.json({
    service: 'Parking Kothay API',
    note: 'Send the JWT as Authorization: Bearer <token>. Owner and administrator routes are role-protected.',
    routes: [
      'POST /api/auth/register', 'POST /api/auth/login', 'GET /api/auth/me', 'PATCH /api/users/me',
      'GET /api/listings', 'GET /api/owner/listings', 'POST /api/owner/listings (multipart images[])',
      'PATCH /api/owner/listings/:id', 'DELETE /api/owner/listings/:id',
      'POST /api/owner/listings/:id/images', 'DELETE /api/owner/listings/:id/images/:imageId',
      'POST /api/bookings', 'GET /api/bookings/mine', 'GET /api/owner/bookings', 'PATCH /api/bookings/:bookingCode/cancel', 'PATCH /api/owner/bookings/:bookingCode/status',
      'GET /api/admin/listings?status=pending', 'PATCH /api/admin/listings/:id/status',
      'GET /api/admin/users', 'PATCH /api/admin/users/:id', 'DELETE /api/admin/users/:id', 'GET /api/images/:id'
    ]
  });
});

app.get('/', (_req, res) => res.sendFile(path.join(ROOT, 'index.html')));

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) return fail(res, 400, error.code === 'LIMIT_FILE_SIZE' ? 'Each image must be 5 MB or smaller.' : 'You can upload up to 8 images at a time.');
  const status = Number(error.status) || 500;
  if (status >= 500) console.error(error);
  return fail(res, status, status >= 500 ? 'The server could not complete that request.' : error.message);
});

async function start() {
  await client.connect();
  db = client.db(DB_NAME);
  imagesBucket = new GridFSBucket(db, { bucketName: 'parkingImages' });
  await Promise.all([
    db.collection('users').createIndex({ email: 1 }, { unique: true }),
    db.collection('listings').createIndex({ ownerId: 1, createdAt: -1 }),
    db.collection('listings').createIndex({ status: 1, area: 1 }),
    db.collection('listings').createIndex({ location: '2dsphere' }),
    db.collection('bookings').createIndex({ driverId: 1, createdAt: -1 }),
    db.collection('bookings').createIndex({ bookingCode: 1 }, { unique: true })
  ]);
  app.listen(PORT, () => console.log(`Parking Kothay is running at http://localhost:${PORT}`));
}

start().catch(error => {
  console.error('Could not connect to MongoDB:', error.message);
  process.exit(1);
});
