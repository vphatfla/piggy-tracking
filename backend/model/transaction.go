package model

import "time"

type Transaction struct {
	ID       int       `json:"id,omitempty"`
	UserID   int       `json:"user_id"`
	ItemName string    `json:"item_name"`
	Type     string    `json:"type"`
	Amount   float64   `json:"amount"`
	Comment  string    `json:"comment,omitempty"`
	Date     time.Time `json:"date,omitempty"`
}
