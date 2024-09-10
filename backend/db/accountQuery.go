package db

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/spending-tracking/model"
)

func GetAccountById(id int) (*model.User, error) {

	query := "SELECT id, email, name FROM user WHERE id = $1?"
	row := DBPool.QueryRow(context.Background(), query, id)
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
	var lastInsertedId int64

	query := "INSERT INTO user (email, name, password) VALUES ($1, $2, $2) RETURNING id;"
	err := DBPool.QueryRow(context.Background(), query, user.Email, user.Name, hashedPassword).Scan(&lastInsertedId)

	if err != nil {
		return lastInsertedId, err
	}

	return lastInsertedId, err
}

func QueryIdByEmail(email string) (int, error) {
	query := "SELECT id FROM user WHERE email = $1;"
	var id int
	err := DBPool.QueryRow(context.Background(), query, email).Scan(&id)
	return id, err
}

func GetHashPasswordByEmail(email string) (string, error) {
	query := "SELECT password FROM user WHERE email = $1;"
	var pw string
	err := DBPool.QueryRow(context.Background(), query, email).Scan(&pw)
	return pw, err
}
