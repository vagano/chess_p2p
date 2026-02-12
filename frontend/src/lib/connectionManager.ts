import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import { WebsocketProvider } from 'y-websocket';
import type { ConnectionMode } from './config';

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
  p2pTimeout?: number;       // ms to wait for P2P before fallback (default 10000)
  p2pRetryInterval?: number; // ms between P2P retry attempts in WS_FALLBACK (default 30000)
  onStateChange?: (state: ConnectionState) => void;
  onPeerCountChange?: (count: number) => void;
}

export class ConnectionManager {
  private doc: Y.Doc;
  private roomId: string;
  private mode: ConnectionMode;
  private webrtcProvider: WebrtcProvider | null = null;
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
      console.log(`[ConnectionManager] ${this.state} -> ${newState}`);
      this.state = newState;
      this.onStateChange?.(newState);
    }
  }

  // ─── Public API ────────────────────────────────────────────

  connect(): void {
    if (this.destroyed) return;

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

  /** Force sync with server (used in P2P mode for periodic validation) */
  syncWithServer(): Promise<void> {
    // In websocket mode, always connected — no-op
    if (this.mode === 'websocket') return Promise.resolve();

    return new Promise((resolve) => {
      if (!this.wsProvider) {
        this.wsProvider = new WebsocketProvider(
          this.wsServerUrl,
          this.roomId,
          this.doc,
          { connect: false }
        );
      }

      const onSync = (synced: boolean) => {
        if (synced) {
          this.wsProvider?.off('sync', onSync);
          // Disconnect after sync if in P2P mode
          if (this.state === 'P2P_CONNECTED') {
            setTimeout(() => {
              this.wsProvider?.disconnect();
              resolve();
            }, 500);
          } else {
            resolve();
          }
        }
      };

      this.wsProvider.on('sync', onSync);
      this.wsProvider.connect();

      // Timeout for sync
      setTimeout(() => {
        if (this.state === 'P2P_CONNECTED') {
          this.wsProvider?.disconnect();
        }
        resolve();
      }, 5000);
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
    this.setState('P2P_CONNECTING');

    this.webrtcProvider = new WebrtcProvider(this.roomId, this.doc, {
      signaling: this.signalingServers,
    });

    this.webrtcProvider.on('peers', (event: { webrtcPeers: string[]; bcPeers: string[] }) => {
      if (this.destroyed) return;
      const total = event.webrtcPeers.length + event.bcPeers.length;
      this.onPeerCountChange?.(total);
      if (total > 0 && this.state === 'P2P_CONNECTING') {
        this.setState('P2P_CONNECTED');
      }
    });

    this.webrtcProvider.on('synced', () => {
      if (this.destroyed) return;
      if (this.state === 'P2P_CONNECTING') {
        this.setState('P2P_CONNECTED');
      }
    });

    // No fallback — just stay in P2P_CONNECTING until peers arrive
  }

  // ─── Mode: WebSocket only ─────────────────────────────────

  private connectWSOnly(): void {
    this.setState('WS_CONNECTING');

    this.wsProvider = new WebsocketProvider(
      this.wsServerUrl,
      this.roomId,
      this.doc,
    );

    this.wsProvider.on('status', (event: { status: string }) => {
      if (this.destroyed) return;
      if (event.status === 'connected') {
        this.setState('WS_CONNECTED');
      } else if (event.status === 'disconnected') {
        this.setState('RECONNECTING');
      }
    });

    this.wsProvider.on('sync', (synced: boolean) => {
      if (this.destroyed) return;
      if (synced) this.setState('WS_CONNECTED');
    });
  }

  // ─── Mode: Hybrid (P2P primary, WS fallback) ──────────────

  private connectHybrid(): void {
    this.startP2P();
  }

  private startP2P(): void {
    this.setState('P2P_CONNECTING');

    this.webrtcProvider = new WebrtcProvider(this.roomId, this.doc, {
      signaling: this.signalingServers,
    });

    this.webrtcProvider.on('peers', (event: { webrtcPeers: string[]; bcPeers: string[] }) => {
      if (this.destroyed) return;
      const total = event.webrtcPeers.length + event.bcPeers.length;
      this.onPeerCountChange?.(total);
      if (total > 0 && this.state === 'P2P_CONNECTING') {
        this.onP2PConnected();
      }
    });

    this.webrtcProvider.on('synced', () => {
      if (this.destroyed) return;
      if (this.state === 'P2P_CONNECTING') {
        this.onP2PConnected();
      }
    });

    // Set timeout for P2P connection → fallback to WS
    this.p2pTimeoutTimer = setTimeout(() => {
      if (this.state === 'P2P_CONNECTING') {
        console.log('[ConnectionManager] P2P timeout, falling back to WebSocket');
        this.activateWSFallback();
      }
    }, this.p2pTimeout);
  }

  private onP2PConnected(): void {
    if (this.p2pTimeoutTimer) {
      clearTimeout(this.p2pTimeoutTimer);
      this.p2pTimeoutTimer = null;
    }

    // If we were on WS fallback, disconnect WS
    if (this.wsProvider) {
      console.log('[ConnectionManager] P2P restored, disconnecting WebSocket');
      this.wsProvider.disconnect();
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
      this.wsProvider = new WebsocketProvider(
        this.wsServerUrl,
        this.roomId,
        this.doc,
        { connect: false }
      );

      this.wsProvider.on('status', (event: { status: string }) => {
        if (this.destroyed) return;
        console.log(`[ConnectionManager] WebSocket status: ${event.status}`);
        if (event.status === 'disconnected' && this.state === 'WS_FALLBACK') {
          this.setState('RECONNECTING');
          setTimeout(() => {
            if (this.state === 'RECONNECTING' && this.wsProvider) {
              this.wsProvider.connect();
            }
          }, 2000);
        }
      });
    }

    this.wsProvider.connect();

    // Periodically try to restore P2P
    this.p2pRetryTimer = setInterval(() => {
      if (this.destroyed) return;
      if (this.state === 'WS_FALLBACK') {
        this.tryRestoreP2P();
      }
    }, this.p2pRetryInterval);
  }

  private tryRestoreP2P(): void {
    if (!this.webrtcProvider) return;
    const peers = this.webrtcProvider.awareness.getStates();
    if (peers.size > 1) {
      this.onP2PConnected();
    }
  }
}
