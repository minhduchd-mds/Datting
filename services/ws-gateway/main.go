// ws-gateway: tầng WebSocket theo mô hình "nudge".
//
// Chạy:  go run ./services/ws-gateway
// Env:   PORT (mặc định 8081), DRAIN_WINDOW (mặc định 25s)
package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"datting/ws-gateway/internal/ws"
)

func main() {
	port := envOr("PORT", "8081")
	drain, _ := time.ParseDuration(envOr("DRAIN_WINDOW", "25s"))

	hub := NewHub()
	mux := http.NewServeMux()

	// --- /ws: client kết nối vào đây --------------------------------------
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		if hub.Draining() {
			http.Error(w, "draining", http.StatusServiceUnavailable)
			return
		}
		// PRODUCTION: userID phải lấy từ session token đã được API Gateway
		// xác thực tập trung (mô hình TAG của Tinder), KHÔNG lấy từ query.
		uid, err := strconv.ParseInt(r.URL.Query().Get("uid"), 10, 64)
		if err != nil {
			http.Error(w, "uid không hợp lệ", http.StatusBadRequest)
			return
		}
		dev := r.URL.Query().Get("device")
		if dev == "" {
			dev = "default"
		}
		c, err := ws.Upgrade(w, r)
		if err != nil {
			log.Printf("upgrade lỗi: %v", err)
			return
		}
		s := hub.Register(uid, dev, c)

		// reader: chỉ để phát hiện đứt kết nối + xử lý pong.
		go func() {
			defer hub.Unregister(s)
			for {
				_ = c.SetDeadline(time.Now().Add(90 * time.Second))
				op, _, err := c.ReadMessage()
				if err != nil {
					return
				}
				if op == 0x8 { // close
					return
				}
			}
		}()
		go func() {
			if err := s.writeLoop(30 * time.Second); err != nil {
				hub.Unregister(s)
			}
		}()
	})

	// --- /push: service nội bộ gọi vào để phát nudge -----------------------
	mux.HandleFunc("/push", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			UserIDs []int64   `json:"user_ids"`
			Kind    NudgeKind `json:"kind"`
			Cursor  string    `json:"cursor"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		total := 0
		for _, uid := range body.UserIDs {
			total += hub.Push(uid, Nudge{Kind: body.Kind, Cursor: body.Cursor})
		}
		writeJSON(w, map[string]int{"delivered": total})
	})

	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		if hub.Draining() {
			http.Error(w, "draining", http.StatusServiceUnavailable)
			return
		}
		w.Write([]byte("ok"))
	})
	mux.HandleFunc("/stats", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, hub.Stats())
	})

	srv := &http.Server{Addr: ":" + port, Handler: mux}

	// --- Graceful drain: quyết định vận hành quan trọng nhất của file này ---
	// Pod WebSocket là stateful. Kill đột ngột = bão reconnect đồng loạt.
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGTERM, syscall.SIGINT)
	go func() {
		<-stop
		log.Printf("nhận SIGTERM — bắt đầu drain trong %v", drain)
		hub.StartDrain(drain) // /healthz fail ngay → k8s rút khỏi endpoint
		time.Sleep(drain + 2*time.Second)
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = srv.Shutdown(ctx)
	}()

	log.Printf("ws-gateway lắng nghe :%s", port)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func envOr(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}
