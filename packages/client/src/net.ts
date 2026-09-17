import type { ClientMessage, ServerMessage } from '@arkad/core';

const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

export class Net {
  private ws: WebSocket | null = null;
  private handlers = new Set<(msg: ServerMessage) => void>();
  public status: 'connecting' | 'open' | 'lost' = 'connecting';
  public statusListeners = new Set<(s: Net['status']) => void>();

  connect(): void {
    const ws = new WebSocket(wsUrl);
    this.ws = ws;
    this.setStatus('connecting');
    ws.onopen = () => this.setStatus('open');
    ws.onclose = () => {
      this.setStatus('lost');
      setTimeout(() => this.connect(), 2000);
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

  send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }
}
