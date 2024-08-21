package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"

	customerror "github.com/spending-tracking/customError"
	"github.com/spending-tracking/db"
	"github.com/spending-tracking/model"
	"github.com/spending-tracking/util"
	"github.com/unrolled/render"
)

func GetAllTransactionByUserIdHandler(responseW http.ResponseWriter, request *http.Request) {
	r := render.New()
	responseW.Header().Set("Content-Type", "application/json")
	tkCheck, err := util.TokenRequestHandling(request)

	if err != nil {
		if errors.Is(err, customerror.NoAuthError()) {
			responseW.WriteHeader(http.StatusUnauthorized)
			r.JSON(responseW, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if errors.Is(err, customerror.InvalidJWTToken()) {
			responseW.WriteHeader(http.StatusUnauthorized)
			r.JSON(responseW, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
	}
	if !tkCheck {
		responseW.WriteHeader(http.StatusUnauthorized)
		r.JSON(responseW, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	// params
	query := request.URL.Query()
	userIdStr := query.Get("userId")

	// empty or invalid id
	userId, err := strconv.Atoi(userIdStr)
	if err != nil {
		responseW.WriteHeader(http.StatusBadRequest)
		r.JSON(responseW, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	transactions, err := db.GetAllTransactionByUserId(userId)
	if err != nil {
		responseW.WriteHeader(http.StatusBadRequest)
		r.JSON(responseW, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	transactionJson, err := json.Marshal(transactions)
	if err != nil {
		responseW.WriteHeader(http.StatusBadRequest)
		r.JSON(responseW, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	responseW.WriteHeader(http.StatusOK)
	fmt.Fprint(responseW, string(transactionJson))
}

func GetAllTransactionByUserIdAndDateRange(responseW http.ResponseWriter, request *http.Request) {
	r := render.New()
	responseW.Header().Set("Content-Type", "application/json")
	tkCheck, err := util.TokenRequestHandling(request)

	if err != nil {
		if errors.Is(err, customerror.NoAuthError()) {
			responseW.WriteHeader(http.StatusUnauthorized)
			r.JSON(responseW, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if errors.Is(err, customerror.InvalidJWTToken()) {
			responseW.WriteHeader(http.StatusUnauthorized)
			r.JSON(responseW, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
	}
	if !tkCheck {
		responseW.WriteHeader(http.StatusUnauthorized)
		r.JSON(responseW, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	// params
	query := request.URL.Query()
	userIdStr := query.Get("userId")

	// empty or invalid id
	userId, err := strconv.Atoi(userIdStr)
	if err != nil {
		responseW.WriteHeader(http.StatusBadRequest)
		r.JSON(responseW, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	// get month and year data 
	startDate := query.Get("startDate")
	endDate := query.Get("endDate")

	transactions, err := db.GetAllTransactionByUserIdTimeRange(userId, startDate, endDate)

	if err != nil {
		responseW.WriteHeader(http.StatusBadRequest)
		r.JSON(responseW, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	transactionJson, err := json.Marshal(transactions)
	if err != nil {
		responseW.WriteHeader(http.StatusBadRequest)
		r.JSON(responseW, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	responseW.WriteHeader(http.StatusOK)
	fmt.Fprint(responseW, string(transactionJson))
}
func PostNewTransactionHandler(responseW http.ResponseWriter, request *http.Request) {
	responseW.Header().Set("Content-Type", "application/json")
	tkCheck, err := util.TokenRequestHandling(request)
	r := render.New()
	if err != nil {
		if errors.Is(err, customerror.NoAuthError()) {
			responseW.WriteHeader(http.StatusUnauthorized)
			r.JSON(responseW, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if errors.Is(err, customerror.InvalidJWTToken()) {
			responseW.WriteHeader(http.StatusUnauthorized)
			r.JSON(responseW, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
	}
	if !tkCheck {
		responseW.WriteHeader(http.StatusUnauthorized)
		r.JSON(responseW, http.StatusBadRequest, map[string]string{"error": "authorization"})
		return
	}
	// params
	var transaction model.Transaction
	err = json.NewDecoder(request.Body).Decode(&transaction)
	if err != nil {
		fmt.Print(err.Error())
		r.JSON(responseW, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	id, err := db.UploadTransaction(transaction)

	if err != nil {
		r.JSON(responseW, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	// empty or invalid id
	responseW.Header().Set("Content-Type", "application/json")
	r.JSON(responseW, http.StatusAccepted, map[string]any{"id":id})
}
