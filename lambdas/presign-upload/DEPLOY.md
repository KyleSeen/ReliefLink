# Media Upload Service — deployment

Owner: Seen Man Hong (TP069765). Services: API Gateway + Lambda + S3.

Do these in order. Everything is console-only, so it works under Learner Lab restrictions.

## 1. S3 bucket

Create a bucket, e.g. `relieflink-incident-media-g15`.

- Keep **Block all public access ON**. Objects are reached through presigned URLs, so
  the bucket never needs to be public.
- Permissions → **CORS** → paste:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": [],
    "MaxAgeSeconds": 3000
  }
]
```

Replace `"*"` in `AllowedOrigins` with the Elastic Beanstalk URL before submission, and
screenshot this panel — the report needs it (placeholder 2.5.4).

**Without this CORS block the browser PUT fails.** It is the single most common cause of
a presigned upload failing, and the browser console error does not name CORS clearly.

## 2. Lambda

Create function → Author from scratch.

- Name: `relieflink-presign-upload`
- Runtime: **Node.js 20.x** (or 22.x)
- Execution role: **Use an existing role → `LabRole`** (Learner Lab cannot create roles)

Paste `index.js` into the editor and **Deploy**.

Configuration → Environment variables:

| Key | Value |
|---|---|
| `UPLOAD_BUCKET` | `relieflink-incident-media-g15` |
| `URL_TTL_SECONDS` | `300` |

Configuration → General → Timeout: **10 seconds**.

> **Verify the SDK import on first deploy.** The Node.js 18+ Lambda runtime bundles AWS
> SDK v3. If the test below fails with `Cannot find module '@aws-sdk/s3-request-presigner'`,
> the runtime does not include that package — in that case run `npm i @aws-sdk/client-s3
> @aws-sdk/s3-request-presigner` locally in this folder, zip `index.js` with `node_modules/`,
> and upload the zip instead of pasting.

### Test it

Test tab → create an event with this JSON:

```json
{ "body": "{\"contentType\":\"image/jpeg\",\"size\":102400}" }
```

A pass returns `statusCode: 200` and a body containing `uploadUrl` and `key`.

## 3. API Gateway

Create API → **HTTP API** (simpler than REST and enough here).

- Integration: **Lambda** → `relieflink-presign-upload`
- Route: **POST** `/upload-url`
- Stage: `$default`, auto-deploy on

Copy the **Invoke URL** — it looks like
`https://abc123.execute-api.us-east-1.amazonaws.com`.

Screenshot the routes view and the stage URL (placeholder 2.5.3).

## 4. Wire it into the app

Set this on the Elastic Beanstalk environment (Configuration → Software → Environment
properties), and in your local `.env` for testing:

```
UPLOAD_API_URL=https://abc123.execute-api.us-east-1.amazonaws.com/upload-url
MEDIA_BUCKET=relieflink-incident-media-g15
```

Then apply `database/migration_task2_media.sql` to add the `photo_key` column.

## 5. Demo script for the video

1. Log in as a victim, open the Emergency Reports tab.
2. Choose a photo — the page shows "Uploading…", then "Photo attached".
3. Submit the report.
4. Switch to the S3 console, refresh the bucket, show the new object under
   `incidents/<date>/`.
5. Open CloudWatch → the Lambda's log group → show the `presigned` log line for that key.

That sequence evidences API Gateway, Lambda and S3 working together in about 90 seconds.

## Cost note

S3, Lambda and API Gateway at this volume cost effectively nothing. The costly resources
are the Elastic Beanstalk load balancer and the RDS instance, which bill continuously and
are not stopped when a lab session ends. **Stop the EB environment and RDS whenever you are
not actively working or demoing.**
