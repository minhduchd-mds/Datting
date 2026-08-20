package main

import (
	"encoding/json"
	"sync"
	"sync/atomic"
	"time"

	"datting/ws-gateway/internal/ws"
)

// ============================================================================
// MÔ HÌNH "NUDGE" (theo Tinder)
//
// Socket CHỈ đẩy một tín hiệu "có cái gì đó mới", KHÔNG đẩy payload.
// Client nhận nudge → tự gọi HTTP để lấy dữ liệu thật.
//
// Vì sao: tách hoàn toàn tầng realtime khỏi tầng dữ liệu. Tầng socket không
// cần biết gì về schema tin nhắn, không phải giải bài toán nhất quán, và có
// thể rollout độc lập. Tinder báo cáo 1.2s → ~300ms khi chuyển từ polling 2s
// sang mô hình này.
// ============================================================================

// NudgeKind là loại tín hiệu. Cố ý giữ danh sách ngắn — nudge không mang dữ liệu.
type NudgeKind string

const (
	NudgeMatch    NudgeKind = "match"    // có match mới
	NudgeMessage  NudgeKind = "message"  // có tin nhắn mới
	NudgeIntro    NudgeKind = "intro"    // có lời giới thiệu mới
	NudgeDailyPair NudgeKind = "pair"    // gợi ý cặp đôi hằng ngày đã sẵn sàng
	// Có hoạt động mới trong một phòng nhiều người. Cursor = room_id — client
	// tự fetch nội dung qua HTTP, nudge KHÔNG chở tin nhắn (bất biến của mô hình).
	NudgeRoom NudgeKind = "room"
)

type Nudge struct {
	Kind NudgeKind `json:"kind"`
	// Cursor cho phép client biết cần fetch từ đâu, KHÔNG phải nội dung.
	Cursor string `json:"cursor,omitempty"`
	TS     int64  `json:"ts"`
}

// session là một kết nối của một thiết bị. Một user có thể có nhiều session.
type session struct {
	userID   int64
	deviceID string
	conn     ws.Conn
	out      chan Nudge
	closed   atomic.Bool
}

// Hub ghép kênh subscription của hàng chục nghìn user trên một process.
//
// Bài học vận hành đã được ghi nhận (Tinder + Slack), xem README:
//   - Pod WebSocket là STATEFUL: rollout k8s BẮT BUỘC graceful drain.
//   - Chạm trần ip_conntrack_max của Linux — phải tune sysctl.
//   - Slow consumer: buffer có hạn, đầy thì DROP nudge chứ không block hub.
//     Drop an toàn vì nudge là idempotent — client sẽ fetch lại ở nudge sau
//     hoặc khi mở app.
type Hub struct {
	mu       sync.RWMutex
	byUser   map[int64]map[string]*session // userID -> deviceID -> session
	draining atomic.Bool

	// metrics (đọc qua /metrics, export sang Prometheus)
	connCount    atomic.Int64
	nudgeSent    atomic.Int64
	nudgeDropped atomic.Int64
}

func NewHub() *Hub {
	return &Hub{byUser: make(map[int64]map[string]*session)}
}

const outBuffer = 32

func (h *Hub) Register(userID int64, deviceID string, c ws.Conn) *session {
	s := &session{userID: userID, deviceID: deviceID, conn: c, out: make(chan Nudge, outBuffer)}
	h.mu.Lock()
	if h.byUser[userID] == nil {
		h.byUser[userID] = make(map[string]*session, 2)
	}
	// Cùng thiết bị kết nối lại → đóng session cũ, tránh rò rỉ goroutine.
	if old, ok := h.byUser[userID][deviceID]; ok {
		old.close()
	}
	h.byUser[userID][deviceID] = s
	h.mu.Unlock()
	h.connCount.Add(1)
	return s
}

func (h *Hub) Unregister(s *session) {
	h.mu.Lock()
	if m, ok := h.byUser[s.userID]; ok {
		if cur, ok := m[s.deviceID]; ok && cur == s {
			delete(m, s.deviceID)
			if len(m) == 0 {
				delete(h.byUser, s.userID)
			}
		}
	}
	h.mu.Unlock()
	s.close()
	h.connCount.Add(-1)
}

// Push gửi nudge tới MỌI thiết bị của user. Không bao giờ block.
// Trả về số thiết bị nhận được.
func (h *Hub) Push(userID int64, n Nudge) int {
	if n.TS == 0 {
		n.TS = time.Now().UnixMilli()
	}
	h.mu.RLock()
	devices := h.byUser[userID]
	sessions := make([]*session, 0, len(devices))
	for _, s := range devices {
		sessions = append(sessions, s)
	}
	h.mu.RUnlock()

	delivered := 0
	for _, s := range sessions {
		select {
		case s.out <- n:
			delivered++
			h.nudgeSent.Add(1)
		default:
			// Slow consumer: bỏ qua thay vì chặn hub.
			h.nudgeDropped.Add(1)
		}
	}
	return delivered
}

// PushMatch là đường nóng: match vừa được tạo → báo CẢ HAI phía.
func (h *Hub) PushMatch(a, b int64, matchID string) {
	n := Nudge{Kind: NudgeMatch, Cursor: matchID, TS: time.Now().UnixMilli()}
	h.Push(a, n)
	h.Push(b, n)
}

// ---- Graceful drain: bắt buộc trước khi pod bị kill ----------------------

// StartDrain đánh dấu pod không nhận kết nối mới, rồi đóng dần các session
// hiện có để client reconnect sang pod khác — tránh bão reconnect đồng loạt.
func (h *Hub) StartDrain(window time.Duration) {
	h.draining.Store(true)
	h.mu.RLock()
	var all []*session
	for _, m := range h.byUser {
		for _, s := range m {
			all = append(all, s)
		}
	}
	h.mu.RUnlock()

	if len(all) == 0 {
		return
	}
	gap := window / time.Duration(len(all))
	if gap <= 0 {
		gap = time.Millisecond
	}
	go func() {
		for _, s := range all {
			s.close()
			time.Sleep(gap) // rải đều, KHÔNG đóng đồng loạt
		}
	}()
}

func (h *Hub) Draining() bool { return h.draining.Load() }

func (h *Hub) Stats() map[string]int64 {
	return map[string]int64{
		"connections":   h.connCount.Load(),
		"nudge_sent":    h.nudgeSent.Load(),
		"nudge_dropped": h.nudgeDropped.Load(),
	}
}

// ---- session ------------------------------------------------------------

func (s *session) close() {
	if s.closed.CompareAndSwap(false, true) {
		close(s.out)
	}
}

// writeLoop tuần tự hoá mọi lần ghi lên socket (một writer duy nhất).
func (s *session) writeLoop(pingEvery time.Duration) error {
	t := time.NewTicker(pingEvery)
	defer t.Stop()
	for {
		select {
		case n, ok := <-s.out:
			if !ok {
				return s.conn.Close()
			}
			b, err := json.Marshal(n)
			if err != nil {
				continue
			}
			// write_deadline: chống slow consumer treo goroutine vĩnh viễn.
			_ = s.conn.SetDeadline(time.Now().Add(10 * time.Second))
			if err := s.conn.WriteText(b); err != nil {
				return err
			}
		case <-t.C:
			_ = s.conn.SetDeadline(time.Now().Add(10 * time.Second))
			if err := s.conn.WritePing(); err != nil {
				return err
			}
		}
	}
}
