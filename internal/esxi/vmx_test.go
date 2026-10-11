package esxi

import (
	"strings"
	"testing"
)

func TestKbpsToMbps(t *testing.T) {
	if g := kbpsToMbps(125000); g != 1000 {
		t.Fatalf("got %v", g)
	}
}

func TestPatchVMXContent(t *testing.T) {
	src := "displayName = \"RV0000_BASE\"\nvc.uuid = \"old\"\nuuid.bios = \"aa\"\nethernet0.generatedAddress = \"00:0c:29:aa\"\nethernet0.addressType = \"vpx\"\nscsi0:0.fileName = \"RV0000_BASE_2.vmdk\"\n"
	out := PatchVMXContent(src, "RV0016", "50aabbcc-1111-2222-3333-444444444444")
	out = rewriteDiskFileNames(out, "RV0000_BASE", "RV0016")
	for _, p := range []string{`displayName = "RV0016"`, `vc.uuid = "50aabbcc-1111-2222-3333-444444444444"`, "RV0016_2.vmdk", `ethernet0.addressType = "generated"`} {
		if !strings.Contains(out, p) {
			t.Fatalf("missing %q in\n%s", p, out)
		}
	}
	if strings.Contains(out, `uuid.bios = "aa"`) || strings.Contains(out, "generatedAddress") {
		t.Fatalf("bios/mac should be stripped:\n%s", out)
	}
}

func TestCloneFileRename(t *testing.T) {
	if g := cloneFileRename("RV0001_BASE_2-flat.vmdk", "RV0001_BASE", "RV1002"); g != "RV1002_2-flat.vmdk" {
		t.Fatalf("got %s", g)
	}
	if g := cloneFileRename("RV0001_BASE.vmx", "RV0001_BASE", "RV1002"); g != "RV1002.vmx" {
		t.Fatalf("got %s", g)
	}
}

func TestParseVmdkExtents(t *testing.T) {
	src := "# Disk DescriptorFile\nRW 167772160 VMFS \"RV0001_BASE_2-flat.vmdk\"\n"
	got := parseVmdkExtents(src)
	if len(got) != 1 || got[0] != "RV0001_BASE_2-flat.vmdk" {
		t.Fatalf("got %v", got)
	}
}

func TestListedDiskRenamesNoGuesses(t *testing.T) {
	files := []DSFile{{Path: "RV0001_BASE_2.vmdk"}, {Path: "RV0001_BASE.vmx"}}
	got := listedDiskRenames(files, "RV0001_BASE", "RV0016")
	if len(got) != 1 || got[0] != [2]string{"RV0001_BASE_2.vmdk", "RV0016_2.vmdk"} {
		t.Fatalf("got %v", got)
	}
}

func TestInferSrcName(t *testing.T) {
	if g := inferSrcName("RV1002_2.vmdk", "RV0001_BASE", "RV1002"); g != "RV0001_BASE_2.vmdk" {
		t.Fatalf("got %s", g)
	}
}

func TestPrefixFromDiskBase(t *testing.T) {
	if g := prefixFromDiskBase("RV0001_BASE_2.vmdk"); g != "RV0001_BASE" {
		t.Fatalf("got %s", g)
	}
}

func TestVmdkDescriptor(t *testing.T) {
	d := VmdkDescriptor("RV1002_2-flat.vmdk", 85899345920)
	if !strings.Contains(d, `RW 167772160 VMFS "RV1002_2-flat.vmdk"`) {
		t.Fatalf("bad descriptor:\n%s", d)
	}
}

func TestPatchVmdkDescriptor(t *testing.T) {
	src := "# Disk DescriptorFile\nCID=aaaaaaaa\nRW 167772160 VMFS \"RV0001_BASE_2-flat.vmdk\"\n"
	out := PatchVmdkDescriptor(src, "RV1002_2-flat.vmdk")
	if strings.Contains(out, "CID=aaaaaaaa") || !strings.Contains(out, `"RV1002_2-flat.vmdk"`) {
		t.Fatalf("bad patch:\n%s", out)
	}
}
