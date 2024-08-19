package customerror

import "errors"

var noAuthErr = errors.New("NO-AUTH")
var inValidJWTErr = errors.New("INVALID-JWT")

func NoAuthError() error {
	return noAuthErr
}

func InvalidJWTToken() error {
	return inValidJWTErr
}
