// hostnet 是早期 QueryPerf 网卡对照脚本（一次性 stdout JSON），不是产品入口。
// 正式时序走 govmc GET /v1/host/metrics。确认无用后再评估删除。
package main

import (
	"context"
	"encoding/json"
	"net/url"
	"os"
	"time"

	"github.com/joho/godotenv"
	"github.com/vmware/govmomi"
	"github.com/vmware/govmomi/performance"
	"github.com/vmware/govmomi/view"
	"github.com/vmware/govmomi/vim25/mo"
	soap2 "github.com/vmware/govmomi/vim25/soap"
	"github.com/vmware/govmomi/vim25/types"
)

func main() {
	_ = godotenv.Load()
	parsed, err := soap2.ParseURL(os.Getenv("ESXI_URL"))
	if err != nil {
		panic(err)
	}
	parsed.User = url.UserPassword(os.Getenv("ESXI_USERNAME"), os.Getenv("ESXI_PASSWORD"))
	ctx := context.Background()
	c, err := govmomi.NewClient(ctx, parsed, true)
	if err != nil {
		panic(err)
	}
	mgr := view.NewManager(c.Client)
	v, err := mgr.CreateContainerView(ctx, c.ServiceContent.RootFolder, []string{"HostSystem"}, true)
	if err != nil {
		panic(err)
	}
	defer v.Destroy(ctx)
	var hosts []mo.HostSystem
	if err := v.Retrieve(ctx, []string{"HostSystem"}, []string{"name"}, &hosts); err != nil {
		panic(err)
	}
	if len(hosts) == 0 {
		panic("no host")
	}
	pm := performance.NewManager(c.Client)
	spec := types.PerfQuerySpec{
		IntervalId: 20,
		MaxSample:  180,
		Format:     string(types.PerfFormatNormal),
		MetricId:   []types.PerfMetricId{{Instance: "*"}},
	}
	series, err := pm.SampleByName(ctx, spec, []string{
		"net.usage.average",
		"net.bytesRx.average",
		"net.bytesTx.average",
	}, []types.ManagedObjectReference{hosts[0].Reference()})
	if err != nil {
		panic(err)
	}
	ems, err := pm.ToMetricSeries(ctx, series)
	if err != nil {
		panic(err)
	}
	out := map[string]any{
		"host": hosts[0].Name,
		"now":  time.Now().UTC().Format(time.RFC3339),
	}
	if len(ems) > 0 {
		em := ems[0]
		times := make([]string, len(em.SampleInfo))
		for i, si := range em.SampleInfo {
			times[i] = si.Timestamp.UTC().Format(time.RFC3339)
		}
		ms := []map[string]any{}
		for _, m := range em.Value {
			vals := make([]int64, len(m.Value))
			copy(vals, m.Value)
			ms = append(ms, map[string]any{
				"name":     m.Name,
				"instance": m.Instance,
				"series":   vals,
			})
		}
		out["times"] = times
		out["metrics"] = ms
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	_ = enc.Encode(out)
}
