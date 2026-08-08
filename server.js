// server.js — ReliefLink application entry point
require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');

const app = express();

// ---- View engine (EJS, server-rendered) ----
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ---- Middleware ----
app.use(express.urlencoded({ extended: true })); // parse form POST bodies
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // css / js / assets

// ---- Session ----
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change_this_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 4 }, // 4 hours
  })
);

// Make the logged-in user available to every view as `currentUser`.
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  next();
});

// ---- Routes ----
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const victimRoutes = require('./routes/victim');
const volunteerRoutes = require('./routes/volunteer');
const donorRoutes = require('./routes/donor');

// Landing page
app.get('/', (req, res) => {
  res.render('index');
});

app.use('/', authRoutes); // /register, /login, /logout
app.use('/admin', adminRoutes); // /admin/dashboard
app.use('/victim', victimRoutes); // /victim/dashboard
app.use('/volunteer', volunteerRoutes); // /volunteer/dashboard
app.use('/donor', donorRoutes); // /donor/dashboard

// ---- 404 fallback ----
app.use((req, res) => {
  res.status(404).render('index', { notFound: true });
});

// ---- Start ----
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ReliefLink running on http://localhost:${PORT}`);
});
