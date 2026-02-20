import * as Y from 'yjs';
import type { onLoadDocumentPayload } from '@hocuspocus/server';
import { loadSnapshot } from '../db.js';

export async function onLoadDocument(data: onLoadDocumentPayload): Promise<void> {
  const { document, documentName } = data;

  const saved = await loadSnapshot(documentName).catch(() => null);
  if (saved) {
    Y.applyUpdate(document, saved.snapshot);
    console.log(`[Load] Restored snapshot for room ${documentName}`);
  } else {
    console.log(`[Load] No snapshot for room ${documentName}, starting fresh`);
  }
}
