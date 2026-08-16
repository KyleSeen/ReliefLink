# How to access ReliefLink

Two ways to open the app. Pick the one that matches what you're doing.

| | Deployed on AWS | Running it locally |
|---|---|---|
| Who it's for | Lecturer, demo video, teammates just *looking* at it | Teammates *building* features |
| Setup needed | None — just a browser | Node.js + MySQL, ~10 minutes |
| Needs Man Hong's lab running | **Yes** | No |

---

## Option A — Open the deployed site (no setup)

**URL:**

```
http://relieflink-env.eba-putaev2j.us-east-1.elasticbeanstalk.com
```

That's it. Click it or paste it into any browser.

### Three rules

1. **It must be `http://`, not `https://`.**
   There is no SSL certificate on this environment and port 443 is closed. If you
   type just the hostname, Chrome may silently upgrade it to `https://` and the
   page will hang forever on "took too long to respond". Always paste the full
   URL including `http://`.

2. **It's only up while the AWS Academy Learner Lab is running.**
   The lab is Man Hong's. When his 4-hour session ends, AWS stops the EC2
   instance and the URL goes dead **for everyone**. If the link doesn't load,
   message him before assuming anything is broken — 90% of the time the lab is
   just asleep. The URL never changes; it comes back when the lab restarts.

3. **Mobile data may not work.** The deployment is IPv4-only. Malaysian mobile
   carriers are largely IPv6-with-NAT64, and that combination can fail. On WiFi
   or fixed broadband it's fine. This does not affect marking — it's opened on a
   desktop browser.

### Test accounts

All four use the password `Test1234`:

| Role | Email |
|---|---|
| Admin / Coordinator | `admin@relief.link` |
| Victim | `victim@relief.link` |
| Volunteer | `volunteer@relief.link` |
| Donor | `donor@relief.link` |

You can also register a fresh account from the home page.

> Anything you do on the deployed site writes to the **real shared RDS
> database**. If you're just poking around, that's fine — but don't spam it
> before a demo, and don't delete seed rows.

---

## Option B — Run it on your own laptop

### 1. Install the prerequisites

- **Node.js 18 or newer** — https://nodejs.org (LTS installer)
  Check it worked:
  ```
  node --version
  npm --version
  ```
- **MySQL 8** — either MySQL Community Server, or XAMPP/Laragon if you already
  have one of those. You need to be able to run SQL somehow (MySQL Workbench,
  phpMyAdmin, or the `mysql` CLI).

### 2. Get the code and install dependencies

```
cd path\to\reliefLink
npm install
```

> ⚠️ **Do not skip `npm install`, and re-run it every time you pull.**
> The repo's `node_modules` has been out of date before and the app crashes at
> startup with `Error: Cannot find module 'express-mysql-session'`. That error
> means exactly one thing: run `npm install`.

### 3. Create the database

Create an empty schema:

```sql
CREATE DATABASE relieflink;
```

Then load **one** file — `database/schema.sql`. It creates all 9 tables plus the
seed data.

If you're using **MySQL Workbench**: File → Open SQL Script → open it → run.
If you're using the **`mysql` CLI**:

```
mysql -u root -p relieflink < database/schema.sql
```

> If you cloned this repo before 15 Aug 2026 you may remember a second file,
> `migration_v2.sql`. Salman folded it into `schema.sql` and deleted it — one
> file now does everything. `git pull` if you still have it.

A 10th table, `sessions`, gets created automatically the first time you start
the app — you don't make that one.

### 4. Create your `.env`

`.env` is gitignored, so it is **not** in the repo — you have to make it. Create
a file called `.env` in the project root:

```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=relieflink
DB_PORT=3306
SESSION_SECRET=any_long_random_string_will_do
PORT=3000
```

### 5. Start it

```
npm start
```

or, if you want it to restart automatically when you edit a file:

```
npm run dev
```

Then open:

```
http://localhost:3000
```

Same test accounts as above.

---

## Should you point your local app at the AWS database instead?

You *can*, but by default you **can't** — the RDS security group only allows
Man Hong's laptop and the Beanstalk server. Your connection will just hang and
eventually fail with `ETIMEDOUT`.

If you genuinely need it, get your public IP from
https://checkip.amazonaws.com and send it to Man Hong so he can add an inbound
rule. But for normal development, **use a local MySQL** — it's faster, it works
offline, it doesn't depend on the lab being awake, and you can't accidentally
wreck the demo data.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Deployed URL: "took too long to respond" | Browser upgraded you to HTTPS, **or** the lab is stopped | Retype with `http://`; ask Man Hong if the lab is running |
| Deployed URL blank on phone | IPv4-only + mobile carrier IPv6 | Switch to WiFi |
| `Cannot find module 'express-mysql-session'` | Stale `node_modules` | `npm install` |
| `ECONNREFUSED 127.0.0.1:3306` | MySQL isn't running locally | Start the MySQL service / XAMPP |
| `ER_ACCESS_DENIED_ERROR` | Wrong `DB_USER` / `DB_PASSWORD` | Fix `.env` |
| `ER_NO_SUCH_TABLE: relieflink.notifications` | Old `schema.sql` from before the merge | `git pull`, then re-run `schema.sql` |
| `ETIMEDOUT` connecting to the RDS host | Your IP isn't allowlisted | Use local MySQL, or ask for an SG rule |
| `EADDRINUSE :::3000` | Port 3000 already taken | Change `PORT` in `.env`, or close the other app |
| Login always fails | Database has no seed data | Re-run `schema.sql` |
