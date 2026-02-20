import { Server } from '@hocuspocus/server';
import { onChange } from './hooks/onChange.js';
import { onLoadDocument } from './hooks/onLoadDocument.js';
import { onStoreDocument } from './hooks/onStoreDocument.js';

const port = parseInt(process.env.PORT || '3000', 10);

const server = Server.configure({
  port,
  async onChange(data) {
    await onChange(data);
  },
  async onLoadDocument(data) {
    await onLoadDocument(data);
  },
  async onStoreDocument(data) {
    await onStoreDocument(data);
  },
  async onListen() {
    console.log(`[CRDT Server] Listening on port ${port}`);
  },
});

server.listen();
