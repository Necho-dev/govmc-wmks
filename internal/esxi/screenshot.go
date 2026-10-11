package esxi

import (
	"context"
	"io"
	"net/http"

	"github.com/vmware/govmomi/object"
	"github.com/vmware/govmomi/vim25/methods"
	"github.com/vmware/govmomi/vim25/soap"
	"github.com/vmware/govmomi/vim25/types"
)

func (c *Client) Screenshot(ctx context.Context, id string) ([]byte, error) {
	vm, err := c.GetVM(ctx, id)
	if err != nil {
		return nil, err
	}
	if vm.Mo.Runtime.PowerState != types.VirtualMachinePowerStatePoweredOn {
		return nil, conflict("vm is powered off; screenshot requires poweredOn")
	}
	req := types.CreateScreenshot_Task{This: vm.Obj.Reference()}
	res, err := methods.CreateScreenshot_Task(ctx, c.Gov.Client, &req)
	if err != nil {
		return nil, wrapVim(err)
	}
	task := object.NewTask(c.Gov.Client, res.Returnval)
	info, err := task.WaitForResult(ctx)
	if err != nil {
		return nil, wrapVim(err)
	}
	pathStr, ok := info.Result.(string)
	if !ok || pathStr == "" {
		return nil, errf(http.StatusBadGateway, "vim_fault", "screenshot path missing")
	}
	var dp object.DatastorePath
	if !dp.FromString(pathStr) {
		return nil, errf(http.StatusBadGateway, "vim_fault", "bad screenshot path %q", pathStr)
	}
	ds, err := c.Finder.Datastore(ctx, dp.Datastore)
	if err != nil {
		return nil, wrapVim(err)
	}
	rc, _, err := ds.Download(ctx, dp.Path, &soap.Download{})
	if err != nil {
		return nil, wrapVim(err)
	}
	defer rc.Close()
	body, err := io.ReadAll(rc)
	if err != nil {
		return nil, err
	}
	dc, err := c.Finder.DefaultDatacenter(ctx)
	if err == nil {
		fm := ds.NewFileManager(dc, true)
		_ = fm.DeleteFile(ctx, dp.Path)
	}
	if len(body) == 0 {
		return nil, errf(http.StatusBadGateway, "empty", "empty screenshot")
	}
	return body, nil
}
