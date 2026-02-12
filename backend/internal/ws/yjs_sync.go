package ws

// y-websocket protocol message types
// Reference: https://github.com/yjs/y-websocket/blob/master/src/y-websocket.js
const (
	MsgSync        = 0
	MsgAwareness   = 1
	MsgAuth        = 2
	MsgQueryAwareness = 3
)

// Sync protocol sub-message types
// Reference: https://github.com/yjs/y-protocols/blob/master/sync.js
const (
	SyncStep1 = 0 // Client sends state vector
	SyncStep2 = 1 // Server responds with missing updates
	SyncUpdate = 2 // Either side sends an update
)

// EncodeSyncStep1 creates a sync step 1 message containing a state vector.
func EncodeSyncStep1(stateVector []byte) []byte {
	msg := []byte{MsgSync, SyncStep1}
	msg = append(msg, encodeVarUint(uint64(len(stateVector)))...)
	msg = append(msg, stateVector...)
	return msg
}

// EncodeSyncStep2 creates a sync step 2 message containing updates.
func EncodeSyncStep2(update []byte) []byte {
	msg := []byte{MsgSync, SyncStep2}
	msg = append(msg, encodeVarUint(uint64(len(update)))...)
	msg = append(msg, update...)
	return msg
}

// EncodeSyncUpdate creates a sync update message.
func EncodeSyncUpdate(update []byte) []byte {
	msg := []byte{MsgSync, SyncUpdate}
	msg = append(msg, encodeVarUint(uint64(len(update)))...)
	msg = append(msg, update...)
	return msg
}

// EncodeAwareness creates an awareness message.
func EncodeAwareness(data []byte) []byte {
	msg := []byte{MsgAwareness}
	msg = append(msg, encodeVarUint(uint64(len(data)))...)
	msg = append(msg, data...)
	return msg
}

// encodeVarUint encodes a uint64 as a variable-length unsigned integer.
func encodeVarUint(num uint64) []byte {
	var buf []byte
	for num > 0x7f {
		buf = append(buf, byte(num&0x7f)|0x80)
		num >>= 7
	}
	buf = append(buf, byte(num))
	return buf
}

// decodeVarUint decodes a variable-length unsigned integer from data starting at offset.
// Returns the decoded value and the new offset.
func decodeVarUint(data []byte, offset int) (uint64, int) {
	var result uint64
	var shift uint
	for offset < len(data) {
		b := data[offset]
		offset++
		result |= uint64(b&0x7f) << shift
		if b&0x80 == 0 {
			break
		}
		shift += 7
	}
	return result, offset
}

// ParseMessage parses a y-websocket protocol message.
// Returns (messageType, subType, payload, error).
func ParseMessage(data []byte) (msgType byte, subType byte, payload []byte, err error) {
	if len(data) < 1 {
		return 0, 0, nil, nil
	}

	msgType = data[0]

	if msgType == MsgSync && len(data) >= 2 {
		subType = data[1]
		// Read varUint length and then payload
		if len(data) > 2 {
			length, offset := decodeVarUint(data, 2)
			end := offset + int(length)
			if end > len(data) {
				end = len(data)
			}
			payload = data[offset:end]
		}
		return
	}

	if msgType == MsgAwareness && len(data) > 1 {
		length, offset := decodeVarUint(data, 1)
		end := offset + int(length)
		if end > len(data) {
			end = len(data)
		}
		payload = data[offset:end]
		return
	}

	payload = data[1:]
	return
}
