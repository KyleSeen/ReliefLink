# ReliefLink — AWS Deployment Guide

Deploy **after** the team has built and merged their features. The app is already
deployment-ready: it uses `process.env.PORT`, reads all DB settings from environment
variables, and has no hardcoded values.

Target: **Amazon RDS (MySQL)** for the database + **AWS Elastic Beanstalk** for the app.

---

## 1. Create the database on Amazon RDS

1. In the AWS Console, go to **RDS → Create database**.
2. Engine: **MySQL**. Template: Free tier is fine.
3. Set a master username/password and a DB instance identifier.
4. Under **Connectivity**, enable **Public access** (so you can load the schema
   from your machine) and configure the security group to allow inbound MySQL
   (port **3306**) from your IP (and later from the Elastic Beanstalk environment).
5. Once the instance is **Available**, copy its **endpoint** (looks like
   `relieflink.xxxxxx.us-east-1.rds.amazonaws.com`).

### Load the schema into RDS

```bash
mysql -h <RDS-endpoint> -u <master-user> -p < database/schema.sql
```

This creates the `relieflink` database, all six tables, and the seed data on RDS.

## 2. Point the app at RDS

Only the connection values change — **no code changes**. Update these (in `.env`
locally to test, and in the Elastic Beanstalk environment for production):

```
DB_HOST=<RDS-endpoint>
DB_USER=<master-user>
DB_PASSWORD=<master-password>
DB_NAME=relieflink
DB_PORT=3306
```

## 3. Deploy to Elastic Beanstalk

Using the EB CLI:

```bash
# one-time
eb init            # choose region, platform = Node.js, name the app
eb create relieflink-env

# set environment variables (DB creds + session secret) on the environment
eb setenv DB_HOST=<RDS-endpoint> DB_USER=<user> DB_PASSWORD=<pass> \
          DB_NAME=relieflink DB_PORT=3306 SESSION_SECRET=<long-random-string>

# deploy
eb deploy
```

**Or** via the console: zip the project (excluding `node_modules/` and `.env`),
create a **Node.js** environment, upload the ZIP, and set the same environment
variables under **Configuration → Software → Environment properties**.

Notes:
- Elastic Beanstalk runs `npm install` and then `npm start` automatically.
- Do **not** upload `.env` — set the values as EB environment properties instead.
- Make sure the RDS security group allows inbound 3306 from the EB environment's
  security group.

## 4. Verify

1. Open the public Elastic Beanstalk URL — the ReliefLink landing page should load.
2. Log in with a seed account (e.g. `admin@relief.link` / `Test1234`) — this
   confirms the app is talking to RDS.
3. Register a new user and log in to confirm writes work against RDS.

---

### Deployment checklist

- [ ] RDS MySQL instance created and **Available**.
- [ ] `schema.sql` loaded into RDS (tables + seed data present).
- [ ] EB Node.js environment created.
- [ ] DB creds + `SESSION_SECRET` set as EB environment properties.
- [ ] RDS security group allows 3306 from the EB environment.
- [ ] Public EB URL loads the landing page and login works.
