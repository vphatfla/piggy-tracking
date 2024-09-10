package util

import (
	"github.com/jackc/pgx/v5"
	"github.com/spending-tracking/db"
)

func CheckEmailExist(email string) (bool, error) {

	_, err := db.QueryIdByEmail(email)

	if err != nil {
		if err != pgx.ErrNoRows {
			return false, err
		}
		return false, nil
	}

	return true, nil
}

func CheckRawPassword(rawPassword, email string) (bool, error) {
	hash, err := db.GetHashPasswordByEmail(email)
	if err != nil {
		return false, err
	}

	return CheckPasswordHash(rawPassword, hash), nil
}

func GetUserIdBYemail(email string) (int, error) {
	id, err := db.QueryIdByEmail(email)
	return id, err
}
