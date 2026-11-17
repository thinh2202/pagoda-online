import { useEffect, useState } from 'react'
import {
  getCurrentUser,
  getToken,
  logout,
  refreshCurrentUser,
  sendEmailUpdate,
  subscribeAuth,
  verifyEmailUpdate,
} from '../auth.js'
import AuthModal from '../components/AuthModal.jsx'
import { ringSmallBell } from '../bell.js'

function normalizeSearchValue(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLocaleLowerCase('vi-VN')
}

function formatActivityDuration(totalSeconds) {
  if (totalSeconds < 60) return `${totalSeconds} giây`
  const totalMinutes = Math.ceil(totalSeconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours ? `${hours} giờ ${minutes} phút` : `${minutes} phút`
}

export default function Account() {
  const [user, setUser] = useState(() => getCurrentUser())
  const [emailDraft, setEmailDraft] = useState(() => getCurrentUser()?.email || '')
  const [emailCode, setEmailCode] = useState('')
  const [emailCodeSent, setEmailCodeSent] = useState(false)
  const [isEditingRecoveryEmail, setIsEditingRecoveryEmail] = useState(
    () => !getCurrentUser()?.emailVerified
  )
  const [emailError, setEmailError] = useState('')
  const [emailMessage, setEmailMessage] = useState('')
  const [emailLoading, setEmailLoading] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalTab, setModalTab] = useState('login')
  const [isAdmin, setIsAdmin] = useState(false)
  const [users, setUsers] = useState([])
  const [userSearch, setUserSearch] = useState('')
  const [moderationDrafts, setModerationDrafts] = useState({})
  const [moderationError, setModerationError] = useState('')
  const [moderationMessage, setModerationMessage] = useState('')
  const [activityUsers, setActivityUsers] = useState([])
  const [activityError, setActivityError] = useState('')
  const [activityLoading, setActivityLoading] = useState(false)
  const [meritResult, setMeritResult] = useState(null)
  const currentUserId = user?.id

  useEffect(() => {
    const unsubscribe = subscribeAuth((nextUser) => {
      setUser(nextUser)
      setEmailDraft(nextUser?.email || '')
      setEmailCode('')
      setEmailCodeSent(false)
      setIsEditingRecoveryEmail(!nextUser?.emailVerified)
      setIsAdmin(false)
      setUsers([])
      setActivityUsers([])
      setActivityError('')
    })
    if (getToken()) {
      refreshCurrentUser().catch((error) => {
        setEmailError(error.message || 'Không thể tải thông tin email')
      })
    }
    return unsubscribe
  }, [])

  function loadAdminActivity() {
    setActivityLoading(true)
    setActivityError('')
    fetch('/api/admin/activity', {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok || !data.ok || !Array.isArray(data.users)) {
          throw new Error(data.error || 'Không thể tải thời gian hoạt động')
        }
        setActivityUsers(data.users)
      })
      .catch((error) => {
        setActivityError(error.message || 'Không thể tải thời gian hoạt động')
      })
      .finally(() => setActivityLoading(false))
  }

  function loadAdminUsers(activeUser = user) {
    if (!activeUser) {
      return
    }

    fetch('/api/admin/users', {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(async (res) => {
        const data = await res.json()
        if (res.status === 401 || res.status === 403) {
          setIsAdmin(false)
          setUsers([])
          setActivityUsers([])
          return
        }
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Không thể tải danh sách tài khoản')
        }
        setIsAdmin(true)
        setUsers(data.users || [])
        loadAdminActivity()
      })
      .catch((error) => {
        setIsAdmin(false)
        setModerationError(error.message || 'Không thể tải danh sách tài khoản')
      })
  }

  useEffect(() => {
    if (user) loadAdminUsers(user)
  }, [user])

  useEffect(() => {
    if (!currentUserId) return
    let active = true
    fetch('/api/dana/summary', {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok || !data.ok || !data.summary) {
          throw new Error(data.error || 'Không thể tải cấp bậc công đức')
        }
        if (active) setMeritResult({ userId: currentUserId, summary: data.summary })
      })
      .catch((error) => {
        if (active) {
          setMeritResult({
            userId: currentUserId,
            error: error.message || 'Không thể tải cấp bậc công đức',
          })
        }
      })

    return () => { active = false }
  }, [currentUserId])

  function updateModerationDraft(userId, field, value) {
    setModerationDrafts((previous) => ({
      ...previous,
      [userId]: {
        status: '',
        duration: '60',
        reason: '',
        ...previous[userId],
        [field]: value,
      },
    }))
  }

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
        setIsEditingRecoveryEmail(false)
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

  async function applyModeration(target) {
    const draft = moderationDrafts[target.id]
    if (!draft?.status) return
    if (
      draft.status === 'banned' &&
      !window.confirm(`Ban vĩnh viễn tài khoản "${target.username}"?`)
    ) {
      return
    }

    setModerationError('')
    setModerationMessage('')
    try {
      const response = await fetch(`/api/admin/users/${target.id}/moderation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          status: draft.status,
          duration: draft.duration,
          reason: draft.reason,
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Không thể cập nhật tài khoản')
      }

      setUsers((previous) => previous.map((account) => (
        account.id === target.id ? data.user : account
      )))
      setModerationDrafts((previous) => ({
        ...previous,
        [target.id]: { status: '', duration: '60', reason: '' },
      }))
      setModerationMessage(`Đã cập nhật tài khoản ${target.username}.`)
    } catch (error) {
      setModerationError(error.message || 'Không thể cập nhật tài khoản')
    }
  }

  function handleLogout() {
    logout()
    ringSmallBell()
  }

  function openAuth(tab = 'login') {
    setModalTab(tab)
    setIsModalOpen(true)
  }

  const normalizedSearch = normalizeSearchValue(userSearch.trim())
  const filteredUsers = users.filter((account) => (
    [account.username, account.dharmaName, account.accountStatus, account.statusReason]
      .some((value) => normalizeSearchValue(value).includes(normalizedSearch))
  ))
  const visibleMeritResult = meritResult?.userId === currentUserId ? meritResult : null

  return (
    <div className="page">
      <section className="section" style={{ maxWidth: '820px' }}>
        <h2>Tài khoản</h2>
        <p className="lead muted">
          Đăng nhập để xem hồ sơ và quản lý thông tin tài khoản của bạn.
        </p>

        {user ? (
          <div className="account-profile-card">
            <div className="profile-header-flex">
              <div className="profile-avatar-large">🪷</div>
              <div className="profile-info">
                <h3>{user.dharmaName || 'Phật tử'}</h3>
                <p className="profile-username">
                  Tên đăng nhập: <strong>{user.username}</strong>
                </p>
                <p className="profile-since">
                  Ngày tham gia: <em>{user.createdAt || 'Đạo hữu lâu năm'}</em>
                </p>
                <span className="profile-badge">Cư sĩ tại gia · Phật tử chùa Từ Quang</span>
                <div className="account-merit-rank" aria-live="polite">
                  {visibleMeritResult?.error ? (
                    <p className="form-feedback error" role="alert">{visibleMeritResult.error}</p>
                  ) : visibleMeritResult?.summary ? (
                    <>
                      <strong>Cấp ghi nhận phát tâm: {visibleMeritResult.summary.rank}</strong>
                      <span>
                        Tổng công đức tự khai:{' '}
                        {visibleMeritResult.summary.total.toLocaleString('vi-VN')} đ
                      </span>
                      {visibleMeritResult.summary.nextRank && (
                        <span>
                          Còn {(visibleMeritResult.summary.nextThreshold
                            - visibleMeritResult.summary.total).toLocaleString('vi-VN')} đ để đạt{' '}
                          {visibleMeritResult.summary.nextRank}
                        </span>
                      )}
                    </>
                  ) : (
                    <span>Đang tải cấp bậc công đức...</span>
                  )}
                </div>
                {user.accountStatus === 'restricted' && (
                  <p className="moderation-notice" role="status">
                    Tài khoản đang bị hạn chế
                    {user.restrictionUntil
                      ? ` đến ${new Date(user.restrictionUntil).toLocaleString('vi-VN')}`
                      : ' đến khi quản trị viên gỡ'}
                    . {user.statusReason && `Lý do: ${user.statusReason}`}
                  </p>
                )}
              </div>
            </div>

            <section className="account-recovery-email" aria-labelledby="recovery-email-title">
              <div>
                <h3 id="recovery-email-title">Email khôi phục mật khẩu</h3>
                <p className="muted">
                  Dùng email đã xác minh để nhận mã đặt lại mật khẩu.
                </p>
              </div>
              {user.emailVerified && !isEditingRecoveryEmail ? (
                <div className="account-email-verified">
                  <p>
                    {user.email} <span className="account-status-badge active">Đã xác minh</span>
                  </p>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => {
                      setIsEditingRecoveryEmail(true)
                      setEmailMessage('')
                      setEmailError('')
                    }}
                  >
                    Đổi email
                  </button>
                </div>
              ) : (
                <form className="account-email-form" onSubmit={handleEmailUpdate}>
                  <label>
                    Địa chỉ email
                    <input
                      type="email"
                      autoComplete="email"
                      required
                      value={emailDraft}
                      disabled={emailLoading || emailCodeSent}
                      onChange={(event) => setEmailDraft(event.target.value)}
                      placeholder="ten@gmail.com"
                    />
                  </label>
                  {emailCodeSent && (
                    <label>
                      Mã xác minh trong email
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
                    </label>
                  )}
                  {emailError && <p className="admin-feedback error">{emailError}</p>}
                  {emailMessage && <p className="admin-feedback success">{emailMessage}</p>}
                  <div className="account-email-actions">
                    <button className="btn btn-gold" type="submit" disabled={emailLoading}>
                      {emailLoading
                        ? 'Đang xử lý...'
                        : emailCodeSent
                          ? 'Xác minh email'
                          : 'Gửi mã xác minh'}
                    </button>
                    {emailCodeSent && (
                      <button
                        className="btn btn-ghost"
                        type="button"
                        disabled={emailLoading}
                        onClick={() => {
                          setEmailCodeSent(false)
                          setEmailCode('')
                          setEmailMessage('')
                        }}
                      >
                        Đổi email
                      </button>
                    )}
                  </div>
                </form>
              )}
              {user.emailVerified && !isEditingRecoveryEmail && (
                <>
                  {emailError && <p className="admin-feedback error">{emailError}</p>}
                  {emailMessage && <p className="admin-feedback success">{emailMessage}</p>}
                </>
              )}
            </section>

            <div className="profile-actions-bar">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleLogout}
                style={{ color: '#7c1e1e', borderColor: '#7c1e1e' }}
              >
                Đăng xuất tài khoản
              </button>
            </div>
          </div>
        ) : (
          <div className="account-guest-card">
            <div className="guest-icon">📿</div>
            <h3>Quý đạo hữu chưa đăng nhập</h3>
            <p className="muted" style={{ maxWidth: '480px', margin: '0.6rem auto 1.6rem' }}>
              Đăng ký để dùng pháp danh tại đạo tràng online, ghi sớ cầu an và phát tâm công đức
              bằng tài khoản của bạn.
            </p>
            <div className="actions" style={{ justifyContent: 'center' }}>
              <button
                type="button"
                className="btn btn-gold"
                onClick={() => openAuth('login')}
              >
                Đăng nhập
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => openAuth('register')}
                style={{ color: '#3b1c14', borderColor: '#c9a227' }}
              >
                Tạo tài khoản mới
              </button>
            </div>
          </div>
        )}

        {isAdmin && (
          <section className="admin-account-panel" aria-labelledby="admin-account-title">
            <header className="admin-account-header">
              <div>
                <h2 id="admin-account-title">Quản lý tài khoản thành viên</h2>
                <p className="muted">Hạn chế tương tác, ban vĩnh viễn hoặc khôi phục tài khoản vi phạm.</p>
              </div>
              <button className="btn btn-ghost" type="button" onClick={() => loadAdminUsers(user)}>
                Làm mới danh sách
              </button>
            </header>

            {moderationError && <p className="admin-feedback error">{moderationError}</p>}
            {moderationMessage && <p className="admin-feedback success">{moderationMessage}</p>}
            <section className="admin-activity-panel" aria-labelledby="admin-activity-title">
              <header>
                <div>
                  <h3 id="admin-activity-title">Thời gian thiền online</h3>
                  <p className="muted">
                    Chỉ quản trị viên xem được. Hệ thống chỉ tính khi trang Ngồi thiền đang hiển thị
                    trên trình duyệt và tài khoản đã đăng nhập.
                  </p>
                </div>
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={activityLoading}
                  onClick={loadAdminActivity}
                >
                  {activityLoading ? 'Đang tải...' : 'Làm mới hoạt động'}
                </button>
              </header>
              {activityError && <p className="admin-feedback error" role="alert">{activityError}</p>}
              {!activityError && activityUsers.length === 0 ? (
                <p className="muted">Chưa có thời gian hoạt động được ghi nhận.</p>
              ) : (
                <div className="admin-activity-list">
                  {activityUsers.map((activity) => (
                    <article key={activity.id}>
                      <strong>{activity.dharmaName || 'Phật tử'}</strong>
                      <span>Tài khoản: {activity.username}</span>
                      <span>Cấp độ: {activity.level}</span>
                      <span>Thời gian: {formatActivityDuration(activity.totalSeconds)}</span>
                    </article>
                  ))}
                </div>
              )}
            </section>
            {users.length === 0 ? (
              <p className="muted">Chưa có tài khoản thành viên nào để quản lý.</p>
            ) : (
              <>
                <div className="admin-account-search">
                  <label htmlFor="admin-user-search">Tìm tài khoản</label>
                  <input
                    id="admin-user-search"
                    type="search"
                    value={userSearch}
                    onChange={(event) => setUserSearch(event.target.value)}
                    placeholder="Nhập tên đăng nhập, pháp danh hoặc trạng thái"
                  />
                  <p className="muted" aria-live="polite">
                    Đang hiển thị {filteredUsers.length} / {users.length} tài khoản
                  </p>
                </div>
                {filteredUsers.length === 0 ? (
                  <p className="muted">Không tìm thấy tài khoản phù hợp.</p>
                ) : (
                  <div className="admin-user-list">
                    {filteredUsers.map((account) => {
                  const draft = moderationDrafts[account.id] || {
                    status: '',
                    duration: '60',
                    reason: '',
                  }
                  const statusLabel = account.accountStatus === 'banned'
                    ? 'Ban vĩnh viễn'
                    : account.accountStatus === 'restricted'
                      ? account.restrictionUntil
                        ? `Hạn chế đến ${new Date(account.restrictionUntil).toLocaleString('vi-VN')}`
                        : 'Hạn chế đến khi gỡ'
                      : 'Đang hoạt động'

                  return (
                    <article className="admin-user-card" key={account.id}>
                      <div className="admin-user-summary">
                        <div>
                          <h3>{account.dharmaName || 'Phật tử'}</h3>
                          <p>
                            Tên đăng nhập: <strong>{account.username}</strong> · Tham gia:{' '}
                            {account.createdAt || 'Không rõ'}
                          </p>
                          <span className={`account-status-badge ${account.accountStatus}`}>
                            {statusLabel}
                          </span>
                          {account.statusReason && (
                            <p className="admin-user-reason">Lý do: {account.statusReason}</p>
                          )}
                        </div>
                      </div>

                      <div className="admin-user-controls">
                        <label>
                          Thao tác
                          <select
                            value={draft.status}
                            onChange={(event) => updateModerationDraft(account.id, 'status', event.target.value)}
                          >
                            <option value="">Chọn thao tác</option>
                            <option value="restricted">Hạn chế</option>
                            <option value="banned">Ban vĩnh viễn</option>
                            <option value="active">Khôi phục tài khoản</option>
                          </select>
                        </label>

                        {draft.status === 'restricted' && (
                          <label>
                            Thời hạn
                            <select
                              value={draft.duration}
                              onChange={(event) => updateModerationDraft(account.id, 'duration', event.target.value)}
                            >
                              <option value="60">1 giờ</option>
                              <option value="1440">24 giờ</option>
                              <option value="10080">7 ngày</option>
                              <option value="43200">30 ngày</option>
                              <option value="indefinite">Đến khi admin gỡ</option>
                            </select>
                          </label>
                        )}

                        {draft.status && draft.status !== 'active' && (
                          <label>
                            Lý do (không bắt buộc)
                            <input
                              value={draft.reason}
                              maxLength={500}
                              onChange={(event) => updateModerationDraft(account.id, 'reason', event.target.value)}
                              placeholder="Ghi chú nội bộ cho quản trị viên"
                            />
                          </label>
                        )}

                        <button
                          className="btn btn-gold"
                          type="button"
                          disabled={!draft.status}
                          onClick={() => applyModeration(account)}
                        >
                          Áp dụng
                        </button>
                      </div>
                    </article>
                  )
                    })}
                  </div>
                )}
              </>
            )}
          </section>
        )}
      </section>

      <AuthModal
        key={`${modalTab}-${isModalOpen}`}
        isOpen={isModalOpen}
        defaultTab={modalTab}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  )
}
