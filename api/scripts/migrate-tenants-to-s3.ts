import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '../src/config/env.js';

const slugs = process.argv.slice(2);
const selectedSlugs = slugs.length > 0 ? slugs : ['_default', 'scalian'];

if (!env.TENANT_S3_BUCKET || !env.TENANT_S3_ACCESS_KEY || !env.TENANT_S3_SECRET_KEY) {
  throw new Error('TENANT_S3_BUCKET, TENANT_S3_ACCESS_KEY and TENANT_S3_SECRET_KEY are required');
}

const client = new S3Client({
  region: env.TENANT_S3_REGION,
  endpoint: env.TENANT_S3_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.TENANT_S3_ACCESS_KEY,
    secretAccessKey: env.TENANT_S3_SECRET_KEY,
  },
});

function objectKey(relativeKey: string): string {
  const prefix = env.TENANT_S3_PREFIX.trim().replace(/^\/+|\/+$/g, '');
  return prefix ? `${prefix}/${relativeKey}` : relativeKey;
}

function contentTypeFor(filePath: string): string {
  if (filePath.endsWith('.json')) {
    return 'application/json; charset=utf-8';
  }
  if (filePath.endsWith('.css')) {
    return 'text/css; charset=utf-8';
  }
  if (filePath.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return 'application/octet-stream';
}

const templatesRoot = resolve('templates');
const uploads = [
  'registry.json',
  ...selectedSlugs.flatMap((slug) => [
    `tenants/${slug}/config.json`,
    `tenants/${slug}/theme.css`,
    `tenants/${slug}/template.docx`,
  ]),
];

for (const relativePath of uploads) {
  const absolutePath = join(templatesRoot, relativePath);
  const body = await readFile(absolutePath);

  await client.send(new PutObjectCommand({
    Bucket: env.TENANT_S3_BUCKET,
    Key: objectKey(relativePath),
    Body: body,
    ContentType: contentTypeFor(relativePath),
  }));

  console.log(`${relativePath} -> s3://${env.TENANT_S3_BUCKET}/${objectKey(relativePath)}`);
}
