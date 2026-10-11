package esxi

import (
	"testing"

	"github.com/vmware/govmomi/vim25/mo"
	"github.com/vmware/govmomi/vim25/types"
)

func vmStub(name, moref, inst string) mo.VirtualMachine {
	vm := mo.VirtualMachine{}
	vm.Self = types.ManagedObjectReference{Type: "VirtualMachine", Value: moref}
	vm.Name = name
	vm.Config = &types.VirtualMachineConfigInfo{InstanceUuid: inst}
	return vm
}

func TestAssignPublicIDUniqueVsShared(t *testing.T) {
	vms := []mo.VirtualMachine{
		vmStub("R0001", "1", "unique-aaa"),
		vmStub("RV0004", "10", "shared"),
		vmStub("RV0011", "43", "shared"),
	}
	a := projectVM(vms[0])
	if a.ID != "1" || a.MoRef != "VirtualMachine-1" || a.UUID != "unique-aaa" {
		t.Fatalf("got id=%s moref=%s uuid=%s", a.ID, a.MoRef, a.UUID)
	}
	b := projectVM(vms[2])
	if b.ID != "43" || b.MoRef != "VirtualMachine-43" || b.UUID != "shared" {
		t.Fatalf("got id=%s moref=%s uuid=%s", b.ID, b.MoRef, b.UUID)
	}
}

func TestPickVMPrefersMoRef(t *testing.T) {
	a := vmStub("RV0004", "10", "shared")
	b := vmStub("RV0011", "43", "shared")
	hit, why := pickVM([]mo.VirtualMachine{b}, nil, []mo.VirtualMachine{a, b})
	if why != "" || hit == nil || hit.Reference().Value != "43" {
		t.Fatalf("hit=%v why=%s", hit, why)
	}
	hit, why = pickVM(nil, nil, []mo.VirtualMachine{a, b})
	if why != "ambiguous" || hit != nil {
		t.Fatalf("expected ambiguous, got %v %s", hit, why)
	}
}
