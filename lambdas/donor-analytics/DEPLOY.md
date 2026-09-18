# Donor Analytics Lambda — Implementation Notes
**Owner:** Yap Sin Ni (Donor)
**Feature:** Shelter shortfall analytics extracted from the monolith into a standalone Lambda

## What this is

The donor dashboard's resource-need calculation (shelter shortfall by category) used to run
as a SQL query directly inside `routes/donor.js`, as part of the `GET /donor/dashboard` route.
For Task #2, this calculation was extracted into an independent AWS Lambda function, exposed
through API Gateway, and the dashboard route now calls it over HTTP instead of running the
query locally.

This is a genuine monolith → microservice transformation: the logic, the compute, and the
scaling now live outside the Elastic Beanstalk instance, in a separately deployable function.

## Architecture

```
Donor dashboard (routes/donor.js)
        |
        | GET https://64ln1vk2u4.execute-api.us-east-1.amazonaws.com/default/reliefflink-shortfall-analytics
        v
  API Gateway (HTTP API)
        |
        v
  Lambda: relieflink-shortfall-analytics  (Node.js 20.x)
        |
        v
  RDS (MySQL) — relieflink-db.c6re5ppmpfj8.us-east-1.rds.amazonaws.com
```

## AWS resources

| Resource | Name |
|---|---|
| Lambda function | `relieflink-shortfall-analytics` |
| Runtime | Node.js 20.x |
| Execution role | LabRole (AWS Academy default) |
| API Gateway | HTTP API, route `GET /` (stage: `default`) |
| Invoke URL | `https://64ln1vk2u4.execute-api.us-east-1.amazonaws.com/default/reliefflink-shortfall-analytics` |
| Database | Existing shared RDS instance (`relieflink-db`) |

## Environment variables (set on the Lambda)

| Key | Value |
|---|---|
| `DB_HOST` | `relieflink-db.c6re5ppmpfj8.us-east-1.rds.amazonaws.com` |
| `DB_USER` | `admin` |
| `DB_PASSWORD` | *(set in Lambda console — not committed to source control)* |
| `DB_NAME` | `relieflink` |

## Lambda code

Located locally in a standalone `shortfall-lambda/` folder (not committed to this repo —
excluded via `.gitignore`, since it's packaged and uploaded directly as a zip rather than
deployed through the app's build).

```javascript
const mysql = require('mysql2/promise');

exports.handler = async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  const [shortfall] = await conn.execute(`
    SELECT r.need_type AS category,
           SUM(r.people_count) * 3            AS units_needed,
           COALESCE(d.total_pledged, 0)       AS units_pledged,
           GREATEST(SUM(r.people_count) * 3 - COALESCE(d.total_pledged, 0), 0) AS shortfall
      FROM aid_requests r
      LEFT JOIN (
            SELECT item_type, SUM(quantity) AS total_pledged
              FROM donations
             GROUP BY item_type
      ) d ON d.item_type = r.need_type
     WHERE r.status <> 'resolved'
     GROUP BY r.need_type, d.total_pledged
     ORDER BY shortfall DESC
  `);
  await conn.end();

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    },
    body: JSON.stringify(shortfall)
  };
};
```

`mysql2` is bundled into the deployment zip (`node_modules/mysql2` + `package.json`) since
it isn't part of the default Lambda runtime.

## Deployment steps taken

1. Created a standalone Node project (`npm init -y && npm install mysql2`).
2. Wrote the handler above in `index.js`.
3. Zipped `index.js`, `node_modules/`, `package.json`, `package-lock.json` into `function.zip`.
4. Created the Lambda function in the console (Node.js 20.x, LabRole execution role).
5. Uploaded `function.zip` via **Code → Upload from → .zip file**.
6. Added the four environment variables above.
7. Added an **API Gateway (HTTP API)** trigger, open security, default stage.
8. Tested via the Lambda console **Test** tab and directly via the Invoke URL in a browser —
   both returned live shortfall data pulled from RDS.

## Change to the monolith (`routes/donor.js`)

The in-route SQL query for `shortfall` was replaced with an HTTP call to the Lambda:

```javascript
const axios = require('axios');

let shortfall = [];
try {
  const { data } = await axios.get(
    'https://64ln1vk2u4.execute-api.us-east-1.amazonaws.com/default/reliefflink-shortfall-analytics'
  );
  shortfall = data;
} catch (lambdaErr) {
  console.error('Shortfall Lambda error:', lambdaErr.message);
}
```

Everything else in the route (`donations`, `shelters`, `stats`, and the render call) is
unchanged — `shortfall` keeps the same shape as before, so `views/dashboards/donor.ejs`
required no changes.

## Verified working

- Lambda test invocation: `Status: Succeeded`, returns correct JSON shortfall data.
- API Gateway Invoke URL: returns the same JSON directly in a browser.
- Donor dashboard (`localhost:3000/donor/dashboard`): "Resource needs" tab renders the
  Lambda-sourced data correctly (confirmed via matching category/shortfall counts).
