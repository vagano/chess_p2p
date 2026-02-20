import { useEffect, useRef, useState, useCallback } from 'react';
import * as Y from 'yjs';
import {
  ConnectionManager,
  type ConnectionState,
  type ConnectionManagerOptions,
} from '../lib/connectionManager';
import { createGameDoc, initGameState } from '../lib/gameState';
import type { AppConfig } from '../types';

export interface UseYjsSyncOptions {
  roomId: string;
  config: AppConfig;
  /**
   * Optional factory for creating a WebrtcProvider.
   * Only needed in apps that support P2P (web app with y-webrtc).
   */
  createWebrtcProvider?: (roomId: string, doc: Y.Doc, signalingServers: string[]) => {
    destroy(): void;
    awareness: { getStates(): Map<number, unknown> };
    on(event: string, cb: (...args: unknown[]) => void): void;
  };
}

export interface UseYjsSyncReturn {
  doc: Y.Doc;
  connectionState: ConnectionState;
  isConnected: boolean;
  isP2P: boolean;
  syncWithServer: () => Promise<void>;
  peerCount: number;
  connLog: string[];
}

const MAX_LOG = 30;

export function useYjsSync({ roomId, config, createWebrtcProvider }: UseYjsSyncOptions): UseYjsSyncReturn {
  const docRef = useRef<Y.Doc | null>(null);
  const managerRef = useRef<ConnectionManager | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('DISCONNECTED');
  const [peerCount, setPeerCount] = useState(0);
  const [connLog, setConnLog] = useState<string[]>([]);

  if (!docRef.current) {
    docRef.current = createGameDoc();
  }

  useEffect(() => {
    const doc = docRef.current!;

    const gameMap = doc.getMap('game');
    if (!gameMap.has('fen')) {
      initGameState(doc);
    }

    const options: ConnectionManagerOptions = {
      doc,
      roomId,
      mode: config.connectionMode,
      signalingServers: config.signalingServers,
      wsServerUrl: config.wsServerUrl,
      onStateChange: (state) => setConnectionState(state),
      onPeerCountChange: (count) => setPeerCount(count),
      onLog: (entry) => setConnLog((prev) => [...prev.slice(-(MAX_LOG - 1)), entry]),
    };

    const manager = new ConnectionManager(options);
    managerRef.current = manager;

    if (createWebrtcProvider && (config.connectionMode === 'p2p' || config.connectionMode === 'hybrid')) {
      const webrtcProvider = createWebrtcProvider(roomId, doc, config.signalingServers);
      manager.attachWebrtcProvider(webrtcProvider);
    }

    manager.connect();

    return () => {
      manager.destroy();
      managerRef.current = null;
    };
  }, [roomId, config, createWebrtcProvider]);

  const syncWithServer = useCallback(async () => {
    if (managerRef.current) {
      await managerRef.current.syncWithServer();
    }
  }, []);

  return {
    doc: docRef.current!,
    connectionState,
    isConnected:
      connectionState === 'P2P_CONNECTED' ||
      connectionState === 'WS_CONNECTED' ||
      connectionState === 'WS_FALLBACK',
    isP2P: connectionState === 'P2P_CONNECTED',
    syncWithServer,
    peerCount,
    connLog,
  };
}
