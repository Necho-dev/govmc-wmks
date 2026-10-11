package esxi

import (
	"context"
	"fmt"
	"io"
	"path"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"github.com/vmware/govmomi/vim25/soap"
)

var vmdkCIDRe = regexp.MustCompile(`(?m)^CID=\S+`)
var vmdkExtentRe = regexp.MustCompile(`(?m)^(RW\s+\d+\s+\S+\s+)"[^"]+"`)
var vmdkExtentNameRe = regexp.MustCompile(`(?m)^RW\s+\d+\s+\S+\s+"([^"]+)"`)

func PatchVmdkDescriptor(src, flatName string) string {
	cid := strings.ReplaceAll(uuid.NewString(), "-", "")[:8]
	out := vmdkCIDRe.ReplaceAllString(src, "CID="+cid)
	if vmdkExtentRe.MatchString(out) {
		out = vmdkExtentRe.ReplaceAllString(out, `${1}`+fmt.Sprintf("%q", flatName))
	}
	return out
}

func VmdkDescriptor(flatName string, flatBytes int64) string {
	if flatBytes < 512 {
		flatBytes = 512
	}
	sectors := flatBytes / 512
	cyl := max(sectors/(255*63), 1)
	cid := strings.ReplaceAll(uuid.NewString(), "-", "")[:8]
	return fmt.Sprintf(`# Disk DescriptorFile
version=1
encoding="UTF-8"
CID=%s
parentCID=ffffffff
createType="vmfs"

# Extent description
RW %d VMFS %q

# The Disk Data Base 
#DDB

ddb.adapterType = "lsilogic"
ddb.geometry.cylinders = "%d"
ddb.geometry.heads = "255"
ddb.geometry.sectors = "63"
ddb.virtualHWVersion = "21"
`, cid, sectors, flatName, cyl)
}

func descriptorNameForFlat(flatBase string) string {
	return strings.TrimSuffix(flatBase, "-flat.vmdk") + ".vmdk"
}

func (c *Client) EnsureVmdkDescriptors(ctx context.Context, dsName, dir string) (int, error) {
	files, err := c.DatastoreFiles(ctx, dsName, dir)
	if err != nil {
		return 0, err
	}
	listed := map[string]bool{}
	for _, f := range files {
		listed[path.Base(f.Path)] = true
	}
	ds, err := c.Finder.Datastore(ctx, dsName)
	if err != nil {
		return 0, wrapVim(err)
	}
	created := 0
	for _, f := range files {
		base := path.Base(f.Path)
		if !strings.HasSuffix(strings.ToLower(base), "-flat.vmdk") {
			continue
		}
		desc := descriptorNameForFlat(base)
		if listed[desc] && fileSize(files, desc) > 0 {
			continue
		}
		if rc, sz, err := ds.Download(ctx, path.Join(dir, desc), &soap.Download{}); err == nil {
			rc.Close()
			if sz > 0 {
				continue
			}
		}
		body := VmdkDescriptor(base, f.Size)
		if err := c.uploadDatastoreText(ctx, dsName, path.Join(dir, desc), body); err != nil {
			return created, err
		}
		created++
	}
	return created, nil
}

func fileSize(files []DSFile, base string) int64 {
	for _, f := range files {
		if path.Base(f.Path) == base {
			return f.Size
		}
	}
	return 0
}

func isDiskFile(base string) bool {
	l := strings.ToLower(base)
	return strings.HasSuffix(l, ".vmdk")
}

func inferSrcName(base, src, dst string) string {
	if src == "" || dst == "" || src == dst || !strings.HasPrefix(base, dst) {
		return ""
	}
	return src + base[len(dst):]
}

func parseVmdkExtents(desc string) []string {
	ms := vmdkExtentNameRe.FindAllStringSubmatch(desc, -1)
	out := make([]string, 0, len(ms))
	for _, m := range ms {
		if len(m) > 1 && m[1] != "" {
			out = append(out, path.Base(m[1]))
		}
	}
	return out
}

func listedDiskRenames(files []DSFile, src, dst string) [][2]string {
	var moves [][2]string
	seen := map[string]bool{}
	for _, f := range files {
		if f.Folder || !isDiskFile(path.Base(f.Path)) {
			continue
		}
		from := path.Base(f.Path)
		to := cloneFileRename(from, src, dst)
		if to == from || seen[from] {
			continue
		}
		seen[from] = true
		moves = append(moves, [2]string{from, to})
	}
	return moves
}

func (c *Client) PatchVMDK(ctx context.Context, dsName, src, dst string, confirm bool) (*StepResult, error) {
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
	dc, err := c.Finder.DefaultDatacenter(ctx)
	if err != nil {
		return nil, wrapVim(err)
	}
	fm := ds.NewFileManager(dc, true)
	files, err := c.DatastoreFiles(ctx, dsName, dst)
	if err != nil {
		return nil, err
	}
	renamed := 0
	moveIfExists := func(from, to string) error {
		if from == "" || to == "" || from == to {
			return nil
		}
		if err := fm.MoveFile(ctx, path.Join(dst, from), path.Join(dst, to)); err != nil {
			msg := strings.ToLower(err.Error())
			if strings.Contains(msg, "not found") || strings.Contains(msg, "already exists") {
				return nil
			}
			return wrapVim(err)
		}
		renamed++
		return nil
	}
	for _, mv := range listedDiskRenames(files, src, dst) {
		if err := moveIfExists(mv[0], mv[1]); err != nil {
			return nil, err
		}
	}
	files, err = c.DatastoreFiles(ctx, dsName, dst)
	if err != nil {
		return nil, err
	}
	for _, f := range files {
		base := path.Base(f.Path)
		l := strings.ToLower(base)
		if f.Folder || !strings.HasSuffix(l, ".vmdk") || strings.HasSuffix(l, "-flat.vmdk") || strings.HasSuffix(l, "-delta.vmdk") {
			continue
		}
		rel := path.Join(dst, base)
		rc, _, err := ds.Download(ctx, rel, &soap.Download{})
		if err != nil {
			continue
		}
		raw, err := io.ReadAll(rc)
		rc.Close()
		if err != nil {
			return nil, err
		}
		for _, extent := range parseVmdkExtents(string(raw)) {
			to := cloneFileRename(extent, src, dst)
			if to == extent {
				continue
			}
			if _, err := ds.Stat(ctx, path.Join(dst, extent)); err != nil {
				continue
			}
			if err := moveIfExists(extent, to); err != nil {
				return nil, err
			}
		}
	}
	created, err := c.EnsureVmdkDescriptors(ctx, dsName, dst)
	if err != nil {
		return nil, err
	}
	files, err = c.DatastoreFiles(ctx, dsName, dst)
	if err != nil {
		return nil, err
	}
	patched := 0
	for _, f := range files {
		base := path.Base(f.Path)
		l := strings.ToLower(base)
		if f.Folder || !strings.HasSuffix(l, ".vmdk") || strings.HasSuffix(l, "-flat.vmdk") || strings.HasSuffix(l, "-delta.vmdk") {
			continue
		}
		rel := path.Join(dst, base)
		rc, _, err := ds.Download(ctx, rel, &soap.Download{})
		if err != nil {
			return nil, wrapVim(err)
		}
		raw, err := io.ReadAll(rc)
		rc.Close()
		if err != nil {
			return nil, err
		}
		flat := strings.TrimSuffix(base, ".vmdk") + "-flat.vmdk"
		body := PatchVmdkDescriptor(string(raw), flat)
		body = rewriteCloneNames(body, src, dst)
		if err := c.uploadDatastoreText(ctx, dsName, rel, body); err != nil {
			return nil, err
		}
		patched++
	}
	return &StepResult{
		Op:      "patch-vmdk",
		Message: fmt.Sprintf("vmdk descriptors created=%d renamed=%d patched=%d", created, renamed, patched),
	}, nil
}
