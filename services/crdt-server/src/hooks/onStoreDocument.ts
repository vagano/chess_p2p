import * as Y from 'yjs';
import type { onStoreDocumentPayload } from '@hocuspocus/server';
import { saveSnapshot } from '../db.js';

export async function onStoreDocument(data: onStoreDocumentPayload): Promise<void> {
  const { document, documentName } = data;

  const snapshot = Y.encodeStateAsUpdate(document);
  const stateVector = Y.encodeStateVector(document);

  await saveSnapshot(documentName, snapshot, stateVector).catch((err) => {
    console.error(`[Store] Failed to save snapshot for ${documentName}:`, err);
  });

  console.log(`[Store] Saved snapshot for room ${documentName} (${snapshot.byteLength} bytes)`);
}
