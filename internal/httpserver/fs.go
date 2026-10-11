package httpserver

import (
	"encoding/json"
	"io"
	"net/http"
	"path"
	"strconv"

	"govmc-wmks/internal/esxi"
)

type dsBody struct {
	DS      string `json:"ds"`
	Path    string `json:"path"`
	Src     string `json:"src"`
	Dst     string `json:"dst"`
	Name    string `json:"name"`
	Confirm bool   `json:"confirm"`
	DryRun  *bool  `json:"dryRun"`
}

func (s *Server) dsQuery(r *http.Request, body dsBody) (ds, pth string) {
	ds = r.URL.Query().Get("ds")
	if ds == "" {
		ds = body.DS
	}
	pth = r.URL.Query().Get("path")
	if pth == "" {
		pth = body.Path
	}
	return ds, pth
}

func decodeDS(r *http.Request) dsBody {
	var body dsBody
	if r.Body != nil && r.Header.Get("Content-Type") != "" && r.ContentLength != 0 {
		_ = json.NewDecoder(r.Body).Decode(&body)
	}
	return body
}

func (s *Server) handleFolderList(w http.ResponseWriter, r *http.Request) error {
	ctx, cancel := s.ctx(r)
	defer cancel()
	ds, pth := s.dsQuery(r, dsBody{})
	out, err := s.ESXi.FSList(ctx, ds, pth, "folder")
	if err != nil {
		return err
	}
	return writeJSON(w, out)
}

func (s *Server) handleFolderCreate(w http.ResponseWriter, r *http.Request) error {
	var body dsBody
	_ = json.NewDecoder(r.Body).Decode(&body)
	ds, pth := s.dsQuery(r, body)
	ctx, cancel := s.ctx(r)
	defer cancel()
	out, err := s.ESXi.FSMkdir(ctx, ds, pth, confirmed(r, body.Confirm))
	if err != nil {
		return err
	}
	return writeJSON(w, out)
}

func (s *Server) handleFolderDelete(w http.ResponseWriter, r *http.Request) error {
	body := decodeDS(r)
	ds, pth := s.dsQuery(r, body)
	qConfirm, _ := strconv.ParseBool(r.URL.Query().Get("confirm"))
	ctx, cancel := s.ctxCopy(r)
	defer cancel()
	out, err := s.ESXi.FSDelete(ctx, ds, pth, confirmed(r, body.Confirm || qConfirm))
	if err != nil {
		return err
	}
	return writeJSON(w, out)
}

func (s *Server) handleFolderCopy(w http.ResponseWriter, r *http.Request) error {
	return s.handleFSCopyMove(w, r, true, true)
}

func (s *Server) handleFolderMove(w http.ResponseWriter, r *http.Request) error {
	return s.handleFSCopyMove(w, r, false, true)
}

func (s *Server) handleFolderRename(w http.ResponseWriter, r *http.Request) error {
	return s.handleFSRename(w, r)
}

func (s *Server) handleFileList(w http.ResponseWriter, r *http.Request) error {
	ctx, cancel := s.ctx(r)
	defer cancel()
	ds, pth := s.dsQuery(r, dsBody{})
	out, err := s.ESXi.FSList(ctx, ds, pth, "file")
	if err != nil {
		return err
	}
	return writeJSON(w, out)
}

func (s *Server) handleFileDelete(w http.ResponseWriter, r *http.Request) error {
	return s.handleFolderDelete(w, r)
}

func (s *Server) handleFileCopy(w http.ResponseWriter, r *http.Request) error {
	return s.handleFSCopyMove(w, r, true, false)
}

func (s *Server) handleFileMove(w http.ResponseWriter, r *http.Request) error {
	return s.handleFSCopyMove(w, r, false, false)
}

func (s *Server) handleFileRename(w http.ResponseWriter, r *http.Request) error {
	return s.handleFSRename(w, r)
}

func (s *Server) handleFSCopyMove(w http.ResponseWriter, r *http.Request, copy, _ bool) error {
	var body dsBody
	_ = json.NewDecoder(r.Body).Decode(&body)
	ds := body.DS
	if ds == "" {
		ds = r.URL.Query().Get("ds")
	}
	dry := true
	if body.DryRun != nil {
		dry = *body.DryRun
	}
	ctx, cancel := s.ctxCopy(r)
	defer cancel()
	var (
		out *esxi.StepResult
		err error
	)
	if copy {
		out, err = s.ESXi.FSCopy(ctx, ds, body.Src, body.Dst, confirmed(r, body.Confirm), dry)
	} else {
		out, err = s.ESXi.FSMove(ctx, ds, body.Src, body.Dst, confirmed(r, body.Confirm), dry)
	}
	if err != nil {
		return err
	}
	return writeJSON(w, out)
}

func (s *Server) handleFSRename(w http.ResponseWriter, r *http.Request) error {
	var body dsBody
	_ = json.NewDecoder(r.Body).Decode(&body)
	ds := body.DS
	if ds == "" {
		ds = r.URL.Query().Get("ds")
	}
	dst, err := esxi.RenameDest(body.Path, body.Name)
	if err != nil {
		return err
	}
	dry := true
	if body.DryRun != nil {
		dry = *body.DryRun
	}
	ctx, cancel := s.ctxCopy(r)
	defer cancel()
	out, err := s.ESXi.FSMove(ctx, ds, body.Path, dst, confirmed(r, body.Confirm), dry)
	if err != nil {
		return err
	}
	return writeJSON(w, out)
}

func (s *Server) handleFileDownload(w http.ResponseWriter, r *http.Request) error {
	ds, pth := s.dsQuery(r, dsBody{})
	ctx, cancel := s.ctxCopy(r)
	defer cancel()
	rc, n, err := s.ESXi.FSDownload(ctx, ds, pth)
	if err != nil {
		return err
	}
	defer rc.Close()
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", `attachment; filename="`+path.Base(pth)+`"`)
	if n > 0 {
		w.Header().Set("Content-Length", strconv.FormatInt(n, 10))
	}
	_, err = io.Copy(w, rc)
	return err
}

func (s *Server) handleFileUpload(w http.ResponseWriter, r *http.Request) error {
	ds := r.URL.Query().Get("ds")
	pth := r.URL.Query().Get("path")
	ctx, cancel := s.ctxCopy(r)
	defer cancel()
	if err := s.ESXi.FSUpload(ctx, ds, pth, r.Body, confirmed(r, false)); err != nil {
		return err
	}
	return writeJSON(w, map[string]string{"status": "uploaded", "path": pth})
}
