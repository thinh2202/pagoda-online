import { useEffect, useRef, useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import Home from './pages/Home.jsx'
import Meditation from './pages/Meditation.jsx'
import Schedule from './pages/Schedule.jsx'
import Sutras from './pages/Sutras.jsx'
import Incense from './pages/Incense.jsx'
import Dana from './pages/Dana.jsx'
import Prayers from './pages/Prayers.jsx'
import About from './pages/About.jsx'
import Account from './pages/Account.jsx'
import AuthModal from './components/AuthModal.jsx'
import {
  getCurrentUser,
  logout,
  sendEmailUpdate,
  subscribeAuth,
  verifyEmailUpdate,
} from './auth.js'
import { ringSmallBell } from './bell.js'
import { temple } from './data.js'

const links = [
  { to: '/', label: 'Trang chủ' },
  { to: '/thien-toa', label: 'Ngồi thiền' },
  { to: '/thap-huong', label: 'Thắp hương' },
  { to: '/kinh-tung', label: 'Kinh tụng' },
  { to: '/cong-phu', label: 'Công phu' },
  { to: '/cong-duc', label: 'Công đức' },
  { to: '/cau-an', label: 'Sổ cầu an' },
  { to: '/gioi-thieu', label: 'Giới thiệu' },
]

function Layout({ children }) {
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser())
  const [isAuthOpen, setIsAuthOpen] = useState(false)
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false)
  const [isEmailEditing, setIsEmailEditing] = useState(false)
  const [emailDraft, setEmailDraft] = useState(() => getCurrentUser()?.email || '')
  const [emailCode, setEmailCode] = useState('')
  const [emailCodeSent, setEmailCodeSent] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [emailMessage, setEmailMessage] = useState('')
  const [emailLoading, setEmailLoading] = useState(false)
  const accountMenuRef = useRef(null)

  useEffect(() => {
    return subscribeAuth((user) => {
      setCurrentUser(user)
      setEmailDraft(user?.email || '')
      setEmailCode('')
      setEmailCodeSent(false)
      setIsEmailEditing(false)
      if (!user) setIsAccountMenuOpen(false)
    })
  }, [])

  useEffect(() => {
    if (!isAccountMenuOpen) return undefined

    function handleOutsideClick(event) {
      if (!accountMenuRef.current?.contains(event.target)) {
        setIsAccountMenuOpen(false)
      }
    }

    function handleEscape(event) {
      if (event.key === 'Escape') setIsAccountMenuOpen(false)
    }

    document.addEventListener('pointerdown', handleOutsideClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('pointerdown', handleOutsideClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isAccountMenuOpen])

  async function handleEmailUpdate(event) {
    event.preventDefault()
    setEmailError('')
    setEmailMessage('')
    setEmailLoading(true)
    try {
      if (emailCodeSent) {
        const updatedUser = await verifyEmailUpdate(emailCode)
        setEmailDraft(updatedUser.email || '')
        setEmailCode('')
        setEmailCodeSent(false)
        setIsEmailEditing(false)
        setEmailMessage('Email khôi phục đã được xác minh.')
      } else {
        await sendEmailUpdate(emailDraft)
        setEmailCodeSent(true)
        setEmailMessage('Mã xác minh đã được gửi tới email. Mã có hiệu lực trong 10 phút.')
      }
    } catch (error) {
      setEmailError(error.message || 'Không thể cập nhật email khôi phục')
    } finally {
      setEmailLoading(false)
    }
  }

  async function handleLogout() {
    await logout()
    ringSmallBell()
  }

  return (
    <>
      <header className="site-header">
        <NavLink to="/" end className="brand">
          <svg className="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
            <path
              fill="#d4af37"
              d="M32 8c2 9-7 13-7 20 0 5 3 8 7 9 4-1 7-4 7-9 0-7-9-11-7-20z"
            />
            <path fill="#e8c96a" d="M16 30c9-2 12 7 16 9-1 3-5 7-9 7-7 0-12-9-7-16z" />
            <path fill="#e8c96a" d="M48 30c-9-2-12 7-16 9 1 3 5 7 9 7 7 0 12-9 7-16z" />
          </svg>
          <span>
            <h1>{temple.name}</h1>
            <small>Chùa online</small>
          </span>
        </NavLink>
        <nav className="nav">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.to === '/'}>
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="header-auth-section">
          {currentUser ? (
            <div className="account-menu" ref={accountMenuRef}>
              <button
                type="button"
                className="header-user-chip"
                title="Mở cài đặt tài khoản"
                aria-expanded={isAccountMenuOpen}
                aria-haspopup="true"
                aria-controls={isAccountMenuOpen ? 'header-account-menu' : undefined}
                onClick={() => setIsAccountMenuOpen((isOpen) => !isOpen)}
              >
                <span className="user-chip-avatar">🪷</span>
                <span className="user-chip-name">{currentUser.dharmaName || currentUser.username}</span>
                <span className="user-chip-chevron" aria-hidden="true">⌄</span>
              </button>
              {isAccountMenuOpen && (
                <section className="account-menu-panel" id="header-account-menu" aria-label="Cài đặt tài khoản">
                  <div className="account-menu-heading">
                    <strong>{currentUser.dharmaName || currentUser.username}</strong>
                    <span>@{currentUser.username}</span>
                  </div>
                  <div className="account-menu-settings">
                    <h2>Cài đặt tài khoản</h2>
                    <div className="account-menu-email">
                      <span className="account-menu-label">Email khôi phục</span>
                      <span className="account-menu-email-value">
                        {currentUser.email || 'Chưa thêm email'}
                        {currentUser.emailVerified && <span className="account-status-badge active">Đã xác minh</span>}
                      </span>
                    </div>
                    {!isEmailEditing ? (
                      <button
                        type="button"
                        className="account-menu-action"
                        onClick={() => {
                          setEmailDraft(currentUser.email || '')
                          setIsEmailEditing(true)
                          setEmailError('')
                          setEmailMessage('')
                        }}
                      >
                        {currentUser.emailVerified ? 'Đổi Gmail' : 'Thêm Gmail'}
                      </button>
                    ) : (
                      <form className="account-menu-email-form" onSubmit={handleEmailUpdate}>
                        <label>
                          {emailCodeSent ? 'Mã xác minh trong email' : 'Địa chỉ Gmail'}
                          {emailCodeSent ? (
                            <input
                              type="text"
                              inputMode="numeric"
                              autoComplete="one-time-code"
                              pattern="[0-9]{8}"
                              maxLength={8}
                              required
                              value={emailCode}
                              disabled={emailLoading}
                              onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, '').slice(0, 8))}
                              placeholder="Nhập mã 8 chữ số"
                            />
                          ) : (
                            <input
                              type="email"
                              autoComplete="email"
                              required
                              value={emailDraft}
                              disabled={emailLoading}
                              onChange={(event) => setEmailDraft(event.target.value)}
                              placeholder="ten@gmail.com"
                            />
                          )}
                        </label>
                        {emailError && <p className="account-menu-feedback error" role="alert">{emailError}</p>}
                        {emailMessage && <p className="account-menu-feedback success" role="status">{emailMessage}</p>}
                        <div className="account-menu-email-actions">
                          <button className="account-menu-action primary" type="submit" disabled={emailLoading}>
                            {emailLoading ? 'Đang xử lý...' : emailCodeSent ? 'Xác minh Gmail' : 'Gửi mã xác minh'}
                          </button>
                          <button
                            className="account-menu-action"
                            type="button"
                            disabled={emailLoading}
                            onClick={() => {
                              if (emailCodeSent) {
                                setEmailCodeSent(false)
                                setEmailCode('')
                                setEmailMessage('')
                              } else {
                                setIsEmailEditing(false)
                                setEmailError('')
                              }
                            }}
                          >
                            {emailCodeSent ? 'Đổi Gmail khác' : 'Huỷ'}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                  <NavLink
                    className="account-menu-link"
                    to="/tai-khoan"
                    onClick={() => setIsAccountMenuOpen(false)}
                  >
                    Hồ sơ & quản lý tài khoản
                  </NavLink>
                  <button className="account-menu-link logout" type="button" onClick={handleLogout}>
                    Đăng xuất
                  </button>
                </section>
              )}
            </div>
          ) : (
            <button
              type="button"
              className="btn-header-login"
              onClick={() => setIsAuthOpen(true)}
            >
              Đăng nhập / Đăng ký
            </button>
          )}
        </div>
      </header>
      <main>{children}</main>
      <footer className="site-footer">
        <p>
          {temple.name} · {temple.address}
        </p>
        <p>Nam mô A Di Đà Phật</p>
      </footer>

      <AuthModal
        key={isAuthOpen ? 'open' : 'closed'}
        isOpen={isAuthOpen}
        defaultTab="login"
        onClose={() => setIsAuthOpen(false)}
      />
    </>
  )
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/thien-toa" element={<Meditation />} />
        <Route path="/cong-phu" element={<Schedule />} />
        <Route path="/thap-huong" element={<Incense />} />
        <Route path="/kinh-tung" element={<Sutras />} />
        <Route path="/cong-duc" element={<Dana />} />
        <Route path="/cau-an" element={<Prayers />} />
        <Route path="/tai-khoan" element={<Account />} />
        <Route path="/gioi-thieu" element={<About />} />
      </Routes>
    </Layout>
  )
}
