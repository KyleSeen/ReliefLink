// ReliefLink — Media Upload microservice
// Owner: Seen Man Hong (TP069765), Victim / Public User role
//
// Issues a short-lived presigned PUT URL so the browser uploads an incident
// photo straight to S3. The image bytes never pass through the EC2 instance
// running the monolith — the app server only hands out a credential.
//
// Trigger: API Gateway  POST /upload-url
// Env vars: UPLOAD_BUCKET (required), URL_TTL_SECONDS (optional, default 300)

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');

const s3 = new S3Client({});

const BUCKET = process.env.UPLOAD_BUCKET;
const TTL = parseInt(process.env.URL_TTL_SECONDS || '300', 10);

// Only allow image types we actually expect from the report form.
const ALLOWED = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

function reply(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      // Tighten to the Elastic Beanstalk origin before submission.
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'OPTIONS,POST',
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  // API Gateway sends a preflight before the real call.
  if (event.requestContext?.http?.method === 'OPTIONS' || event.httpMethod === 'OPTIONS') {
    return reply(204, {});
  }

  if (!BUCKET) {
    console.error('UPLOAD_BUCKET is not set');
    return reply(500, { error: 'Server not configured.' });
  }

  let body;
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {});
  } catch {
    return reply(400, { error: 'Body must be JSON.' });
  }

  const contentType = String(body.contentType || '').toLowerCase();
  const size = parseInt(body.size, 10);

  // Validate here rather than trusting the browser: this endpoint is public.
  if (!ALLOWED[contentType]) {
    return reply(400, { error: 'Only JPEG, PNG or WebP images are accepted.' });
  }
  if (Number.isNaN(size) || size <= 0 || size > MAX_BYTES) {
    return reply(400, { error: 'Image must be larger than 0 and at most 5 MB.' });
  }

  // Random key: a victim must not be able to guess or overwrite another's photo.
  const key = `incidents/${new Date().toISOString().slice(0, 10)}/` +
    `${crypto.randomUUID()}.${ALLOWED[contentType]}`;

  try {
    // ContentType is signed in, so the browser's PUT must send the same value
    // or S3 rejects the upload.
    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: TTL });

    console.log(JSON.stringify({ msg: 'presigned', key, contentType, size }));
    return reply(200, { uploadUrl, key, expiresIn: TTL });
  } catch (e) {
    console.error('Presign failed:', e);
    return reply(500, { error: 'Could not prepare the upload.' });
  }
};
