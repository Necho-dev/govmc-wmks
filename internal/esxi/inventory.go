package esxi

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/vmware/govmomi/object"
	"github.com/vmware/govmomi/vim25/methods"
	"github.com/vmware/govmomi/vim25/mo"
	"github.com/vmware/govmomi/vim25/types"
)

type ResolvedVM struct {
	Obj  *object.VirtualMachine
	Mo   mo.VirtualMachine
	Info VMInfo
}

func projectVM(vm mo.VirtualMachine) VMInfo {
	ref := vm.Reference()
	info := VMInfo{
		ID:    ref.Value,
		MoRef: ref.Type + "-" + ref.Value,
		Name:  vm.Name,
	}
	if vm.Config != nil {
		info.UUID = strings.TrimSpace(vm.Config.InstanceUuid)
		info.InstanceUUID = vm.Config.InstanceUuid
		info.BiosUUID = vm.Config.Uuid
		info.GuestID = vm.Config.GuestId
		info.NumCPU = vm.Config.Hardware.NumCPU
		info.MemoryMB = vm.Config.Hardware.MemoryMB
		info.NICs, info.Disks, info.VGPU = devicesFrom(vm.Config.Hardware.Device)
	}
	info.PowerState = string(vm.Runtime.PowerState)
	info.ConnectionState = string(vm.Runtime.ConnectionState)
	info.Question = questionFrom(vm.Runtime.Question)
	qs := vm.Summary.QuickStats
	info.QuickStats = &QuickStats{
		OverallCPUUsage:  qs.OverallCpuUsage,
		GuestMemoryUsage: qs.GuestMemoryUsage,
		HostMemoryUsage:  qs.HostMemoryUsage,
		UptimeSeconds:    qs.UptimeSeconds,
		ConsumedOverhead: 0,
		PrivateMemory:    qs.PrivateMemory,
	}
	info.QuickStatsReliable = qs.HostMemoryUsage >= 0 && qs.UptimeSeconds > 0 && vm.Runtime.PowerState == types.VirtualMachinePowerStatePoweredOn
	if vm.Runtime.PowerState != types.VirtualMachinePowerStatePoweredOn {
		info.QuickStatsReliable = false
	}
	tools := ""
	if vm.Guest != nil {
		tools = string(vm.Guest.ToolsStatus)
		info.Guest.HostName = vm.Guest.HostName
		info.Guest.IPAddress = vm.Guest.IpAddress
		info.Guest.ToolsStatus = tools
	}
	info.Guest.GuestUnavailable = info.Guest.HostName == "" && info.Guest.IPAddress == ""
	return info
}

func questionFrom(q *types.VirtualMachineQuestionInfo) *Question {
	if q == nil {
		return nil
	}
	out := &Question{ID: q.Id, Text: q.Text, Choices: map[string]string{}}
	for _, v := range q.Choice.ChoiceInfo {
		if ed, ok := v.(*types.ElementDescription); ok {
			out.Choices[ed.Key] = ed.Label
		}
	}
	return out
}

func labelOf(d types.BaseVirtualDevice) string {
	info := d.GetVirtualDevice().DeviceInfo
	if info == nil {
		return ""
	}
	return info.GetDescription().Label
}

func devicesFrom(devs []types.BaseVirtualDevice) (nics []NIC, disks []Disk, vgpus []VGPU) {
	for _, b := range devs {
		d := b.GetVirtualDevice()
		switch t := b.(type) {
		case types.BaseVirtualEthernetCard:
			card := t.GetVirtualEthernetCard()
			n := NIC{Label: labelOf(b), Key: d.Key, MAC: card.MacAddress, Adapter: deviceTypeName(b)}
			if backing, ok := d.Backing.(*types.VirtualEthernetCardNetworkBackingInfo); ok {
				n.Portgroup = backing.DeviceName
			}
			nics = append(nics, n)
		case *types.VirtualDisk:
			disk := Disk{Label: labelOf(b), Key: d.Key, Capacity: t.CapacityInKB}
			if fb, ok := d.Backing.(types.BaseVirtualDeviceFileBackingInfo); ok {
				disk.FileName = fb.GetVirtualDeviceFileBackingInfo().FileName
			}
			disks = append(disks, disk)
		case *types.VirtualPCIPassthrough:
			g := VGPU{Label: labelOf(b)}
			if vb, ok := d.Backing.(*types.VirtualPCIPassthroughVmiopBackingInfo); ok {
				g.Type = vb.Vgpu
			}
			if g.Type != "" {
				vgpus = append(vgpus, g)
			}
		}
	}
	return
}

func deviceTypeName(b types.BaseVirtualDevice) string {
	s := fmt.Sprintf("%T", b)
	s = strings.TrimPrefix(s, "*types.")
	s = strings.TrimPrefix(s, "types.")
	return s
}

func hasUSBTablet(devs []types.BaseVirtualDevice) bool {
	for _, b := range devs {
		switch t := b.(type) {
		case *types.VirtualUSB:
			if strings.Contains(strings.ToLower(t.DeviceInfo.GetDescription().Label), "tablet") {
				return true
			}
		case *types.VirtualPointingDevice:
			if b, ok := t.Backing.(*types.VirtualPointingDeviceDeviceBackingInfo); ok {
				if strings.EqualFold(b.HostPointingDevice, "usb") || strings.Contains(strings.ToLower(b.HostPointingDevice), "tablet") {
					return true
				}
			}
		}
	}
	return false
}

func (c *Client) ListVMs(ctx context.Context, withSpark bool) ([]VMInfo, error) {
	vms, err := c.containerVMs(ctx, vmProps)
	if err != nil {
		return nil, err
	}
	out := make([]VMInfo, 0, len(vms))
	var on []types.ManagedObjectReference
	idx := map[string]int{}
	for _, vm := range vms {
		info := projectVM(vm)
		idx[vm.Reference().Value] = len(out)
		out = append(out, info)
		if vm.Runtime.PowerState == types.VirtualMachinePowerStatePoweredOn {
			on = append(on, vm.Reference())
		}
	}
	if withSpark && len(on) > 0 {
		mhz, err := c.HostCPUMhz(ctx)
		if err != nil {
			return out, nil
		}
		latest, err := c.latestVMMetrics(ctx, on)
		if err != nil {
			return out, nil
		}
		for moref, snap := range latest {
			i, ok := idx[moref]
			if !ok {
				continue
			}
			applySpark(&out[i], snap, mhz)
		}
	}
	return out, nil
}

func applySpark(info *VMInfo, snap map[string]int64, hostMhz int32) {
	if v, ok := snap["cpu.usagemhz.average"]; ok && info.NumCPU > 0 && hostMhz > 0 {
		pct := float64(v) / (float64(info.NumCPU) * float64(hostMhz)) * 100
		info.CPUPct = &pct
	}
	if v, ok := snap["mem.active.average"]; ok && info.MemoryMB > 0 {
		pct := float64(v) / (float64(info.MemoryMB) * 1024) * 100
		info.MemActivePct = &pct
	}
	if v, ok := snap["net.bytesRx.average"]; ok {
		m := kbpsToMbps(v)
		info.NetRxMbps = &m
	}
	if v, ok := snap["net.bytesTx.average"]; ok {
		m := kbpsToMbps(v)
		info.NetTxMbps = &m
	}
}

func (c *Client) GetVM(ctx context.Context, id string) (*ResolvedVM, error) {
	vms, err := c.containerVMs(ctx, vmProps)
	if err != nil {
		return nil, err
	}
	id = strings.TrimSpace(id)
	wantMo := normalizeMoRef(id)
	var byMoRef, byName, byUUID []mo.VirtualMachine
	for _, vm := range vms {
		if wantMo != "" && vm.Reference().Value == wantMo {
			byMoRef = append(byMoRef, vm)
		}
		if vm.Name == id {
			byName = append(byName, vm)
		}
		if vm.Config != nil && (eqFold(id, vm.Config.InstanceUuid) || eqFold(id, vm.Config.Uuid)) {
			byUUID = append(byUUID, vm)
		}
	}
	hit, why := pickVM(byMoRef, byName, byUUID)
	if hit == nil {
		if why == "ambiguous" {
			src := byUUID
			if len(byName) > 1 {
				src = byName
			}
			var refs []string
			for _, vm := range src {
				refs = append(refs, vm.Name+"/"+vm.Reference().Value)
			}
			return nil, &Error{
				Status: http.StatusConflict,
				Code:   "ambiguous",
				Message: fmt.Sprintf("ambiguous vm %q (shared instanceUuid from directory clone). Use display name or moref, e.g. GET /v1/vms/%s. matches: %s",
					id, src[0].Reference().Value, strings.Join(refs, ", ")),
			}
		}
		return nil, notFound("vm %q not found", id)
	}
	return &ResolvedVM{
		Obj:  object.NewVirtualMachine(c.Gov.Client, hit.Reference()),
		Mo:   *hit,
		Info: projectVM(*hit),
	}, nil
}

func normalizeMoRef(id string) string {
	s := strings.TrimSpace(id)
	s = strings.TrimPrefix(s, "VirtualMachine-")
	s = strings.TrimPrefix(s, "vm-")
	return s
}

func pickVM(byMoRef, byName, byUUID []mo.VirtualMachine) (*mo.VirtualMachine, string) {
	if len(byMoRef) == 1 {
		return &byMoRef[0], ""
	}
	if len(byName) == 1 {
		return &byName[0], ""
	}
	if len(byName) > 1 {
		return nil, "ambiguous"
	}
	if len(byUUID) == 1 {
		return &byUUID[0], ""
	}
	if len(byUUID) > 1 {
		return nil, "ambiguous"
	}
	return nil, ""
}

func eqFold(a, b string) bool {
	return a != "" && b != "" && strings.EqualFold(a, b)
}

func (c *Client) Host(ctx context.Context) (*HostInfo, error) {
	hs, err := c.Finder.DefaultHostSystem(ctx)
	if err != nil {
		return nil, wrapVim(err)
	}
	var moHost mo.HostSystem
	err = hs.Properties(ctx, hs.Reference(), []string{"name", "summary.hardware", "config.network.portgroup"}, &moHost)
	if err != nil {
		return nil, wrapVim(err)
	}
	out := &HostInfo{Name: moHost.Name, MoRef: hs.Reference().Value}
	if hw := moHost.Summary.Hardware; hw != nil {
		out.CPUMhz = hw.CpuMhz
		out.NumCpuCores = hw.NumCpuCores
		out.NumCpuThreads = hw.NumCpuThreads
		out.NumCpuPkgs = hw.NumCpuPkgs
		out.NumCPU = hw.NumCpuThreads
		if out.NumCPU == 0 {
			out.NumCPU = hw.NumCpuCores
		}
		out.MemoryMB = hw.MemorySize / (1024 * 1024)
	}
	if moHost.Config != nil && moHost.Config.Network != nil {
		for _, pg := range moHost.Config.Network.Portgroup {
			out.Portgroups = append(out.Portgroups, Portgroup{
				Name:    pg.Spec.Name,
				VLAN:    pg.Spec.VlanId,
				VSwitch: pg.Spec.VswitchName,
			})
		}
	}
	return out, nil
}

func (c *Client) Networks(ctx context.Context) ([]NetworkInfo, error) {
	h, err := c.Host(ctx)
	if err != nil {
		return nil, err
	}
	var out []NetworkInfo
	for _, pg := range h.Portgroups {
		out = append(out, NetworkInfo{Name: pg.Name, Type: "portgroup"})
	}
	return out, nil
}

func (c *Client) RefreshDatastores(ctx context.Context) error {
	hs, err := c.Finder.DefaultHostSystem(ctx)
	if err != nil {
		return wrapVim(err)
	}
	ss, err := hs.ConfigManager().StorageSystem(ctx)
	if err != nil {
		return wrapVim(err)
	}
	if err := ss.Refresh(ctx); err != nil {
		return wrapVim(err)
	}
	dss, err := c.Finder.DatastoreList(ctx, "*")
	if err != nil {
		return wrapVim(err)
	}
	for _, ds := range dss {
		ref := ds.Reference()
		if _, err := methods.RefreshDatastore(ctx, c.Gov.Client, &types.RefreshDatastore{This: ref}); err != nil {
			return wrapVim(err)
		}
		if _, err := methods.RefreshDatastoreStorageInfo(ctx, c.Gov.Client, &types.RefreshDatastoreStorageInfo{This: ref}); err != nil {
			return wrapVim(err)
		}
	}
	return nil
}

func (c *Client) Datastores(ctx context.Context) ([]DatastoreInfo, error) {
	dss, err := c.Finder.DatastoreList(ctx, "*")
	if err != nil {
		return nil, wrapVim(err)
	}
	var out []DatastoreInfo
	for _, ds := range dss {
		var md mo.Datastore
		if err := ds.Properties(ctx, ds.Reference(), []string{"name", "summary"}, &md); err != nil {
			return nil, wrapVim(err)
		}
		out = append(out, DatastoreInfo{
			Name:      md.Name,
			Type:      md.Summary.Type,
			Capacity:  md.Summary.Capacity,
			FreeSpace: md.Summary.FreeSpace,
		})
	}
	return out, nil
}

func (c *Client) DatastoreFiles(ctx context.Context, dsName, path string) ([]DSFile, error) {
	ds, err := c.Finder.Datastore(ctx, dsName)
	if err != nil {
		return nil, wrapVim(err)
	}
	if path == "" {
		path = ""
	}
	b, err := ds.Browser(ctx)
	if err != nil {
		return nil, wrapVim(err)
	}
	spec := &types.HostDatastoreBrowserSearchSpec{
		Details: &types.FileQueryFlags{
			FileType:     true,
			FileSize:     true,
			Modification: true,
			FileOwner:    false,
		},
	}
	task, err := b.SearchDatastore(ctx, ds.Path(path), spec)
	if err != nil {
		return nil, wrapVim(err)
	}
	info, err := task.WaitForResult(ctx)
	if err != nil {
		return nil, wrapVim(err)
	}
	res, ok := info.Result.(types.HostDatastoreBrowserSearchResults)
	if !ok {
		return nil, errf(http.StatusBadGateway, "vim_fault", "unexpected datastore search result")
	}
	var out []DSFile
	for _, f := range res.File {
		fi := f.GetFileInfo()
		item := DSFile{Path: fi.Path, Size: fi.FileSize}
		if fi.Modification != nil {
			item.Modified = fi.Modification.UTC().Format(time.RFC3339)
		}
		if _, isDir := f.(*types.FolderFileInfo); isDir {
			item.Folder = true
		}
		out = append(out, item)
	}
	return out, nil
}
