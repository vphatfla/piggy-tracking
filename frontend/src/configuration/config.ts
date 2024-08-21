
const LOCAL_BASE_URL = 'http://localhost:3000/api/v1'
const PROD_BASE_URL = 'https://piggytracking.com/api/v1'

const BACKEND_BASE_URL = (import.meta.env.VITE_PIGGY_TRACKING_ISLOCAL === 'true') ? LOCAL_BASE_URL : PROD_BASE_URL 
export { BACKEND_BASE_URL } 