package esxi

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/vmware/govmomi/vim25/soap"
	"github.com/vmware/govmomi/vim25/types"
)

// Error is an API-facing fault with HTTP status and optional vim fault name.
type Error struct {
	Status   int
	Code     string
	Message  string
	VimFault string
}

func (e *Error) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

func errf(status int, code, format string, args ...any) *Error {
	return &Error{Status: status, Code: code, Message: fmt.Sprintf(format, args...)}
}

func ErrBad(format string, args ...any) *Error {
	return badRequest(format, args...)
}

func notFound(format string, args ...any) *Error {
	return errf(http.StatusNotFound, "not_found", format, args...)
}

func ErrNotFound(format string, args ...any) *Error {
	return notFound(format, args...)
}

func conflict(format string, args ...any) *Error {
	return errf(http.StatusConflict, "conflict", format, args...)
}

func badRequest(format string, args ...any) *Error {
	return errf(http.StatusBadRequest, "bad_request", format, args...)
}

func forbidden(format string, args ...any) *Error {
	return errf(http.StatusForbidden, "confirm_required", format, args...)
}

func ErrNotImplemented(format string, args ...any) *Error {
	return errf(http.StatusNotImplemented, "not_implemented", format, args...)
}

func ErrTooLarge(format string, args ...any) *Error {
	return errf(http.StatusRequestEntityTooLarge, "too_large", format, args...)
}

func wrapVim(err error) error {
	if err == nil {
		return nil
	}
	var api *Error
	if errors.As(err, &api) {
		return err
	}
	out := &Error{
		Status:  http.StatusBadGateway,
		Code:    "vim_fault",
		Message: err.Error(),
	}
	if isNotAuthenticated(err) {
		out.Status = http.StatusServiceUnavailable
		out.Code = "session_expired"
	}
	if soap.IsSoapFault(err) {
		if f := soap.ToSoapFault(err); f != nil && f.VimFault() != nil {
			out.VimFault = vimTypeName(f.VimFault())
		}
	}
	return out
}

func vimTypeName(f types.AnyType) string {
	if f == nil {
		return ""
	}
	return fmt.Sprintf("%T", f)
}
