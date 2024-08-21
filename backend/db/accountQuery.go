package db

import (
	"database/sql"
	"fmt"

	"github.com/spending-tracking/model"
)

func GetAccountById(id int) (*model.User, error) {
	db := GetDBConn()

	query := "SELECT id, email, name FROM user WHERE id = ?"
	row := db.QueryRow(query, id)
	var user model.User
	if err := row.Scan(&user.ID, &user.Email, &user.Name); err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("user with id = %d not found", id)
		}
		return nil, err
	}

	return &user, nil
}

func InsertNewAccount(user model.User, hashedPassword string) (int64, error) {
	query := "INSERT INTO user (email, name, password) VALUES (?, ?, ?);"
	result, err := GetDBConn().Exec(query, user.Email, user.Name, hashedPassword)
	var lastInsertedId int64
	if err != nil {
		return lastInsertedId, err
	}
	lastInsertedId, err = result.LastInsertId()

	return lastInsertedId, err
}

func QueryIdByEmail(email string) (int, error) {
	query := "SELECT id FROM user WHERE email = ?;"
	var id int
	err := GetDBConn().QueryRow(query, email).Scan(&id)

	return id, err
}

func GetHashPasswordByEmail(email string) (string, error) {
	query := "SELECT password FROM user WHERE email = ?;"
	var pw string
	err := GetDBConn().QueryRow(query, email).Scan(&pw)

	return pw, err
}
