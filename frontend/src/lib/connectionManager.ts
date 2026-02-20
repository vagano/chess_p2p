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
  p2pTimeout?: number;
  p2pRetryInterval?: number;
  onStateChange?: (state: ConnectionState) => void;
  onPeerCountChange?: (count: number) => void;
  onLog?: (entry: string) => void;
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
    if (this.mode === 'websocket') return Promise.resolve();

    return new Promise((resolve) => {
      if (!this.wsProvider) {
        this.wsProvider = new WebsocketProvider(
          this.wsServerUrl,
          this.roomId,
          this.doc,
          { connect: false, params: {}, resyncInterval: 20000 }
        );
      }

      const onSync = (synced: boolean) => {
        if (synced) {
          this.wsProvider?.off('sync', onSync);
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
  }

  // ─── Mode: WebSocket only ─────────────────────────────────

  private connectWSOnly(): void {
    this.setState('WS_CONNECTING');
    this.createWSProvider(true);
  }

  // ─── Mode: Hybrid (P2P primary, WS fallback) ──────────────

  private connectHybrid(): void {
    this.startP2P();
  }

  private startP2P(): void {
    this.setState('P2P_CONNECTING');
    this.log(`WebRTC signaling: ${this.signalingServers.join(', ')}`);

    this.webrtcProvider = new WebrtcProvider(this.roomId, this.doc, {
      signaling: this.signalingServers,
    });

    this.webrtcProvider.on('peers', (event: { webrtcPeers: string[]; bcPeers: string[] }) => {
      if (this.destroyed) return;
      const total = event.webrtcPeers.length + event.bcPeers.length;
      this.log(`peers: webrtc=${event.webrtcPeers.length} bc=${event.bcPeers.length}`);
      this.onPeerCountChange?.(total);
      if (total > 0 && this.state === 'P2P_CONNECTING') {
        this.onP2PConnected();
      }
    });

    this.webrtcProvider.on('synced', () => {
      if (this.destroyed) return;
      this.log('WebRTC synced');
      if (this.state === 'P2P_CONNECTING') {
        this.onP2PConnected();
      }
    });

    this.p2pTimeoutTimer = setTimeout(() => {
      if (this.state === 'P2P_CONNECTING') {
        this.log('P2P timeout → WS fallback');
        this.activateWSFallback();
      }
    }, this.p2pTimeout);
  }

  private onP2PConnected(): void {
    if (this.p2pTimeoutTimer) {
      clearTimeout(this.p2pTimeoutTimer);
      this.p2pTimeoutTimer = null;
    }

    if (this.wsProvider) {
      this.log('P2P restored, disconnecting WS');
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
    this.createWSProvider(false);

    this.p2pRetryTimer = setInterval(() => {
      if (this.destroyed) return;
      if (this.state === 'WS_FALLBACK') {
        this.tryRestoreP2P();
      }
    }, this.p2pRetryInterval);
  }

  private createWSProvider(autoConnect: boolean): void {
    const url = `${this.wsServerUrl}/${encodeURIComponent(this.roomId)}`;
    this.log(`WS target: ${url}`);

    if (!this.wsProvider) {
      this.wsProvider = new WebsocketProvider(
        this.wsServerUrl,
        this.roomId,
        this.doc,
        { connect: false, params: {}, resyncInterval: 20000 }
      );

      this.wsProvider.on('status', (event: { status: string }) => {
        if (this.destroyed) return;
        this.log(`WS status: ${event.status}`);

        if (event.status === 'connected') {
          if (this.state === 'WS_CONNECTING') this.setState('WS_CONNECTED');
        } else if (event.status === 'disconnected') {
          if (this.state === 'WS_FALLBACK' || this.state === 'WS_CONNECTED') {
            this.setState('RECONNECTING');
            setTimeout(() => {
              if (!this.destroyed && this.state === 'RECONNECTING' && this.wsProvider) {
                this.log('WS reconnecting...');
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

      // Capture connection errors and close events
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

    if (autoConnect) {
      this.wsProvider.connect();
    } else {
      this.wsProvider.connect();
    }
  }

  private tryRestoreP2P(): void {
    if (!this.webrtcProvider) return;
    const peers = this.webrtcProvider.awareness.getStates();
    if (peers.size > 1) {
      this.onP2PConnected();
    }
  }
}
