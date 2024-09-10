package db

import (
	"context"
	"fmt"

	"github.com/spending-tracking/model"
)

func GetAllTransactionByUserId(userId int) ([]model.Transaction, error) {
	query := `SELECT * FROM %s WHERE user_id = $1`
	rows, err := DBPool.Query(context.Background(), fmt.Sprintf(query, transaction_table_quoted), userId)

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
	query := `SELECT * FROM %s WHERE user_id = $1 AND date BETWEEN $2 AND $3 ORDER BY date ASC;`

	rows, err := DBPool.Query(context.Background(), fmt.Sprintf(query, transaction_table_quoted), userId, startDate, endDate)
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
	query := `INSERT INTO %s (user_id, item_name, type, amount, comment, date) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id;`
	var lastInsertedId int64
	err := DBPool.QueryRow(context.Background(), fmt.Sprintf(query, transaction_table_quoted), transaction.UserID, transaction.ItemName, transaction.Type, transaction.Amount, transaction.Comment, transaction.Date).Scan(&lastInsertedId)

	if err != nil {
		return lastInsertedId, err
	}

	return lastInsertedId, err
}
