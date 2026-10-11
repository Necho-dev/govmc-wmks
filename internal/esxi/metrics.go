package esxi

import (
	"context"
	"maps"
	"strings"
	"time"

	"github.com/vmware/govmomi/vim25/types"
)

func kbpsToMbps(kbps int64) float64 {
	return float64(kbps) * 8 / 1000
}

func (c *Client) resolveCounterNames(ctx context.Context, names []string) ([]string, error) {
	info, err := c.Perf.CounterInfoByName(ctx)
	if err != nil {
		return nil, wrapVim(err)
	}
	if len(names) == 0 {
		names = DefaultMetricNames
	}
	var out []string
	for _, n := range names {
		n = strings.TrimSpace(n)
		if n == "" {
			continue
		}
		if _, ok := info[n]; ok {
			out = append(out, n)
			continue
		}
		matched := false
		for full := range info {
			if full == n+"."+string(types.PerfSummaryTypeAverage) || strings.HasPrefix(full, n+".") {
				out = append(out, full)
				matched = true
				break
			}
		}
		if !matched {
			return nil, badRequest("unknown counter %q", n)
		}
	}
	return out, nil
}

func (c *Client) Counters(ctx context.Context, entity string) ([]CounterInfo, error) {
	info, err := c.Perf.CounterInfo(ctx)
	if err != nil {
		return nil, wrapVim(err)
	}
	var out []CounterInfo
	for i := range info {
		ci := &info[i]
		name := ci.Name()
		if entity == "vm" && !(strings.HasPrefix(name, "cpu.") || strings.HasPrefix(name, "mem.") || strings.HasPrefix(name, "net.") || strings.HasPrefix(name, "disk.")) {
			continue
		}
		if entity == "host" && !(strings.HasPrefix(name, "cpu.") || strings.HasPrefix(name, "mem.") || strings.HasPrefix(name, "net.") || strings.HasPrefix(name, "disk.")) {
			continue
		}
		item := CounterInfo{Name: name, Rollup: string(ci.RollupType)}
		if ci.GroupInfo != nil {
			item.Group = ci.GroupInfo.GetElementDescription().Key
		}
		if ci.UnitInfo != nil {
			item.Unit = ci.UnitInfo.GetElementDescription().Key
		}
		if ci.NameInfo != nil {
			item.Description = ci.NameInfo.GetElementDescription().Label
		}
		out = append(out, item)
	}
	return out, nil
}

type MetricsQuery struct {
	Names     []string
	Instance  string
	Start     *time.Time
	End       *time.Time
	MaxSample int32
}

func (c *Client) latestVMMetrics(ctx context.Context, refs []types.ManagedObjectReference) (map[string]map[string]int64, error) {
	names, err := c.resolveCounterNames(ctx, DefaultMetricNames)
	if err != nil {
		return nil, err
	}
	spec := types.PerfQuerySpec{
		MaxSample:  1,
		IntervalId: 20,
		MetricId:   []types.PerfMetricId{{Instance: ""}},
	}
	series, err := c.Perf.SampleByName(ctx, spec, names, refs)
	if err != nil {
		return nil, wrapVim(err)
	}
	converted, err := c.Perf.ToMetricSeries(ctx, series)
	if err != nil {
		return nil, wrapVim(err)
	}
	out := map[string]map[string]int64{}
	for _, em := range converted {
		snap := map[string]int64{}
		for _, s := range em.Value {
			if s.Instance != "" {
				continue
			}
			if len(s.Value) == 0 {
				continue
			}
			snap[s.Name] = s.Value[len(s.Value)-1]
		}
		out[em.Entity.Value] = snap
	}
	return out, nil
}

func (c *Client) VMMetrics(ctx context.Context, id string, q MetricsQuery) (*MetricsResponse, error) {
	vm, err := c.GetVM(ctx, id)
	if err != nil {
		return nil, err
	}
	hostMhz, err := c.HostCPUMhz(ctx)
	if err != nil {
		return nil, err
	}
	return c.queryMetrics(ctx, vm.Obj.Reference(), "vm:"+vm.Info.ID, q, vm.Info.NumCPU, vm.Info.MemoryMB, hostMhz)
}

func (c *Client) HostMetrics(ctx context.Context, q MetricsQuery) (*MetricsResponse, error) {
	hs, err := c.Finder.DefaultHostSystem(ctx)
	if err != nil {
		return nil, wrapVim(err)
	}
	h, err := c.Host(ctx)
	if err != nil {
		return nil, err
	}
	hostCPU := int32(h.NumCpuCores)
	if hostCPU == 0 {
		hostCPU = int32(h.NumCPU)
	}
	return c.queryMetrics(ctx, hs.Reference(), "host:"+h.Name, q, hostCPU, int32(h.MemoryMB), h.CPUMhz)
}

func (c *Client) queryMetrics(ctx context.Context, ref types.ManagedObjectReference, entity string, q MetricsQuery, numCPU, memoryMB, hostMhz int32) (*MetricsResponse, error) {
	names, err := c.resolveCounterNames(ctx, q.Names)
	if err != nil {
		return nil, err
	}
	max := q.MaxSample
	if max <= 0 {
		max = 180
	}
	inst := q.Instance
	spec := types.PerfQuerySpec{
		MaxSample:  max,
		IntervalId: 20,
		MetricId:   []types.PerfMetricId{{Instance: inst}},
		StartTime:  q.Start,
		EndTime:    q.End,
	}
	series, err := c.Perf.SampleByName(ctx, spec, names, []types.ManagedObjectReference{ref})
	if err != nil {
		return nil, wrapVim(err)
	}
	converted, err := c.Perf.ToMetricSeries(ctx, series)
	if err != nil {
		return nil, wrapVim(err)
	}
	resp := &MetricsResponse{
		Entity:     entity,
		WindowNote: WindowNote,
		Units: map[string]string{
			"cpuPct":       "percent = usagemhz / (numCPU * host.cpuMhz) * 100",
			"memActivePct": "percent = mem.active(KB) / (memoryMB * 1024) * 100",
			"netMbps":      "Mbps = KBps * 8 / 1000 (Host Client)",
			"time":         "UTC",
		},
		Series: []MetricSeriesOut{},
	}
	if len(converted) == 0 {
		return resp, nil
	}
	em := converted[0]
	for _, s := range em.Value {
		out := MetricSeriesOut{Name: s.Name, Instance: s.Instance, Unit: s.Unit, RawUnit: s.Unit}
		for i, v := range s.Value {
			ts := time.Time{}
			if i < len(em.SampleInfo) {
				ts = em.SampleInfo[i].Timestamp.UTC()
			}
			val := float64(v)
			derived := map[string]any{}
			switch {
			case strings.HasPrefix(s.Name, "net.bytesRx") || strings.HasPrefix(s.Name, "net.bytesTx") || strings.HasPrefix(s.Name, "net.usage"):
				out.Unit = "Mbps"
				val = kbpsToMbps(v)
				derived["rawKBps"] = v
			case strings.HasPrefix(s.Name, "cpu.usagemhz"):
				out.Unit = "MHz"
				if numCPU > 0 && hostMhz > 0 {
					derived["cpuPct"] = float64(v) / (float64(numCPU) * float64(hostMhz)) * 100
				}
			case strings.HasPrefix(s.Name, "cpu.usage"):
				out.Unit = "percent"
				val = float64(v) / 100
			case strings.HasPrefix(s.Name, "mem.active"):
				out.Unit = "KB"
				if memoryMB > 0 {
					derived["memActivePct"] = float64(v) / (float64(memoryMB) * 1024) * 100
				}
			}
			pt := MetricSample{TimeUTC: ts, Value: val}
			out.Points = append(out.Points, pt)
			if len(derived) > 0 {
				if out.Derived == nil {
					out.Derived = map[string]any{}
				}
				// keep last derived on series for convenience
				maps.Copy(out.Derived, derived)
			}
		}
		resp.Series = append(resp.Series, out)
	}
	return resp, nil
}
