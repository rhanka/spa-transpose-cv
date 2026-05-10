import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

const tenant = (process.env.TENANT ?? '_default').trim() || '_default';
const inputFile = (process.env.INPUT_FILE ?? 'templates/references/cgi_source_example_fictional.docx').trim();
const sessionPassword = (process.env.SESSION_PASSWORD ?? 'smoke-pass').trim() || 'smoke-pass';
const apiBaseUrl = (process.env.API_BASE_URL ?? 'http://localhost:8686/api').trim().replace(/\/+$/g, '');
const provider = process.env.PROVIDER?.trim() || '';
const templateVariant = process.env.TEMPLATE_VARIANT?.trim() || '';
const targetCompany = process.env.TARGET_COMPANY?.trim() || '';
const timeoutMs = Number.parseInt(process.env.TIMEOUT_MS ?? '180000', 10);
const pollIntervalMs = Number.parseInt(process.env.POLL_INTERVAL_MS ?? '2000', 10);

function getSessionBaseUrl(): string {
  return tenant === '_default'
    ? `${apiBaseUrl}/sessions`
    : `${apiBaseUrl}/tenants/${tenant}/sessions`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readResponseText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '<unreadable-body>';
  }
}

async function assertOk(response: Response, label: string): Promise<void> {
  if (response.ok) {
    return;
  }

  throw new Error(`${label} failed with ${response.status}: ${await readResponseText(response)}`);
}

async function main(): Promise<void> {
  const sessionBaseUrl = getSessionBaseUrl();
  const inputBuffer = await readFile(inputFile);
  const inputName = basename(inputFile);

  console.log(`[smoke] tenant=${tenant} input=${inputName}`);

  const createResponse = await fetch(sessionBaseUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      password: sessionPassword,
    }),
  });
  await assertOk(createResponse, 'create session');
  const created = await createResponse.json() as { sessionId: string; tenant: string };
  const sessionId = created.sessionId;

  console.log(`[smoke] session=${sessionId}`);

  const uploadForm = new FormData();
  uploadForm.append(
    'files',
    new Blob([inputBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }),
    inputName,
  );

  const uploadResponse = await fetch(`${sessionBaseUrl}/${sessionId}/upload`, {
    method: 'POST',
    headers: {
      'X-Session-Password': sessionPassword,
    },
    body: uploadForm,
  });
  await assertOk(uploadResponse, 'upload');

  const readyResponse = await fetch(`${sessionBaseUrl}/${sessionId}/ready`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Session-Password': sessionPassword,
    },
    body: JSON.stringify({
      prompt: '',
      ...(provider ? { provider } : {}),
      ...(templateVariant ? { templateVariant } : {}),
      ...(targetCompany ? { targetCompany } : {}),
    }),
  });
  await assertOk(readyResponse, 'mark ready');

  const runResponse = await fetch(`${sessionBaseUrl}/${sessionId}/run`, {
    method: 'POST',
    headers: {
      'X-Session-Password': sessionPassword,
    },
  });
  await assertOk(runResponse, 'run');

  const deadline = Date.now() + timeoutMs;
  let results: {
    tenant: string;
    status: string;
    outputs: string[];
    files: Array<{ name: string; status: string; output?: string; error?: string }>;
  } | null = null;

  while (Date.now() < deadline) {
    const resultsResponse = await fetch(`${sessionBaseUrl}/${sessionId}/results`);
    await assertOk(resultsResponse, 'poll results');
    results = await resultsResponse.json() as typeof results;
    console.log(`[smoke] status=${results?.status}`);

    if (results?.status === 'done' || results?.status === 'error') {
      break;
    }

    await sleep(pollIntervalMs);
  }

  if (!results) {
    throw new Error('results payload missing after polling');
  }

  if (results.status !== 'done') {
    throw new Error(`session ended with status=${results.status}: ${JSON.stringify(results.files)}`);
  }

  if (results.tenant !== tenant) {
    throw new Error(`tenant mismatch: expected ${tenant}, got ${results.tenant}`);
  }

  const outputName = results.outputs[0];
  if (!outputName) {
    throw new Error('no output produced');
  }

  const downloadResponse = await fetch(`${sessionBaseUrl}/${sessionId}/download/${encodeURIComponent(outputName)}`, {
    headers: {
      'X-Session-Password': sessionPassword,
    },
  });
  await assertOk(downloadResponse, 'download');
  const outputBuffer = Buffer.from(await downloadResponse.arrayBuffer());
  if (outputBuffer.length === 0) {
    throw new Error('downloaded output is empty');
  }

  console.log(
    JSON.stringify(
      {
        tenant,
        sessionId,
        inputName,
        templateVariant,
        targetCompany,
        outputName,
        outputBytes: outputBuffer.length,
      },
      null,
      2,
    ),
  );
}

await main();
