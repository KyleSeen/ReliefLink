require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Sessions live in MySQL so they survive instance restarts and let the app
// scale horizontally behind the Elastic Beanstalk load balancer.
const sessionStore = new MySQLStore({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  createDatabaseTable: true,
});

app.set('trust proxy', 1); // required behind the EB load balancer

app.use(
  session({
    key: 'relieflink.sid',
    secret: process.env.SESSION_SECRET || 'change_this_secret',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 4 },
  })
);

app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  next();
});

app.use(require('./middleware/chain'));

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const victimRoutes = require('./routes/victim');
const volunteerRoutes = require('./routes/volunteer');
const donorRoutes = require('./routes/donor');
const notificationRoutes = require('./routes/notifications');

app.get('/', (req, res) => {
  res.render('index');
});

app.use('/', authRoutes);
app.use('/admin', adminRoutes);
app.use('/victim', victimRoutes);
app.use('/volunteer', volunteerRoutes);
app.use('/donor', donorRoutes);
app.use('/notifications', notificationRoutes);

app.use((req, res) => {
  res.status(404).render('index', { notFound: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ReliefLink running on http://localhost:${PORT}`);
});
