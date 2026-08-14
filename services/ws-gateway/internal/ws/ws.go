// Package ws cài đặt tối thiểu RFC 6455 (server side) chỉ dùng thư viện chuẩn.
//
// Vì sao không dùng gorilla/websocket? Scaffold này phải build được trong môi
// trường không có Go module proxy. Trong production, thay Upgrade() bằng
// gorilla/websocket hoặc coder/websocket — phần còn lại của hub không đổi vì
// mọi thứ đi qua interface Conn.
package ws

import (
	"bufio"
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"io"
	"net"
	"net/http"
	"strings"
	"time"
)

const magicGUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

// Conn là bề mặt tối thiểu mà Hub cần. Đổi implementation không ảnh hưởng Hub.
type Conn interface {
	WriteText(p []byte) error
	WritePing() error
	ReadMessage() (opcode byte, payload []byte, err error)
	Close() error
	SetDeadline(t time.Time) error
}

type conn struct {
	rw  net.Conn
	br  *bufio.Reader
	buf []byte
}

var _ Conn = (*conn)(nil)

// Upgrade thực hiện bắt tay WebSocket trên một http.ResponseWriter đang mở.
func Upgrade(w http.ResponseWriter, r *http.Request) (Conn, error) {
	if !strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
		return nil, errors.New("ws: thiếu header Upgrade: websocket")
	}
	key := r.Header.Get("Sec-WebSocket-Key")
	if key == "" {
		return nil, errors.New("ws: thiếu Sec-WebSocket-Key")
	}
	h, ok := w.(http.Hijacker)
	if !ok {
		return nil, errors.New("ws: ResponseWriter không hỗ trợ Hijack")
	}
	netConn, brw, err := h.Hijack()
	if err != nil {
		return nil, err
	}
	sum := sha1.Sum([]byte(key + magicGUID))
	accept := base64.StdEncoding.EncodeToString(sum[:])
	resp := "HTTP/1.1 101 Switching Protocols\r\n" +
		"Upgrade: websocket\r\n" +
		"Connection: Upgrade\r\n" +
		"Sec-WebSocket-Accept: " + accept + "\r\n\r\n"
	if _, err := netConn.Write([]byte(resp)); err != nil {
		netConn.Close()
		return nil, err
	}
	return &conn{rw: netConn, br: brw.Reader}, nil
}

func (c *conn) SetDeadline(t time.Time) error { return c.rw.SetDeadline(t) }
func (c *conn) Close() error                  { return c.rw.Close() }

func (c *conn) WriteText(p []byte) error { return c.writeFrame(0x1, p) }
func (c *conn) WritePing() error         { return c.writeFrame(0x9, nil) }

// writeFrame ghi một frame server→client (không mask, theo đúng RFC).
func (c *conn) writeFrame(opcode byte, payload []byte) error {
	var hdr []byte
	n := len(payload)
	switch {
	case n <= 125:
		hdr = []byte{0x80 | opcode, byte(n)}
	case n <= 65535:
		hdr = make([]byte, 4)
		hdr[0], hdr[1] = 0x80|opcode, 126
		binary.BigEndian.PutUint16(hdr[2:], uint16(n))
	default:
		hdr = make([]byte, 10)
		hdr[0], hdr[1] = 0x80|opcode, 127
		binary.BigEndian.PutUint64(hdr[2:], uint64(n))
	}
	if _, err := c.rw.Write(hdr); err != nil {
		return err
	}
	if n == 0 {
		return nil
	}
	_, err := c.rw.Write(payload)
	return err
}

// ReadMessage đọc một frame client→server (luôn được mask theo RFC).
func (c *conn) ReadMessage() (byte, []byte, error) {
	h := make([]byte, 2)
	if _, err := io.ReadFull(c.br, h); err != nil {
		return 0, nil, err
	}
	opcode := h[0] & 0x0f
	masked := h[1]&0x80 != 0
	n := int(h[1] & 0x7f)
	switch n {
	case 126:
		e := make([]byte, 2)
		if _, err := io.ReadFull(c.br, e); err != nil {
			return 0, nil, err
		}
		n = int(binary.BigEndian.Uint16(e))
	case 127:
		e := make([]byte, 8)
		if _, err := io.ReadFull(c.br, e); err != nil {
			return 0, nil, err
		}
		n = int(binary.BigEndian.Uint64(e))
	}
	if n > 1<<20 {
		return 0, nil, errors.New("ws: frame quá lớn")
	}
	var mask [4]byte
	if masked {
		if _, err := io.ReadFull(c.br, mask[:]); err != nil {
			return 0, nil, err
		}
	}
	payload := make([]byte, n)
	if _, err := io.ReadFull(c.br, payload); err != nil {
		return 0, nil, err
	}
	if masked {
		for i := range payload {
			payload[i] ^= mask[i%4]
		}
	}
	return opcode, payload, nil
}
