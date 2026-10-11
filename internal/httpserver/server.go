package httpserver

import (
	"context"
	"crypto/rand"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/vmware/govmomi/vim25/types"

	"govmc-wmks/internal/esxi"
	"govmc-wmks/internal/mcp"
)

type consoleTicket struct {
	ID        string
	WSS       string
	ExpiresAt time.Time
}

type Server struct {
	ESXi    *esxi.Client
	Token   string
	Listen  string
	WebDir  string
	tickets sync.Map
	clones  *cloneHub
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.Handle("/", s.webFS())
	mux.HandleFunc("GET /ws/console", s.handleWS)
	mux.HandleFunc("GET /v1/openapi.yaml", s.handleOpenAPI)
	mux.HandleFunc("GET /v1/about", s.wrap(s.handleAbout))
	mux.HandleFunc("GET /v1/vms", s.wrap(s.handleVMList))
	mux.HandleFunc("GET /v1/vms/{id}", s.wrap(s.handleVMGet))
	mux.HandleFunc("GET /v1/vms/{id}/devices", s.wrap(s.handleVMDevices))
	mux.HandleFunc("GET /v1/vms/{id}/screenshot", s.wrap(s.handleScreenshot))
	mux.HandleFunc("GET /v1/vms/{id}/metrics", s.wrap(s.handleVMMetrics))
	mux.HandleFunc("POST /v1/vms/{id}/console", s.wrap(s.handleConsole))
	mux.HandleFunc("POST /v1/vms/{id}/power", s.wrap(s.handlePower))
	mux.HandleFunc("GET /v1/vms/{id}/question", s.wrap(s.handleQuestionGet))
	mux.HandleFunc("POST /v1/vms/{id}/question", s.wrap(s.handleQuestionPost))
	mux.HandleFunc("PATCH /v1/vms/{id}", s.wrap(s.handleVMPatch))
	mux.HandleFunc("GET /v1/vms/{id}/networks", s.wrap(s.handleVMNetworksList))
	mux.HandleFunc("POST /v1/vms/{id}/networks", s.wrap(s.handleVMNetworks))
	mux.HandleFunc("POST /v1/vms/{id}/unregister", s.wrap(s.handleUnregister))
	mux.HandleFunc("POST /v1/vms/register", s.wrap(s.handleRegister))
	mux.HandleFunc("GET /v1/host", s.wrap(s.handleHost))
	mux.HandleFunc("GET /v1/host/metrics", s.wrap(s.handleHostMetrics))
	mux.HandleFunc("GET /v1/networks", s.wrap(s.handleNetworks))
	if s.clones == nil {
		s.clones = newCloneHub()
	}
	mux.HandleFunc("GET /v1/datastores", s.wrap(s.handleDatastores))
	mux.HandleFunc("POST /v1/datastores/refresh", s.wrap(s.handleDatastoreRefresh))
	mux.HandleFunc("GET /v1/datastores/folder", s.wrap(s.handleFolderList))
	mux.HandleFunc("POST /v1/datastores/folder", s.wrap(s.handleFolderCreate))
	mux.HandleFunc("DELETE /v1/datastores/folder", s.wrap(s.handleFolderDelete))
	mux.HandleFunc("POST /v1/datastores/folder/copy", s.wrap(s.handleFolderCopy))
	mux.HandleFunc("POST /v1/datastores/folder/move", s.wrap(s.handleFolderMove))
	mux.HandleFunc("POST /v1/datastores/folder/rename", s.wrap(s.handleFolderRename))
	mux.HandleFunc("GET /v1/datastores/file", s.wrap(s.handleFileList))
	mux.HandleFunc("GET /v1/datastores/file/content", s.wrap(s.handleFileDownload))
	mux.HandleFunc("PUT /v1/datastores/file", s.wrap(s.handleFileUpload))
	mux.HandleFunc("DELETE /v1/datastores/file", s.wrap(s.handleFileDelete))
	mux.HandleFunc("POST /v1/datastores/file/copy", s.wrap(s.handleFileCopy))
	mux.HandleFunc("POST /v1/datastores/file/move", s.wrap(s.handleFileMove))
	mux.HandleFunc("POST /v1/datastores/file/rename", s.wrap(s.handleFileRename))
	mux.HandleFunc("GET /v1/metrics", s.wrap(s.handleMetricsIndex))
	mux.HandleFunc("GET /v1/metrics/counters", s.wrap(s.handleCounters))
	mux.HandleFunc("POST /v1/custom/clone", s.wrap(s.handleCustomClone))
	mux.HandleFunc("GET /v1/custom/clone/tasks", s.wrap(s.handleCloneTasks))
	mux.HandleFunc("GET /v1/custom/clone/tasks/{taskId}", s.wrap(s.handleCloneTaskGet))
	mux.HandleFunc("POST /v1/custom/clone/tasks/{taskId}/cancel", s.wrap(s.handleCloneTaskCancel))
	mux.HandleFunc("/mcp", s.handleMCP)
	return s.auth(mux)
}

func (s *Server) ListenAndServe() error {
	log.Printf("http://%s  REST /v1  MCP POST /mcp  console demo /", s.Listen)
	return http.ListenAndServe(s.Listen, s.Handler())
}

func (s *Server) auth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.Token == "" || !needsToken(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}
		got := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if got == "" {
			got = r.Header.Get("X-API-Token")
		}
		if got != s.Token {
			writeErr(w, &esxi.Error{Status: http.StatusUnauthorized, Code: "unauthorized", Message: "invalid or missing API token"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

func needsToken(path string) bool {
	return strings.HasPrefix(path, "/v1/") || path == "/mcp"
}

type handlerFunc func(http.ResponseWriter, *http.Request) error

func (s *Server) wrap(h handlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := h(w, r); err != nil {
			writeErr(w, err)
		}
	}
}

func writeErr(w http.ResponseWriter, err error) {
	var api *esxi.Error
	if errors.As(err, &api) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(api.Status)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"code":     api.Code,
			"message":  api.Message,
			"vimFault": emptyNil(api.VimFault),
		})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusBadGateway)
	_ = json.NewEncoder(w).Encode(map[string]any{"code": "error", "message": err.Error()})
}

func emptyNil(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func writeJSON(w http.ResponseWriter, v any) error {
	w.Header().Set("Content-Type", "application/json")
	return json.NewEncoder(w).Encode(v)
}

func (s *Server) ctx(r *http.Request) (context.Context, context.CancelFunc) {
	return context.WithTimeout(r.Context(), 120*time.Second)
}

func (s *Server) ctxCopy(r *http.Request) (context.Context, context.CancelFunc) {
	return context.WithTimeout(r.Context(), 30*time.Minute)
}

func confirmed(r *http.Request, bodyConfirm bool) bool {
	if bodyConfirm {
		return true
	}
	v := strings.TrimSpace(r.Header.Get("X-Confirm"))
	b, _ := strconv.ParseBool(v)
	return b
}

func (s *Server) issueConsole(w http.ResponseWriter, ticket *types.VirtualMachineTicket) error {
	id, err := randomID()
	if err != nil {
		return err
	}
	wss := ticketWSS(ticket, s.ESXi.Reach)
	log.Printf("webmks ticket host=%q port=%d url=%q -> %s", ticket.Host, ticket.Port, ticket.Url, wss)
	s.tickets.Store(id, consoleTicket{ID: id, WSS: wss, ExpiresAt: time.Now().Add(2 * time.Minute)})
	return writeJSON(w, map[string]string{
		"ws":   "/ws/console?id=" + id,
		"note": "open in a browser; this URL is one-shot and expires in 2 minutes. ESXi WSS is never exposed. Without USB Tablet/Tools the mouse may not work (409 is not a ticket failure).",
	})
}

func (s *Server) handleWS(w http.ResponseWriter, r *http.Request) {
	raw, ok := s.tickets.LoadAndDelete(r.URL.Query().Get("id"))
	if !ok {
		http.Error(w, "ticket not found or already used", http.StatusGone)
		return
	}
	t := raw.(consoleTicket)
	if time.Now().After(t.ExpiresAt) {
		http.Error(w, "ticket expired", http.StatusGone)
		return
	}
	requested := websocket.Subprotocols(r)
	if len(requested) == 0 {
		requested = []string{"binary", "vmware-vvc"}
	}
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }, Subprotocols: requested}
	client, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("upgrade: %v", err)
		return
	}
	defer client.Close()
	dialer := websocket.Dialer{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}, Subprotocols: requested} //nolint:gosec
	remote, _, err := dialer.Dial(t.WSS, nil)
	if err != nil {
		log.Printf("dial %s: %v", t.WSS, err)
		_ = client.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseTryAgainLater, err.Error()))
		return
	}
	defer remote.Close()
	errc := make(chan error, 2)
	go pump(client, remote, errc)
	go pump(remote, client, errc)
	if err := <-errc; err != nil && !isBenignWS(err) {
		log.Printf("proxy end: %v", err)
	}
}

func pump(src, dst *websocket.Conn, errc chan<- error) {
	for {
		typ, data, err := src.ReadMessage()
		if err != nil {
			errc <- err
			return
		}
		if err := dst.WriteMessage(typ, data); err != nil {
			errc <- err
			return
		}
	}
}

func ticketWSS(t *types.VirtualMachineTicket, reach *url.URL) string {
	path := "/ticket/" + strings.TrimSpace(t.Ticket)
	if raw := strings.TrimSpace(t.Url); raw != "" {
		if parsed, err := url.Parse(raw); err == nil && parsed.Path != "" {
			path = parsed.Path
			if parsed.RawQuery != "" {
				path += "?" + parsed.RawQuery
			}
		} else if strings.HasPrefix(raw, "/") {
			path = raw
		}
	}
	port := reach.Port()
	if port == "" {
		if reach.Scheme == "http" {
			port = "80"
		} else {
			port = "443"
		}
	}
	return fmt.Sprintf("wss://%s:%s%s", reach.Hostname(), port, path)
}

func randomID() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(b[:]), nil
}

func isBenignWS(err error) bool {
	return err == io.EOF || websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway)
}

func (s *Server) webFS() http.Handler {
	fs := http.FileServer(http.Dir(s.WebDir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Path
		if p == "/v1" || strings.HasPrefix(p, "/v1/") || p == "/mcp" || strings.HasPrefix(p, "/ws/") {
			http.NotFound(w, r)
			return
		}
		if p == "/" || p == "/index.html" || p == "/app.js" {
			w.Header().Set("Cache-Control", "no-store")
		}
		fs.ServeHTTP(w, r)
	})
}

func FindWeb() string {
	candidates := []string{"web"}
	if exe, err := os.Executable(); err == nil {
		dir := filepath.Dir(exe)
		candidates = append(candidates, filepath.Join(dir, "web"), filepath.Join(dir, "..", "web"))
	}
	for _, d := range candidates {
		if fi, err := os.Stat(d); err == nil && fi.IsDir() {
			return d
		}
	}
	log.Fatal("web/ directory not found; run from repo root")
	return "web"
}

func (s *Server) handleMCP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Accept, Mcp-Session-Id, Authorization, X-API-Token")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Expose-Headers", "Mcp-Session-Id")
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method == http.MethodDelete {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method == http.MethodGet {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, ": connected\n\n")
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if len(bytesTrimSpace(body)) == 0 {
		w.WriteHeader(http.StatusAccepted)
		return
	}
	out, err := mcp.Handle(r.Context(), s.ESXi, s, s, body)
	if err != nil {
		writeErr(w, err)
		return
	}
	if len(out) == 0 {
		w.WriteHeader(http.StatusAccepted)
		return
	}
	if isInitialize(body) {
		w.Header().Set("Mcp-Session-Id", mustTicketID())
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(out)
}

func bytesTrimSpace(b []byte) []byte {
	return []byte(strings.TrimSpace(string(b)))
}

func isInitialize(body []byte) bool {
	var peek struct {
		Method string `json:"method"`
	}
	_ = json.Unmarshal(body, &peek)
	return peek.Method == "initialize"
}

func mustTicketID() string {
	id, err := randomID()
	if err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return id
}

// IssueLocalConsole is used by MCP (same ticket store as REST).
func (s *Server) IssueLocalConsole(ctx context.Context, id string) (map[string]string, error) {
	ticket, _, err := s.ESXi.AcquireWebMKS(ctx, id)
	if err != nil {
		return nil, err
	}
	tid, err := randomID()
	if err != nil {
		return nil, err
	}
	wss := ticketWSS(ticket, s.ESXi.Reach)
	s.tickets.Store(tid, consoleTicket{ID: tid, WSS: wss, ExpiresAt: time.Now().Add(2 * time.Minute)})
	return map[string]string{
		"ws":   "/ws/console?id=" + tid,
		"note": "Open this path on the REST server in a browser. Do not consume ESXi WSS. One-shot, 2 minutes.",
	}, nil
}
