package esxi

import (
	"context"
	"strings"

	"github.com/vmware/govmomi/object"
	"github.com/vmware/govmomi/vim25/types"
)

func RequireConfirm(confirm bool) error {
	if confirm {
		return nil
	}
	return forbidden("destructive action requires confirm=true or header X-Confirm: true")
}

func (c *Client) Power(ctx context.Context, id, action string, confirm bool) error {
	if err := RequireConfirm(confirm); err != nil {
		return err
	}
	vm, err := c.GetVM(ctx, id)
	if err != nil {
		return err
	}
	var task *object.Task
	switch strings.ToLower(strings.TrimSpace(action)) {
	case "on":
		task, err = vm.Obj.PowerOn(ctx)
	case "off":
		task, err = vm.Obj.PowerOff(ctx)
	case "reset":
		task, err = vm.Obj.Reset(ctx)
	case "suspend", "s":
		task, err = vm.Obj.Suspend(ctx)
	default:
		return badRequest("action must be on|off|reset|suspend")
	}
	if err != nil {
		return wrapVim(err)
	}
	return wrapVim(task.Wait(ctx))
}

func (c *Client) GetQuestion(ctx context.Context, id string) (*Question, error) {
	vm, err := c.GetVM(ctx, id)
	if err != nil {
		return nil, err
	}
	return vm.Info.Question, nil
}

func (c *Client) AnswerQuestion(ctx context.Context, id, questionID, choice string, confirm bool) error {
	if err := RequireConfirm(confirm); err != nil {
		return err
	}
	vm, err := c.GetVM(ctx, id)
	if err != nil {
		return err
	}
	q := vm.Info.Question
	if q == nil {
		return conflict("no pending question")
	}
	if questionID == "" {
		questionID = q.ID
	}
	if choice == "" {
		return badRequest("choice is required")
	}
	return wrapVim(vm.Obj.Answer(ctx, questionID, choice))
}

type VMChange struct {
	NumCPU     *int32
	MemoryMB   *int32
	NestedHV   *bool
	IOMMU      *bool
	LockMemory bool
}

func (c *Client) ChangeVM(ctx context.Context, id string, ch VMChange, confirm bool) error {
	if err := RequireConfirm(confirm); err != nil {
		return err
	}
	vm, err := c.GetVM(ctx, id)
	if err != nil {
		return err
	}
	spec := types.VirtualMachineConfigSpec{}
	if ch.NumCPU != nil {
		spec.NumCPUs = *ch.NumCPU
	}
	if ch.MemoryMB != nil {
		spec.MemoryMB = int64(*ch.MemoryMB)
		if ch.LockMemory {
			mb := int64(*ch.MemoryMB)
			spec.MemoryReservationLockedToMax = types.NewBool(true)
			spec.MemoryAllocation = &types.ResourceAllocationInfo{Reservation: types.NewInt64(mb)}
		}
	}
	if ch.NestedHV != nil {
		spec.NestedHVEnabled = types.NewBool(*ch.NestedHV)
	}
	if ch.IOMMU != nil {
		val := "FALSE"
		if *ch.IOMMU {
			val = "TRUE"
		}
		spec.ExtraConfig = append(spec.ExtraConfig, &types.OptionValue{Key: "vvtd.enable", Value: val})
	}
	task, err := vm.Obj.Reconfigure(ctx, spec)
	if err != nil {
		return wrapVim(err)
	}
	return wrapVim(task.Wait(ctx))
}

func (c *Client) AddNIC(ctx context.Context, id, portgroup, adapter string, replace, confirm bool) error {
	if err := RequireConfirm(confirm); err != nil {
		return err
	}
	if portgroup == "" {
		return badRequest("portgroup is required")
	}
	if adapter == "" {
		adapter = "e1000e"
	}
	vm, err := c.GetVM(ctx, id)
	if err != nil {
		return err
	}
	if replace {
		devs, err := vm.Obj.Device(ctx)
		if err != nil {
			return wrapVim(err)
		}
		var remove []types.BaseVirtualDevice
		for _, d := range devs {
			if _, ok := d.(types.BaseVirtualEthernetCard); ok {
				remove = append(remove, d)
			}
		}
		if len(remove) > 0 {
			if err := vm.Obj.RemoveDevice(ctx, false, remove...); err != nil {
				return wrapVim(err)
			}
		}
	}
	net, err := c.Finder.Network(ctx, portgroup)
	if err != nil {
		return wrapVim(err)
	}
	backing, err := net.EthernetCardBackingInfo(ctx)
	if err != nil {
		return wrapVim(err)
	}
	card, err := object.EthernetCardTypes().CreateEthernetCard(adapter, backing)
	if err != nil {
		return wrapVim(err)
	}
	return wrapVim(vm.Obj.AddDevice(ctx, card))
}

func (c *Client) Unregister(ctx context.Context, id string, confirm bool) error {
	if err := RequireConfirm(confirm); err != nil {
		return err
	}
	vm, err := c.GetVM(ctx, id)
	if err != nil {
		return err
	}
	return wrapVim(vm.Obj.Unregister(ctx))
}

func (c *Client) Register(ctx context.Context, datastore, path, name string, confirm bool) (*VMInfo, error) {
	if err := RequireConfirm(confirm); err != nil {
		return nil, err
	}
	if datastore == "" || path == "" {
		return nil, badRequest("datastore and path are required")
	}
	if name == "" {
		return nil, badRequest("name is required")
	}
	dsPath := path
	if !strings.HasPrefix(strings.TrimSpace(path), "[") {
		p := object.DatastorePath{Datastore: datastore, Path: path}
		dsPath = p.String()
	}
	dc, err := c.Finder.DefaultDatacenter(ctx)
	if err != nil {
		return nil, wrapVim(err)
	}
	folders, err := dc.Folders(ctx)
	if err != nil {
		return nil, wrapVim(err)
	}
	host, err := c.Finder.DefaultHostSystem(ctx)
	if err != nil {
		return nil, wrapVim(err)
	}
	pool, err := host.ResourcePool(ctx)
	if err != nil {
		return nil, wrapVim(err)
	}
	task, err := folders.VmFolder.RegisterVM(ctx, dsPath, name, false, pool, host)
	if err != nil {
		return nil, wrapVim(err)
	}
	info, err := task.WaitForResult(ctx)
	if err != nil {
		return nil, wrapVim(err)
	}
	ref, ok := info.Result.(types.ManagedObjectReference)
	if !ok {
		return nil, errf(502, "vim_fault", "register returned no VM")
	}
	resolved, err := c.GetVM(ctx, ref.Value)
	if err != nil {
		return nil, err
	}
	return &resolved.Info, nil
}

func (c *Client) CopyDatastoreDir(ctx context.Context, dsName, src, dst string, confirm, dryRun bool) (*StepResult, error) {
	if src == "" || dst == "" {
		return nil, badRequest("src and dst are required")
	}
	layout := CloneLayout{Folder: src, Prefix: src}
	if got, err := c.ResolveCloneLayout(ctx, dsName, src); err == nil {
		layout = got
		if layout.Folder != "" {
			src = layout.Folder
		}
	}
	if dryRun {
		return &StepResult{Op: "copy", DryRun: true, Message: "copy [" + dsName + "] " + src + " -> " + dst, Detail: layout}, nil
	}
	out, err := c.FSCopy(ctx, dsName, src, dst, confirm, false)
	if err != nil {
		return nil, err
	}
	out.Detail = layout
	return out, nil
}

func (c *Client) DeleteDatastoreDir(ctx context.Context, dsName, rel string, confirm bool) (*StepResult, error) {
	return c.FSDelete(ctx, dsName, rel, confirm)
}
