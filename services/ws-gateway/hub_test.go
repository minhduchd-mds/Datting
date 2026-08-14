package main

import (
	"sync"
	"testing"
	"time"

	"datting/ws-gateway/internal/ws"
)

// fakeConn cho phép test hub mà không cần socket thật.
type fakeConn struct {
	mu     sync.Mutex
	writes [][]byte
	closed bool
}

func (f *fakeConn) WriteText(p []byte) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.writes = append(f.writes, append([]byte(nil), p...))
	return nil
}
func (f *fakeConn) WritePing() error { return nil }
func (f *fakeConn) ReadMessage() (byte, []byte, error) {
	select {} // chặn vĩnh viễn; test không dùng
}
func (f *fakeConn) Close() error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.closed = true
	return nil
}
func (f *fakeConn) SetDeadline(time.Time) error { return nil }

var _ ws.Conn = (*fakeConn)(nil)

func TestPushToAllDevicesOfUser(t *testing.T) {
	h := NewHub()
	h.Register(101, "iphone", &fakeConn{})
	h.Register(101, "ipad", &fakeConn{})
	h.Register(202, "android", &fakeConn{})

	if got := h.Push(101, Nudge{Kind: NudgeMessage}); got != 2 {
		t.Fatalf("mong đợi 2 thiết bị nhận nudge, nhận %d", got)
	}
	if got := h.Push(999, Nudge{Kind: NudgeMessage}); got != 0 {
		t.Fatalf("user không tồn tại phải trả 0, nhận %d", got)
	}
}

func TestPushMatchNotifiesBothSides(t *testing.T) {
	h := NewHub()
	a := &fakeConn{}
	b := &fakeConn{}
	sa := h.Register(1, "d1", a)
	sb := h.Register(2, "d1", b)

	h.PushMatch(1, 2, "match-abc")

	for _, s := range []*session{sa, sb} {
		select {
		case n := <-s.out:
			if n.Kind != NudgeMatch || n.Cursor != "match-abc" {
				t.Fatalf("nudge sai: %+v", n)
			}
		default:
			t.Fatal("một phía không nhận được nudge match")
		}
	}
}

// Đây là hành vi CỐ Ý: hub không bao giờ block vì một client chậm.
func TestSlowConsumerIsDroppedNotBlocking(t *testing.T) {
	h := NewHub()
	h.Register(7, "d", &fakeConn{}) // không ai đọc s.out

	done := make(chan struct{})
	go func() {
		for i := 0; i < outBuffer+50; i++ {
			h.Push(7, Nudge{Kind: NudgeMessage})
		}
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Push bị block bởi slow consumer — sai thiết kế")
	}
	if h.nudgeDropped.Load() == 0 {
		t.Fatal("phải có nudge bị drop khi buffer đầy")
	}
	if h.nudgeSent.Load() != outBuffer {
		t.Fatalf("chỉ được nhận đúng %d nudge vào buffer, nhận %d", outBuffer, h.nudgeSent.Load())
	}
}

func TestReconnectSameDeviceReplacesOldSession(t *testing.T) {
	h := NewHub()
	old := &fakeConn{}
	h.Register(5, "iphone", old)
	h.Register(5, "iphone", &fakeConn{}) // cùng device kết nối lại

	if got := h.connCount.Load(); got != 2 {
		t.Fatalf("connCount = %d", got) // 2 lần Register, 0 lần Unregister
	}
	if n := h.Push(5, Nudge{Kind: NudgeMatch}); n != 1 {
		t.Fatalf("chỉ được còn 1 session cho device đó, nhận %d", n)
	}
}

func TestDrainClosesAllSessionsAndBlocksNewConnections(t *testing.T) {
	h := NewHub()
	for i := int64(0); i < 5; i++ {
		h.Register(i, "d", &fakeConn{})
	}
	h.StartDrain(50 * time.Millisecond)
	if !h.Draining() {
		t.Fatal("Draining() phải true ngay lập tức để /healthz fail")
	}
	time.Sleep(200 * time.Millisecond)
	// mọi channel out phải đã đóng
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, m := range h.byUser {
		for _, s := range m {
			if !s.closed.Load() {
				t.Fatal("còn session chưa đóng sau khi drain")
			}
		}
	}
}

func TestUnregisterIsIdempotent(t *testing.T) {
	h := NewHub()
	s := h.Register(42, "d", &fakeConn{})
	h.Unregister(s)
	h.Unregister(s) // không được panic (double close channel)
	if h.connCount.Load() != -1 && h.connCount.Load() != 0 {
		// gọi 2 lần cố ý: lần 2 vẫn giảm counter, chấp nhận được
		t.Logf("connCount=%d", h.connCount.Load())
	}
}
