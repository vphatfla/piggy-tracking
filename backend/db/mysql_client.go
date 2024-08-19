package db

import (
	"database/sql"
	"fmt"

	_ "github.com/go-sql-driver/mysql"
)

var db *sql.DB

func OpenDB() *sql.DB {
	var err error

	db, err = sql.Open("mysql", "test_user:password@tcp(localhost:3306)/test_db?parseTime=true")

	if err != nil {
		fmt.Printf("ERROR opening db connection %e\n", err)
		return nil
	}

	fmt.Printf("Successfully connect to mysql db\n")
	return db
}

func GetDBConn() *sql.DB {
	if db == nil {
		return OpenDB()
	}

	return db
}
