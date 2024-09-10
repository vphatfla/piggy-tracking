package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strconv"

	customerror "github.com/spending-tracking/customError"
	"github.com/spending-tracking/db"
	"github.com/spending-tracking/model"
	"github.com/spending-tracking/util"
	"github.com/unrolled/render"
)

func GetAccountHandler(responseW http.ResponseWriter, request *http.Request) {
	responseW.Header().Set("Content-Type", "application/json")
	tkCheck, err := util.TokenRequestHandling(request)
	r := render.New()
	if err != nil {
		if errors.Is(err, customerror.NoAuthError()) {
			responseW.WriteHeader(http.StatusUnauthorized)
			fmt.Fprint(responseW, "No Authorization detected")
			return
		}
		if errors.Is(err, customerror.InvalidJWTToken()) {
			responseW.WriteHeader(http.StatusUnauthorized)
			fmt.Fprint(responseW, "Invalid token")
			return
		}
	}

	if !tkCheck {
		responseW.WriteHeader(http.StatusUnauthorized)
		fmt.Fprint(responseW, "Unable to authorize for resources")
		return
	}
	// params
	query := request.URL.Query()

	userIdStr := query.Get("id")

	responseW.Header().Set("Content-Type", "application/json")

	// empty or invalid id
	userId, err := strconv.Atoi(userIdStr)
	if err != nil {
		responseW.WriteHeader(http.StatusBadRequest)
		fmt.Fprintf(responseW, "invalid userId")
		return
	}

	user, err := db.GetAccountById(userId)
	if err != nil {
		responseW.WriteHeader(http.StatusBadRequest)
		http.Error(responseW, err.Error(), http.StatusBadRequest)
		return
	}

	_, err = json.Marshal(user)
	if err != nil {
		responseW.WriteHeader(http.StatusBadRequest)
		http.Error(responseW, err.Error(), http.StatusBadRequest)
		return
	}
	responseW.WriteHeader(http.StatusOK)
	r.JSON(responseW, http.StatusAccepted, user)
}

func RegisterNewUserHandler(responseW http.ResponseWriter, request *http.Request) {
	r := render.New()
	// get over body request
	var newUser model.User
	err := json.NewDecoder(request.Body).Decode(&newUser)

	if err != nil {
		r.JSON(responseW, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	if len(newUser.Email) == 0 || len(newUser.RawPassword) == 0 {
		r.JSON(responseW, http.StatusBadRequest, map[string]string{"error": "Email and password are required!"})
		return
	}
	// check if email exists

	res, err := util.CheckEmailExist(newUser.Email)

	if err != nil {
		r.JSON(responseW, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	if res {
		r.JSON(responseW, http.StatusBadRequest, map[string]string{"error": "user exist"})
		return
	}
	// check sign up code
	SIGN_UP_CODE, err := strconv.Atoi(os.Getenv("SIGN_UP_CODE"))
	if err != nil {
		r.JSON(responseW, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	if SIGN_UP_CODE != newUser.Code {
		r.JSON(responseW, http.StatusBadRequest, map[string]string{"error": "invalid code"})
		return
	}
	rawPassword := newUser.RawPassword
	hashedPassword, err := util.HashPassword(rawPassword)

	if err != nil {
		r.JSON(responseW, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	id, err := db.InsertNewAccount(newUser, hashedPassword)

	if err != nil {
		r.JSON(responseW, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	responseW.Header().Set("Content-Type", "application/json")
	r.JSON(responseW, http.StatusAccepted, map[string]any{"id": id})
}

func AccountLoginHandler(responseW http.ResponseWriter, request *http.Request) {
	r := render.New()
	var user model.User
	json.NewDecoder(request.Body).Decode(&user)
	email, raw_password := user.Email, user.RawPassword

	if len(email) == 0 || len(raw_password) == 0 {
		r.JSON(responseW, http.StatusBadRequest, map[string]string{"error": "Email and password are required!"})
		return
	}
	// check if email exist
	check, err := util.CheckEmailExist(email)

	if err != nil {
		r.JSON(responseW, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if !check {
		r.JSON(responseW, http.StatusBadRequest, map[string]string{"error": "user do not exist"})
		return
	}

	// check password
	check, err = util.CheckRawPassword(raw_password, email)
	if err != nil {
		r.JSON(responseW, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if !check {
		r.JSON(responseW, http.StatusBadRequest, map[string]string{"error": "Incorrect Password"})
		return
	}

	tokenStr, err := util.CreateJWTToken(email)
	if err != nil {
		r.JSON(responseW, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	id, err := util.GetUserIdBYemail(email)

	if err != nil {
		r.JSON(responseW, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	responseW.Header().Set("Content-Type", "application/json")
	responseW.WriteHeader(http.StatusOK)
	r.JSON(responseW, http.StatusAccepted, map[string]any{"token": tokenStr, "id": id})
}
