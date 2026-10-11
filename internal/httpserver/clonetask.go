package httpserver

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"sync"
	"time"

	"govmc-wmks/internal/esxi"
)

type cloneHub struct {
	mu    sync.Mutex
	tasks map[string]*cloneTask
}

type cloneTask struct {
	mu     sync.Mutex
	view   esxi.CloneTaskView
	cancel context.CancelFunc
}

func newCloneHub() *cloneHub {
	return &cloneHub{tasks: map[string]*cloneTask{}}
}

func newTaskID() string {
	var b [8]byte
	_, _ = rand.Read(b[:])
	return "cln_" + hex.EncodeToString(b[:])
}

func (s *Server) handleCustomClone(w http.ResponseWriter, r *http.Request) error {
	var spec esxi.CloneSpec
	if err := json.NewDecoder(r.Body).Decode(&spec); err != nil {
		return esxi.ErrBad("invalid JSON: %v", err)
	}
	ctx, cancel := s.ctx(r)
	defer cancel()
	plan, err := s.ESXi.BuildClonePlanFromSpec(ctx, spec)
	if err != nil {
		return err
	}
	if spec.DryRunValue() {
		return writeJSON(w, plan)
	}
	if !spec.Confirm {
		return &esxi.Error{Status: 403, Code: "confirm_required", Message: "destructive clone requires confirm=true"}
	}
	if !spec.AsyncValue() {
		runCtx, runCancel := context.WithTimeout(context.Background(), 45*time.Minute)
		defer runCancel()
		info, err := s.ESXi.ExecuteClone(runCtx, spec, nil)
		if err != nil {
			return err
		}
		return writeJSON(w, map[string]any{"status": "ok", "result": info})
	}
	id := newTaskID()
	tctx, tcancel := context.WithTimeout(context.Background(), 45*time.Minute)
	task := &cloneTask{cancel: tcancel, view: esxi.CloneTaskView{
		TaskID: id, Status: "queued", Poll: "/v1/custom/clone/tasks/" + id,
		Layout: plan.Layout, Progress: esxi.CloneProgress{Steps: len(plan.Steps)},
		Steps: make([]esxi.CloneTaskStep, 0, len(plan.Steps)),
	}}
	s.clones.mu.Lock()
	s.clones.tasks[id] = task
	s.clones.mu.Unlock()
	go s.runCloneTask(tctx, task, spec)
	w.WriteHeader(http.StatusAccepted)
	return writeJSON(w, map[string]any{"taskId": id, "status": "queued", "poll": "/v1/custom/clone/tasks/" + id})
}

func (s *Server) runCloneTask(ctx context.Context, task *cloneTask, spec esxi.CloneSpec) {
	task.patch(func(v *esxi.CloneTaskView) { v.Status = "running" })
	info, err := s.ESXi.ExecuteClone(ctx, spec, func(op, status, message string) {
		task.patch(func(v *esxi.CloneTaskView) {
			v.Op = op
			now := time.Now().UTC().Format(time.RFC3339)
			if status == "running" {
				v.Steps = append(v.Steps, esxi.CloneTaskStep{Op: op, Status: status, Message: message, StartedAt: now})
			} else if n := len(v.Steps); n > 0 {
				v.Steps[n-1].Status = status
				v.Steps[n-1].Message = message
				v.Steps[n-1].EndedAt = now
			}
			done := 0
			for _, st := range v.Steps {
				if st.Status == "ok" {
					done++
				}
			}
			if v.Progress.Steps > 0 {
				v.Progress.Step = done
				if status == "running" {
					v.Progress.Step = done + 1
				}
				v.Progress.Percent = v.Progress.Step * 100 / v.Progress.Steps
			}
		})
	})
	task.patch(func(v *esxi.CloneTaskView) {
		v.Result = info
		if err == nil {
			v.Status = "ok"
			v.Op = ""
			v.Progress.Percent = 100
			v.Progress.Step = v.Progress.Steps
			return
		}
		if errors.Is(err, context.Canceled) {
			v.Status = "cancelled"
		} else {
			v.Status = "error"
		}
		ce := &esxi.CloneTaskError{Code: "error", Message: err.Error(), Op: v.Op}
		var api *esxi.Error
		if errors.As(err, &api) {
			ce.Code = api.Code
			ce.Message = api.Message
			ce.VimFault = api.VimFault
		}
		v.Error = ce
	})
}

func (t *cloneTask) patch(fn func(*esxi.CloneTaskView)) {
	t.mu.Lock()
	fn(&t.view)
	t.mu.Unlock()
}

func (t *cloneTask) snapshot() esxi.CloneTaskView {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.view
}

func (s *Server) handleCloneTasks(w http.ResponseWriter, r *http.Request) error {
	s.clones.mu.Lock()
	out := make([]esxi.CloneTaskView, 0, len(s.clones.tasks))
	for _, t := range s.clones.tasks {
		out = append(out, t.snapshot())
	}
	s.clones.mu.Unlock()
	return writeJSON(w, out)
}

func (s *Server) handleCloneTaskGet(w http.ResponseWriter, r *http.Request) error {
	id := r.PathValue("taskId")
	s.clones.mu.Lock()
	t := s.clones.tasks[id]
	s.clones.mu.Unlock()
	if t == nil {
		return esxi.ErrNotFound("task %s not found", id)
	}
	return writeJSON(w, t.snapshot())
}

func (s *Server) handleCloneTaskCancel(w http.ResponseWriter, r *http.Request) error {
	var body struct {
		Confirm bool `json:"confirm"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if !confirmed(r, body.Confirm) {
		return esxi.ErrBad("cancel requires confirm=true")
	}
	id := r.PathValue("taskId")
	s.clones.mu.Lock()
	t := s.clones.tasks[id]
	s.clones.mu.Unlock()
	if t == nil {
		return esxi.ErrNotFound("task %s not found", id)
	}
	if t.cancel != nil {
		t.cancel()
	}
	return writeJSON(w, map[string]string{"status": "cancel_requested", "taskId": id})
}

func (s *Server) CloneSubmit(ctx context.Context, spec esxi.CloneSpec) (any, int, error) {
	plan, err := s.ESXi.BuildClonePlanFromSpec(ctx, spec)
	if err != nil {
		return nil, 0, err
	}
	if spec.DryRunValue() {
		return plan, http.StatusOK, nil
	}
	if !spec.Confirm {
		return nil, 0, &esxi.Error{Status: 403, Code: "confirm_required", Message: "destructive clone requires confirm=true"}
	}
	id := newTaskID()
	tctx, tcancel := context.WithTimeout(context.Background(), 45*time.Minute)
	task := &cloneTask{cancel: tcancel, view: esxi.CloneTaskView{
		TaskID: id, Status: "queued", Poll: "/v1/custom/clone/tasks/" + id,
		Layout: plan.Layout, Progress: esxi.CloneProgress{Steps: len(plan.Steps)},
	}}
	s.clones.mu.Lock()
	s.clones.tasks[id] = task
	s.clones.mu.Unlock()
	go s.runCloneTask(tctx, task, spec)
	return map[string]any{"taskId": id, "status": "queued", "poll": "/v1/custom/clone/tasks/" + id}, http.StatusAccepted, nil
}

func (s *Server) CloneTask(id string) (any, error) {
	s.clones.mu.Lock()
	t := s.clones.tasks[id]
	s.clones.mu.Unlock()
	if t == nil {
		return nil, esxi.ErrNotFound("task %s not found", id)
	}
	return t.snapshot(), nil
}

func (s *Server) CloneTasks() any {
	s.clones.mu.Lock()
	out := make([]esxi.CloneTaskView, 0, len(s.clones.tasks))
	for _, t := range s.clones.tasks {
		out = append(out, t.snapshot())
	}
	s.clones.mu.Unlock()
	return out
}

func (s *Server) CloneCancel(id string, confirm bool) error {
	if !confirm {
		return esxi.ErrBad("cancel requires confirm=true")
	}
	s.clones.mu.Lock()
	t := s.clones.tasks[id]
	s.clones.mu.Unlock()
	if t == nil {
		return esxi.ErrNotFound("task %s not found", id)
	}
	if t.cancel != nil {
		t.cancel()
	}
	return nil
}
