package model

type User struct {
	ID          int    `json:"id,omitempty"`
	Username    string `json:"username"`
	Name        string `json:"name,omitempty"`
	RawPassword string `json:"raw_password,omitempty"`
}
