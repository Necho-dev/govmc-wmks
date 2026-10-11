package esxi

import (
	"context"
	"fmt"
	"io"
	"path"
	"strings"

	"github.com/vmware/govmomi/vim25/soap"
	"github.com/vmware/govmomi/vim25/types"
)

func (c *Client) AcquireWebMKS(ctx context.Context, id string) (*types.VirtualMachineTicket, *VMInfo, error) {
	vm, err := c.GetVM(ctx, id)
	if err != nil {
		return nil, nil, err
	}
	if vm.Mo.Runtime.PowerState != types.VirtualMachinePowerStatePoweredOn {
		return nil, nil, conflict("vm is not powered on")
	}
	ticket, err := vm.Obj.AcquireTicket(ctx, "webmks")
	if err != nil {
		return nil, nil, wrapVim(err)
	}
	info := vm.Info
	return ticket, &info, nil
}

func boolDefault(p *bool, def bool) bool {
	if p == nil {
		return def
	}
	return *p
}

func (s CloneSpec) DryRunValue() bool { return boolDefault(s.DryRun, true) }
func (s CloneSpec) AsyncValue() bool  { return boolDefault(s.Async, true) }

func (c *Client) BuildClonePlan(ctx context.Context, src, dst, datastore, portgroup string, numCPU, memoryMB int32, nestedHV bool) (*ClonePlan, error) {
	cpu, mem := numCPU, memoryMB
	spec := CloneSpec{Src: src, Dst: dst, Datastore: datastore, Portgroup: portgroup, NumCPU: &cpu, MemoryMB: &mem, NestedHV: &nestedHV}
	return c.BuildClonePlanFromSpec(ctx, spec)
}

func (c *Client) BuildClonePlanFromSpec(ctx context.Context, spec CloneSpec) (*ClonePlan, error) {
	if spec.Src == "" || spec.Dst == "" || spec.Datastore == "" {
		return nil, badRequest("src, dst and datastore are required")
	}
	layout := CloneLayout{Folder: spec.Src, Prefix: spec.Src}
	if spec.SrcFolder != "" {
		layout.Folder = spec.SrcFolder
	}
	if spec.SrcPrefix != "" {
		layout.Prefix = spec.SrcPrefix
	} else if ctx != nil && spec.SrcFolder == "" {
		if got, err := c.ResolveCloneLayout(ctx, spec.Datastore, spec.Src); err == nil {
			if spec.SrcFolder == "" {
				layout.Folder = got.Folder
			}
			if spec.SrcPrefix == "" {
				layout.Prefix = got.Prefix
			}
		}
	}
	cpu, applyCPU := optionalInt(spec.NumCPU, 8)
	mem, applyMem := optionalInt(spec.MemoryMB, 24576)
	nested := boolDefault(spec.NestedHV, false)
	steps := []CloneStep{
		{Op: "copy", Summary: "copy folder as-is", Datastore: spec.Datastore, Src: layout.Folder, Dst: spec.Dst},
		{Op: "patch-vmdk", Summary: "vmdk descriptor/CID/rename", Datastore: spec.Datastore, Src: layout.Prefix, Dst: spec.Dst},
		{Op: "patch-vmx", Summary: "new vc.uuid", Datastore: spec.Datastore, Src: layout.Prefix, Dst: spec.Dst},
		{Op: "register", Summary: "register .vmx", Datastore: spec.Datastore, Path: spec.Dst + "/" + spec.Dst + ".vmx", Name: spec.Dst},
	}
	if applyCPU || applyMem || boolDefault(spec.LockMemory, true) || boolDefault(spec.IOMMU, true) {
		st := CloneStep{Op: "change", Summary: "CPU/memory/IOMMU", Name: spec.Dst, NestedHV: &nested}
		if applyCPU {
			st.NumCPU = cpu
		}
		if applyMem {
			st.MemoryMB = mem
		}
		steps = append(steps, st)
	}
	if spec.Portgroup != "" && boolDefault(spec.ReplaceNic, true) {
		steps = append(steps, CloneStep{Op: "networks", Summary: "replace VM network adapter", Name: spec.Dst, Portgroup: spec.Portgroup})
	}
	if boolDefault(spec.PowerOn, true) {
		steps = append(steps, CloneStep{Op: "power", Summary: "power on", Name: spec.Dst})
		if boolDefault(spec.AnswerCopied, true) {
			choice := spec.AnswerChoice
			if choice == "" {
				choice = "1"
			}
			steps = append(steps, CloneStep{Op: "question", Summary: "answer I copied it", Name: spec.Dst, Choice: choice})
		}
	}
	return &ClonePlan{
		DryRun: spec.DryRunValue(),
		Note:   "POST /v1/custom/clone; no vm.clone. FS copy then patch-vmdk/patch-vmx.",
		Layout: &layout,
		Steps:  steps,
	}, nil
}

func optionalInt(p *int32, def int32) (int32, bool) {
	if p == nil {
		return def, true
	}
	if *p == 0 {
		return 0, false
	}
	return *p, true
}

func (c *Client) ExecuteClone(ctx context.Context, spec CloneSpec, report func(op, status, message string)) (*VMInfo, error) {
	plan, err := c.BuildClonePlanFromSpec(ctx, spec)
	if err != nil {
		return nil, err
	}
	adapter := spec.NicAdapter
	if adapter == "" {
		adapter = "e1000e"
	}
	var last *VMInfo
	for _, step := range plan.Steps {
		if err := ctx.Err(); err != nil {
			return last, err
		}
		if report != nil {
			report(step.Op, "running", step.Summary)
		}
		if spec.DryRunValue() {
			if report != nil {
				report(step.Op, "ok", "dry-run")
			}
			continue
		}
		res, err := c.runCloneSpecStep(ctx, spec, *plan.Layout, step, adapter)
		if err != nil {
			if report != nil {
				report(step.Op, "error", err.Error())
			}
			return last, err
		}
		if info, ok := res.Detail.(*VMInfo); ok {
			last = info
		} else if info, ok := res.Detail.(VMInfo); ok {
			last = &info
		}
		if report != nil {
			report(step.Op, "ok", res.Message)
		}
	}
	if last == nil && !spec.DryRunValue() {
		if vm, err := c.GetVM(ctx, spec.Dst); err == nil {
			last = &vm.Info
		}
	}
	return last, nil
}

func (c *Client) runCloneSpecStep(ctx context.Context, spec CloneSpec, layout CloneLayout, step CloneStep, adapter string) (*StepResult, error) {
	switch step.Op {
	case "copy":
		return c.FSCopy(ctx, spec.Datastore, layout.Folder, spec.Dst, spec.Confirm, false)
	case "patch-vmdk":
		return c.PatchVMDK(ctx, spec.Datastore, layout.Prefix, spec.Dst, spec.Confirm)
	case "patch-vmx":
		return c.PatchVMX(ctx, spec.Datastore, layout.Prefix, spec.Dst, spec.Confirm)
	case "register":
		info, err := c.Register(ctx, spec.Datastore, spec.Dst+"/"+spec.Dst+".vmx", spec.Dst, spec.Confirm)
		if err != nil {
			return nil, err
		}
		return &StepResult{Op: "register", Message: "registered", Detail: info}, nil
	case "change":
		ch := VMChange{LockMemory: boolDefault(spec.LockMemory, true)}
		if spec.NestedHV != nil {
			ch.NestedHV = spec.NestedHV
		}
		if spec.IOMMU != nil {
			ch.IOMMU = spec.IOMMU
		} else {
			t := true
			ch.IOMMU = &t
		}
		if step.NumCPU > 0 {
			ch.NumCPU = &step.NumCPU
		}
		if step.MemoryMB > 0 {
			ch.MemoryMB = &step.MemoryMB
		}
		if err := c.ChangeVM(ctx, spec.Dst, ch, spec.Confirm); err != nil {
			return nil, err
		}
		return &StepResult{Op: "change", Message: "reconfigured"}, nil
	case "networks":
		replace := boolDefault(spec.ReplaceNic, true)
		if err := c.AddNIC(ctx, spec.Dst, spec.Portgroup, adapter, replace, spec.Confirm); err != nil {
			return nil, err
		}
		return &StepResult{Op: "networks", Message: "network adapter replaced"}, nil
	case "power":
		if err := c.Power(ctx, spec.Dst, "on", spec.Confirm); err != nil {
			return nil, err
		}
		return &StepResult{Op: "power", Message: "powered on"}, nil
	case "question":
		choice := spec.AnswerChoice
		if choice == "" {
			choice = "1"
		}
		if err := c.AnswerQuestion(ctx, spec.Dst, "", choice, spec.Confirm); err != nil {
			if e, ok := err.(*Error); ok && e.Code == "conflict" {
				return &StepResult{Op: "question", Message: "no pending question"}, nil
			}
			return nil, err
		}
		return &StepResult{Op: "question", Message: "answered"}, nil
	default:
		return c.RunCloneStep(ctx, step, spec.Confirm, false)
	}
}

func (c *Client) RunCloneStep(ctx context.Context, step CloneStep, confirm, dryRun bool) (*StepResult, error) {
	if dryRun {
		return &StepResult{Op: step.Op, DryRun: true, Message: "dry-run: " + step.Summary, Detail: step}, nil
	}
	switch step.Op {
	case "copy":
		return c.CopyDatastoreDir(ctx, step.Datastore, step.Src, step.Dst, confirm, false)
	case "patch-vmdk":
		return c.PatchVMDK(ctx, step.Datastore, step.Src, step.Dst, confirm)
	case "patch-vmx":
		return c.PatchVMX(ctx, step.Datastore, step.Src, step.Dst, confirm)
	case "delete":
		return c.DeleteDatastoreDir(ctx, step.Datastore, step.Dst, confirm)
	case "register":
		info, err := c.Register(ctx, step.Datastore, step.Path, step.Name, confirm)
		if err != nil {
			return nil, err
		}
		return &StepResult{Op: "register", Message: "registered", Detail: info}, nil
	case "change":
		ch := VMChange{NestedHV: step.NestedHV, LockMemory: true}
		iommu := true
		ch.IOMMU = &iommu
		if step.NumCPU > 0 {
			ch.NumCPU = &step.NumCPU
		}
		if step.MemoryMB > 0 {
			ch.MemoryMB = &step.MemoryMB
		}
		if err := c.ChangeVM(ctx, step.Name, ch, confirm); err != nil {
			return nil, err
		}
		return &StepResult{Op: "change", Message: "reconfigured (memory reserved)"}, nil
	case "networks":
		if err := c.AddNIC(ctx, step.Name, step.Portgroup, "e1000e", true, confirm); err != nil {
			return nil, err
		}
		return &StepResult{Op: "networks", Message: "network adapter replaced"}, nil
	case "power":
		if err := c.Power(ctx, step.Name, "on", confirm); err != nil {
			return nil, err
		}
		return &StepResult{Op: "power", Message: "powered on"}, nil
	case "question":
		choice := step.Choice
		if choice == "" {
			choice = "1"
		}
		if err := c.AnswerQuestion(ctx, step.Name, "", choice, confirm); err != nil {
			return nil, err
		}
		return &StepResult{Op: "question", Message: "answered"}, nil
	default:
		return nil, badRequest("unknown clone op %q (copy|patch-vmdk|patch-vmx|register|change|nic|power|question|delete)", step.Op)
	}
}

func (c *Client) ResolveCloneLayout(ctx context.Context, dsName, src string) (CloneLayout, error) {
	out := CloneLayout{Folder: src, Prefix: src}
	vm, err := c.GetVM(ctx, src)
	if err != nil || vm == nil || len(vm.Info.Disks) == 0 {
		return out, nil
	}
	folder, base := splitDatastoreFile(vm.Info.Disks[0].FileName)
	if folder != "" {
		out.Folder = folder
	}
	if p := prefixFromDiskBase(base); p != "" {
		out.Prefix = p
	}
	return out, nil
}

func splitDatastoreFile(fileName string) (folder, base string) {
	s := strings.TrimSpace(fileName)
	if i := strings.Index(s, "]"); i >= 0 {
		s = strings.TrimSpace(s[i+1:])
	}
	s = strings.ReplaceAll(s, "\\", "/")
	folder = path.Dir(s)
	if folder == "." || folder == "/" {
		folder = ""
	}
	return folder, path.Base(s)
}

func prefixFromDiskBase(base string) string {
	name := strings.TrimSuffix(base, path.Ext(base))
	name = strings.TrimSuffix(name, "-flat")
	if i := strings.LastIndex(name, "_"); i > 0 {
		rest := name[i+1:]
		if rest != "" && isAllDigits(rest) {
			return name[:i]
		}
	}
	return name
}

func isAllDigits(s string) bool {
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return s != ""
}

func (c *Client) uploadDatastoreText(ctx context.Context, dsName, rel, body string) error {
	ds, err := c.Finder.Datastore(ctx, dsName)
	if err != nil {
		return wrapVim(err)
	}
	up := soap.DefaultUpload
	if err := ds.Upload(ctx, strings.NewReader(body), rel, &up); err != nil {
		return wrapVim(err)
	}
	return nil
}

func (c *Client) PatchVMX(ctx context.Context, dsName, src, dst string, confirm bool) (*StepResult, error) {
	if err := RequireConfirm(confirm); err != nil {
		return nil, err
	}
	if layout, err := c.ResolveCloneLayout(ctx, dsName, src); err == nil && layout.Prefix != "" {
		src = layout.Prefix
	}
	ds, err := c.Finder.Datastore(ctx, dsName)
	if err != nil {
		return nil, wrapVim(err)
	}
	files, err := c.DatastoreFiles(ctx, dsName, dst)
	if err != nil {
		return nil, err
	}
	dc, err := c.Finder.DefaultDatacenter(ctx)
	if err != nil {
		return nil, wrapVim(err)
	}
	fm := ds.NewFileManager(dc, true)
	for _, f := range files {
		if f.Folder || isDiskFile(path.Base(f.Path)) {
			continue
		}
		base := path.Base(f.Path)
		newName := cloneFileRename(base, src, dst)
		if newName == base {
			continue
		}
		if err := fm.MoveFile(ctx, path.Join(dst, base), path.Join(dst, newName)); err != nil {
			return nil, wrapVim(err)
		}
	}
	files, err = c.DatastoreFiles(ctx, dsName, dst)
	if err != nil {
		return nil, err
	}
	vmxRel := path.Join(dst, dst+".vmx")
	for _, f := range files {
		base := path.Base(f.Path)
		if strings.HasSuffix(strings.ToLower(base), ".vmx") && !strings.HasSuffix(base, ".vmx~") {
			vmxRel = path.Join(dst, base)
			break
		}
	}
	rc, _, err := ds.Download(ctx, vmxRel, &soap.Download{})
	if err != nil {
		return nil, wrapVim(err)
	}
	raw, err := io.ReadAll(rc)
	rc.Close()
	if err != nil {
		return nil, err
	}
	vc := NewVCUUID()
	patched := PatchVMXContent(string(raw), dst, vc)
	patched = rewriteDiskFileNames(patched, src, dst)
	if err := c.uploadDatastoreText(ctx, dsName, vmxRel, patched); err != nil {
		return nil, err
	}
	rc, _, err = ds.Download(ctx, vmxRel, &soap.Download{})
	if err != nil {
		return nil, wrapVim(err)
	}
	got, err := io.ReadAll(rc)
	rc.Close()
	if err != nil {
		return nil, err
	}
	if !strings.Contains(string(got), vc) {
		return nil, errf(502, "patch_not_persisted", "patch-vmx upload did not persist vc.uuid=%s in %s", vc, vmxRel)
	}
	return &StepResult{Op: "patch-vmx", Message: fmt.Sprintf("patched %s vc.uuid=%s", vmxRel, vc)}, nil
}
