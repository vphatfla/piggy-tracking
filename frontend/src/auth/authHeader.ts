export function authHeader(): { [key: string]: string } {
  const userToken = localStorage.getItem('user_token')
  if (userToken !== '')
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`,
      'x-access-token': userToken || ''
    }

  return { 'Content-Type': 'application/json' }
}
