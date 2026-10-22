package like

import (
	"errors"

	"github.com/jackc/pgx/v5/pgconn"
)

func isDupKey(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
