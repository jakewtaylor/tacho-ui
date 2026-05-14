package card

import (
	"encoding/binary"
	"fmt"
	"time"

	"github.com/jakewtaylor/go-ddd/internal/primitives"
)

// AuthStatusEntry is one decoded slot of EF_Places_Authentication or
// EF_GNSS_Places_Authentication. Both EFs use the identical 5-byte
// PlaceAuthStatusRecord / GNSSAuthStatusADRecord layout (2021/1228
// §2.116b and §2.79b).
//
// The TimeStamp matches an `entryTime` (Places) or `timeStamp` (GNSS)
// in the corresponding non-auth EF — that's how the records join.
//
// Byte layout (5 bytes total):
//
//	timeStamp             TimeReal                       — 4 bytes
//	authenticationStatus  PositionAuthenticationStatus   — 1 byte
type AuthStatusEntry struct {
	TimeStamp  time.Time
	AuthStatus AuthenticationStatus
}

const authStatusRecordLen = 5

// DecodeAuthStatus parses either EF body. Layout: 2-byte pointer +
// cyclic array of 5-byte records. On a Gen2v2 driver card:
//
//   - EF_Places_Authentication:        n4=112 → 2 + 560 = 562 bytes
//   - EF_GNSS_Places_Authentication:   n8=336 → 2 + 1680 = 1682 bytes
//
// (2021/1228 §TCS_155).
func DecodeAuthStatus(body []byte) ([]AuthStatusEntry, error) {
	if len(body) < 2 {
		return nil, fmt.Errorf("card: AuthStatus body too short: %d bytes", len(body))
	}
	pointer := int(binary.BigEndian.Uint16(body[:2]))
	arr := body[2:]
	if len(arr)%authStatusRecordLen != 0 {
		return nil, fmt.Errorf("card: AuthStatus array length %d not a multiple of %d",
			len(arr), authStatusRecordLen)
	}
	count := len(arr) / authStatusRecordLen
	if count == 0 {
		return nil, nil
	}
	if pointer >= count {
		pointer = count - 1
	}

	out := make([]AuthStatusEntry, 0, count)
	for i := 1; i <= count; i++ {
		idx := (pointer + i) % count
		slot := arr[idx*authStatusRecordLen : (idx+1)*authStatusRecordLen]
		ts, err := primitives.TimeReal(slot[0:4])
		if err != nil {
			return nil, fmt.Errorf("card: AuthStatus slot %d timeStamp: %w", idx, err)
		}
		if ts.IsZero() {
			continue
		}
		var auth AuthenticationStatus
		switch slot[4] {
		case 0x00:
			auth = AuthNotAuthenticated
		case 0x01:
			auth = AuthAuthenticated
		default:
			auth = AuthUnknown
		}
		out = append(out, AuthStatusEntry{TimeStamp: ts, AuthStatus: auth})
	}
	return out, nil
}
