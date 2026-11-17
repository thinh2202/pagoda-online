import { useState } from 'react'
import { Link } from 'react-router-dom'
import { assertCanInteract } from '../auth.js'
import { schedule, temple } from '../data.js'
import { ringBell } from '../bell.js'

export default function Home() {
  const [interactionError, setInteractionError] = useState('')

  async function ringTempleBell() {
    try {
      await assertCanInteract()
      setInteractionError('')
      ringBell()
    } catch (error) {
      setInteractionError(error.message || 'Tài khoản hiện không thể tương tác')
    }
  }

  return (
    <>
      <section className="hero">
        <div className="lanterns" aria-hidden="true">
          <span className="lantern" />
          <span className="lantern" />
          <span className="lantern" />
          <span className="lantern" />
        </div>
        <div className="hero-inner">
          <span className="kicker">Chùa online</span>
          <h2>{temple.name}</h2>
          <p>
            Một ngôi chùa trên mạng để lòng được tĩnh: thắp hương, tụng kinh, theo
            lịch công phu, ghi lời cầu an và phát tâm công đức — bất cứ nơi nào
            bạn đang đứng.
          </p>
          <p className="quote" style={{ color: '#e7d08a' }}>
            “{temple.tagline}”
          </p>
          <div className="actions">
            <Link className="btn btn-gold" to="/thien-toa">
              Ngồi thiền
            </Link>
            <Link className="btn btn-ghost" to="/thap-huong">
              Thắp hương
            </Link>
            <Link className="btn btn-ghost" to="/kinh-tung">
              Tụng kinh
            </Link>
            <button className="btn btn-ghost" type="button" onClick={ringTempleBell}>
              Thỉnh chuông
            </button>
          </div>
          {interactionError && <p className="moderation-notice" role="status">{interactionError}</p>}
        </div>
      </section>

      <div className="page">
        <section className="section">
          <h2>Công phu hôm nay</h2>
          <p className="lead muted">
            Năm thời khóa, từ khuya đến tối. Bạn có thể tụng theo tại nhà.
          </p>
          <div className="grid cards-3">
            {schedule.slice(0, 3).map((item) => (
              <article className="card" key={item.period}>
                <p className="time">{item.time}</p>
                <h3>{item.period}</h3>
                <p>{item.note}</p>
              </article>
            ))}
          </div>
          <p>
            <Link className="btn btn-gold" to="/cong-phu" style={{ display: 'inline-block', marginTop: '1rem' }}>
              Xem đủ lịch
            </Link>
          </p>
        </section>

        <section className="section" style={{ marginTop: '2.4rem' }}>
          <div style={{ background: 'var(--cream)', border: '1px solid rgba(201, 162, 39, 0.35)', borderRadius: '20px', padding: '2rem 2.2rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1.5rem' }}>
            <div>
              <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.8rem', color: 'var(--crimson)' }}>Tọa thiền tĩnh tâm online</h2>
              <p className="muted" style={{ margin: 0, maxWidth: '520px' }}>
                Dành 5 đến 15 phút mỗi ngày để quay về nương tựa hơi thở, lắng đọng tâm tư với nhịp thở hoa sen, chuông thanh tịnh và suối reo an nhiên.
              </p>
            </div>
            <Link className="btn btn-gold" to="/thien-toa" style={{ whiteSpace: 'nowrap' }}>
              Bắt đầu ngồi thiền
            </Link>
          </div>
        </section>
      </div>
    </>
  )
}
