import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createInitialEventState,
  isWindowsTaskkillParseNoise,
  processCodexEventStream,
} from './codex-event-handler.js';

async function* eventsFrom(items) {
  for (const item of items) {
    yield item;
  }
}

async function captureStdout(fn) {
  const original = process.stdout.write.bind(process.stdout);
  const captured = [];
  process.stdout.write = (chunk, ...rest) => {
    const text = typeof chunk === 'string' ? chunk : chunk.toString();
    captured.push(text);
    return true;
  };
  try {
    await fn();
  } finally {
    process.stdout.write = original;
  }
  return captured;
}

function tagLines(captured, tag) {
  return captured.filter((line) => line.startsWith(tag));
}

function makeConfig(overrides = {}) {
  return {
    cwd: undefined,
    threadId: null,
    threadOptions: {},
    normalizedPermissionMode: 'default',
    turnAbortController: new AbortController(),
    ...overrides,
  };
}

test('custom_tool_call exec apply_patch emits edit and result messages without a file_change event', async () => {
  const emittedMessages = [];
  const state = createInitialEventState((message) => emittedMessages.push(message));
  const patch = [
    '*** Begin Patch',
    '*** Update File: hbapp/src/example.js',
    '@@ -1 +1 @@',
    '-const size = 30;',
    '+const size = 32;',
    '*** End Patch',
  ].join('\n');
  const source = `const patch = ${JSON.stringify(patch)}; text(await tools.apply_patch(patch));`;

  await captureStdout(async () => {
    await processCodexEventStream(
      eventsFrom([
        {
          type: 'response_item',
          payload: { type: 'custom_tool_call', call_id: 'patch-1', name: 'exec', input: source },
        },
        {
          type: 'response_item',
          payload: { type: 'custom_tool_call_output', call_id: 'patch-1', output: 'Done' },
        },
      ]),
      state,
      makeConfig(),
    );
  });

  assert.deepEqual(emittedMessages, [
    {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{
          type: 'tool_use',
          id: 'codex_patch_patch-1_0',
          name: 'edit',
          input: {
            file_path: 'hbapp/src/example.js',
            old_string: 'const size = 30;',
            new_string: 'const size = 32;',
            start_line: 1,
            end_line: undefined,
            replace_all: false,
            source: 'codex_session_patch',
          },
        }],
      },
    },
    {
      type: 'user',
      message: {
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: 'codex_patch_patch-1_0',
          is_error: false,
          content: 'Patch applied',
        }],
      },
    },
  ]);
});

test('new thread completion uses thread.started id to replay custom_tool_call exec patches from session JSONL', async () => {
  const emittedMessages = [];
  const state = createInitialEventState((message) => emittedMessages.push(message));
  const patch = [
    '*** Begin Patch',
    '*** Update File: hbapp/src/example.js',
    '@@ -1 +1 @@',
    '-const size = 30;',
    '+const size = 32;',
    '*** End Patch',
  ].join('\n');
  const source = `const patch = ${JSON.stringify(patch)}; text(await tools.apply_patch(patch));`;
  const directory = await mkdtemp(join(tmpdir(), 'ccgui-codex-session-'));
  const sessionFile = join(directory, 'rollout.jsonl');
  const entries = [
    {
      type: 'response_item',
      payload: { type: 'custom_tool_call', call_id: 'session-patch-1', name: 'exec', input: source },
    },
    {
      type: 'response_item',
      payload: { type: 'custom_tool_call_output', call_id: 'session-patch-1', output: 'Done' },
    },
  ];

  try {
    await writeFile(sessionFile, `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`, 'utf8');
    const lookedUpThreadIds = [];

    await captureStdout(async () => {
      await processCodexEventStream(
        eventsFrom([
          { type: 'thread.started', thread_id: 'new-thread-1' },
          { type: 'turn.completed' },
        ]),
        state,
        makeConfig({
          threadId: null,
          findSessionFileByThreadId: (threadId) => {
            lookedUpThreadIds.push(threadId);
            return sessionFile;
          },
        }),
      );
    });

    assert.deepEqual(lookedUpThreadIds, ['new-thread-1']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  assert.equal(emittedMessages.length, 2);
  assert.equal(emittedMessages[0].message.content[0].type, 'tool_use');
  assert.equal(emittedMessages[0].message.content[0].name, 'edit');
  assert.equal(emittedMessages[0].message.content[0].input.file_path, 'hbapp/src/example.js');
  assert.equal(emittedMessages[1].message.content[0].type, 'tool_result');
  assert.equal(emittedMessages[1].message.content[0].tool_use_id, 'codex_patch_session-patch-1_0');
  assert.equal(emittedMessages[1].message.content[0].is_error, false);
});

test('Codex item.updated agent_message emits incremental content deltas before completion', async () => {
  const emittedMessages = [];
  const state = createInitialEventState((message) => emittedMessages.push(message));

  const captured = await captureStdout(async () => {
    await processCodexEventStream(
      eventsFrom([
        {
          type: 'item.updated',
          item: { id: 'msg-1', type: 'agent_message', text: 'Hel' },
        },
        {
          type: 'item.updated',
          item: { id: 'msg-1', type: 'agent_message', text: 'Hello' },
        },
        {
          type: 'item.completed',
          item: { id: 'msg-1', type: 'agent_message', text: 'Hello' },
        },
      ]),
      state,
      makeConfig(),
    );
  });

  const deltaLines = tagLines(captured, '[CONTENT_DELTA]');

  assert.equal(deltaLines.length, 2);
  assert.match(deltaLines[0], /"Hel"/);
  assert.match(deltaLines[1], /"lo"/);
  assert.equal(state.assistantText, 'Hello');
  assert.equal(emittedMessages.length, 1);
  assert.deepEqual(emittedMessages[0], {
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: 'Hello' }],
    },
  });
});

test('isWindowsTaskkillParseNoise: matches English SUCCESS taskkill output', () => {
  const message =
    'Failed to parse item: SUCCESS: The process with PID 12345 (child process of PID 67890) has been terminated.';
  assert.equal(isWindowsTaskkillParseNoise(message), true);
});

test('isWindowsTaskkillParseNoise: matches Chinese 成功 taskkill output', () => {
  const message = 'Failed to parse item: 成功: 进程 PID 12345 (PID 67890 的子进程) 已被终止';
  assert.equal(isWindowsTaskkillParseNoise(message), true);
});

test('isWindowsTaskkillParseNoise: matches mojibake (replacement char) with PID pair', () => {
  const message = 'Failed to parse item: ���: PID 12345 PID 67890 ��';
  assert.equal(isWindowsTaskkillParseNoise(message), true);
});

test('isWindowsTaskkillParseNoise: ignores message without "Failed to parse item:" prefix', () => {
  const message = 'SUCCESS: process PID 12345 (child PID 67890) terminated';
  assert.equal(isWindowsTaskkillParseNoise(message), false);
});

test('isWindowsTaskkillParseNoise: ignores message with only a single PID', () => {
  const message = 'Failed to parse item: SUCCESS: process PID 12345 terminated';
  assert.equal(isWindowsTaskkillParseNoise(message), false);
});

test('isWindowsTaskkillParseNoise: ignores real Codex parse errors without taskkill keywords', () => {
  const message = 'Failed to parse item: {"id":"msg-1","type":"agent_message"';
  assert.equal(isWindowsTaskkillParseNoise(message), false);
});

test('isWindowsTaskkillParseNoise: returns false for non-string input', () => {
  assert.equal(isWindowsTaskkillParseNoise(null), false);
  assert.equal(isWindowsTaskkillParseNoise(undefined), false);
  assert.equal(isWindowsTaskkillParseNoise(42), false);
  assert.equal(isWindowsTaskkillParseNoise({ msg: 'x' }), false);
});

test('isWindowsTaskkillParseNoise: returns false for empty payload after prefix', () => {
  assert.equal(isWindowsTaskkillParseNoise('Failed to parse item:'), false);
  assert.equal(isWindowsTaskkillParseNoise('Failed to parse item:   '), false);
});

test('isWindowsTaskkillParseNoise: matches when only "terminated" keyword present with PID pair', () => {
  const message = 'Failed to parse item: PID 100 PID 200 process tree terminated';
  assert.equal(isWindowsTaskkillParseNoise(message), true);
});
