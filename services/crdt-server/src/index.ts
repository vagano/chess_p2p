import { Server } from '@hocuspocus/server';
import { onChange } from './hooks/onChange.js';
import { onLoadDocument } from './hooks/onLoadDocument.js';
import { onStoreDocument } from './hooks/onStoreDocument.js';

const port = parseInt(process.env.PORT || '3000', 10);

const server = Server.configure({
  port,
  debounce: 0,
  quiet: false,
  async onConnect(data) {
    console.log(`[WS] CONNECT doc="${data.documentName}" req=${data.request.url}`);
  },
  async onDisconnect(data) {
    console.log(`[WS] DISCONNECT doc="${data.documentName}"`);
  },
  async onChange(data) {
    try {
      await onChange(data);
    } catch (err) {
      console.error(`[WS] onChange ERROR doc="${data.documentName}":`, err);
    }
  },
  async onLoadDocument(data) {
    console.log(`[WS] LOAD doc="${data.documentName}"`);
    try {
      await onLoadDocument(data);
      console.log(`[WS] LOAD OK doc="${data.documentName}"`);
    } catch (err) {
      console.error(`[WS] LOAD ERROR doc="${data.documentName}":`, err);
    }
  },
  async onStoreDocument(data) {
    try {
      await onStoreDocument(data);
    } catch (err) {
      console.error(`[WS] STORE ERROR doc="${data.documentName}":`, err);
    }
  },
  async onListen() {
    console.log(`[CRDT Server] Listening on port ${port}`);
  },
});

server.listen();
