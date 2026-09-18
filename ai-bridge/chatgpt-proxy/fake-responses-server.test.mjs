import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createFakeResponsesServer,
  DEFAULT_FAKE_RESPONSE,
} from './fake-responses-server.js';

async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test('serves health, non-streaming JSON, and Responses SSE text', async () => {
  const instance = createFakeResponsesServer({ responseText: 'fake stream test OK' });
  const address = await instance.ready;

  try {
    const health = await fetch(`${address.baseUrl.replace(/\/v1$/, '')}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), {
      status: 'ok',
      provider: 'chatgpt-fake',
    });

    const versionedHealth = await fetch(`${address.baseUrl}/health`);
    assert.equal(versionedHealth.status, 200);

    const nonStreaming = await fetch(`${address.baseUrl}/responses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'chatgpt-fake-model',
        input: 'hello',
        stream: false,
      }),
    });
    assert.equal(nonStreaming.status, 200);
    const response = await nonStreaming.json();
    assert.equal(response.object, 'response');
    assert.equal(response.status, 'completed');
    assert.equal(response.model, 'chatgpt-fake-model');
    assert.equal(response.output[0].content[0].text, 'fake stream test OK');
    assert.deepEqual(instance.getLastRequest(), {
      model: 'chatgpt-fake-model',
      input: 'hello',
      stream: false,
    });

    const streaming = await fetch(`${address.baseUrl}/responses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'chatgpt-fake-model',
        input: 'hello again',
        stream: true,
      }),
    });
    assert.equal(streaming.status, 200);
    assert.match(streaming.headers.get('content-type') || '', /text\/event-stream/);
    const sse = await streaming.text();
    assert.match(sse, /event: response\.created/);
    assert.match(sse, /event: response\.output_text\.delta/);
    assert.match(sse, /"delta":"fake stream test OK"/);
    assert.match(sse, /event: response\.completed/);
    assert.deepEqual(instance.getLastRequest(), {
      model: 'chatgpt-fake-model',
      input: 'hello again',
      stream: true,
    });
  } finally {
    await closeServer(instance.server);
  }
});

test('uses the stable default response text', async () => {
  const instance = createFakeResponsesServer();
  const address = await instance.ready;

  try {
    const response = await fetch(`${address.baseUrl}/responses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stream: false }),
    });
    const body = await response.json();
    assert.equal(body.output[0].content[0].text, DEFAULT_FAKE_RESPONSE);
  } finally {
    await closeServer(instance.server);
  }
});
