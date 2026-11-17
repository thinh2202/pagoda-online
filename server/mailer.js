import 'dotenv/config'
import nodemailer from 'nodemailer'

export function assertEmailServiceConfigured() {
  const emailUser = process.env.PAGODA_EMAIL_USER?.trim()
  const appPassword = process.env.PAGODA_EMAIL_APP_PASSWORD?.replace(/\s/g, '')
  if (!emailUser || !appPassword) {
    throw new Error('Máy chủ chưa cấu hình tài khoản gửi email Gmail')
  }
  if (Buffer.byteLength(process.env.PAGODA_EMAIL_CODE_SECRET || '') < 32) {
    throw new Error('Máy chủ chưa cấu hình khóa bảo vệ mã email đủ mạnh')
  }
  return { emailUser, appPassword }
}

export async function sendEmailCode({ email, code, purpose }) {
  const { emailUser, appPassword } = assertEmailServiceConfigured()
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: emailUser, pass: appPassword },
  })
  const purposeText = {
    registration: 'xác minh địa chỉ email đăng ký',
    email_update: 'xác minh email khôi phục tài khoản',
    password_reset: 'đặt lại mật khẩu',
  }[purpose]
  if (!purposeText) {
    throw new Error('Mục đích gửi email không hợp lệ')
  }

  await transporter.sendMail({
    from: `"Chùa Từ Quang" <${emailUser}>`,
    to: email,
    subject: 'Mã xác minh tài khoản Chùa Từ Quang',
    text: `Mã xác minh để ${purposeText} là: ${code}\n\nMã có hiệu lực trong 10 phút. Không chia sẻ mã này với bất kỳ ai.\n\nNếu bạn không yêu cầu thao tác này, hãy bỏ qua email.`,
  })
}
