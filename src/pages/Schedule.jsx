import { schedule, weekly } from '../data.js'

export default function Schedule() {
  return (
    <div className="page">
      <section className="section">
        <h2>Lịch công phu mỗi ngày</h2>
        <p className="lead muted">
          Chuông trống Bát Nhã vang, đại chúng nhiếp tâm. Online, bạn chỉ cần một
          góc yên và hơi thở chậm.
        </p>
        <div className="grid cards-3">
          {schedule.map((item) => (
            <article className="card" key={item.period}>
              <p className="time">{item.time}</p>
              <h3>{item.period}</h3>
              <p>{item.note}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="section">
        <h2>Sinh hoạt trong tuần</h2>
        <div className="grid cards-3">
          {weekly.map((item) => (
            <article className="card" key={item.day}>
              <p className="time">{item.time}</p>
              <h3>{item.day}</h3>
              <p>{item.event}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
