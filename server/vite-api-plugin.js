import {
  db,
  completeEmailUpdate,
  completeEmailVerification,
  createEmailChallenge,
  createDanaRecord,
  getDanaMeritSummary,
  getManagedUsers,
  getManagedMeditationActivity,
  recordMeditationActivityHeartbeat,
  isAdminUser,
  getUserByToken,
  loginUser,
  logoutToken,
  getMeditationStream,
  postMeditationComment,
  registerUser,
  requestPasswordResetChallenge,
  resetPassword,
  updateUserModeration,
} from './db.js'
import { assertEmailServiceConfigured, sendEmailCode } from './mailer.js'

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res, statusCode, data) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(data))
}

export function apiPlugin() {
  return {
    name: 'pagoda-sqlite-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url.split('?')[0]

        // Chỉ xử lý các route bắt đầu bằng /api/
        if (!url.startsWith('/api/')) {
          return next()
        }

        try {
          const authHeader = req.headers.authorization || ''
          const token = authHeader.replace(/^Bearer\s+/i, '').trim()

          // 1. ĐĂNG KÝ TÀI KHOẢN
          if (url === '/api/auth/register' && req.method === 'POST') {
            const body = await parseJsonBody(req)
            assertEmailServiceConfigured()
            const result = registerUser(body)
            const challenge = createEmailChallenge({
              userId: result.user.id,
              email: result.user.email,
              purpose: 'registration',
            })
            try {
              await sendEmailCode({
                email: result.user.email,
                code: challenge.code,
                purpose: 'registration',
              })
            } catch (error) {
              console.error('Registration email delivery failed:', error.message)
              return sendJson(res, 503, {
                ok: false,
                error: 'Không gửi được email xác minh. Hãy kiểm tra cấu hình Gmail hoặc thử lại sau một phút.',
              })
            }
            return sendJson(res, 201, {
              ok: true,
              verificationRequired: true,
              email: result.user.email,
            })
          }

          if (url === '/api/auth/resend-verification' && req.method === 'POST') {
            const body = await parseJsonBody(req)
            assertEmailServiceConfigured()
            const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
            const pendingUser = db.prepare(`
              SELECT id, email FROM users
              WHERE email = ? AND email_required = 1 AND email_verified = 0
            `).get(email)
            if (pendingUser) {
              try {
                const challenge = createEmailChallenge({
                  userId: pendingUser.id,
                  email: pendingUser.email,
                  purpose: 'registration',
                })
                await sendEmailCode({
                  email: pendingUser.email,
                  code: challenge.code,
                  purpose: 'registration',
                })
              } catch (error) {
                if (!error.message.includes('Vui lòng đợi một phút')) {
                  console.error('Verification email delivery failed:', error.message)
                  return sendJson(res, 503, {
                    ok: false,
                    error: 'Không gửi được email xác minh. Vui lòng thử lại sau một phút.',
                  })
                }
              }
            }
            return sendJson(res, 200, {
              ok: true,
              message: 'Nếu email thuộc tài khoản chưa xác minh, mã mới sẽ được gửi. Hãy đợi ít nhất một phút giữa các lần yêu cầu.',
            })
          }

          if (url === '/api/auth/verify-email' && req.method === 'POST') {
            const body = await parseJsonBody(req)
            const result = completeEmailVerification(body)
            return sendJson(res, 200, { ok: true, ...result })
          }

          if (url === '/api/auth/email' && req.method === 'POST') {
            const currentUser = getUserByToken(token)
            if (!currentUser) {
              return sendJson(res, 401, { ok: false, error: 'Vui lòng đăng nhập' })
            }
            const body = await parseJsonBody(req)
            assertEmailServiceConfigured()
            const challenge = createEmailChallenge({
              userId: currentUser.id,
              email: body.email,
              purpose: 'email_update',
            })
            try {
              await sendEmailCode({
                email: body.email.trim().toLowerCase(),
                code: challenge.code,
                purpose: 'email_update',
              })
            } catch (error) {
              console.error('Email update delivery failed:', error.message)
              return sendJson(res, 503, {
                ok: false,
                error: 'Không gửi được email xác minh. Hãy kiểm tra cấu hình Gmail hoặc thử lại sau một phút.',
              })
            }
            return sendJson(res, 200, { ok: true })
          }

          if (url === '/api/auth/email/verify' && req.method === 'POST') {
            const currentUser = getUserByToken(token)
            if (!currentUser) {
              return sendJson(res, 401, { ok: false, error: 'Vui lòng đăng nhập' })
            }
            const body = await parseJsonBody(req)
            completeEmailUpdate({ userId: currentUser.id, code: body.code })
            return sendJson(res, 200, { ok: true, user: getUserByToken(token) })
          }

          if (url === '/api/auth/forgot-password' && req.method === 'POST') {
            const body = await parseJsonBody(req)
            assertEmailServiceConfigured()
            let challenge
            try {
              challenge = requestPasswordResetChallenge(body.email)
            } catch (error) {
              if (!error.message.includes('Vui lòng đợi một phút')) throw error
            }
            if (challenge) {
              try {
                await sendEmailCode({
                  email: body.email.trim().toLowerCase(),
                  code: challenge.code,
                  purpose: 'password_reset',
                })
              } catch (error) {
                console.error('Password reset email delivery failed:', error.message)
                return sendJson(res, 503, {
                  ok: false,
                  error: 'Dịch vụ email đang gặp sự cố. Vui lòng thử lại sau.',
                })
              }
            }
            return sendJson(res, 200, {
              ok: true,
              message: 'Nếu email đã xác minh tồn tại, mã đặt lại mật khẩu đã được gửi.',
            })
          }

          if (url === '/api/auth/reset-password' && req.method === 'POST') {
            const body = await parseJsonBody(req)
            resetPassword(body)
            return sendJson(res, 200, { ok: true })
          }

          // 2. ĐĂNG NHẬP
          if (url === '/api/auth/login' && req.method === 'POST') {
            const body = await parseJsonBody(req)
            const result = loginUser(body)
            return sendJson(res, 200, { ok: true, ...result })
          }

          // 3. LẤY THÔNG TIN TÀI KHOẢN ĐANG ĐĂNG NHẬP
          if (url === '/api/auth/me' && req.method === 'GET') {
            const user = getUserByToken(token)
            if (!user) {
              return sendJson(res, 401, { ok: false, error: 'Chưa đăng nhập' })
            }
            return sendJson(res, 200, { ok: true, user })
          }

          // 4. ĐĂNG XUẤT
          if (url === '/api/auth/logout' && req.method === 'POST') {
            logoutToken(token)
            return sendJson(res, 200, { ok: true })
          }

          if (url === '/api/admin/users' && req.method === 'GET') {
            const currentUser = getUserByToken(token)
            if (!currentUser) {
              return sendJson(res, 401, { ok: false, error: 'Vui lòng đăng nhập' })
            }
            if (!isAdminUser(currentUser)) {
              return sendJson(res, 403, { ok: false, error: 'Bạn không có quyền quản lý tài khoản' })
            }
            return sendJson(res, 200, { ok: true, users: getManagedUsers() })
          }

          const moderationMatch = url.match(/^\/api\/admin\/users\/(\d+)\/moderation$/)
          if (moderationMatch && req.method === 'POST') {
            const currentUser = getUserByToken(token)
            if (!currentUser) {
              return sendJson(res, 401, { ok: false, error: 'Vui lòng đăng nhập' })
            }
            if (!isAdminUser(currentUser)) {
              return sendJson(res, 403, { ok: false, error: 'Bạn không có quyền quản lý tài khoản' })
            }
            const body = await parseJsonBody(req)
            const user = updateUserModeration({
              userId: moderationMatch[1],
              status: body.status,
              duration: body.duration,
              reason: body.reason,
            })
            return sendJson(res, 200, { ok: true, user })
          }

          if (url === '/api/admin/activity' && req.method === 'GET') {
            const currentUser = getUserByToken(token)
            if (!currentUser) {
              return sendJson(res, 401, { ok: false, error: 'Vui lòng đăng nhập' })
            }
            if (!isAdminUser(currentUser)) {
              return sendJson(res, 403, { ok: false, error: 'Bạn không có quyền xem thời gian hoạt động' })
            }
            return sendJson(res, 200, {
              ok: true,
              users: getManagedMeditationActivity(),
            })
          }

          if (url === '/api/activity/heartbeat' && req.method === 'POST') {
            const currentUser = getUserByToken(token)
            if (!currentUser) {
              return sendJson(res, 401, { ok: false, error: 'Vui lòng đăng nhập để ghi nhận thời gian tham gia' })
            }
            return sendJson(res, 200, {
              ok: true,
              ...recordMeditationActivityHeartbeat(currentUser.id),
            })
          }

          if (url === '/api/meditation/stream' && req.method === 'GET') {
            const currentUser = getUserByToken(token)
            if (token && !currentUser) {
              return sendJson(res, 401, { ok: false, error: 'Phiên đăng nhập không hợp lệ' })
            }
            const visitorId = new URL(req.url, 'http://localhost').searchParams.get('visitorId')
            const stream = getMeditationStream({ user: currentUser, visitorId })
            return sendJson(res, 200, { ok: true, ...stream })
          }

          if (url === '/api/meditation/comments' && req.method === 'POST') {
            const currentUser = getUserByToken(token)
            if (token && !currentUser) {
              return sendJson(res, 401, { ok: false, error: 'Phiên đăng nhập không hợp lệ' })
            }
            if (currentUser?.accountStatus === 'restricted') {
              return sendJson(res, 403, {
                ok: false,
                error: 'Tài khoản đang bị hạn chế, bạn chưa thể bình luận',
              })
            }
            const body = await parseJsonBody(req)
            const stream = postMeditationComment({
              user: currentUser,
              visitorId: body.visitorId,
              name: body.name,
              text: body.text,
            })
            return sendJson(res, 201, { ok: true, ...stream })
          }

          // 5. SỔ CẦU AN (LẤY DANH SÁCH)
          if (url === '/api/prayers' && req.method === 'GET') {
            const query = db.prepare('SELECT * FROM prayers ORDER BY id DESC LIMIT 50')
            const list = query.all()
            return sendJson(res, 200, { ok: true, prayers: list })
          }

          // 6. SỔ CẦU AN (GHI MỚI)
          if (url === '/api/prayers' && req.method === 'POST') {
            const body = await parseJsonBody(req)
            const currentUser = getUserByToken(token)
            if (token && !currentUser) {
              return sendJson(res, 401, { ok: false, error: 'Phiên đăng nhập không hợp lệ' })
            }
            if (currentUser?.accountStatus === 'restricted') {
              return sendJson(res, 403, {
                ok: false,
                error: 'Tài khoản đang bị hạn chế, bạn chưa thể gửi sớ cầu an',
              })
            }
            const insert = db.prepare('INSERT INTO prayers (user_id, name, wish) VALUES (?, ?, ?)')
            const result = insert.run(
              currentUser ? currentUser.id : null,
              body.name || 'Phật tử',
              body.wish || ''
            )
            return sendJson(res, 201, { ok: true, id: Number(result.lastInsertRowid) })
          }

          // 7. SỔ CÔNG ĐỨC (LẤY DANH SÁCH)
          if (url === '/api/dana/summary' && req.method === 'GET') {
            const currentUser = getUserByToken(token)
            if (!currentUser) {
              return sendJson(res, 401, { ok: false, error: 'Vui lòng đăng nhập để xem cấp bậc công đức' })
            }
            return sendJson(res, 200, {
              ok: true,
              summary: getDanaMeritSummary(currentUser.id),
            })
          }

          if (url === '/api/dana' && req.method === 'GET') {
            const query = db.prepare('SELECT * FROM dana_records ORDER BY id DESC LIMIT 50')
            const list = query.all()
            return sendJson(res, 200, { ok: true, records: list })
          }

          // 8. SỔ CÔNG ĐỨC (GHI MỚI)
          if (url === '/api/dana' && req.method === 'POST') {
            const body = await parseJsonBody(req)
            const currentUser = getUserByToken(token)
            if (token && !currentUser) {
              return sendJson(res, 401, { ok: false, error: 'Phiên đăng nhập không hợp lệ' })
            }
            if (currentUser?.accountStatus === 'restricted') {
              return sendJson(res, 403, {
                ok: false,
                error: 'Tài khoản đang bị hạn chế, bạn chưa thể ghi nhận công đức',
              })
            }
            const id = createDanaRecord({
              userId: currentUser?.id,
              name: body.name || 'Phật tử',
              intent: body.intent,
              amount: body.amount,
              note: body.note,
            })
            return sendJson(res, 201, {
              ok: true,
              id,
              summary: currentUser ? getDanaMeritSummary(currentUser.id) : null,
            })
          }

          return sendJson(res, 404, { ok: false, error: 'Endpoint không tồn tại' })
        } catch (err) {
          return sendJson(res, 400, { ok: false, error: err.message || 'Lỗi xử lý yêu cầu' })
        }
      })
    },
  }
}

