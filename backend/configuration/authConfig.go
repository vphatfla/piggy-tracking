package configuration

import "os"

func GetJWTKey() ([]byte, error) {
	return []byte(os.Getenv("JWT_SECRETE_KEY")), nil
}
