# ReliefLink

A centralized web platform where four types of users coordinate disaster relief:
**Admin/Coordinator**, **Victim/Public User**, **Volunteer**, and **NGO/Donor**.

This repository is the **foundation build**: registration, login, session-based
role routing, four styled (empty) dashboards, and the full database schema.
The two functionalities per role are intentionally left for each team member to
build on top of this foundation.

**Module:** CT071-3-3-DDAC — Designing and Developing Applications on the Cloud
**Stack:** Node.js + Express, EJS, MySQL (`mysql2`), Bootstrap 5, `express-session` + `bcryptjs`
**Target deployment:** AWS (Amazon RDS + Elastic Beanstalk) — see `DEPLOYMENT.md`.

---

## 1. Prerequisites

- **Node.js** 18 or newer
- **MySQL** 8 (running locally)
- **Git**

## 2. Setup

```bash
git clone <repo>
cd reliefLink
npm install
cp .env.example .env        # then fill in your DB details
mysql -u root -p < database/schema.sql   # creates the DB, tables, and seed data
npm start
```

Then open http://localhost:3000

> `schema.sql` includes `CREATE DATABASE IF NOT EXISTS relieflink;` so you don't
> need to create the database manually. Make sure `DB_NAME=relieflink` in `.env`.

### Environment variables (`.env`)

| Variable | Meaning |
|---|---|
| `DB_HOST` | MySQL host (`localhost` for dev, RDS endpoint for prod) |
| `DB_USER` | MySQL user |
| `DB_PASSWORD` | MySQL password |
| `DB_NAME` | `relieflink` |
| `DB_PORT` | `3306` |
| `SESSION_SECRET` | any long random string |
| `PORT` | app port (default `3000`) |

`.env` is gitignored — never commit real credentials. `.env.example` is the template.

## 3. Test logins (from seed data)

Password for **all** seed accounts: `Test1234`

| Role | Email |
|---|---|
| Admin | `admin@relief.link` |
| Victim | `victim@relief.link` |
| Volunteer | `volunteer@relief.link` |
| Donor | `donor@relief.link` |

You can also register a brand-new account for any role from `/register`.

## 4. Where do I build my part?
Each member owns one dashboard view and one route file. Work only in your own
files so nobody's changes collide. Each member's two functionalities are designed
to cover a full set of CRUD operations (Create, Read, Update, Delete).

| Member | Role | Build your features in | Tables you'll use | CRUD coverage |
|---|---|---|---|---|
| Salman | Admin | `views/dashboards/admin.ejs` + `routes/admin.js` | shelters, tasks, users | Manage shelters = full CRUD; assign volunteers = Read + Update |
| Manhong | Victim | `views/dashboards/victim.ejs` + `routes/victim.js` | aid_requests, incident_reports, shelters | Aid requests = Create + Read; emergency reports = full CRUD (create, view, edit, cancel) |
| Saeed | Volunteer | `views/dashboards/volunteer.ejs` + `routes/volunteer.js` | tasks, volunteer_logs, users | Accept/update tasks = Read + Update; activity log = full CRUD (add, view, edit, delete entries) |
| Yap Sin Ni | Donor | `views/dashboards/donor.ejs` + `routes/donor.js` | donations, shelters, aid_requests | Donations = full CRUD (pledge, view, edit, cancel); resource-need dashboard = Read (aggregation) |

Inside each dashboard `.ejs` there's a clearly marked `feature-area` div with a
`TEAM: BUILD YOUR TWO FUNCTIONALITIES BELOW` comment — put your UI there.

**Note:** the `volunteer_logs` table (id, user_id, activity, notes, status, created_at)
supports Saeed's activity-log feature so every member has a genuine full-CRUD
functionality. It is created in `schema.sql` as part of the foundation build.

## 5. Git workflow

- Each member works on their own branch: `feature/admin`, `feature/victim`,
  `feature/volunteer`, `feature/donor`.
- Commit often with clear messages.
- Open a **pull request** to merge into `main`; review before merging.

## 6. The 3-step pattern for building any functionality

1. Add a form/section to your dashboard `.ejs` (inside `feature-area`).
2. Add a route in your `routes/*.js` that runs the SQL query.
3. That query reads/writes **your** table.

Example (Donor pledging a donation):

```js
// routes/donor.js
router.post('/pledge', requireLogin, requireRole('donor'), async (req, res) => {
  const { item_type, quantity } = req.body;
  await db.query(
    'INSERT INTO donations (user_id, item_type, quantity) VALUES (?, ?, ?)',
    [req.session.user.id, item_type, quantity]
  );
  res.redirect('/donor/dashboard');
});
```

## 7. Project structure

```
reliefLink/
├── server.js              # App entry point
├── package.json
├── .env.example
├── .gitignore
├── config/db.js           # MySQL connection pool
├── database/schema.sql    # All tables + seed data
├── middleware/auth.js     # requireLogin + requireRole guards
├── routes/                # auth + one file per role dashboard
├── views/                 # EJS: partials, index, login, register, dashboards/
├── public/                # css/style.css + js/main.js
├── README.md
└── DEPLOYMENT.md          # AWS RDS + Elastic Beanstalk steps
```

## 8. What's already done vs. left to build

**Done (foundation):** landing page, register, login, logout, session, role-based
routing + guards, all seven database tables + seed data, four styled dashboard shells,
shared theme.

**Left for the team:** the two role-specific functionalities each (managing shelters
& assigning volunteers; aid registration & incident reports; task accept/update &
activity log; donation pledging & resource-need dashboard). Tables for all of these
already exist.
