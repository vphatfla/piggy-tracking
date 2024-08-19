package configuration

func GetJWTKey() ([]byte, error) {
	return []byte("secrete_key"), nil
}
