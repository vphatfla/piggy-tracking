import { BACKEND_BASE_URL } from "../configuration/config";

export async function loginFunction(email: string, password: string) {
  try {
    const response = await (
      await fetch(BACKEND_BASE_URL + '/users/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          raw_password: password,
        }),
      })
    ).json();
    if (response.error) return response.error;
    localStorage.setItem('user_token', response.token);
    localStorage.setItem('user_id', response.id);
    return null;
  } catch (err) {
    return err;
  }
}

export async function signUpFunction(email: string, name: string, password: string, code: number) {
  try {
    const response = await (
      await fetch(BACKEND_BASE_URL + '/users/insert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          name: name,
          raw_password: password,
          code: code
        }),
      })
    ).json();
    if (response.error) return response.error;
    return null;
  } catch (err) {
    return err;
  }
}
