package httpserver

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"govmc-wmks/internal/esxi"
)

func (s *Server) handleOpenAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/yaml")
	_, _ = w.Write(openapiYAML)
}

func (s *Server) handleAbout(w http.ResponseWriter, r *http.Request) error {
	return writeJSON(w, s.ESXi.About(r.Context()))
}

func (s *Server) handleVMList(w http.ResponseWriter, r *http.Request) error {
	ctx, cancel := s.ctx(r)
	defer cancel()
	list, err := s.ESXi.ListVMs(ctx, true)
	if err != nil {
		return err
	}
	if r.URL.Query().Get("view") == "full" {
		return writeJSON(w, list)
	}
	type row struct {
		ID                 string         `json:"id"`
		UUID               string         `json:"uuid,omitempty"`
		MoRef              string         `json:"moref"`
		Name               string         `json:"name"`
		BiosUUID           string         `json:"biosUuid,omitempty"`
		GuestID            string         `json:"guestId,omitempty"`
		PowerState         string         `json:"powerState"`
		ConnectionState    string         `json:"connectionState,omitempty"`
		NumCPU             int32          `json:"numCPU"`
		MemoryMB           int32          `json:"memoryMB"`
		ToolsStatus        string         `json:"toolsStatus,omitempty"`
		GuestUnavailable   bool           `json:"guestUnavailable"`
		CPUPct             *float64       `json:"cpuPct,omitempty"`
		MemActivePct       *float64       `json:"memActivePct,omitempty"`
		NetRxMbps          *float64       `json:"netRxMbps,omitempty"`
		NetTxMbps          *float64       `json:"netTxMbps,omitempty"`
		QuickStatsReliable bool           `json:"quickStatsReliable"`
		Question           *esxi.Question `json:"question,omitempty"`
	}
	out := make([]row, 0, len(list))
	for _, vm := range list {
		out = append(out, row{
			ID: vm.ID, UUID: vm.UUID, MoRef: vm.MoRef, Name: vm.Name,
			BiosUUID: vm.BiosUUID, GuestID: vm.GuestID,
			PowerState: vm.PowerState, ConnectionState: vm.ConnectionState,
			NumCPU: vm.NumCPU, MemoryMB: vm.MemoryMB,
			ToolsStatus: vm.Guest.ToolsStatus, GuestUnavailable: vm.Guest.GuestUnavailable,
			CPUPct: vm.CPUPct, MemActivePct: vm.MemActivePct,
			NetRxMbps: vm.NetRxMbps, NetTxMbps: vm.NetTxMbps,
			QuickStatsReliable: vm.QuickStatsReliable, Question: vm.Question,
		})
	}
	return writeJSON(w, out)
}

func (s *Server) handleVMGet(w http.ResponseWriter, r *http.Request) error {
	ctx, cancel := s.ctx(r)
	defer cancel()
	vm, err := s.ESXi.GetVM(ctx, r.PathValue("id"))
	if err != nil {
		return err
	}
	return writeJSON(w, vm.Info)
}

func (s *Server) handleVMDevices(w http.ResponseWriter, r *http.Request) error {
	ctx, cancel := s.ctx(r)
	defer cancel()
	vm, err := s.ESXi.GetVM(ctx, r.PathValue("id"))
	if err != nil {
		return err
	}
	return writeJSON(w, map[string]any{"networks": vm.Info.NICs, "disks": vm.Info.Disks, "vgpu": vm.Info.VGPU})
}

func (s *Server) handleScreenshot(w http.ResponseWriter, r *http.Request) error {
	ctx, cancel := s.ctx(r)
	defer cancel()
	png, err := s.ESXi.Screenshot(ctx, r.PathValue("id"))
	if err != nil {
		return err
	}
	w.Header().Set("Content-Type", "image/png")
	_, err = w.Write(png)
	return err
}

func parseMetrics(r *http.Request) (esxi.MetricsQuery, error) {
	q := esxi.MetricsQuery{Instance: r.URL.Query().Get("instance")}
	if names := strings.TrimSpace(r.URL.Query().Get("names")); names != "" {
		q.Names = strings.Split(names, ",")
	}
	if ms := r.URL.Query().Get("maxSample"); ms != "" {
		n, err := strconv.Atoi(ms)
		if err != nil {
			return q, esxi.ErrBad("maxSample")
		}
		q.MaxSample = int32(n)
	}
	if v := r.URL.Query().Get("start"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			return q, esxi.ErrBad("start must be RFC3339 UTC")
		}
		q.Start = &t
	}
	if v := r.URL.Query().Get("end"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			return q, esxi.ErrBad("end must be RFC3339 UTC")
		}
		q.End = &t
	}
	return q, nil
}

func (s *Server) handleVMMetrics(w http.ResponseWriter, r *http.Request) error {
	q, err := parseMetrics(r)
	if err != nil {
		return err
	}
	ctx, cancel := s.ctx(r)
	defer cancel()
	out, err := s.ESXi.VMMetrics(ctx, r.PathValue("id"), q)
	if err != nil {
		return err
	}
	return writeJSON(w, out)
}

func (s *Server) handleConsole(w http.ResponseWriter, r *http.Request) error {
	ctx, cancel := s.ctx(r)
	defer cancel()
	ticket, _, err := s.ESXi.AcquireWebMKS(ctx, r.PathValue("id"))
	if err != nil {
		return err
	}
	return s.issueConsole(w, ticket)
}

type confirmBody struct {
	Confirm bool   `json:"confirm"`
	DryRun  *bool  `json:"dryRun"`
	Action  string `json:"action"`
	ID      string `json:"id"`
	Choice  string `json:"choice"`
}

func (s *Server) handlePower(w http.ResponseWriter, r *http.Request) error {
	var body confirmBody
	_ = json.NewDecoder(r.Body).Decode(&body)
	ctx, cancel := s.ctx(r)
	defer cancel()
	if err := s.ESXi.Power(ctx, r.PathValue("id"), body.Action, confirmed(r, body.Confirm)); err != nil {
		return err
	}
	return writeJSON(w, map[string]string{"status": "ok", "action": body.Action})
}

func (s *Server) handleQuestionGet(w http.ResponseWriter, r *http.Request) error {
	ctx, cancel := s.ctx(r)
	defer cancel()
	q, err := s.ESXi.GetQuestion(ctx, r.PathValue("id"))
	if err != nil {
		return err
	}
	return writeJSON(w, q)
}

func (s *Server) handleQuestionPost(w http.ResponseWriter, r *http.Request) error {
	var body confirmBody
	_ = json.NewDecoder(r.Body).Decode(&body)
	ctx, cancel := s.ctx(r)
	defer cancel()
	if err := s.ESXi.AnswerQuestion(ctx, r.PathValue("id"), body.ID, body.Choice, confirmed(r, body.Confirm)); err != nil {
		return err
	}
	return writeJSON(w, map[string]string{"status": "ok"})
}

func (s *Server) handleVMPatch(w http.ResponseWriter, r *http.Request) error {
	var body struct {
		Confirm  bool   `json:"confirm"`
		NumCPU   *int32 `json:"numCPU"`
		MemoryMB *int32 `json:"memoryMB"`
		NestedHV *bool  `json:"nestedHV"`
		IOMMU    *bool  `json:"iommu"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	ctx, cancel := s.ctx(r)
	defer cancel()
	if err := s.ESXi.ChangeVM(ctx, r.PathValue("id"), esxi.VMChange{NumCPU: body.NumCPU, MemoryMB: body.MemoryMB, NestedHV: body.NestedHV, IOMMU: body.IOMMU}, confirmed(r, body.Confirm)); err != nil {
		return err
	}
	vm, err := s.ESXi.GetVM(ctx, r.PathValue("id"))
	if err != nil {
		return err
	}
	return writeJSON(w, vm.Info)
}

func (s *Server) handleVMNetworksList(w http.ResponseWriter, r *http.Request) error {
	ctx, cancel := s.ctx(r)
	defer cancel()
	vm, err := s.ESXi.GetVM(ctx, r.PathValue("id"))
	if err != nil {
		return err
	}
	return writeJSON(w, vm.Info.NICs)
}

func (s *Server) handleVMNetworks(w http.ResponseWriter, r *http.Request) error {
	var body struct {
		Confirm   bool   `json:"confirm"`
		Portgroup string `json:"portgroup"`
		Adapter   string `json:"adapter"`
		Replace   bool   `json:"replace"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	ctx, cancel := s.ctx(r)
	defer cancel()
	if err := s.ESXi.AddNIC(ctx, r.PathValue("id"), body.Portgroup, body.Adapter, body.Replace, confirmed(r, body.Confirm)); err != nil {
		return err
	}
	return writeJSON(w, map[string]string{"status": "ok"})
}

func (s *Server) handleUnregister(w http.ResponseWriter, r *http.Request) error {
	var body confirmBody
	_ = json.NewDecoder(r.Body).Decode(&body)
	ctx, cancel := s.ctx(r)
	defer cancel()
	if err := s.ESXi.Unregister(ctx, r.PathValue("id"), confirmed(r, body.Confirm)); err != nil {
		return err
	}
	return writeJSON(w, map[string]string{"status": "unregistered", "note": "MoRef will change on next register; files are kept"})
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) error {
	var body struct {
		Confirm   bool   `json:"confirm"`
		Datastore string `json:"datastore"`
		Path      string `json:"path"`
		Name      string `json:"name"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	ctx, cancel := s.ctx(r)
	defer cancel()
	info, err := s.ESXi.Register(ctx, body.Datastore, body.Path, body.Name, confirmed(r, body.Confirm))
	if err != nil {
		return err
	}
	return writeJSON(w, info)
}

func (s *Server) handleHost(w http.ResponseWriter, r *http.Request) error {
	ctx, cancel := s.ctx(r)
	defer cancel()
	h, err := s.ESXi.Host(ctx)
	if err != nil {
		return err
	}
	return writeJSON(w, h)
}

func (s *Server) handleHostMetrics(w http.ResponseWriter, r *http.Request) error {
	q, err := parseMetrics(r)
	if err != nil {
		return err
	}
	ctx, cancel := s.ctx(r)
	defer cancel()
	out, err := s.ESXi.HostMetrics(ctx, q)
	if err != nil {
		return err
	}
	return writeJSON(w, out)
}

func (s *Server) handleNetworks(w http.ResponseWriter, r *http.Request) error {
	ctx, cancel := s.ctx(r)
	defer cancel()
	out, err := s.ESXi.Networks(ctx)
	if err != nil {
		return err
	}
	return writeJSON(w, out)
}

func (s *Server) handleDatastores(w http.ResponseWriter, r *http.Request) error {
	ctx, cancel := s.ctx(r)
	defer cancel()
	out, err := s.ESXi.Datastores(ctx)
	if err != nil {
		return err
	}
	return writeJSON(w, out)
}

func (s *Server) handleDatastoreRefresh(w http.ResponseWriter, r *http.Request) error {
	ctx, cancel := s.ctx(r)
	defer cancel()
	if err := s.ESXi.RefreshDatastores(ctx); err != nil {
		return err
	}
	out, err := s.ESXi.Datastores(ctx)
	if err != nil {
		return err
	}
	return writeJSON(w, out)
}

func (s *Server) handleMetricsIndex(w http.ResponseWriter, r *http.Request) error {
	return writeJSON(w, map[string]any{
		"role": "QueryPerf catalog. Time series hang off the entity, not this path.",
		"counters": map[string]string{
			"path":  "/v1/metrics/counters",
			"query": "entity=vm|host",
			"use":   "discover full counter names, then pass names= to a series endpoint",
		},
		"series": map[string]string{
			"host":  "GET /v1/host/metrics",
			"vm":    "GET /v1/vms/{id}/metrics",
			"query": "names,instance,start,end,maxSample",
		},
		"inventory": map[string]string{
			"host":     "GET /v1/host — static host (cpuMhz, memory, portgroups summary); not time series",
			"networks": "GET /v1/networks — host portgroups. VM vNICs are GET /v1/vms/{id}/networks",
		},
	})
}

func (s *Server) handleCounters(w http.ResponseWriter, r *http.Request) error {
	ctx, cancel := s.ctx(r)
	defer cancel()
	out, err := s.ESXi.Counters(ctx, r.URL.Query().Get("entity"))
	if err != nil {
		return err
	}
	return writeJSON(w, out)
}
