import { useEffect, useState } from 'react'
import { danaIntents } from '../data.js'
import { assertCanInteract, getCurrentUser, getToken, subscribeAuth } from '../auth.js'

export default function Dana() {
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser())
  const [records, setRecords] = useState([])
  const [form, setForm] = useState({
    name: getCurrentUser()?.dharmaName || '',
    intent: danaIntents[0].id,
    amount: '',
    note: '',
  })
  const [loadError, setLoadError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [meritResult, setMeritResult] = useState(null)
  const currentUserId = currentUser?.id

  useEffect(() => {
    return subscribeAuth((u) => {
      setCurrentUser(u)
      if (u?.dharmaName) setForm((prev) => ({ ...prev, name: u.dharmaName }))
    })
  }, [])

  useEffect(() => {
    fetch('/api/dana')
      .then((res) => {
        if (!res.ok) throw new Error('Không thể tải sổ công đức')
        return res.json()
      })
      .then((data) => {
        if (!data.ok || !Array.isArray(data.records)) {
          throw new Error(data.error || 'Dữ liệu sổ công đức không hợp lệ')
        }
        setRecords(data.records.map((record) => ({
          id: record.id,
          name: record.name,
          intent: record.intent,
          amount: record.amount,
          note: record.note,
          when: record.created_at || new Date().toLocaleString('vi-VN'),
        })))
      })
      .catch((error) => {
        setLoadError(error.message || 'Không thể tải sổ công đức')
      })
  }, [])

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

  async function submit(event) {
    event.preventDefault()
    setSubmitError('')
    setIsSubmitting(true)
    const donorName = form.name.trim() || currentUser?.dharmaName || 'Ẩn danh'
    try {
      await assertCanInteract()
      const token = getToken()
      const response = await fetch('/api/dana', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: donorName,
          intent: form.intent,
          amount: form.amount,
          note: form.note,
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Không thể ghi nhận công đức')
      }
      if (data.summary && currentUserId) {
        setMeritResult({ userId: currentUserId, summary: data.summary })
      }

      const next = [{
        ...form,
        name: donorName,
        id: data.id,
        when: new Date().toLocaleString('vi-VN'),
      }, ...records]
      setRecords(next)
      setForm({
        name: currentUser?.dharmaName || '',
        intent: danaIntents[0].id,
        amount: '',
        note: '',
      })
    } catch (error) {
      setSubmitError(error.message || 'Không thể ghi nhận công đức')
    } finally {
      setIsSubmitting(false)
    }
  }

  const visibleMeritResult = meritResult?.userId === currentUserId ? meritResult : null

  return (
    <div className="page">
      <section className="section">
        <h2>Công đức · Tùy duyên</h2>
        <p className="lead muted">
          Quét mã để chuyển khoản, sau đó điền thông tin để ghi nhận khoản công đức của bạn.
        </p>
        <section className="dana-panel dana-rank-card" aria-labelledby="dana-rank-title">
          <h3 id="dana-rank-title">Cấp bậc ghi nhận phát tâm</h3>
          {currentUser ? (
            visibleMeritResult?.error ? (
              <p className="form-feedback error" role="alert">{visibleMeritResult.error}</p>
            ) : visibleMeritResult?.summary ? (
              <>
                <p className="dana-rank-current">
                  Cấp hiện tại: <strong>{visibleMeritResult.summary.rank}</strong>
                  {' · '}Đã ghi nhận tổng cộng{' '}
                  <strong>{visibleMeritResult.summary.total.toLocaleString('vi-VN')} đ</strong>
                </p>
                {visibleMeritResult.summary.nextRank ? (
                  <>
                    <p className="muted">
                      Còn {(visibleMeritResult.summary.nextThreshold - visibleMeritResult.summary.total)
                        .toLocaleString('vi-VN')} đ để đạt {visibleMeritResult.summary.nextRank}.
                    </p>
                    <div
                      className="dana-rank-progress"
                      role="progressbar"
                      aria-label={`Tiến độ đến cấp ${visibleMeritResult.summary.nextRank}`}
                      aria-valuemin="0"
                      aria-valuemax="100"
                      aria-valuenow={visibleMeritResult.summary.progress}
                    >
                      <span style={{ width: `${visibleMeritResult.summary.progress}%` }} />
                    </div>
                  </>
                ) : (
                  <p className="muted">Bạn đã đạt cấp bậc ghi nhận cao nhất.</p>
                )}
                <ul className="dana-rank-levels">
                  {visibleMeritResult.summary.levels.map((level) => (
                    <li key={level.rank}>
                      {level.rank}: từ {level.threshold.toLocaleString('vi-VN')} đ
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="muted">Đang tải cấp bậc của bạn...</p>
            )
          ) : (
            <p className="muted">
              Đăng nhập để tích lũy cấp bậc. Chỉ các khoản ghi nhận gắn với tài khoản mới được cộng dồn.
            </p>
          )}
          <p className="dana-rank-disclaimer">
            Cấp bậc chỉ ghi nhận tổng số tiền người gửi tự khai trên website, không phải cấp bậc tu hành
            và chưa được ngân hàng xác minh.
          </p>
        </section>
        <section className="dana-panel dana-payment-panel" aria-labelledby="dana-payment-title">
          <div className="dana-payment-copy">
            <h3 id="dana-payment-title">1. Chuyển khoản công đức</h3>
            <p>Quét mã bằng ứng dụng ngân hàng để thực hiện chuyển khoản.</p>
            <p className="dana-payment-warning">
              Trước khi xác nhận giao dịch, hãy kiểm tra kỹ tên người nhận và số tiền trên ứng dụng ngân hàng.
            </p>
          </div>
          <a
            className="dana-qr-link"
            href="/dana-qr.png"
            target="_blank"
            rel="noreferrer"
            aria-label="Mở ảnh mã QR chuyển khoản kích thước đầy đủ"
          >
            <img
              className="dana-qr-image"
              src="/dana-qr.png"
              alt="Mã QR chuyển khoản công đức"
              width="280"
              height="280"
            />
          </a>
        </section>

        <section className="dana-panel" aria-labelledby="dana-record-title">
          <h3 id="dana-record-title">2. Ghi nhận khoản đã phát tâm</h3>
          <p className="dana-self-report-note">
            Thông tin bạn nhập sẽ hiển thị công khai. Đây là nội dung do người gửi tự khai, chưa được ngân hàng xác minh.
          </p>
          {currentUser?.accountStatus === 'restricted' && (
            <p className="moderation-notice" role="status">
              Tài khoản đang bị hạn chế tương tác. Thử gửi lại sau khi hết hạn hoặc được admin gỡ hạn chế.
            </p>
          )}
          <form className="form dana-form" onSubmit={submit}>
            <label>
              Pháp danh / Tên người phát tâm
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={currentUser?.dharmaName || 'Ẩn danh cũng được'}
              />
            </label>
            <label>
              Hướng công đức
              <select
                value={form.intent}
                onChange={(e) => setForm({ ...form, intent: e.target.value })}
              >
                {danaIntents.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Số tùy hỷ (VND)
              <input
                type="number"
                min="0"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="Tùy tâm"
              />
            </label>
            <label>
              Lời hồi hướng (hiển thị công khai)
              <textarea
                rows="3"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="Nguyện đem công đức này hồi hướng cho..."
              />
            </label>
            {submitError && <p className="form-feedback error" role="alert">{submitError}</p>}
            <button className="btn btn-gold" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Đang ghi...' : 'Ghi vào sổ công đức'}
            </button>
          </form>
        </section>

        <section className="dana-panel" aria-labelledby="dana-ledger-title">
          <h3 id="dana-ledger-title">3. Sổ ghi nhận công đức</h3>
          <p className="dana-self-report-note">
            Các bản ghi bên dưới là lời phát tâm do người gửi tự khai, không phải xác nhận giao dịch từ ngân hàng.
          </p>
          {loadError && <p className="form-feedback error" role="alert">{loadError}</p>}
          {!loadError && records.length === 0 ? (
            <p className="muted">Chưa có bản ghi công đức nào.</p>
          ) : (
            <div className="prayer-list">
              {records.map((item) => (
                <article className="prayer dana-record" key={item.id}>
                  <strong>{item.name || 'Ẩn danh'}</strong>
                  <span className="dana-record-status">Người gửi tự khai</span>
                  <p className="muted">
                    {danaIntents.find((x) => x.id === item.intent)?.label || 'Tùy duyên'} ·{' '}
                    {item.amount ? `${Number(item.amount).toLocaleString('vi-VN')} đ` : 'tùy duyên'} ·{' '}
                    {item.when}
                  </p>
                  {item.note && <p>{item.note}</p>}
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </div>
  )
}
