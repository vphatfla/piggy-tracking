package db

import "github.com/lib/pq"

var (
	user_table_quoted        = pq.QuoteIdentifier("user")
	transaction_table_quoted = pq.QuoteIdentifier("transaction")
)
