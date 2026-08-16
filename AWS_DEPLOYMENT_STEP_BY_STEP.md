# ReliefLink — AWS Deployment, Step by Step

**Goal:** get ReliefLink running on a public AWS URL, using Amazon RDS for the database and AWS Elastic Beanstalk for the application.

**Time:** 60–90 minutes the first time.

**Do it as a team.** Every member has to explain the cloud database integration in the video, so everyone should watch this happen at least once.

---

## Understanding what you are building

Before clicking anything, understand the shape of it. Right now ReliefLink runs entirely on your laptop: Node.js serves the pages, MySQL stores the data, and only you can reach it at `localhost:3000`.

Deployment splits those two jobs and moves both into AWS:

```
        Browser (anyone, anywhere)
                  |
                  v
     AWS Elastic Beanstalk   ← runs your Node.js code
                  |
                  v
         Amazon RDS (MySQL)  ← stores your data
```

**Amazon RDS** replaces the MySQL on your machine. It is a managed relational database — AWS handles the server, the operating system, patching, and backups. You only supply the schema and the queries.

**Elastic Beanstalk** replaces `npm start`. You upload your code; it provisions an EC2 server, installs Node.js, runs your app, monitors its health, and gives you a public URL. There is no charge for Beanstalk itself — you pay only for the EC2 instance underneath.

**The critical idea:** your application code does not change at all. It already reads its database details from environment variables. Locally those come from `.env`; on AWS they come from Beanstalk's configuration. Same code, different values.

---

## Before you start

### Pick one region and stay in it

Use **ap-southeast-1 (Singapore)** — closest to Malaysia with full service support.

RDS and Elastic Beanstalk must be in the **same region**. Put them in different regions and they cannot see each other, and you will waste an hour finding out why.

### Clean the project

```bash
cd ReliefLink
rm -f .env
rm -rf .idea
rm -rf node_modules
```

Why each one:

- **`.env`** holds your real database password. It must never be uploaded. On AWS the configuration comes from Beanstalk instead.
- **`.idea`** is your editor's settings folder — irrelevant to the server.
- **`node_modules`** is huge and Beanstalk installs it itself from `package.json`. Uploading it makes deployment slow and can break things.

### Have these ready

- An AWS account with console access
- Your project working locally (so you know any failure is deployment, not code)
- A text file open to paste the RDS endpoint and password into as you go

---

# PART 1 — The database on Amazon RDS

## Step 1.1 — Create the instance

AWS Console → search **RDS** → **Create database**.

| Setting | Value | Why |
|---|---|---|
| Creation method | Standard create | Easy create hides the settings you need |
| Engine type | **MySQL** | Matches what you developed against |
| Version | **MySQL 8.0.x** | Must match your local major version or queries can fail |
| Templates | **Free tier** | Restricts the options to free-eligible ones |
| DB instance identifier | `relieflink-db` | The instance's name in AWS, not the database name |
| Master username | `admin` | The database superuser |
| Master password | your choice | **Write this down now** — you cannot retrieve it later |
| Instance class | `db.t3.micro` | The free tier size |
| Storage | 20 GB gp3 | Free tier allowance |
| Storage autoscaling | **Disabled** | Prevents surprise charges |
| Public access | **Yes** | Lets you load the schema from your laptop |
| VPC security group | Create new → `relieflink-db-sg` | A dedicated firewall for this database |
| Initial database name | `relieflink` | Under *Additional configuration*. Miss this and no database is created |
| Backup retention | 0 days | Avoids storage charges |
| Enhanced monitoring | Off | Not free |

Click **Create database**. It takes 5–10 minutes. The status goes `Creating` → `Backing-up` → **Available**.

> **A note on Public access.** For a student project this is fine and makes life much easier. In a production system you would place RDS in a private subnet reachable only from the application tier. Be ready to say that in the video — it shows you understood the VPC material rather than just clicking through.

## Step 1.2 — Copy the endpoint

Once the status is **Available**, click the instance. Under **Connectivity & security** you will see the **Endpoint**:

```
relieflink-db.abc123xyz.ap-southeast-1.rds.amazonaws.com
```

This is the address of your database on the internet. It replaces `localhost` everywhere. Paste it into your notes.

## Step 1.3 — Open the firewall to yourself

A new RDS instance blocks all traffic. You have to explicitly allow connections.

On the instance page, under **VPC security groups**, click the security group. Then **Inbound rules** → **Edit inbound rules** → **Add rule**:

- **Type:** MYSQL/Aurora (this fills in port 3306 automatically)
- **Source:** **My IP** (AWS detects your current address)

**Save rules.**

You will add a second rule later so Elastic Beanstalk can connect too.

> Security groups are the single most common cause of "I can't connect". If anything fails from here on, check this first.

## Step 1.4 — Load your database structure

Your RDS instance is empty. Send it your schema:

```bash
mysql -h relieflink-db.abc123xyz.ap-southeast-1.rds.amazonaws.com \
      -u admin -p < database/schema.sql
```

Then the migration that adds the v2 tables:

```bash
mysql -h relieflink-db.abc123xyz.ap-southeast-1.rds.amazonaws.com \
      -u admin -p < database/migration_v2.sql
```

Substitute your real endpoint. Enter your master password when prompted.

**Check it worked:**

```bash
mysql -h <endpoint> -u admin -p -e "USE relieflink; SHOW TABLES;"
```

You should see nine tables: `users`, `shelters`, `aid_requests`, `incident_reports`, `tasks`, `donations`, `volunteer_logs`, `notifications`, `activity_log`.

If you get **"Unknown database"**, you missed the initial database name in Step 1.1. Create it manually:
```bash
mysql -h <endpoint> -u admin -p -e "CREATE DATABASE relieflink;"
```
then re-run the two files above.

## Step 1.5 — Test locally against RDS

**Do not skip this.** It is the most useful step in the whole guide.

Point your local app at the cloud database and run it on your laptop. If it works, your code is fine and any later failure is purely a hosting problem. That cuts your debugging time in half.

```bash
cat > .env << 'EOF'
DB_HOST=<your RDS endpoint>
DB_USER=admin
DB_PASSWORD=<your RDS master password>
DB_NAME=relieflink
DB_PORT=3306
SESSION_SECRET=change_this_to_a_long_random_string
PORT=3000
EOF

npm install
npm start
```

Open `http://localhost:3000` and log in. The page is served from your laptop, but every piece of data is coming from AWS.

**Then delete `.env` again:**
```bash
rm .env
```

---

# PART 2 — The application on Elastic Beanstalk

## Step 2.1 — Install the tools

```bash
pip3 install awsebcli awscli --upgrade --user
eb --version
```

If `eb: command not found`, Python's user bin directory is not on your PATH. Either fix that, or use the browser-based method in Step 2.8 instead.

## Step 2.2 — Give the CLI your credentials

Console → **IAM** → **Users** → your user → **Security credentials** → **Create access key** → choose **Command Line Interface** → create. Copy both the access key ID and the secret key — the secret is shown once only.

```bash
aws configure
```

Enter the access key, the secret, region `ap-southeast-1`, output format `json`.

## Step 2.3 — Initialise the project

```bash
cd ReliefLink
eb init
```

Answer:
- **Region:** ap-southeast-1
- **Application name:** `relieflink`
- **Platform:** Node.js
- **Platform branch:** the latest Node.js 20 running on Amazon Linux 2023
- **CodeCommit:** no
- **SSH:** no (or yes if you want to log into the server later)

This creates a hidden `.elasticbeanstalk` folder holding your settings. It writes no code.

## Step 2.4 — Create the environment

```bash
eb create relieflink-env --single
```

This provisions an EC2 instance, installs Node.js, uploads your code, runs `npm install`, and starts the app. It takes 5–10 minutes and prints progress as it goes.

**Why `--single`:** it creates one instance with no load balancer. A load balancer costs money and is not free-tier eligible. For a coursework demo one instance is correct.

> Your app still keeps `trust proxy` and the MySQL session store even without a load balancer. Those are what make the app *correct* if it were ever scaled to multiple instances — worth explaining in the video as a design decision, not an accident.

## Step 2.5 — Supply the configuration

There is no `.env` on the server. Beanstalk holds the values instead:

```bash
eb setenv \
  DB_HOST=relieflink-db.abc123xyz.ap-southeast-1.rds.amazonaws.com \
  DB_USER=admin \
  DB_PASSWORD='your_rds_password' \
  DB_NAME=relieflink \
  DB_PORT=3306 \
  SESSION_SECRET='a_long_random_string' \
  NODE_ENV=production
```

The environment restarts automatically, about a minute.

**Do not set `PORT`.** Beanstalk assigns it, and your app already reads `process.env.PORT`.

Wrap any value containing special characters in single quotes.

Check they landed:
```bash
eb printenv
```

## Step 2.6 — Let Beanstalk reach the database

**This is the step people miss.** Your app is now running, but the RDS firewall only allows your laptop. The server is blocked.

**First, find the Beanstalk server's security group:**

Console → **EC2** → **Instances** → find the instance named after your environment → **Security** tab → copy the security group ID (`sg-0a1b2c3d...`).

**Then allow it through the RDS firewall:**

Console → **RDS** → your instance → click its security group → **Inbound rules** → **Edit inbound rules** → **Add rule**:

- **Type:** MYSQL/Aurora
- **Source:** **Custom** → paste the `sg-...` ID you copied

**Save rules.**

You are telling the database "accept connections from that server." Without it the site loads but every action fails with a database error.

## Step 2.7 — Open your site

```bash
eb open
```

Or copy the URL from the Beanstalk console. It looks like:

```
http://relieflink-env.eba-x7m2kq3p.ap-southeast-1.elasticbeanstalk.com
```

**That URL is your deliverable.** Put it in your report and show it in the video.

## Step 2.8 — Alternative: deploy through the browser

If the CLI fights you:

1. Zip the project, excluding what should not be uploaded:
   ```bash
   zip -r relieflink-deploy.zip . \
     -x "node_modules/*" ".env" ".idea/*" ".git/*" "*.DS_Store"
   ```
2. Console → **Elastic Beanstalk** → **Create application**
3. Application name `relieflink`, Platform **Node.js**
4. **Upload your code** → your zip
5. Presets → **Single instance (free tier eligible)**
6. Configure service access → use or create the default EC2 instance profile
7. Under **Configure updates, monitoring, and logging** → **Environment properties** → add the same variables as Step 2.5
8. **Submit**

Then do Step 2.6 — it is still required.

---

# PART 3 — Verify it works

Work through all of these against the live URL. They map to what your marking scheme checks.

- [ ] The URL loads the landing page
- [ ] Register a new account, then confirm it reached RDS:
      ```bash
      mysql -h <endpoint> -u admin -p \
        -e "USE relieflink; SELECT name,email,role FROM users ORDER BY id DESC LIMIT 3;"
      ```
- [ ] Log in as each of the four accounts; each lands on the right dashboard
- [ ] Hard-refresh several times — you stay logged in *(proves sessions are stored in RDS, not in server memory)*
- [ ] Victim submits an aid request → Coordinator sees it under Aid requests
- [ ] Coordinator raises a task → the victim's request flips to `assigned`
- [ ] Coordinator assigns an available volunteer
- [ ] A shelter at capacity refuses a placement with a clear message
- [ ] Donor pledges → the shortfall figures recalculate
- [ ] The notification bell shows an unread count
- [ ] The Activity log tab lists entries and paginates
- [ ] Leave the site idle 10 minutes, then use it — no connection error *(proves the pool keepalive works)*
- [ ] `eb logs` shows no errors

> The volunteer dashboard stays empty until Saeed's routes are built. Deploy now anyway — a working URL with three roles beats a perfect app that never reached AWS. Redeploy after his code merges.

---

# PART 4 — Redeploying

Every time the code changes:

```bash
git pull          # get the team's latest
eb deploy         # push it to AWS
```

If the database structure changed, also run the migration against RDS:

```bash
mysql -h <endpoint> -u admin -p < database/migration_v2.sql
```

The migration is guarded with `information_schema` checks, so re-running it is safe — it becomes a no-op rather than an error.

> `eb deploy` sends **committed** files when the project is a git repo. Commit before deploying, or you will push old code and wonder why nothing changed.

---

# PART 5 — When something breaks

| Symptom | Cause | Fix |
|---|---|---|
| 502 Bad Gateway | App crashed on startup | `eb logs`, read the end of `web.stdout.log`. Usually a missing environment variable |
| Site loads, every action errors | RDS firewall blocks the server | Redo Step 2.6 |
| `ER_ACCESS_DENIED_ERROR` | Wrong DB user or password | Re-run `eb setenv` with the correct values |
| `Unknown database 'relieflink'` | Schema never loaded into RDS | Redo Step 1.4 |
| `ETIMEDOUT` from your laptop | Your IP address changed | Update the "My IP" rule in the RDS security group |
| Logged out on every page | Session store not working | Confirm `express-mysql-session` is in `package.json` and a `sessions` table exists in RDS |
| Deploy succeeds but old code runs | Uncommitted changes | `git add . && git commit` then `eb deploy` |

**Useful commands:**

```bash
eb status        # environment health
eb logs          # recent logs
eb printenv      # confirm environment variables
eb ssh           # shell into the server
eb health        # detailed health view
```

---

# PART 6 — Cost control

The free tier covers `db.t3.micro` and `t3.micro` for 12 months, but only within monthly hour limits. One RDS instance plus one EC2 instance running continuously will consume most of them.

**Set a billing alarm today:** Console → **Billing** → **Budgets** → create a budget with a $1 threshold. You will be emailed if anything falls outside the free tier.

**During marking:** leave both running so the URL works when your lecturer opens it.

**Before you delete anything**, capture evidence for the report:

- Screenshot the RDS instance page (endpoint, engine, status)
- Screenshot the Beanstalk environment dashboard showing health
- Screenshot the live application on its public URL
- Screenshot the environment properties screen with the password blurred — it shows configuration is externalised
- Export the database:
  ```bash
  mysqldump -h <endpoint> -u admin -p relieflink > relieflink_final.sql
  ```

**After marking:**

```bash
eb terminate relieflink-env
```

Then RDS → your instance → **Actions** → **Delete** → skip the final snapshot.

---

# PART 7 — What to say about this in the video

Each of these maps a deployment step to a concept from the module.

**Why Amazon RDS rather than DynamoDB.** ReliefLink's data is relational — victims link to shelters, tasks link to the aid requests that caused them, donations are compared against outstanding need. Those relationships need joins and foreign keys across nine tables, which is what a relational engine does. DynamoDB suits unstructured data without a fixed schema. RDS is also a managed service: AWS handles server maintenance, OS and database patching, backups, and high availability, leaving the team responsible only for application optimisation.

**Why Elastic Beanstalk rather than raw EC2.** Beanstalk still runs on EC2 underneath, but it manages provisioning, deployment, load balancing, automatic scaling, health monitoring, and logging for you. That reduces management complexity and improves developer productivity. There is no additional charge for Beanstalk itself — you pay only for the underlying resources.

**Why sessions live in the database.** By default Express keeps sessions in the server's memory, which means every user is logged out whenever an instance restarts or scales. Moving session state into RDS is what allows the application to run across multiple instances safely. It is a deliberate architectural decision, not a configuration detail.

**Why the configuration is external.** No credential appears anywhere in the source code. Locally the values come from `.env`; on AWS they come from Beanstalk's environment properties. The same code artifact runs in both places — only the configuration differs.

**What you would do differently in production.** Place RDS in a private subnet rather than making it publicly accessible, enable Multi-AZ deployment for high availability, and put HTTPS on a load balancer. Naming these shows you understand the material beyond what the coursework required.
