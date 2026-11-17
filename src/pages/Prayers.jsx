import { useEffect, useState } from 'react'
import { assertCanInteract, getCurrentUser, getToken, subscribeAuth } from '../auth.js'

const KEY = 'tu-quang-prayers'

export default function Prayers() {
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser())
  const [items, setItems] = useState(() => {
    try {
      const saved = localStorage.getItem(KEY)
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [name, setName] = useState(() => getCurrentUser()?.dharmaName || '')
  const [wish, setWish] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    return subscribeAuth((u) => {
      setCurrentUser(u)
      if (u?.dharmaName) setName(u.dharmaName)
    })
  }, [])

  // Nạp danh sách sớ cầu an từ cơ sở dữ liệu SQLite
  useEffect(() => {
    fetch('/api/prayers')
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.prayers) && data.prayers.length > 0) {
          setItems(data.prayers)
        }
      })
      .catch(() => {})
  }, [])

  async function submit(event) {
    event.preventDefault()
    if (!wish.trim()) return

    setSubmitError('')
    setIsSubmitting(true)
    const prayerName = name.trim() || currentUser?.dharmaName || 'Phật tử'
    const prayerWish = wish.trim()

    try {
      await assertCanInteract()
      const token = getToken()
      const response = await fetch('/api/prayers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: prayerName, wish: prayerWish }),
      })
      const data = await response.json()
      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Không thể ghi sớ cầu an')
      }

      const next = [{ id: data.id, name: prayerName, wish: prayerWish }, ...items]
      setItems(next)
      setWish('')
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {}
    } catch (error) {
      setSubmitError(error.message || 'Không thể ghi sớ cầu an')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="page">
      <section className="section">
        <h2>Sổ cầu an</h2>
        <p className="lead muted">
          Viết tên người thân, người ốm, người đã khuất. Lời sớ được lưu trữ trong cơ sở dữ liệu
          chùa, như một tờ sớ trang nghiêm dâng lên Phật đài.
        </p>
        {currentUser?.accountStatus === 'restricted' && (
          <p className="moderation-notice" role="status">
            Tài khoản đang bị hạn chế tương tác. Thử gửi lại sau khi hết hạn hoặc được admin gỡ hạn chế.
          </p>
        )}
        <form className="form" onSubmit={submit}>
          <label>
            Pháp danh / Tên người cầu
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={currentUser?.dharmaName || 'Nhập tên hoặc pháp danh'}
            />
          </label>
          <label>
            Lời cầu nguyện
            <textarea
              rows="3"
              value={wish}
              onChange={(e) => setWish(e.target.value)}
              placeholder="Cầu cho gia đình bình an, tiêu tai cát tường..."
              required
            />
          </label>
          {submitError && <p className="form-feedback error" role="alert">{submitError}</p>}
          <button className="btn btn-gold" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Đang ghi...' : 'Ghi vào sổ cầu an'}
          </button>
        </form>
        <div className="prayer-list">
          {items.map((item) => (
            <article className="prayer" key={item.id}>
              <strong>{item.name}</strong>
              <p>{item.wish}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
