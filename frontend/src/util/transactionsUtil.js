import { authHeader } from '../auth/authHeader'
import { BACKEND_BASE_URL } from '../configuration/config'

export async function getTransactionsByUserId(user_id) {
  try {
    const response = await (
      await fetch(BACKEND_BASE_URL + '/transactions?userId=' + user_id, {
        method: 'GET',
        headers: authHeader()
      })
    ).json()
    if (response === null) return []
    return response
  } catch (err) {
    return err
  }
}

export async function getTransactionsByUserIdWithTimeRange(user_id, startDate, endDate) {
  try {
    const urlParam = new URLSearchParams({
      userId: user_id, 
      startDate: startDate, 
      endDate: endDate
    })
    const response = await (
      await fetch(BACKEND_BASE_URL + '/transactions/dateRange?' + urlParam, {
        method: 'GET',
        headers: authHeader()
      })
    ).json()
    if (response === null) return []
    return response
  } catch (err) {
    return err
  }
}

export async function uploadTransactionFunction(transaction) {
  console.log('transaction info' + JSON.stringify(transaction))
  try {
    const response = await (
      await fetch(BACKEND_BASE_URL + '/transactions/upload', {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify(transaction)
      })
    ).json()
    if (response === null) return null
  } catch (err) {
    return err
  }
}
