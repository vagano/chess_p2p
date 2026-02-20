import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import type { ConnectionMode } from '../types';

export type ConnectionState =
  | 'P2P_CONNECTING'
  | 'P2P_CONNECTED'
  | 'WS_CONNECTING'
  | 'WS_CONNECTED'
  | 'WS_FALLBACK'
  | 'RECONNECTING'
  | 'DISCONNECTED';

export interface ConnectionManagerOptions {
  doc: Y.Doc;
  roomId: string;
  mode: ConnectionMode;
  signalingServers: string[];
  wsServerUrl: string;
  p2pTimeout?: number;
  p2pRetryInterval?: number;
  onStateChange?: (state: ConnectionState) => void;
  onPeerCountChange?: (count: number) => void;
  onLog?: (entry: string) => void;
}

/**
 * Manages Yjs document connections.
 *
 * Supports three modes:
 * - 'websocket': WS only (TMA, rated games)
 * - 'p2p': WebRTC only (requires y-webrtc, caller must provide WebrtcProvider)
 * - 'hybrid': P2P primary with WS fallback
 *
 * P2P functionality requires the consuming app to supply a WebrtcProvider
 * via `attachWebrtcProvider()` since y-webrtc is an optional dependency.
 */
export class ConnectionManager {
  private doc: Y.Doc;
  private roomId: string;
  private mode: ConnectionMode;
  private webrtcProvider: { destroy(): void; awareness: { getStates(): Map<number, unknown> }; on(event: string, cb: (...args: unknown[]) => void): void } | null = null;
  private wsProvider: WebsocketProvider | null = null;
  private state: ConnectionState = 'DISCONNECTED';
  private p2pTimeout: number;
  private p2pRetryInterval: number;
  private p2pTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private p2pRetryTimer: ReturnType<typeof setInterval> | null = null;
  private signalingServers: string[];
  private wsServerUrl: string;
  private onStateChange?: (state: ConnectionState) => void;
  private onPeerCountChange?: (count: number) => void;
  private onLog?: (entry: string) => void;
  private destroyed = false;

  constructor(options: ConnectionManagerOptions) {
    this.doc = options.doc;
    this.roomId = options.roomId;
    this.mode = options.mode;
    this.signalingServers = options.signalingServers;
    this.wsServerUrl = options.wsServerUrl;
    this.p2pTimeout = options.p2pTimeout ?? 10000;
    this.p2pRetryInterval = options.p2pRetryInterval ?? 30000;
    this.onStateChange = options.onStateChange;
    this.onPeerCountChange = options.onPeerCountChange;
    this.onLog = options.onLog;
  }

  private log(msg: string): void {
    const ts = new Date().toLocaleTimeString('en-GB', { hour12: false });
    const entry = `${ts} ${msg}`;
    console.log(`[CM] ${entry}`);
    this.onLog?.(entry);
  }

  get currentState(): ConnectionState {
    return this.state;
  }

  get isP2P(): boolean {
    return this.state === 'P2P_CONNECTED';
  }

  get isConnected(): boolean {
    return (
      this.state === 'P2P_CONNECTED' ||
      this.state === 'WS_CONNECTED' ||
      this.state === 'WS_FALLBACK'
    );
  }

  private setState(newState: ConnectionState): void {
    if (this.state !== newState) {
      this.log(`state: ${this.state} → ${newState}`);
      this.state = newState;
      this.onStateChange?.(newState);
    }
  }

  /**
   * Attach an external WebrtcProvider for P2P modes.
   * Called by apps that include y-webrtc (e.g. web app).
   */
  attachWebrtcProvider(provider: ConnectionManager['webrtcProvider']): void {
    this.webrtcProvider = provider;
  }

  connect(): void {
    if (this.destroyed) return;
    this.log(`connect() mode=${this.mode} room=${this.roomId}`);

    switch (this.mode) {
      case 'p2p':
        this.connectP2POnly();
        break;
      case 'websocket':
        this.connectWSOnly();
        break;
      case 'hybrid':
      default:
        this.connectHybrid();
        break;
    }
  }

  syncWithServer(): Promise<void> {
    if (this.wsProvider?.wsconnected) return Promise.resolve();

    return new Promise((resolve) => {
      if (!this.wsProvider) {
        this.createWSProvider();
      } else {
        this.wsProvider.connect();
      }

      const onSync = (synced: boolean) => {
        if (synced) {
          this.wsProvider?.off('sync', onSync);
          resolve();
        }
      };

      this.wsProvider!.on('sync', onSync);

      setTimeout(() => resolve(), 5000);
    });
  }

  destroy(): void {
    this.destroyed = true;

    if (this.p2pTimeoutTimer) clearTimeout(this.p2pTimeoutTimer);
    if (this.p2pRetryTimer) clearInterval(this.p2pRetryTimer);

    this.webrtcProvider?.destroy();
    this.wsProvider?.destroy();
    this.webrtcProvider = null;
    this.wsProvider = null;

    this.setState('DISCONNECTED');
  }

  // ─── Mode: P2P only ───────────────────────────────────────

  private connectP2POnly(): void {
    if (!this.webrtcProvider) {
      this.log('P2P mode requested but no WebrtcProvider attached, falling back to WS');
      this.connectWSOnly();
      return;
    }
    this.setState('P2P_CONNECTING');
    this.setupP2PListeners();
  }

  private setupP2PListeners(): void {
    if (!this.webrtcProvider) return;

    this.webrtcProvider.on('peers', (event: unknown) => {
      if (this.destroyed) return;
      const e = event as { webrtcPeers: string[]; bcPeers: string[] };
      const total = e.webrtcPeers.length + e.bcPeers.length;
      this.log(`peers: webrtc=${e.webrtcPeers.length} bc=${e.bcPeers.length}`);
      this.onPeerCountChange?.(total);
      if (total > 0 && this.state !== 'P2P_CONNECTED') {
        this.onP2PConnected();
      }
    });

    this.webrtcProvider.on('synced', () => {
      if (this.destroyed) return;
      this.log('WebRTC synced');
      if (this.state !== 'P2P_CONNECTED') {
        this.onP2PConnected();
      }
    });
  }

  // ─── Mode: WebSocket only ─────────────────────────────────

  private connectWSOnly(): void {
    this.setState('WS_CONNECTING');
    this.createWSProvider();
  }

  // ─── Mode: Hybrid (P2P for fast sync, WS always on for server validation) ──

  private connectHybrid(): void {
    this.log(`Hybrid: starting WS (required for server validation)`);
    this.setState('WS_CONNECTING');
    this.createWSProvider();

    if (!this.webrtcProvider) {
      this.log('Hybrid mode but no WebrtcProvider, WS-only');
      return;
    }

    this.log(`WebRTC signaling: ${this.signalingServers.join(', ')}`);
    this.setupP2PListeners();
  }

  private onP2PConnected(): void {
    if (this.p2pTimeoutTimer) {
      clearTimeout(this.p2pTimeoutTimer);
      this.p2pTimeoutTimer = null;
    }

    if (this.p2pRetryTimer) {
      clearInterval(this.p2pRetryTimer);
      this.p2pRetryTimer = null;
    }

    this.setState('P2P_CONNECTED');
  }

  private activateWSFallback(): void {
    this.setState('WS_FALLBACK');
    if (!this.wsProvider) {
      this.createWSProvider();
    }

    this.p2pRetryTimer = setInterval(() => {
      if (this.destroyed) return;
      if (this.state === 'WS_FALLBACK') {
        this.tryRestoreP2P();
      }
    }, this.p2pRetryInterval);
  }

  private createWSProvider(): void {
    const url = `${this.wsServerUrl}/${encodeURIComponent(this.roomId)}`;
    this.log(`WS target: ${url}`);

    if (!this.wsProvider) {
      this.wsProvider = new WebsocketProvider(
        this.wsServerUrl,
        this.roomId,
        this.doc,
        { connect: false, params: {}, resyncInterval: 20000 },
      );

      this.wsProvider.on('status', (event: { status: string }) => {
        if (this.destroyed) return;
        this.log(`WS status: ${event.status}`);

        if (event.status === 'connected') {
          if (this.state === 'WS_CONNECTING') this.setState('WS_CONNECTED');
        } else if (event.status === 'disconnected') {
          if (
            this.state === 'WS_FALLBACK' ||
            this.state === 'WS_CONNECTED'
          ) {
            this.setState('RECONNECTING');
            setTimeout(() => {
              if (!this.destroyed && this.state === 'RECONNECTING' && this.wsProvider) {
                this.log('WS reconnecting...');
                this.wsProvider.connect();
              }
            }, 2000);
          }
          // In hybrid mode, reconnect WS silently even when P2P is primary
          if (this.mode === 'hybrid' && this.state === 'P2P_CONNECTED' && this.wsProvider) {
            this.log('WS lost while P2P active, reconnecting WS for validation...');
            setTimeout(() => {
              if (!this.destroyed && this.wsProvider) {
                this.wsProvider.connect();
              }
            }, 2000);
          }
        }
      });

      this.wsProvider.on('sync', (synced: boolean) => {
        if (this.destroyed) return;
        this.log(`WS sync: ${synced}`);
        if (synced && this.state === 'WS_CONNECTING') {
          this.setState('WS_CONNECTED');
        }
      });

      this.wsProvider.on('connection-error', (event: Event) => {
        this.log(`WS ERROR: ${(event as ErrorEvent).message || 'unknown error'}`);
      });

      this.wsProvider.on('connection-close', (event: CloseEvent | null) => {
        if (event) {
          this.log(`WS CLOSE: code=${event.code} reason="${event.reason}" clean=${event.wasClean}`);
        } else {
          this.log('WS CLOSE: event=null');
        }
      });
    }

    this.wsProvider.connect();
  }

  private tryRestoreP2P(): void {
    if (!this.webrtcProvider) return;
    const peers = this.webrtcProvider.awareness.getStates();
    if (peers.size > 1) {
      this.onP2PConnected();
    }
  }
}
