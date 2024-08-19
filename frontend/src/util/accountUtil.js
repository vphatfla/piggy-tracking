import { authHeader } from '../auth/authHeader'
import { BACKEND_BASE_URL } from '../configuration/config'
export async function getAccountDetails(user_id) {
  try {
    const response = await (
      await fetch(BACKEND_BASE_URL + '/account?id=' + user_id, {
        method: 'GET',
        headers: authHeader()
      })
    ).json()
    return response
  } catch (err) {
    return err
  }
}
