import { useState } from 'react'
import { sutras } from '../data.js'

export default function Sutras() {
  const [current, setCurrent] = useState(sutras[0].id)
  const sutra = sutras.find((item) => item.id === current) || sutras[0]

  return (
    <div className="page">
      <section className="section">
        <h2>Kinh tụng</h2>
        <p className="lead muted">
          Chọn một thời kinh, đọc chậm. Không cần thuộc hết — chỉ cần từng chữ đi
          cùng hơi thở.
        </p>
        <div className="actions">
          {sutras.map((item) => (
            <button
              key={item.id}
              className={item.id === current ? 'btn btn-gold' : 'btn btn-ghost'}
              style={item.id === current ? undefined : { color: '#3b1c14', borderColor: '#c9a227' }}
              type="button"
              onClick={() => setCurrent(item.id)}
            >
              {item.title}
            </button>
          ))}
        </div>
        <article className="sutra" style={{ marginTop: '1.4rem' }}>
          <h3 style={{ fontFamily: 'var(--serif)', marginTop: 0 }}>{sutra.title}</h3>
          <p className="muted">{sutra.subtitle}</p>
          {sutra.lines.map((line, index) => (
            <p key={`${sutra.id}-${index}`}>{line}</p>
          ))}
        </article>
      </section>
    </div>
  )
}
