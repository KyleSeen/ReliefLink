# Media Upload Service — live resources

Deployed 14 September 2026 by Seen Man Hong (TP069765) into the group's shared
AWS Academy account.

| Item | Value |
|---|---|
| AWS account | `3450-1071-8040` (Saeed's Learner Lab) |
| Region | **`us-east-1`** |
| S3 bucket | `relieflink-incident-media-345010718040` |
| Lambda | `relieflink-presign-upload` (Node.js 20.x, `LabRole`, 10s timeout) |
| API (HTTP API) | `relieflink-upload-api`, id `440t8cpwza` |
| Route | `POST /upload-url`, stage `$default` (auto-deploy) |
| **Endpoint** | `https://440t8cpwza.execute-api.us-east-1.amazonaws.com/upload-url` |

Lambda environment variables:

```
UPLOAD_BUCKET=relieflink-incident-media-345010718040
URL_TTL_SECONDS=300
```

## Verified working

Tested end to end from CloudShell on 14 Sep 2026:

1. `POST /upload-url` through API Gateway → **HTTP 200**, presigned URL returned.
2. `PUT` of a JPEG to that presigned URL → **HTTP 200**.
3. Object confirmed in the bucket:
   `incidents/2026-09-14/2cfac68c-3a68-4a1e-a505-0ab899d28cec.jpg`

The Node.js 20 runtime bundles `@aws-sdk/client-s3` **and**
`@aws-sdk/s3-request-presigner`, so no layer or dependency zip is required —
`index.js` alone is the deployment package. (`presign-upload-lambda.zip` in this
folder is kept as a fallback only.)

## Wiring status — COMPLETE (14 September 2026)

- [x] `UPLOAD_API_URL` and `MEDIA_BUCKET` set on `ReliefLink-env`
- [x] Bucket CORS tightened to the Elastic Beanstalk origin + `localhost:3000`
      (both lower-case and mixed-case host spellings allowed — browsers send the
      Origin host lower-cased and S3 matches it case-sensitively)
- [x] API Gateway CORS tightened to the same origins
- [x] App redeployed — latest version `media-260914_065358`, environment Ready / Green
- [x] `incident_reports.photo_key` created automatically on boot. Confirmed in the
      instance log: `[victim] added incident_reports.photo_key`

Live app: `http://relieflink-env.eba-aceznikr.us-east-1.elasticbeanstalk.com`

### End-to-end verified through the browser, 14 September 2026

A victim attached a photograph on the live site and submitted the report:

1. Browser called `POST /upload-url` — presigned URL returned
2. Browser `PUT` the image straight to S3 — accepted
3. Form posted the key; the report saved and now displays
   `Photo attached · incidents/2026-09-14/8e084e45-b748-49cd-babb-2b7144edd751.jpg`
4. The same object is visible in the bucket at 10.5 KB

### Known gap

An image is uploaded to S3 before the report form is submitted, so abandoning the form
after choosing a photo leaves an object in the bucket that no report references. One such
orphan exists from testing. An S3 lifecycle rule deleting unreferenced objects under
`incidents/` after a short period would clean these up — worth listing under the report's
"further improvements".

## Cost

S3 + Lambda + API Gateway at demo volumes is a few cents at most — well inside
the $10 per-member limit the group agreed. The expensive resources in this
account are the Elastic Beanstalk load balancer and RDS, which are not part of
this service.
