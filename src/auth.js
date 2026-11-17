const TOKEN_KEY = 'tu-quang-token'
const USER_KEY = 'tu-quang-user'
const OFFLINE_USERS_KEY = 'tu-quang-offline-users'

let subscribers = []

async function postJson(path, body, token = '') {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetch(path, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok || !data.ok) {
    throw new Error(data.error || 'Yêu cầu không thành công')
  }
  return data
}

function notify() {
  const user = getCurrentUser()
  subscribers.forEach((fn) => {
    try {
      fn(user)
    } catch {}
  })
}

export function getCurrentUser() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export async function refreshCurrentUser() {
  const token = getToken()
  if (!token) return null

  const response = await fetch('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await response.json()
  if (response.status === 401) {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    notify()
    throw new Error('Phiên đăng nhập không còn hiệu lực. Vui lòng đăng nhập lại.')
  }
  if (!response.ok || !data.ok) {
    throw new Error(data.error || 'Không thể kiểm tra trạng thái tài khoản')
  }

  localStorage.setItem(USER_KEY, JSON.stringify(data.user))
  notify()
  return data.user
}

export async function assertCanInteract() {
  const user = await refreshCurrentUser()
  if (user?.accountStatus === 'restricted') {
    const until = user.restrictionUntil
      ? ` đến ${new Date(user.restrictionUntil).toLocaleString('vi-VN')}`
      : ' đến khi quản trị viên gỡ'
    throw new Error(`Tài khoản đang bị hạn chế${until}.`)
  }
  return user
}

export function subscribeAuth(callback) {
  subscribers.push(callback)
  return () => {
    subscribers = subscribers.filter((fn) => fn !== callback)
  }
}

export async function register({ username, password, dharmaName, email, adminSetupKey }) {
  const cleanUsername = username.trim().toLowerCase()
  const cleanDharma = (dharmaName && dharmaName.trim()) || 'Phật tử'
  return postJson('/api/auth/register', {
    username: cleanUsername,
    password,
    dharmaName: cleanDharma,
    email,
    adminSetupKey,
  })
}

export async function resendVerification(email) {
  return postJson('/api/auth/resend-verification', { email })
}

export async function verifyEmail({ email, code }) {
  const data = await postJson('/api/auth/verify-email', { email, code })
  localStorage.setItem(TOKEN_KEY, data.token)
  localStorage.setItem(USER_KEY, JSON.stringify(data.user))
  localStorage.setItem('tu-quang-username', data.user.dharmaName || data.user.username)
  notify()
  return data.user
}

export async function requestPasswordReset(email) {
  return postJson('/api/auth/forgot-password', { email })
}

export async function resetPassword({ email, code, password }) {
  return postJson('/api/auth/reset-password', { email, code, password })
}

export async function sendEmailUpdate(email) {
  return postJson('/api/auth/email', { email }, getToken())
}

export async function verifyEmailUpdate(code) {
  const data = await postJson('/api/auth/email/verify', { code }, getToken())
  localStorage.setItem(USER_KEY, JSON.stringify(data.user))
  notify()
  return data.user
}

export async function login({ username, password }) {
  const cleanUsername = username.trim().toLowerCase()

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: cleanUsername, password }),
    })
    const data = await res.json()
    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'Tên đăng nhập hoặc mật khẩu không chính xác')
    }

    localStorage.setItem(TOKEN_KEY, data.token)
    localStorage.setItem(USER_KEY, JSON.stringify(data.user))
    localStorage.setItem('tu-quang-username', data.user.dharmaName || data.user.username)
    notify()
    return data.user
  } catch (err) {
    if (err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
      return loginOffline({ username: cleanUsername, password })
    }
    throw err
  }
}

export async function logout() {
  const token = getToken()
  try {
    if (token) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
    }
  } catch {}

  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  notify()
}

function loginOffline({ username, password }) {
  let users = []
  try {
    users = JSON.parse(localStorage.getItem(OFFLINE_USERS_KEY) || '[]')
  } catch {}

  const user = users.find((u) => u.username === username && u.password === password)
  if (!user) {
    throw new Error('Tên đăng nhập hoặc mật khẩu không chính xác (offline)')
  }

  const token = 'offline-token-' + Date.now()
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  localStorage.setItem('tu-quang-username', user.dharmaName || user.username)
  notify()
  return user
}

