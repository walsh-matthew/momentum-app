// A fake Anthropic API for the browser specs (MOM-111). It listens on this machine only and answers the one request guided
// setup makes (POST /v1/messages) from a script, so the setup spec runs a whole conversation through the real screen, server
// action, service, budget and database without a paid call or a key.
//
// - A request whose system prompt is setup's gets the next scripted turn of Claude's: the number of assistant messages in the
//   request says how far the conversation has got, so the fake keeps no state and any number of people can talk to it.
// - Every other request gets a 401 in the API's own error shape. The app turns that into "not configured", which is what the
//   wizard spec expects, so those specs behave as they did when the key was empty.
// - GET /__fake/last reports the newest setup request (how many, and the text of its last user message), so the spec can check
//   what the screen sent. It never holds a conversation.
// - POST /__fake/slow?ms=N holds each setup answer back N milliseconds, and POST /__fake/unusable?count=N answers the next N
//   setup requests with a reply that is not a turn, so a spec can watch the screen while Claude is slow or a reply is thrown
//   away (MOM-111 finding 10). Both reset with ms=0 and count=0.

import { createServer, type Server } from 'node:http';
import type { AssistantTurn } from '../../../types/setup';

const SETUP_PROMPT_START = 'You guide one person through setting up their goals in Momentum';

interface MessagesBody {
  model?: string;
  system?: unknown;
  messages?: { role: string; content: unknown }[];
}

export interface FakeAnthropic {
  close: () => Promise<void>;
}

function lastUserText(body: MessagesBody): string {
  const last = [...(body.messages ?? [])].reverse().find((m) => m.role === 'user');
  if (!last) return '';
  if (typeof last.content === 'string') return last.content;
  return Array.isArray(last.content) ? last.content.map((b) => (b as { text?: string }).text ?? '').join('\n') : '';
}

export function startFakeAnthropic(port: number, script: readonly AssistantTurn[]): Promise<FakeAnthropic> {
  let setupRequests = 0;
  let lastSetupUserText = '';
  let slowMs = 0;
  let unusableLeft = 0;

  const server: Server = createServer((req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    if (req.method === 'GET' && req.url === '/__fake/last') {
      send(200, { setupRequests, lastSetupUserText });
      return;
    }
    if (req.method === 'POST' && req.url?.startsWith('/__fake/')) {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/__fake/slow') slowMs = Math.max(0, Number(url.searchParams.get('ms')) || 0);
      if (url.pathname === '/__fake/unusable') unusableLeft = Math.max(0, Number(url.searchParams.get('count')) || 0);
      send(200, { slowMs, unusableLeft });
      return;
    }
    if (req.method !== 'POST' || !req.url?.startsWith('/v1/messages')) {
      send(404, { type: 'error', error: { type: 'not_found_error', message: 'not found' } });
      return;
    }

    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      let body: MessagesBody;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as MessagesBody;
      } catch {
        send(400, { type: 'error', error: { type: 'invalid_request_error', message: 'bad json' } });
        return;
      }
      if (typeof body.system !== 'string' || !body.system.startsWith(SETUP_PROMPT_START)) {
        send(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
        return;
      }
      setupRequests += 1;
      lastSetupUserText = lastUserText(body);
      const turnIndex = (body.messages ?? []).filter((m) => m.role === 'assistant').length;
      const turn = script[turnIndex];
      if (!turn) {
        send(500, { type: 'error', error: { type: 'api_error', message: `the script has no turn ${turnIndex}` } });
        return;
      }
      const unusable = unusableLeft > 0;
      if (unusable) unusableLeft -= 1;
      setTimeout(() => {
        send(200, {
          id: `msg_fake_${setupRequests}`,
          type: 'message',
          role: 'assistant',
          model: body.model ?? 'fake',
          content: [{ type: 'text', text: unusable ? '{"not":"a turn"}' : JSON.stringify(turn) }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 4000, output_tokens: 700 },
        });
      }, slowMs);
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    // 127.0.0.1 only: the fake is never reachable from another machine.
    server.listen(port, '127.0.0.1', () => {
      resolve({ close: () => new Promise((done) => server.close(() => done())) });
    });
  });
}
