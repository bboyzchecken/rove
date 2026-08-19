// Package validator wraps go-playground/validator so Echo returns a consistent
// error shape: {"error": "field is required, ..."} (DEV_SPEC §4.1).
package validator

import (
	"fmt"
	"strings"

	"github.com/go-playground/validator/v10"
)

type Validator struct {
	v *validator.Validate
}

func New() *Validator {
	return &Validator{v: validator.New()}
}

// Validate implements echo.Validator.
func (cv *Validator) Validate(i any) error {
	if err := cv.v.Struct(i); err != nil {
		return fmt.Errorf("%s", Format(err))
	}
	return nil
}

// Format turns validator errors into one human-readable sentence.
func Format(err error) string {
	var errs validator.ValidationErrors
	if !asValidationErrors(err, &errs) {
		return err.Error()
	}

	msgs := make([]string, 0, len(errs))
	for _, e := range errs {
		field := strings.ToLower(e.Field())
		switch e.Tag() {
		case "required":
			msgs = append(msgs, field+" is required")
		case "email":
			msgs = append(msgs, field+" must be a valid email")
		case "min":
			msgs = append(msgs, fmt.Sprintf("%s must be at least %s", field, e.Param()))
		case "max":
			msgs = append(msgs, fmt.Sprintf("%s must be at most %s", field, e.Param()))
		case "oneof":
			msgs = append(msgs, fmt.Sprintf("%s must be one of [%s]", field, e.Param()))
		default:
			msgs = append(msgs, fmt.Sprintf("%s failed %s validation", field, e.Tag()))
		}
	}
	return strings.Join(msgs, ", ")
}

func asValidationErrors(err error, target *validator.ValidationErrors) bool {
	if ve, ok := err.(validator.ValidationErrors); ok {
		*target = ve
		return true
	}
	return false
}
