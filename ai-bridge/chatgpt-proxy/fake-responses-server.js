/**
 * Local fake Responses API used by the ChatGPT Chat provider POC.
 *
 * This server deliberately has no ChatGPT authentication or tool execution
 * logic. It only proves that Codex can speak the Responses wire protocol to a
 * localhost model provider and receive a streamed assistant message.
 */
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

export const DEFAULT_FAKE_RESPONSE = 'ChatGPT provider bridge test OK';

function jsonResponse(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function writeEvent(res, type, payload) {
  res.write(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function buildResponse(body, text) {
  const responseId = `resp_${randomUUID().replaceAll('-', '')}`;
  const messageId = `msg_${randomUUID().replaceAll('-', '')}`;
  const model = typeof body?.model === 'string' && body.model.trim()
    ? body.model.trim()
    : 'chatgpt-fake-model';
  const outputText = text || DEFAULT_FAKE_RESPONSE;
  const message = {
    id: messageId,
    type: 'message',
    status: 'completed',
    role: 'assistant',
    content: [{
      type: 'output_text',
      text: outputText,
      annotations: [],
    }],
  };

  return {
    id: responseId,
    object: 'response',
    created_at: Math.floor(Date.now() / 1000),
    status: 'completed',
    incomplete_details: null,
    model,
    output: [message],
    parallel_tool_calls: true,
    tool_choice: 'auto',
    tools: [],
    temperature: 1,
    top_p: 1,
    truncation: 'disabled',
    usage: {
      input_tokens: 1,
      output_tokens: outputText.length,
      total_tokens: outputText.length + 1,
    },
  };
}

function streamResponse(res, response, outputText) {
  const message = response.output[0];
  const responseInProgress = {
    ...response,
    status: 'in_progress',
    output: [],
    usage: null,
  };
  const itemInProgress = {
    ...message,
    status: 'in_progress',
    content: [],
  };

  res.writeHead(200, {
    'cache-control': 'no-cache',
    connection: 'keep-alive',
    'content-type': 'text/event-stream; charset=utf-8',
    'transfer-encoding': 'chunked',
  });

  writeEvent(res, 'response.created', {
    type: 'response.created',
    response: responseInProgress,
  });
  writeEvent(res, 'response.output_item.added', {
    type: 'response.output_item.added',
    output_index: 0,
    item: itemInProgress,
  });
  writeEvent(res, 'response.content_part.added', {
    type: 'response.content_part.added',
    item_id: message.id,
    output_index: 0,
    content_index: 0,
    part: {
      type: 'output_text',
      text: '',
      annotations: [],
    },
  });
  writeEvent(res, 'response.output_text.delta', {
    type: 'response.output_text.delta',
    item_id: message.id,
    output_index: 0,
    content_index: 0,
    delta: outputText,
  });
  writeEvent(res, 'response.output_text.done', {
    type: 'response.output_text.done',
    item_id: message.id,
    output_index: 0,
    content_index: 0,
    text: outputText,
  });
  writeEvent(res, 'response.content_part.done', {
    type: 'response.content_part.done',
    item_id: message.id,
    output_index: 0,
    content_index: 0,
    part: message.content[0],
  });
  writeEvent(res, 'response.output_item.done', {
    type: 'response.output_item.done',
    output_index: 0,
    item: message,
  });
  writeEvent(res, 'response.completed', {
    type: 'response.completed',
    response,
  });
  res.end();
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return { __invalidJson: true };
  }
}

/**
 * Create, but do not close over any external credentials for, the fake server.
 * The returned `ready` promise resolves after the loopback socket is listening.
 */
export function createFakeResponsesServer({
  host = '127.0.0.1',
  port = 0,
  responseText = DEFAULT_FAKE_RESPONSE,
} = {}) {
  let lastRequest = null;
  const server = createServer(async (req, res) => {
    const requestUrl = new URL(req.url || '/', `http://${host}`);

    if (req.method === 'GET' && (requestUrl.pathname === '/health' || requestUrl.pathname === '/v1/health')) {
      jsonResponse(res, 200, { status: 'ok', provider: 'chatgpt-fake' });
      return;
    }

    if (req.method !== 'POST' || requestUrl.pathname !== '/v1/responses') {
      jsonResponse(res, 404, { error: { message: 'Not found', type: 'invalid_request_error' } });
      return;
    }

    const body = await readRequestBody(req);
    if (body.__invalidJson) {
      jsonResponse(res, 400, { error: { message: 'Request body must be JSON', type: 'invalid_request_error' } });
      return;
    }
    lastRequest = body;

    const response = buildResponse(body, responseText);
    if (body.stream === false) {
      jsonResponse(res, 200, response);
      return;
    }
    streamResponse(res, response, response.output[0].content[0].text);
  });

  const ready = new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      resolve({ host, port: actualPort, baseUrl: `http://${host}:${actualPort}/v1` });
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });

  return {
    server,
    ready,
    getLastRequest: () => lastRequest,
  };
}

function parseArg(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0 || index + 1 >= args.length) return fallback;
  return args[index + 1];
}

async function runCli() {
  const args = process.argv.slice(2);
  const host = parseArg(args, '--host', '127.0.0.1');
  const port = Number.parseInt(parseArg(args, '--port', '0'), 10);
  const responseText = process.env.CHATGPT_FAKE_RESPONSE || DEFAULT_FAKE_RESPONSE;
  const instance = createFakeResponsesServer({ host, port, responseText });

  try {
    const address = await instance.ready;
    process.stdout.write(`CHATGPT_PROXY_READY ${JSON.stringify(address)}\n`);
  } catch (error) {
    process.stderr.write(`CHATGPT_PROXY_ERROR ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
    return;
  }

  const shutdown = () => {
    instance.server.close(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runCli();
}
