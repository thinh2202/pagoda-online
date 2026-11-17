import { useEffect, useState } from 'react'
import { ringBell } from '../bell.js'
import { assertCanInteract, getCurrentUser, subscribeAuth } from '../auth.js'

export default function Incense() {
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser())
  const [lit, setLit] = useState([false, false, false])
  const [wish, setWish] = useState('')
  const [kept, setKept] = useState('')
  const [moderationNotice, setModerationNotice] = useState('')
  const isRestricted = currentUser?.accountStatus === 'restricted'

  useEffect(() => subscribeAuth(setCurrentUser), [])

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

  async function light(index) {
    if (!(await canInteract())) return
    setLit((prev) => prev.map((on, i) => (i === index ? !on : on)))
  }

  async function lightAll() {
    if (!(await canInteract())) return
    setLit([true, true, true])
    ringBell()
  }

  async function clearIncense() {
    if (!(await canInteract())) return
    setLit([false, false, false])
  }

  async function offerWish(event) {
    event.preventDefault()
    if (!wish.trim()) return
    if (!(await canInteract())) return
    setKept(wish.trim())
    setWish('')
  }

  return (
    <div className="page">
      <section className="section">
        <h2>Thắp hương</h2>
        <p className="lead muted">
          Ba nén hương: Phật, Pháp, Tăng. Chạm vào nén hương để thắp, hoặc thắp
          cả bàn rồi thỉnh một tiếng chuông.
        </p>
        {(moderationNotice || isRestricted) && (
          <p className="moderation-notice" role="status">
            {moderationNotice || 'Tài khoản đang bị hạn chế tương tác.'}
          </p>
        )}
        <div className="altar">
          <div className="sticks">
            {lit.map((on, i) => (
              <button
                key={i}
                className={on ? 'stick lit' : 'stick'}
                type="button"
                aria-label={on ? 'Tắt nén hương' : 'Thắp nén hương'}
                onClick={() => light(i)}
              />
            ))}
          </div>
        </div>
        <div className="actions">
          <button className="btn btn-gold" type="button" onClick={lightAll}>
            Thắp ba nén & thỉnh chuông
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={clearIncense}
            style={{ color: '#3b1c14', borderColor: '#c9a227' }}
          >
            Tàn hương
          </button>
        </div>
        <form className="form" onSubmit={offerWish} style={{ marginTop: '1.6rem' }}>
          <label>
            Nguyện hương
            <input
              value={wish}
              onChange={(e) => setWish(e.target.value)}
              placeholder="Cầu cho gia đình bình an..."
            />
          </label>
          <button className="btn btn-gold" type="submit">
            Dâng nguyện
          </button>
        </form>
        {kept && (
          <p className="quote">
            Nguyện đã dâng: “{kept}”
          </p>
        )}
      </section>
    </div>
  )
}
