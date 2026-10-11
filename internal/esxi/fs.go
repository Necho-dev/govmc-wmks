package esxi

import (
	"context"
	"fmt"
	"io"
	"path"
	"strings"

	"github.com/vmware/govmomi/object"
	"github.com/vmware/govmomi/vim25/soap"
)

func CleanRel(p string) (string, error) {
	p = strings.TrimSpace(strings.ReplaceAll(p, "\\", "/"))
	p = strings.TrimPrefix(p, "/")
	if p == "." {
		p = ""
	}
	if strings.Contains(p, "..") {
		return "", badRequest("path must not contain ..")
	}
	return p, nil
}

func RenameDest(rel, newName string) (string, error) {
	rel, err := CleanRel(rel)
	if err != nil {
		return "", err
	}
	newName = strings.TrimSpace(strings.ReplaceAll(newName, "\\", "/"))
	if newName == "" || strings.Contains(newName, "/") || newName == "." || newName == ".." {
		return "", badRequest("name must be a single path segment")
	}
	dir := path.Dir(rel)
	if dir == "." {
		return newName, nil
	}
	return path.Join(dir, newName), nil
}

func (c *Client) dsFM(ctx context.Context, dsName string) (*object.Datastore, *object.DatastoreFileManager, *object.Datacenter, error) {
	ds, err := c.Finder.Datastore(ctx, dsName)
	if err != nil {
		return nil, nil, nil, wrapVim(err)
	}
	dc, err := c.Finder.DefaultDatacenter(ctx)
	if err != nil {
		return nil, nil, nil, wrapVim(err)
	}
	return ds, ds.NewFileManager(dc, true), dc, nil
}

func (c *Client) FSList(ctx context.Context, dsName, rel, kind string) ([]DSFile, error) {
	rel, err := CleanRel(rel)
	if err != nil {
		return nil, err
	}
	all, err := c.DatastoreFiles(ctx, dsName, rel)
	if err != nil {
		return nil, err
	}
	kind = strings.ToLower(strings.TrimSpace(kind))
	if kind == "" || kind == "all" {
		return all, nil
	}
	wantFolder := kind == "folder"
	out := make([]DSFile, 0, len(all))
	for _, f := range all {
		if f.Folder == wantFolder {
			out = append(out, f)
		}
	}
	return out, nil
}

func (c *Client) FSMkdir(ctx context.Context, dsName, rel string, confirm bool) (*StepResult, error) {
	rel, err := CleanRel(rel)
	if err != nil {
		return nil, err
	}
	if rel == "" {
		return nil, badRequest("path is required")
	}
	if err := RequireConfirm(confirm); err != nil {
		return nil, err
	}
	_, _, dc, err := c.dsFM(ctx, dsName)
	if err != nil {
		return nil, err
	}
	name := fmt.Sprintf("[%s] %s", dsName, rel)
	if err := object.NewFileManager(c.Gov.Client).MakeDirectory(ctx, name, dc, true); err != nil {
		return nil, wrapVim(err)
	}
	return &StepResult{Op: "mkdir", Message: "created folder [" + dsName + "] " + rel}, nil
}

func (c *Client) FSCopy(ctx context.Context, dsName, src, dst string, confirm, dryRun bool) (*StepResult, error) {
	src, err := CleanRel(src)
	if err != nil {
		return nil, err
	}
	dst, err = CleanRel(dst)
	if err != nil {
		return nil, err
	}
	if src == "" || dst == "" {
		return nil, badRequest("src and dst are required")
	}
	res := &StepResult{Op: "copy", DryRun: dryRun, Message: "copy [" + dsName + "] " + src + " -> " + dst}
	if dryRun {
		return res, nil
	}
	if err := RequireConfirm(confirm); err != nil {
		return nil, err
	}
	_, fm, _, err := c.dsFM(ctx, dsName)
	if err != nil {
		return nil, err
	}
	if err := fm.CopyFile(ctx, src, dst); err != nil {
		return nil, wrapVim(err)
	}
	res.Message = "copied [" + dsName + "] " + src + " -> " + dst
	return res, nil
}

func (c *Client) FSMove(ctx context.Context, dsName, src, dst string, confirm, dryRun bool) (*StepResult, error) {
	src, err := CleanRel(src)
	if err != nil {
		return nil, err
	}
	dst, err = CleanRel(dst)
	if err != nil {
		return nil, err
	}
	if src == "" || dst == "" {
		return nil, badRequest("src and dst are required")
	}
	res := &StepResult{Op: "move", DryRun: dryRun, Message: "move [" + dsName + "] " + src + " -> " + dst}
	if dryRun {
		return res, nil
	}
	if err := RequireConfirm(confirm); err != nil {
		return nil, err
	}
	_, fm, _, err := c.dsFM(ctx, dsName)
	if err != nil {
		return nil, err
	}
	if err := fm.MoveFile(ctx, src, dst); err != nil {
		return nil, wrapVim(err)
	}
	res.Message = "moved [" + dsName + "] " + src + " -> " + dst
	return res, nil
}

func (c *Client) FSDelete(ctx context.Context, dsName, rel string, confirm bool) (*StepResult, error) {
	rel, err := CleanRel(rel)
	if err != nil {
		return nil, err
	}
	if rel == "" {
		return nil, badRequest("path is required")
	}
	if err := RequireConfirm(confirm); err != nil {
		return nil, err
	}
	_, fm, _, err := c.dsFM(ctx, dsName)
	if err != nil {
		return nil, err
	}
	if err := fm.DeleteFile(ctx, rel); err != nil {
		return nil, wrapVim(err)
	}
	return &StepResult{Op: "delete", Message: "deleted [" + dsName + "] " + rel}, nil
}

func (c *Client) FSDownload(ctx context.Context, dsName, rel string) (io.ReadCloser, int64, error) {
	rel, err := CleanRel(rel)
	if err != nil {
		return nil, 0, err
	}
	if rel == "" {
		return nil, 0, badRequest("path is required")
	}
	ds, err := c.Finder.Datastore(ctx, dsName)
	if err != nil {
		return nil, 0, wrapVim(err)
	}
	rc, n, err := ds.Download(ctx, rel, &soap.Download{})
	if err != nil {
		return nil, 0, wrapVim(err)
	}
	return rc, n, nil
}

func (c *Client) FSUpload(ctx context.Context, dsName, rel string, r io.Reader, confirm bool) error {
	rel, err := CleanRel(rel)
	if err != nil {
		return err
	}
	if rel == "" {
		return badRequest("path is required")
	}
	if err := RequireConfirm(confirm); err != nil {
		return err
	}
	ds, err := c.Finder.Datastore(ctx, dsName)
	if err != nil {
		return wrapVim(err)
	}
	up := soap.DefaultUpload
	return wrapVim(ds.Upload(ctx, r, rel, &up))
}
