package esxi

import "testing"

func TestCleanRel(t *testing.T) {
	p, err := CleanRel("/RV1002/../x")
	if err == nil {
		t.Fatal("expected .. rejected")
	}
	p, err = CleanRel("/RV1002/a")
	if err != nil || p != "RV1002/a" {
		t.Fatalf("%q %v", p, err)
	}
}

func TestRenameDest(t *testing.T) {
	p, err := RenameDest("RV1002/old.vmx", "new.vmx")
	if err != nil || p != "RV1002/new.vmx" {
		t.Fatalf("%q %v", p, err)
	}
	if _, err := RenameDest("RV1002/old.vmx", "a/b"); err == nil {
		t.Fatal("slash name should fail")
	}
}
