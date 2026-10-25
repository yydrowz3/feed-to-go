package apierror

import (
	"errors"
	"log"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgconn"
	"gorm.io/gorm"
)

func (c Code) Error() string { return Registry[c].Description }

type wrapped struct {
	code  Code
	cause error
}

func (e *wrapped) Error() string {
	if e.cause != nil {
		return e.code.Error() + ": " + e.cause.Error()
	}
	return e.code.Error()
}
func (e *wrapped) Unwrap() error        { return e.cause }
func (e *wrapped) Is(target error) bool { return target == e.code }
func Wrap(code Code, cause error) error { return &wrapped{code, cause} }

func Classify(err error, missing Code) Code {
	var wrappedError *wrapped
	if errors.As(err, &wrappedError) {
		return wrappedError.code
	}
	var code Code
	if errors.As(err, &code) {
		if _, ok := Registry[code]; ok {
			return code
		}
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return missing
	}
	return InternalError
}

func IsDuplicate(err error) bool {
	var pg *pgconn.PgError
	return errors.Is(err, gorm.ErrDuplicatedKey) || (errors.As(err, &pg) && pg.Code == "23505")
}

func From(c *gin.Context, err error, missing Code) {
	code := Classify(err, missing)
	if Registry[code].Status >= 500 {
		log.Printf("API %s %s: %v", c.Request.Method, c.Request.URL.Path, err)
	}
	Write(c, code)
}

func Write(c *gin.Context, code Code, extra ...gin.H) {
	metadata, ok := Registry[code]
	if !ok {
		code = InternalError
		metadata = Registry[code]
	}
	body := gin.H{}
	for _, fields := range extra {
		for key, value := range fields {
			body[key] = value
		}
	}
	body["code"], body["error"] = code, metadata.Description
	c.AbortWithStatusJSON(metadata.Status, body)
}
