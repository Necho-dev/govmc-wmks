package esxi

import (
	"context"
	"net/url"
	"sync"

	"github.com/vmware/govmomi"
	"github.com/vmware/govmomi/find"
	"github.com/vmware/govmomi/performance"
	"github.com/vmware/govmomi/view"
	"github.com/vmware/govmomi/vim25/mo"
)

type Client struct {
	Gov    *govmomi.Client
	Finder *find.Finder
	Perf   *performance.Manager
	Reach  *url.URL

	mu     sync.Mutex
	cpuMhz int32
}

func (c *Client) About(ctx context.Context) About {
	a := c.Gov.ServiceContent.About
	return About{
		Product:        a.FullName,
		APIVersion:     a.ApiVersion,
		Build:          a.Build,
		OSType:         a.OsType,
		Name:           a.Name,
		InstanceUUID:   a.InstanceUuid,
		StandaloneESXi: a.ApiType == "HostAgent",
		Note:           "no vm.clone on standalone ESXi; id is Host Client moref (/ui/#/host/vms/{id}); metrics via QueryPerf not QuickStats",
	}
}

func (c *Client) HostCPUMhz(ctx context.Context) (int32, error) {
	c.mu.Lock()
	if c.cpuMhz > 0 {
		v := c.cpuMhz
		c.mu.Unlock()
		return v, nil
	}
	c.mu.Unlock()
	h, err := c.Host(ctx)
	if err != nil {
		return 0, err
	}
	c.mu.Lock()
	c.cpuMhz = h.CPUMhz
	c.mu.Unlock()
	return h.CPUMhz, nil
}

func (c *Client) containerVMs(ctx context.Context, props []string) ([]mo.VirtualMachine, error) {
	m := view.NewManager(c.Gov.Client)
	v, err := m.CreateContainerView(ctx, c.Gov.ServiceContent.RootFolder, []string{"VirtualMachine"}, true)
	if err != nil {
		return nil, wrapVim(err)
	}
	defer v.Destroy(ctx)
	var vms []mo.VirtualMachine
	if err := v.Retrieve(ctx, []string{"VirtualMachine"}, props, &vms); err != nil {
		return nil, wrapVim(err)
	}
	return vms, nil
}

var vmProps = []string{
	"name",
	"runtime.powerState",
	"runtime.connectionState",
	"runtime.question",
	"config.instanceUuid",
	"config.uuid",
	"config.guestId",
	"config.hardware.numCPU",
	"config.hardware.memoryMB",
	"config.hardware.device",
	"guest.hostName",
	"guest.ipAddress",
	"guest.toolsStatus",
	"summary.quickStats",
	"summary.runtime.powerState",
	"summary.guest.toolsStatus",
}
