import type { ClientMessage, ServerMessage } from '@arkad/core';

const wsUrl = (): string =>
  `${typeof location !== 'undefined' && location.protocol === 'https:' ? 'wss' : 'ws'}://${typeof location !== 'undefined' ? location.host : ''}/ws`;

/** exponential reconnect backoff with a cap; attempt counts failures since the last open */
export function reconnectBackoffMs(attempt: number, base = 800, cap = 15_000): number {
  const a = Math.max(0, Math.floor(attempt));
  return Math.min(cap, Math.round(base * 2 ** Math.min(a, 10)));
}

export class Net {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private handlers = new Set<(msg: ServerMessage) => void>();
  private openHandlers = new Set<() => void>();
  public status: 'connecting' | 'open' | 'lost' = 'connecting';
  /** last close code + reason, surfaced on the canvas (stability fix) */
  public closeInfo = '';
  public statusListeners = new Set<(s: Net['status']) => void>();

  connect(): void {
    const ws = new WebSocket(wsUrl());
    this.ws = ws;
    this.setStatus('connecting');
    ws.onopen = () => {
      this.attempt = 0;
      this.closeInfo = '';
      this.setStatus('open');
      for (const f of this.openHandlers) f();
    };
    ws.onclose = (ev: CloseEvent) => {
      this.closeInfo = `${ev.code}${ev.reason ? ` ${ev.reason}` : ''}`;
      this.setStatus('lost');
      const wait = reconnectBackoffMs(this.attempt++);
      setTimeout(() => this.connect(), wait);
    };
    ws.onmessage = (ev: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(ev.data) as ServerMessage;
        for (const h of this.handlers) h(msg);
      } catch {
        /* ignore malformed */
      }
    };
  }

  private setStatus(s: Net['status']): void {
    this.status = s;
    for (const l of this.statusListeners) l(s);
  }

  onMessage(handler: (msg: ServerMessage) => void): void {
    this.handlers.add(handler);
  }

  onOpen(handler: () => void): void {
    this.openHandlers.add(handler);
  }

  send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }
}
