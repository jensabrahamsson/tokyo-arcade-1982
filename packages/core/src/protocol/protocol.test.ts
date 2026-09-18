import { describe, it, expect } from 'vitest';
import { parseClientMessage, serialize, GAME_IDS, type ClientMessage } from './protocol';

describe('protocol', () => {
  it('lists the six arcade cabinets', () => {
    expect(GAME_IDS).toEqual(['snake', 'puck', 'block', 'galaxy', 'river', 'myriad']);
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
