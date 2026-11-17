import { useState } from 'react'
import {
  login,
  register,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  verifyEmail,
} from '../auth.js'
import { ringSmallBell } from '../bell.js'

const flowTitles = {
  login: 'Đăng Nhập Đạo Tràng',
  register: 'Đăng Ký Tài Khoản',
  verify: 'Xác Minh Email',
  forgot: 'Quên Mật Khẩu',
  reset: 'Đặt Lại Mật Khẩu',
}

export default function AuthModal({ isOpen, onClose, defaultTab = 'login', onAuthSuccess }) {
  const [flow, setFlow] = useState(defaultTab)
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [dharmaName, setDharmaName] = useState('')
  const [adminSetupKey, setAdminSetupKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  if (!isOpen) return null

  function resetForm() {
    setUsername('')
    setEmail('')
    setCode('')
    setPassword('')
    setConfirmPassword('')
    setDharmaName('')
    setAdminSetupKey('')
    setError('')
    setSuccessMsg('')
    setFlow(defaultTab)
  }

  function handleClose() {
    resetForm()
    onClose()
  }

  function changeFlow(nextFlow) {
    setFlow(nextFlow)
    setError('')
    setSuccessMsg('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSuccessMsg('')

    if (flow === 'login' && (!username.trim() || !password)) {
      setError('Vui lòng nhập tên đăng nhập và mật khẩu')
      return
    }
    if (flow === 'register') {
      if (!username.trim() || !email.trim() || !password) {
        setError('Vui lòng nhập tên đăng nhập, email và mật khẩu')
        return
      }
      if (password !== confirmPassword) {
        setError('Mật khẩu nhập lại không khớp')
        return
      }
      if (password.length < 4) {
        setError('Mật khẩu phải có ít nhất 4 ký tự')
        return
      }
    }
    if (flow === 'reset') {
      if (!email.trim() || !code.trim() || !password) {
        setError('Vui lòng nhập email, mã xác minh và mật khẩu mới')
        return
      }
      if (password.length < 8) {
        setError('Mật khẩu mới phải có ít nhất 8 ký tự')
        return
      }
      if (password !== confirmPassword) {
        setError('Mật khẩu nhập lại không khớp')
        return
      }
    }
    if ((flow === 'verify' || flow === 'forgot') && !email.trim()) {
      setError('Vui lòng nhập địa chỉ email')
      return
    }
    if (flow === 'verify' && !code.trim()) {
      setError('Vui lòng nhập mã xác minh trong email')
      return
    }

    setLoading(true)
    try {
      if (flow === 'login') {
        const user = await login({ username, password })
        ringSmallBell()
        setSuccessMsg(`Chào mừng đạo hữu ${user.dharmaName || user.username} trở lại đạo tràng!`)
        setTimeout(() => {
          handleClose()
          if (onAuthSuccess) onAuthSuccess(user)
        }, 800)
      } else if (flow === 'register') {
        const result = await register({
          username,
          email,
          password,
          dharmaName: dharmaName.trim() || 'Phật tử',
          adminSetupKey,
        })
        setEmail(result.email || email.trim())
        setCode('')
        setFlow('verify')
        setSuccessMsg('Mã xác minh đã được gửi tới email. Hãy nhập mã để hoàn tất đăng ký.')
      } else if (flow === 'verify') {
        const user = await verifyEmail({ email, code })
        ringSmallBell()
        setSuccessMsg(`Xác minh thành công! Chào mừng đạo hữu ${user.dharmaName || user.username}.`)
        setTimeout(() => {
          handleClose()
          if (onAuthSuccess) onAuthSuccess(user)
        }, 800)
      } else if (flow === 'forgot') {
        const result = await requestPasswordReset(email)
        setFlow('reset')
        setSuccessMsg(result.message || 'Nếu email đã xác minh tồn tại, mã đặt lại mật khẩu đã được gửi.')
      } else if (flow === 'reset') {
        await resetPassword({ email, code, password })
        setPassword('')
        setConfirmPassword('')
        setCode('')
        setFlow('login')
        setSuccessMsg('Đã đổi mật khẩu. Hãy đăng nhập bằng mật khẩu mới.')
      }
    } catch (requestError) {
      setError(requestError.message || 'Có lỗi xảy ra, vui lòng thử lại')
    } finally {
      setLoading(false)
    }
  }

  async function handleResendVerification() {
    setError('')
    setSuccessMsg('')
    setLoading(true)
    try {
      const result = await resendVerification(email)
      setSuccessMsg(result.message || 'Nếu email cần xác minh, mã mới đã được gửi.')
    } catch (requestError) {
      setError(requestError.message || 'Không thể gửi lại mã xác minh')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-modal-backdrop" onClick={handleClose}>
      <div className="auth-modal-card" onClick={(event) => event.stopPropagation()}>
        <button className="auth-close-btn" type="button" onClick={handleClose}>
          ✕
        </button>

        <div className="auth-header">
          <div className="auth-logo-lotus">🪷</div>
          <h3>{flowTitles[flow]}</h3>
          <p className="auth-sub">
            {flow === 'login'
              ? 'Đăng nhập để dùng pháp danh, ghi sớ cầu an và tham gia đạo tràng online'
              : flow === 'register'
                ? 'Tạo tài khoản và xác minh email để bảo vệ khả năng khôi phục mật khẩu'
                : flow === 'verify'
                  ? `Nhập mã 8 chữ số đã gửi tới ${email}`
                  : flow === 'forgot'
                    ? 'Nhập email đã xác minh để nhận mã đặt lại mật khẩu'
                    : 'Nhập mã trong email và tạo mật khẩu mới'}
          </p>
          {(flow === 'login' || flow === 'register') && (
            <ul className="auth-benefits" aria-label="Quyền lợi khi có tài khoản">
              <li>Sử dụng pháp danh khi tham gia đạo tràng online</li>
              <li>Ghi sớ cầu an và phát tâm công đức gắn với tài khoản</li>
              <li>Có hồ sơ cá nhân và đăng nhập lại bất cứ lúc nào</li>
            </ul>
          )}
        </div>

        {(flow === 'login' || flow === 'register') && (
          <div className="auth-tab-bar">
            <button
              type="button"
              className={flow === 'login' ? 'auth-tab active' : 'auth-tab'}
              onClick={() => changeFlow('login')}
            >
              Đăng nhập
            </button>
            <button
              type="button"
              className={flow === 'register' ? 'auth-tab active' : 'auth-tab'}
              onClick={() => changeFlow('register')}
            >
              Đăng ký mới
            </button>
          </div>
        )}

        {error && <div className="auth-alert error" role="alert">{error}</div>}
        {successMsg && <div className="auth-alert success" role="status">{successMsg}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          {(flow === 'login' || flow === 'register') && (
            <label>
              Tên đăng nhập
              <input
                type="text"
                required
                autoFocus
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Ví dụ: phattu123"
                disabled={loading}
              />
            </label>
          )}

          {(flow === 'register' || flow === 'verify' || flow === 'forgot' || flow === 'reset') && (
            <label>
              Email
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="ten@gmail.com"
                disabled={loading || flow === 'verify'}
              />
            </label>
          )}
          {flow === 'register' && (
            <p className="auth-field-hint">
              Email dùng để xác minh tài khoản và hỗ trợ đặt lại mật khẩu.
            </p>
          )}

          {flow === 'register' && (
            <label>
              Pháp danh / Tên hiển thị
              <input
                type="text"
                value={dharmaName}
                onChange={(event) => setDharmaName(event.target.value)}
                placeholder="Ví dụ: Diệu Tâm, Minh Đức..."
                disabled={loading}
              />
            </label>
          )}

          {flow === 'register' && (
            <label>
              Mã thiết lập admin (để trống nếu bạn là Phật tử)
              <input
                type="password"
                autoComplete="off"
                value={adminSetupKey}
                onChange={(event) => setAdminSetupKey(event.target.value)}
                placeholder="Chỉ dành cho lần tạo tài khoản admin"
                disabled={loading}
              />
            </label>
          )}

          {(flow === 'verify' || flow === 'reset') && (
            <label>
              Mã xác minh trong email
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{8}"
                maxLength={8}
                required
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="Nhập mã 8 chữ số"
                disabled={loading}
              />
            </label>
          )}

          {(flow === 'login' || flow === 'register' || flow === 'reset') && (
            <label>
              {flow === 'reset' ? 'Mật khẩu mới' : 'Mật khẩu'}
              <input
                type="password"
                required
                autoComplete={flow === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={flow === 'reset' ? 'Tối thiểu 8 ký tự' : 'Tối thiểu 4 ký tự'}
                disabled={loading}
              />
            </label>
          )}

          {(flow === 'register' || flow === 'reset') && (
            <label>
              Nhập lại mật khẩu
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Nhập lại mật khẩu vừa đặt"
                disabled={loading}
              />
            </label>
          )}

          <button className="btn btn-gold auth-submit-btn" type="submit" disabled={loading}>
            {loading
              ? 'Đang xử lý...'
              : flow === 'login'
                ? 'Đăng Nhập'
                : flow === 'register'
                  ? 'Gửi mã xác minh'
                  : flow === 'verify'
                    ? 'Xác minh và hoàn tất'
                    : flow === 'forgot'
                      ? 'Gửi mã đặt lại'
                      : 'Đổi mật khẩu'}
          </button>
        </form>

        {flow === 'verify' && (
          <div className="auth-footer-hint">
            Chưa nhận được mã?{' '}
            <button
              type="button"
              className="link-btn"
              onClick={handleResendVerification}
              disabled={loading}
            >
              Gửi lại mã
            </button>
          </div>
        )}

        <div className="auth-footer-hint">
          {flow === 'login' ? (
            <>
              <button type="button" className="link-btn" onClick={() => changeFlow('forgot')}>
                Quên mật khẩu?
              </button>
              <span> · Chưa có tài khoản? </span>
              <button type="button" className="link-btn" onClick={() => changeFlow('register')}>
                Đăng ký ngay
              </button>
            </>
          ) : flow === 'register' ? (
            <>
              Đã có tài khoản?{' '}
              <button type="button" className="link-btn" onClick={() => changeFlow('login')}>
                Đăng nhập ngay
              </button>
            </>
          ) : (
            <button type="button" className="link-btn" onClick={() => changeFlow('login')}>
              Quay lại đăng nhập
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
