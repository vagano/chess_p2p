import { WebrtcProvider } from 'y-webrtc';
import * as Y from 'yjs';

export function createWebrtcProvider(
  roomId: string,
  doc: Y.Doc,
  signalingServers: string[],
) {
  return new WebrtcProvider(roomId, doc, {
    signaling: signalingServers,
  });
}
