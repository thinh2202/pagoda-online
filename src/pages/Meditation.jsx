import { useCallback, useEffect, useRef, useState } from 'react'
import { assertCanInteract, getCurrentUser, getToken, subscribeAuth } from '../auth.js'
import {
  playLotusOfferingSound,
  playWoodenFish,
  ringBell,
  ringSmallBell,
  startAmbientStream,
  stopAmbient,
} from '../bell.js'

// Tổng số bồ đoàn trong đạo tràng
const TOTAL_SEATS = 16

function getVisitorId() {
  const key = 'tu-quang-meditation-visitor'
  try {
    const saved = localStorage.getItem(key)
    if (saved) return saved
    const visitorId = globalThis.crypto?.randomUUID?.()
      || `${Date.now()}-${Math.random().toString(36).slice(2)}`
    localStorage.setItem(key, visitorId)
    return visitorId
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}

function formatActivityDuration(totalSeconds) {
  const totalMinutes = Math.ceil(totalSeconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours ? `${hours} giờ ${minutes} phút` : `${minutes} phút`
}

export default function Meditation() {
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser())
  const activityUserId = currentUser?.id
  const [moderationNotice, setModerationNotice] = useState('')
  const [activityResult, setActivityResult] = useState(null)
  const [activityNotice, setActivityNotice] = useState(null)
  const [userName, setUserName] = useState(() => {
    const u = getCurrentUser()
    return u?.dharmaName || u?.username || localStorage.getItem('tu-quang-username') || 'Phật tử'
  })
  const isRestricted = currentUser?.accountStatus === 'restricted'

  useEffect(() => {
    return subscribeAuth((u) => {
      setCurrentUser(u)
      if (u) {
        setUserName(localStorage.getItem('tu-quang-username') || u.dharmaName || u.username)
      }
    })
  }, [])

  async function canInteract() {
    try {
      await assertCanInteract()
      setModerationNotice('')
      return true
    } catch (error) {
      setModerationNotice(error.message || 'Tài khoản hiện không thể tương tác')
      return false
    }
  }

  // Bồ đoàn trống cho đến khi có người thật tương tác.
  const [seats, setSeats] = useState(() => Array(TOTAL_SEATS).fill(null))
  const [visitorId] = useState(getVisitorId)

  // Thống kê tương tác
  const [meritCount, setMeritCount] = useState(0)
  const [incenseCount, setIncenseCount] = useState(0)
  const [bowCount, setBowCount] = useState(0)
  const [lotusCount, setLotusCount] = useState(0)

  // Stream bình luận / niệm Phật
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [streamError, setStreamError] = useState('')
  const [isSendingComment, setIsSendingComment] = useState(false)

  // Hiệu ứng bay bổng
  const [floatings, setFloatings] = useState([])
  const [isAudioPlaying, setIsAudioPlaying] = useState(false)

  const chatContainerRef = useRef(null)
  const activityNoticeTimerRef = useRef(null)

  useEffect(() => {
    if (!activityUserId) return
    const token = getToken()
    if (!token) return
    let active = true
    let pending = false

    async function sendHeartbeat(allowHidden = false, keepalive = false) {
      if (pending || (!allowHidden && document.visibilityState !== 'visible')) return
      pending = true
      try {
        const response = await fetch('/api/activity/heartbeat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: '{}',
          keepalive,
        })
        const data = await response.json()
        if (!response.ok || !data.ok || !data.summary) {
          throw new Error(data.error || 'Không thể ghi nhận thời gian thiền')
        }
        if (active) {
          setActivityResult({ userId: activityUserId, summary: data.summary })
          if (data.levelUps.length > 0) {
            const text = `Chúc mừng! Bạn vừa đạt cấp ${data.levelUps.join(', ')} khi tham gia thiền online.`
            setActivityNotice({ userId: activityUserId, text })
            if (activityNoticeTimerRef.current) clearTimeout(activityNoticeTimerRef.current)
            activityNoticeTimerRef.current = setTimeout(() => {
              setActivityNotice((previous) => (
                previous?.userId === activityUserId && previous.text === text ? null : previous
              ))
            }, 12_000)
          }
        }
      } catch (error) {
        if (active) {
          setActivityResult({
            userId: activityUserId,
            error: error.message || 'Không thể ghi nhận thời gian thiền',
          })
        }
      } finally {
        pending = false
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') sendHeartbeat()
      else sendHeartbeat(true)
    }
    function handlePageHide() {
      sendHeartbeat(true, true)
    }

    sendHeartbeat()
    const interval = setInterval(() => sendHeartbeat(), 20_000)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', handlePageHide)

    return () => {
      if (document.visibilityState === 'visible') sendHeartbeat(true, true)
      active = false
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [activityUserId])

  useEffect(() => () => {
    if (activityNoticeTimerRef.current) clearTimeout(activityNoticeTimerRef.current)
  }, [])

  const applyStream = useCallback((stream) => {
    const now = Date.now()
    setMessages(stream.comments.slice().reverse().map((comment) => ({
      id: comment.id,
      user: comment.author,
      text: comment.text,
      avatar: '🪷',
      isUser: comment.isCurrentUser,
    })))

    const nextSeats = Array(TOTAL_SEATS).fill(null)
    stream.participants.slice(0, TOTAL_SEATS).forEach((participant, index) => {
      const age = now - participant.lastCommentAt
      nextSeats[index] = {
        user: participant.author,
        avatar: '🪷',
        bubble: participant.lastComment,
        showBubble: age <= 4_500,
        isUser: participant.isCurrentUser,
        isBowing: age <= 2_000,
        lastActive: participant.lastCommentAt,
      }
    })
    setSeats(nextSeats)
  }, [])

  useEffect(() => {
    let active = true
    async function refreshStream() {
      try {
        const token = getToken()
        const headers = token ? { Authorization: `Bearer ${token}` } : {}
        const response = await fetch(
          `/api/meditation/stream?visitorId=${encodeURIComponent(visitorId)}`,
          { headers }
        )
        const data = await response.json()
        if (!response.ok || !data.ok) {
          throw new Error(data.error || 'Không thể tải đạo tràng trực tuyến')
        }
        if (active) {
          applyStream(data)
          setStreamError('')
        }
      } catch (error) {
        if (active) setStreamError(error.message || 'Không thể tải đạo tràng trực tuyến')
      }
    }

    refreshStream()
    const interval = setInterval(refreshStream, 3_000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [applyStream, visitorId, currentUser?.id])

  // Tự động cuộn chat xuống dưới
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [messages])

  // Dọn dẹp âm thanh khi rời trang
  useEffect(() => {
    return () => {
      stopAmbient()
    }
  }, [])

  // Thêm hiệu ứng bay trên màn hình
  const triggerFloating = useCallback((emoji, text) => {
    const id = Date.now() + Math.random()
    const leftPos = 20 + Math.random() * 60
    setFloatings((prev) => [...prev, { id, emoji, text, left: `${leftPos}%` }])
    setTimeout(() => {
      setFloatings((prev) => prev.filter((item) => item.id !== id))
    }, 2800)
  }, [])

  const handleCommentAndSeat = useCallback(async (author, text) => {
    try {
      const token = getToken()
      const headers = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`
      const response = await fetch('/api/meditation/comments', {
        method: 'POST',
        headers,
        body: JSON.stringify({ visitorId, name: author, text }),
      })
      const data = await response.json()
      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Không thể gửi bình luận')
      }
      applyStream(data)
      setStreamError('')
      return true
    } catch (error) {
      setStreamError(error.message || 'Không thể gửi bình luận')
      return false
    }
  }, [applyStream, visitorId])

  // Người dùng gửi bình luận từ ô nhập
  async function submitComment(e) {
    if (e) e.preventDefault()
    const userText = inputText.trim()
    if (!userText || isSendingComment) return
    if (!(await canInteract())) return

    setIsSendingComment(true)
    const sent = await handleCommentAndSeat(userName, userText)
    setIsSendingComment(false)
    if (!sent) return

    setInputText('')
    setMeritCount((prev) => prev + 2)
    ringSmallBell()
    triggerFloating('🪷', userText)
  }

  // Người dùng bấm phím niệm nhanh
  async function quickChant(text) {
    if (!(await canInteract())) return
    setMeritCount((prev) => prev + 2)
    ringSmallBell()
    triggerFloating('✨', text)
    await handleCommentAndSeat(userName, text)
  }

  // Hành động: Dâng hương
  async function offerIncense() {
    if (!(await canInteract())) return
    setIncenseCount((prev) => prev + 1)
    setMeritCount((prev) => prev + 3)
    ringSmallBell()
    triggerFloating('🕯️', 'Thành tâm Dâng Hương')
    await handleCommentAndSeat(userName, 'đã thành tâm Dâng Hương 🙏🕯️')
  }

  // Hành động: Lễ Phật (Lạy)
  async function bowToBuddha() {
    if (!(await canInteract())) return
    setBowCount((prev) => prev + 1)
    setMeritCount((prev) => prev + 3)
    ringSmallBell()
    triggerFloating('🙏', 'Chí tâm đảnh lễ')
    await handleCommentAndSeat(userName, 'chí tâm Đảnh Lễ Phật Tam Bái 🙏')
  }

  // Hành động: Dâng hoa sen
  async function offerLotus() {
    if (!(await canInteract())) return
    setLotusCount((prev) => prev + 1)
    setMeritCount((prev) => prev + 5)
    playLotusOfferingSound()
    triggerFloating('🪷', 'Cúng dường đóa sen hồng')
    await handleCommentAndSeat(userName, 'đã cúng dường đóa Hoa Sen thanh khiết 🪷')
  }

  // Gõ mõ
  async function hitFish() {
    if (!(await canInteract())) return
    playWoodenFish()
    setMeritCount((prev) => prev + 1)
    // Nếu user đang ngồi, cho nhân vật gõ mõ nhẹ
    setSeats((prev) =>
      prev.map((s) => (s && s.isUser ? { ...s, lastActive: Date.now() } : s))
    )
  }

  // Thỉnh chuông
  async function hitBell() {
    if (!(await canInteract())) return
    ringBell(4.2)
    setMeritCount((prev) => prev + 3)
    triggerFloating('🔔', 'Chuông ngân Bát Nhã')
  }

  // Bật/tắt suối reo
  function toggleAmbient() {
    if (isAudioPlaying) {
      stopAmbient()
      setIsAudioPlaying(false)
    } else {
      startAmbientStream()
      setIsAudioPlaying(true)
    }
  }

  // Đổi tên
  async function changeName() {
    if (!(await canInteract())) return
    const input = prompt('Nhập Pháp danh / Tên của bạn:', userName)
    if (input && input.trim()) {
      setUserName(input.trim())
      try {
        localStorage.setItem('tu-quang-username', input.trim())
      } catch {}
    }
  }

  // Kiểm tra xem người dùng hiện tại đã có chỗ ngồi trên bồ đoàn chưa
  const userSeated = seats.some((s) => s && s.isUser)
  const seatedCount = seats.filter(Boolean).length
  const visibleActivityResult = activityResult?.userId === activityUserId ? activityResult : null
  const visibleActivityNotice = activityNotice?.userId === activityUserId ? activityNotice : null

  return (
    <div className="temple-stream-page">
      {/* Hiệu ứng bay bổng toàn màn hình */}
      {floatings.map((item) => (
        <div key={item.id} className="floating-merit-item" style={{ left: item.left }}>
          <span className="float-emoji">{item.emoji}</span>
          <span className="float-text">{item.text}</span>
        </div>
      ))}

      {/* KHUNG ĐẠO TRÀNG CHÍNH ĐIỆN (PHONG CÁCH LIVESTREAM) */}
      <div className="temple-live-container">
        {/* THANH TRẠNG THÁI TRÊN CÙNG */}
        <header className="temple-top-bar">
          <div className="temple-identity">
            <div className="temple-avatar-glow">🪷</div>
            <div className="temple-meta">
              <span className="temple-title">Đi Chùa Online</span>
              <span className="temple-merit">❤️ {meritCount.toLocaleString('vi-VN')} Lượt niệm</span>
            </div>
            {userSeated ? (
              <span className="joined-badge">★ Bạn đang an tọa</span>
            ) : (
              <span className="comment-to-join-hint">Bình luận để lên ngồi</span>
            )}
          </div>

          <div className="temple-top-right">
            <span className="online-pill">
              👥 <strong>{seatedCount}</strong> đang an tọa
            </span>
            <button
              type="button"
              className="btn-icon-top"
              title="Đổi tên / Pháp danh"
              onClick={changeName}
            >
              🏷️ {userName}
            </button>
            <button
              type="button"
              className={`btn-icon-top ${isAudioPlaying ? 'active' : ''}`}
              title={isAudioPlaying ? 'Tắt suối reo' : 'Bật suối reo tịnh tâm'}
              onClick={toggleAmbient}
            >
              {isAudioPlaying ? '🌊 Suối: Bật' : '🔇 Suối: Tắt'}
            </button>
          </div>
        </header>

        {(moderationNotice || isRestricted) && (
          <p className="moderation-notice" role="status">
            {moderationNotice || 'Tài khoản đang bị hạn chế tương tác.'}
          </p>
        )}
        {streamError && (
          <p className="moderation-notice" role="alert">
            {streamError}
          </p>
        )}
        {currentUser ? (
          <div className="meditation-activity-card" aria-live="polite">
            {visibleActivityResult?.error ? (
              <span className="form-feedback error" role="alert">{visibleActivityResult.error}</span>
            ) : visibleActivityResult?.summary ? (
              <>
                <strong>Cấp độ tinh tấn online: {visibleActivityResult.summary.level}</strong>
                <span>
                  Thời gian tham gia: {formatActivityDuration(visibleActivityResult.summary.totalSeconds)}
                </span>
                {visibleActivityResult.summary.nextLevel && (
                  <span>
                    Còn {formatActivityDuration(
                      visibleActivityResult.summary.nextThresholdSeconds
                      - visibleActivityResult.summary.totalSeconds
                    )} để đạt cấp {visibleActivityResult.summary.nextLevel}
                  </span>
                )}
              </>
            ) : (
              <span>Đang ghi nhận thời gian thiền của tài khoản...</span>
            )}
            {visibleActivityNotice && (
              <span className="meditation-level-notice" role="status">
                {visibleActivityNotice.text}
              </span>
            )}
            <small>
              Chỉ tính thời gian trang thiền đang hiển thị và tài khoản đã đăng nhập; đây không phải
              đánh giá mức độ tu hành.
            </small>
            <small>Mốc cấp: Tập sự 1 giờ · Tinh tấn 10 giờ · An trú 50 giờ.</small>
          </div>
        ) : (
          <p className="meditation-activity-card">
            Đăng nhập để ghi nhận thời gian tham gia thiền và nhận thông báo khi lên cấp.
          </p>
        )}

        {/* PHẦN CHÍNH ĐIỆN: PHẬT TỔ VÀ BÀN THỜ KIM THÂN */}
        <div className="altar-sanctuary">
          {/* Bảng hoành phi bên trái */}
          <div className="altar-scroll-left">
            <h4>Cùng tham gia</h4>
            <ul>
              <li>• Trì tâm niệm Phật</li>
              <li>• Bình luận để lên ngồi</li>
              <li>• Dâng hương cầu an</li>
              <li>• Hồi hướng muôn loài</li>
            </ul>
          </div>

          {/* TƯỢNG PHẬT THÍCH CA / A DI ĐÀ MẠ VÀNG TỌA THIỀN */}
          <div className="buddha-throne-wrapper">
            <div className="buddha-halo" />

            {/* Hình tượng Phật vàng uy nghi */}
            <svg
              className="buddha-figure-svg"
              viewBox="0 0 200 240"
              aria-label="Kim thân Phật Tổ"
            >
              <defs>
                <radialGradient id="goldGlow" cx="50%" cy="40%" r="60%">
                  <stop offset="0%" stopColor="#fff3b0" />
                  <stop offset="45%" stopColor="#eec744" />
                  <stop offset="85%" stopColor="#c59218" />
                  <stop offset="100%" stopColor="#875806" />
                </radialGradient>
                <filter id="auraFilter">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {/* Tòa sen nhiều lớp */}
              <g className="lotus-throne">
                <path
                  d="M40 215 C60 195 140 195 160 215 C175 230 25 230 40 215 Z"
                  fill="#c59218"
                />
                <path
                  d="M50 205 C70 185 130 185 150 205 C165 220 35 220 50 205 Z"
                  fill="#eec744"
                />
                <ellipse cx="100" cy="208" rx="22" ry="12" fill="#ffd966" />
                <ellipse cx="76" cy="210" rx="18" ry="10" fill="#eec744" />
                <ellipse cx="124" cy="210" rx="18" ry="10" fill="#eec744" />
                <ellipse cx="54" cy="214" rx="16" ry="8" fill="#d49b1a" />
                <ellipse cx="146" cy="214" rx="16" ry="8" fill="#d49b1a" />
              </g>

              {/* Thân Phật tọa kiết già */}
              <g fill="url(#goldGlow)" filter="url(#auraFilter)">
                <path d="M48 185 C42 165 65 155 100 155 C135 155 158 165 152 185 C145 200 55 200 48 185 Z" />
                <path d="M68 115 C65 150 75 165 100 165 C125 165 135 150 132 115 C130 85 70 85 68 115 Z" />
                <path d="M58 125 C52 155 80 180 100 180 C120 180 148 155 142 125 C132 128 128 140 100 150 C72 140 68 128 58 125 Z" />
                <circle cx="100" cy="65" r="24" />
                <circle cx="100" cy="38" r="9" />
                <circle cx="100" cy="26" r="3.5" fill="#fff5cc" />
                <ellipse cx="73" cy="68" rx="3.5" ry="10" />
                <ellipse cx="127" cy="68" rx="3.5" ry="10" />
                <circle cx="100" cy="58" r="2" fill="#ffffff" />
              </g>
            </svg>

            {/* Bàn thờ, lư hương & khói trầm */}
            <div className="altar-table">
              <div className="censer-wrapper">
                <div className="incense-smoke">
                  <span className="smoke-particle p1" />
                  <span className="smoke-particle p2" />
                  <span className="smoke-particle p3" />
                </div>
                <div className="censer-pot">
                  <div className="incense-glow-tips">
                    <span className="incense-dot" />
                    <span className="incense-dot" />
                    <span className="incense-dot" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* VỊ TRÍ BỒ ĐOÀN ĐẶC BIỆT THƯỢNG TỌA (HÀNG ĐẦU NGAY TRƯỚC BÀN THỜ) */}
          <div className="leader-seat-platform">
            {seats[0] ? (
              <div
                className={`meditator-figure leader ${seats[0].isUser ? 'user-figure-active' : ''} ${
                  seats[0].isBowing ? 'bowing-anim' : ''
                }`}
              >
                {/* Bong bóng lời niệm trên đầu */}
                {seats[0].bubble && seats[0].showBubble && (
                  <div className="bubble-head-popup">
                    <span>{seats[0].bubble}</span>
                  </div>
                )}
                <div className="figure-head" />
                <div className="figure-body" />
                <span className={`seat-nametag ${seats[0].isUser ? 'gold-nametag' : ''}`}>
                  {seats[0].isUser ? `★ ${userName} (Bạn)` : seats[0].user}
                </span>
              </div>
            ) : (
              <div
                className="empty-leader-cushion"
                onClick={() => quickChant('Nam mô A Di Đà Phật')}
                title="Bồ đoàn thượng tọa đang trống. Bình luận để lên ngồi!"
              >
                <div className="cushion-pillow leader-pillow" />
                <span className="empty-seat-hint">Bình luận để ngồi</span>
              </div>
            )}
          </div>
        </div>

        {/* HÀNG BỒ ĐOÀN ĐẠO TRÀNG (CHỈ AI CMT MỚI LÊN NGỒI) */}
        <div className="congregation-hall">
          <div className="carpet-aisle" />

          {/* Lưới các bồ đoàn (Index 1 đến 15) */}
          <div className="meditators-grid">
            {seats.slice(1).map((seat, idx) => {
              const seatRealIndex = idx + 1

              if (seat) {
                // ĐÃ CÓ NGƯỜI CMT VÀ ĐANG NGỒI
                return (
                  <div
                    key={`seat-${seatRealIndex}-${seat.user}`}
                    className={`meditator-seat ${seat.isUser ? 'user-active-seat' : ''} ${
                      seat.isBowing ? 'bowing-anim' : ''
                    }`}
                  >
                    {/* Bong bóng lời niệm trên đầu */}
                    {seat.bubble && seat.showBubble && (
                      <div className="bubble-head-popup">
                        <span>{seat.bubble}</span>
                      </div>
                    )}
                    <div className="cushion-pillow">
                      <div className="meditator-avatar-spirit">
                        <div className="figure-head" />
                        <div className="figure-body" />
                      </div>
                    </div>
                    <span className={`seat-nametag ${seat.isUser ? 'gold-nametag' : ''}`}>
                      {seat.isUser ? `★ ${userName} (Bạn)` : seat.user}
                    </span>
                  </div>
                )
              }

              // BỒ ĐOÀN TRỐNG (ĐANG CHỜ NGƯỜI BÌNH LUẬN)
              return (
                <div
                  key={`empty-seat-${seatRealIndex}`}
                  className="meditator-seat empty-seat"
                  onClick={() => quickChant('Nam mô A Di Đà Phật')}
                  title="Bồ đoàn trống. Bình luận để lên ngồi!"
                >
                  <div className="cushion-pillow empty-pillow">
                    <span className="empty-plus-icon">+</span>
                  </div>
                  <span className="seat-nametag empty-nametag">Trống</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* CỘT NÚT TƯƠNG TÁC DÂNG LỄ BÊN PHẢI */}
        <aside className="stream-action-panel">
          <button
            type="button"
            className="stream-action-btn"
            onClick={offerIncense}
            title="Dâng nén hương trầm"
          >
            <div className="action-badge-icon">🕯️</div>
            <span className="action-badge-count">{incenseCount}</span>
            <span className="action-badge-label">Dâng Hương</span>
          </button>

          <button
            type="button"
            className="stream-action-btn"
            onClick={bowToBuddha}
            title="Lễ Phật đảnh lễ"
          >
            <div className="action-badge-icon">🙏</div>
            <span className="action-badge-count">{bowCount}</span>
            <span className="action-badge-label">Lễ Phật</span>
          </button>

          <button
            type="button"
            className="stream-action-btn"
            onClick={offerLotus}
            title="Dâng đóa hoa sen"
          >
            <div className="action-badge-icon">🪷</div>
            <span className="action-badge-count">{lotusCount}</span>
            <span className="action-badge-label">Hoa Sen</span>
          </button>

          <button
            type="button"
            className="stream-action-btn"
            onClick={hitFish}
            title="Gõ một tiếng mõ"
          >
            <div className="action-badge-icon">🪵</div>
            <span className="action-badge-label">Gõ Mõ</span>
          </button>

          <button
            type="button"
            className="stream-action-btn"
            onClick={hitBell}
            title="Thỉnh chuông chùa"
          >
            <div className="action-badge-icon">🔔</div>
            <span className="action-badge-label">Thỉnh Chuông</span>
          </button>
        </aside>

        {/* DÒNG BÌNH LUẬN / NIỆM PHẬT TRỰC TUYẾN (CHAT STREAM BÊN DƯỚI GÓC TRÁI) */}
        <div className="live-chat-overlay" ref={chatContainerRef}>
          {messages.map((m) => (
            <div key={m.id} className={`chat-bubble-stream ${m.isUser ? 'chat-bubble-user' : ''}`}>
              <span className="chat-avatar">{m.avatar}</span>
              <div className="chat-content">
                <span className="chat-username">{m.user}:</span>
                <span className="chat-message-text">{m.text}</span>
              </div>
            </div>
          ))}
        </div>

        {/* CÁC PHÍM TẮT NIỆM PHẬT NHANH (BẤM VÀO LÀ LÊN NGỒI NGAY) */}
        <div className="quick-chants-bar">
          <button type="button" onClick={() => quickChant('Nam mô A Di Đà Phật')}>
            🙏 Nam mô A Di Đà Phật
          </button>
          <button type="button" onClick={() => quickChant('Cầu gia đạo bình an, tai qua nạn khỏi')}>
            🌸 Cầu gia đạo bình an
          </button>
          <button type="button" onClick={() => quickChant('Nam mô Đại Bi Quán Thế Âm Bồ Tát')}>
            📿 Nam mô Quan Thế Âm
          </button>
          <button type="button" onClick={() => quickChant('Nguyện tâm thanh tịnh, muôn loài an lạc')}>
            🕊️ Nguyện tâm thanh tịnh
          </button>
        </div>

        {/* THANH NHẬP LỜI NGUYỆN / BÌNH LUẬN DƯỚI CÙNG ("NHẬP...") */}
        <footer className="stream-footer-input">
          <form className="stream-input-form" onSubmit={submitComment}>
            <input
              type="text"
              value={inputText}
              maxLength={280}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Bình luận niệm Phật hoặc cầu an để lên ngồi bồ đoàn..."
            />
            <button
              type="submit"
              className="btn-stream-send"
              title="Gửi và Lên ngồi"
              disabled={isSendingComment || isRestricted}
            >
              {isSendingComment ? 'Đang gửi...' : 'Lên ngồi 🙏'}
            </button>
          </form>
        </footer>
      </div>
    </div>
  )
}
