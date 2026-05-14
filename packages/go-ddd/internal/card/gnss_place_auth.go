package card

import (
	"fmt"
	"time"

	"github.com/jakewtaylor/go-ddd/internal/primitives"
)

// GnssPlaceAuth is the decoded form of GNSSPlaceAuthRecord (2021/1228
// §2.79c), the 12-byte position record embedded inside
// CardBorderCrossingRecord and CardLoadUnloadRecord.
//
// Byte layout (12 bytes):
//
//	TimeReal                      timeStamp           — 4 bytes
//	GNSSAccuracy                  accuracy            — 1 byte
//	GeoCoordinates                lat (3) + lng (3)   — 6 bytes
//	PositionAuthenticationStatus  authStatus          — 1 byte
type GnssPlaceAuth struct {
	TimeStamp  time.Time
	Accuracy   int     // GNSSAccuracy, 1..100 (1/10 of GSA NMEA value)
	Latitude   float64 // decimal degrees, +N
	Longitude  float64 // decimal degrees, +E
	AuthStatus AuthenticationStatus
}

// AuthenticationStatus encodes the on-wire PositionAuthenticationStatus
// (2021/1228 §2.117a) plus a synthesised "unknown" value for record
// slots that never carried a fix.
type AuthenticationStatus int

const (
	AuthUnknown          AuthenticationStatus = -1
	AuthNotAuthenticated AuthenticationStatus = 0
	AuthAuthenticated    AuthenticationStatus = 1
)

// String reports a stable token for JSON output / SQL storage.
func (a AuthenticationStatus) String() string {
	switch a {
	case AuthAuthenticated:
		return "authenticated"
	case AuthNotAuthenticated:
		return "not_authenticated"
	default:
		return "unknown"
	}
}

const gnssPlaceAuthLen = 12

func decodeGnssPlaceAuth(slot []byte) (GnssPlaceAuth, error) {
	if len(slot) < gnssPlaceAuthLen {
		return GnssPlaceAuth{}, fmt.Errorf("gnssPlaceAuth: need %d bytes, got %d", gnssPlaceAuthLen, len(slot))
	}
	ts, err := primitives.TimeReal(slot[0:4])
	if err != nil {
		return GnssPlaceAuth{}, fmt.Errorf("timeStamp: %w", err)
	}
	latRaw, err := primitives.Int24BE(slot[5:8])
	if err != nil {
		return GnssPlaceAuth{}, fmt.Errorf("latitude: %w", err)
	}
	lngRaw, err := primitives.Int24BE(slot[8:11])
	if err != nil {
		return GnssPlaceAuth{}, fmt.Errorf("longitude: %w", err)
	}
	var auth AuthenticationStatus
	switch slot[11] {
	case 0x00:
		auth = AuthNotAuthenticated
	case 0x01:
		auth = AuthAuthenticated
	default:
		auth = AuthUnknown
	}
	return GnssPlaceAuth{
		TimeStamp:  ts,
		Accuracy:   int(slot[4]),
		Latitude:   geoCoordinateToDegrees(latRaw, false),
		Longitude:  geoCoordinateToDegrees(lngRaw, true),
		AuthStatus: auth,
	}, nil
}
