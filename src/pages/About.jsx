import { temple } from '../data.js'

export default function About() {
  return (
    <div className="page">
      <section className="section">
        <h2>Giới thiệu {temple.name}</h2>
        <p className="lead">
          {temple.name} là ngôi chùa mở trên internet, mô phỏng một đạo tràng nhỏ
          nơi ai cũng có thể vào lễ — không cần đi xa, không cần đúng giờ đóng
          mở cửa vật lý.
        </p>
        <div className="grid cards-3">
          <article className="card">
            <h3>Địa chỉ</h3>
            <p>{temple.address}</p>
            <p className="muted">Cổng online luôn mở.</p>
          </article>
          <article className="card">
            <h3>Liên hệ</h3>
            <p>{temple.phone}</p>
            <p>{temple.email}</p>
          </article>
          <article className="card">
            <h3>Giờ lễ</h3>
            <p>{temple.hours}</p>
            <p className="muted">Công phu khuya bắt đầu lúc 04:30.</p>
          </article>
        </div>
        <p className="quote">“{temple.tagline}”</p>
      </section>
    </div>
  )
}
