package model

type User struct {
	ID          int    `json:"id,omitempty"`
	Email       string `json:"email"`
	Name        string `json:"name,omitempty"`
	RawPassword string `json:"raw_password,omitempty"`
	Code        int    `json:"code,omitempty"`
}
