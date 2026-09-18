import { describe, it, expect } from 'vitest';
import { parseClientMessage, serialize, GAME_IDS, type ClientMessage } from './protocol';

describe('protocol', () => {
  it('lists the hall cabinets (R22 added coast)', () => {
    expect(GAME_IDS).toEqual(['snake', 'puck', 'block', 'galaxy', 'river', 'myriad', 'coast']);
  });

  it('parses a join message', () => {
    const msg = parseClientMessage(JSON.stringify({ type: 'join', name: 'AKIRA', lang: 'ja' }));
    expect(msg).toEqual({ type: 'join', name: 'AKIRA', lang: 'ja' });
  });

  it('parses an input message with direction', () => {
    const raw = JSON.stringify({ type: 'input', dir: { dx: 1, dy: 0 }, button: true });
    const msg = parseClientMessage(raw);
    expect(msg).toEqual({ type: 'input', dir: { dx: 1, dy: 0 }, button: true });
  });

  it('accepts null direction', () => {
    const msg = parseClientMessage(JSON.stringify({ type: 'input', dir: null, button: false }));
    expect(msg).toMatchObject({ type: 'input', dir: null });
  });

  it('rejects malformed JSON', () => {
    expect(parseClientMessage('{oops')).toBeNull();
  });

  it('rejects unknown message types', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'hack' }))).toBeNull();
  });

  it('rejects bad game ids in start', () => {
    const msg = { type: 'start', game: 'doodlejump', mode: 'solo' } as unknown as ClientMessage;
    expect(parseClientMessage(JSON.stringify(msg))).toBeNull();
  });

  it('rejects non-unit directions', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'input', dir: { dx: 3, dy: 0 } }))).toBeNull();
  });

  it('rejects diagonal directions', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'input', dir: { dx: 1, dy: 1 } }))).toBeNull();
  });

  it('serialize round-trips', () => {
    const msg: ClientMessage = { type: 'start', game: 'snake', mode: 'versus' };
    expect(parseClientMessage(serialize(msg))).toEqual(msg);
  });
});

describe('input seq hygiene', () => {
  it('drops non-finite seq values', () => {
    const msg = parseClientMessage('{"type":"input","dir":{"dx":1,"dy":0},"button":false,"seq":1e999}');
    expect(msg?.type).toBe('input');
    expect((msg as { seq?: number }).seq).toBeUndefined();
  });

  it('truncates fractional seq', () => {
    const msg = parseClientMessage('{"type":"input","dir":{"dx":1,"dy":0},"button":false,"seq":4.7}');
    expect((msg as { seq?: number }).seq).toBe(4);
  });
});

describe('hall subscription (R8)', () => {
  it('accepts hall watch on/off', () => {
    expect(parseClientMessage('{"type":"hall","watch":true}')).toEqual({ type: 'hall', watch: true });
    expect(parseClientMessage('{"type":"hall","watch":false}')).toEqual({ type: 'hall', watch: false });
  });
  it('rejects malformed hall messages', () => {
    expect(parseClientMessage('{"type":"hall"}')).toBeNull();
    expect(parseClientMessage('{"type":"hall","watch":"yes"}')).toBeNull();
    expect(parseClientMessage('{"type":"hall","watch":1}')).toBeNull();
  });
});

describe('operator protocol (R16-R18)', () => {
  it('accepts coin, stats and freePlay messages', () => {
    expect(parseClientMessage('{"type":"coin"}')).toEqual({ type: 'coin' });
    expect(parseClientMessage('{"type":"stats"}')).toEqual({ type: 'stats' });
    expect(parseClientMessage('{"type":"freePlay","on":true}')).toEqual({ type: 'freePlay', on: true });
    expect(parseClientMessage('{"type":"freePlay","on":false}')).toEqual({ type: 'freePlay', on: false });
  });
  it('rejects malformed operator messages', () => {
    expect(parseClientMessage('{"type":"freePlay"}')).toBeNull();
    expect(parseClientMessage('{"type":"freePlay","on":"yes"}')).toBeNull();
    expect(parseClientMessage('{"type":"freePlay","on":1}')).toBeNull();
    expect(parseClientMessage('{"type":"coin","hack":true}')).toEqual({ type: 'coin' });
  });
});
