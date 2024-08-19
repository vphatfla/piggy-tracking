package db

import (
	"github.com/spending-tracking/model"
)

func GetAllTransactionByUserId(userId int) ([]model.Transaction, error) {
	query := "SELECT * FROM transaction WHERE user_id = ?"
	rows, err := GetDBConn().Query(query, userId)

	if err != nil {
		return nil, err
	}

	var transactions []model.Transaction

	for rows.Next() {
		var transaction model.Transaction
		if err := rows.Scan(&transaction.ID, &transaction.UserID, &transaction.ItemName, &transaction.Type, &transaction.Amount, &transaction.Comment, &transaction.Date); err != nil {
			return transactions, err
		}
		transactions = append(transactions, transaction)
	}

	if err := rows.Err(); err != nil {
		return transactions, nil
	}

	return transactions, nil
}

func GetAllTransactionByUserIdTimeRange(userId int, startDate string, endDate string) ([]model.Transaction, error) {
	query := "SELECT * FROM transaction WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date ASC"
	
	rows, err := GetDBConn().Query(query, userId, startDate, endDate)
	if err != nil {
		return nil, err
	}

	var transactions []model.Transaction

	for rows.Next() {
		var transaction model.Transaction
		if err := rows.Scan(&transaction.ID, &transaction.UserID, &transaction.ItemName, &transaction.Type, &transaction.Amount, &transaction.Comment, &transaction.Date); err != nil {
			return transactions, err
		}
		transactions = append(transactions, transaction)
	}

	if err := rows.Err(); err != nil {
		return transactions, nil
	}

	return transactions, nil
}
func UploadTransaction(transaction model.Transaction) (int64, error) {
	query := "INSERT INTO transaction (user_id, item_name, type, amount, comment, date) VALUES (?, ?, ?, ?, ?, ?);"
	var lastInsertedId int64
	result, err := GetDBConn().Exec(query, transaction.UserID, transaction.ItemName, transaction.Type, transaction.Amount, transaction.Comment, transaction.Date)

	if err != nil {
		return lastInsertedId, err
	}

	lastInsertedId, err = result.LastInsertId()

	return lastInsertedId, err
}
