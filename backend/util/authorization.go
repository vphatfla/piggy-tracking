package util

import (
	"net/http"

	"github.com/golang-jwt/jwt/v5"
	"github.com/spending-tracking/configuration"
	customerror "github.com/spending-tracking/customError"
)

func CreateJWTToken(username string) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256,
		jwt.MapClaims{
			"username": username,
		})
	sK, err := configuration.GetJWTKey()
	if err != nil {
		return "", err
	}
	tokenString, err := token.SignedString(sK)

	if err != nil {
		return "", err
	}

	return tokenString, nil
}

func VerifyJWTToken(tokenString string) (bool, error) {
	sK, err := configuration.GetJWTKey()
	if err != nil {
		return false, err
	}
	token, err := jwt.Parse(tokenString, func(t *jwt.Token) (interface{}, error) {
		return sK, nil
	})

	if err != nil {
		return false, err
	}

	if !token.Valid {
		return false, nil
	}

	return true, nil
}

func TokenRequestHandling(r *http.Request) (bool, error) {
	tokenString := r.Header.Get("Authorization")
	if tokenString == "" {
		return false, customerror.NoAuthError()
	}

	tkStr := tokenString[len("Bearer "):]

	check, err := VerifyJWTToken(tkStr)

	if !check && err != nil {
		return false, customerror.InvalidJWTToken()
	}

	return true, nil
}
