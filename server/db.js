import 'dotenv/config'
import { DatabaseSync } from 'node:sqlite'
import crypto from 'node:crypto'
import path from 'node:path'

const dbPath = path.resolve('pagoda.db')
const adminUsername = (process.env.PAGODA_ADMIN_USERNAME || 'adminthinh').trim().toLowerCase()
const danaRanks = [
  { rank: 'Sen Đồng', threshold: 100_000 },
  { rank: 'Sen Bạc', threshold: 500_000 },
  { rank: 'Sen Vàng', threshold: 1_000_000 },
]
const activityRanks = [
  { rank: 'Tập sự', thresholdSeconds: 3_600 },
  { rank: 'Tinh tấn', thresholdSeconds: 36_000 },
  { rank: 'An trú', thresholdSeconds: 180_000 },
]
const MAX_ACTIVITY_HEARTBEAT_GAP_MS = 45_000
export const db = new DatabaseSync(dbPath)

export function isAdminUser(user) {
  return typeof user?.username === 'string' && user.username.toLowerCase() === adminUsername
}

// Khởi tạo các bảng cơ sở dữ liệu SQLite
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    email TEXT,
    email_verified INTEGER NOT NULL DEFAULT 0,
    email_required INTEGER NOT NULL DEFAULT 0,
    dharma_name TEXT,
    full_name TEXT,
    account_status TEXT NOT NULL DEFAULT 'active',
    restriction_until INTEGER,
    status_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS email_challenges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    email TEXT NOT NULL,
    purpose TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    UNIQUE(user_id, purpose)
  );

  CREATE TABLE IF NOT EXISTS meditation_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_key TEXT NOT NULL,
    author TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS meditation_presence (
    actor_key TEXT PRIMARY KEY,
    author TEXT NOT NULL,
    last_comment TEXT NOT NULL,
    last_comment_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS meditation_activity_totals (
    user_id INTEGER PRIMARY KEY,
    total_ms INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS meditation_activity_presence (
    user_id INTEGER PRIMARY KEY,
    last_seen_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS prayers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name TEXT NOT NULL,
    wish TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS dana_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name TEXT,
    intent TEXT,
    amount INTEGER,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`)

const userColumns = new Set(db.prepare('PRAGMA table_info(users)').all().map((column) => column.name))
if (!userColumns.has('email')) {
  db.exec('ALTER TABLE users ADD COLUMN email TEXT')
}
if (!userColumns.has('email_verified')) {
  db.exec('ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0')
}
if (!userColumns.has('email_required')) {
  db.exec('ALTER TABLE users ADD COLUMN email_required INTEGER NOT NULL DEFAULT 0')
}
if (!userColumns.has('account_status')) {
  db.exec("ALTER TABLE users ADD COLUMN account_status TEXT NOT NULL DEFAULT 'active'")
}
if (!userColumns.has('restriction_until')) {
  db.exec('ALTER TABLE users ADD COLUMN restriction_until INTEGER')
}
if (!userColumns.has('status_reason')) {
  db.exec('ALTER TABLE users ADD COLUMN status_reason TEXT')
}
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
  ON users(email)
  WHERE email IS NOT NULL AND email <> ''
`)

function refreshRestriction(user) {
  if (
    user.account_status === 'restricted' &&
    user.restriction_until !== null &&
    user.restriction_until <= Date.now()
  ) {
    db.prepare(`
      UPDATE users
      SET account_status = 'active', restriction_until = NULL, status_reason = NULL
      WHERE id = ?
    `).run(user.id)
    user.account_status = 'active'
    user.restriction_until = null
    user.status_reason = null
  }
  return user
}

// Hàm mã hóa mật khẩu an toàn với Scrypt
export function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex')
}

function normalizeEmail(email) {
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
  if (
    cleanEmail.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
  ) {
    throw new Error('Vui lòng nhập địa chỉ email hợp lệ')
  }
  return cleanEmail
}

function hashEmailCode(code, userId, email, purpose) {
  const secret = process.env.PAGODA_EMAIL_CODE_SECRET || ''
  if (Buffer.byteLength(secret) < 32) {
    throw new Error('Máy chủ chưa cấu hình khóa bảo vệ mã email đủ mạnh')
  }
  return crypto
    .createHmac('sha256', secret)
    .update(`${userId}:${email}:${purpose}:${code}`)
    .digest('hex')
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex')
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, userId)
  return token
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    dharmaName: user.dharma_name,
    fullName: user.full_name,
    email: user.email,
    emailVerified: Boolean(user.email_verified),
    accountStatus: user.account_status,
    restrictionUntil: user.restriction_until,
    statusReason: user.status_reason,
  }
}

export function createEmailChallenge({ userId, email, purpose }) {
  const cleanEmail = normalizeEmail(email)
  if (!['registration', 'email_update', 'password_reset'].includes(purpose)) {
    throw new Error('Mục đích xác minh email không hợp lệ')
  }
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(userId)) {
    throw new Error('Không tìm thấy tài khoản')
  }

  const emailOwner = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(cleanEmail, userId)
  if (emailOwner) {
    throw new Error('Email này đã được liên kết với một tài khoản khác')
  }

  const now = Date.now()
  const previous = db.prepare(`
    SELECT created_at FROM email_challenges
    WHERE user_id = ? AND purpose = ?
  `).get(userId, purpose)
  if (previous && now - previous.created_at < 60_000) {
    throw new Error('Vui lòng đợi một phút trước khi yêu cầu mã mới')
  }

  const code = String(crypto.randomInt(0, 100_000_000)).padStart(8, '0')
  const codeHash = hashEmailCode(code, userId, cleanEmail, purpose)
  db.prepare(`
    INSERT INTO email_challenges (user_id, email, purpose, code_hash, expires_at, created_at, attempts)
    VALUES (?, ?, ?, ?, ?, ?, 0)
    ON CONFLICT(user_id, purpose) DO UPDATE SET
      email = excluded.email,
      code_hash = excluded.code_hash,
      expires_at = excluded.expires_at,
      created_at = excluded.created_at,
      attempts = 0
  `).run(userId, cleanEmail, purpose, codeHash, now + 10 * 60_000, now)

  return { code }
}

function verifyEmailChallenge({ userId, email, purpose, code }) {
  const cleanEmail = normalizeEmail(email)
  const normalizedCode = typeof code === 'string' ? code.trim() : ''
  if (!/^\d{8}$/.test(normalizedCode)) {
    throw new Error('Mã xác minh không hợp lệ hoặc đã hết hạn')
  }

  const challenge = db.prepare(`
    SELECT id, user_id, email, code_hash, expires_at, attempts
    FROM email_challenges
    WHERE user_id = ? AND email = ? AND purpose = ?
  `).get(userId, cleanEmail, purpose)
  if (!challenge || challenge.expires_at <= Date.now() || challenge.attempts >= 5) {
    if (challenge) db.prepare('DELETE FROM email_challenges WHERE id = ?').run(challenge.id)
    throw new Error('Mã xác minh không hợp lệ hoặc đã hết hạn')
  }

  const expected = Buffer.from(challenge.code_hash, 'hex')
  const provided = Buffer.from(hashEmailCode(normalizedCode, userId, cleanEmail, purpose), 'hex')
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    db.prepare('UPDATE email_challenges SET attempts = attempts + 1 WHERE id = ?').run(challenge.id)
    throw new Error('Mã xác minh không hợp lệ hoặc đã hết hạn')
  }
  return challenge
}

export function completeEmailVerification({ email, code }) {
  const cleanEmail = normalizeEmail(email)
  const user = db.prepare(`
    SELECT * FROM users
    WHERE email = ? AND email_required = 1 AND email_verified = 0
  `).get(cleanEmail)
  if (!user) {
    throw new Error('Mã xác minh không hợp lệ hoặc đã hết hạn')
  }

  const challenge = verifyEmailChallenge({
    userId: user.id,
    email: cleanEmail,
    purpose: 'registration',
    code,
  })
  db.prepare('UPDATE users SET email_verified = 1, email_required = 0 WHERE id = ?').run(user.id)
  db.prepare('DELETE FROM email_challenges WHERE id = ?').run(challenge.id)
  return { user: publicUser({ ...user, email_verified: 1 }), token: createSession(user.id) }
}

export function completeEmailUpdate({ userId, code }) {
  const challenge = db.prepare(`
    SELECT email FROM email_challenges
    WHERE user_id = ? AND purpose = 'email_update'
  `).get(userId)
  if (!challenge) {
    throw new Error('Mã xác minh không hợp lệ hoặc đã hết hạn')
  }

  const verified = verifyEmailChallenge({
    userId,
    email: challenge.email,
    purpose: 'email_update',
    code,
  })
  db.prepare('UPDATE users SET email = ?, email_verified = 1 WHERE id = ?')
    .run(challenge.email, userId)
  db.prepare('DELETE FROM email_challenges WHERE id = ?').run(verified.id)
}

export function requestPasswordResetChallenge(email) {
  const cleanEmail = normalizeEmail(email)
  const user = db.prepare(`
    SELECT id FROM users
    WHERE email = ? AND email_verified = 1 AND email_required = 0
  `).get(cleanEmail)
  if (!user) return null
  return {
    userId: user.id,
    ...createEmailChallenge({ userId: user.id, email: cleanEmail, purpose: 'password_reset' }),
  }
}

export function resetPassword({ email, code, password }) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('Mật khẩu mới phải có ít nhất 8 ký tự')
  }
  const cleanEmail = normalizeEmail(email)
  const user = db.prepare(`
    SELECT * FROM users
    WHERE email = ? AND email_verified = 1 AND email_required = 0
  `).get(cleanEmail)
  if (!user) {
    throw new Error('Mã xác minh không hợp lệ hoặc đã hết hạn')
  }

  const challenge = verifyEmailChallenge({
    userId: user.id,
    email: cleanEmail,
    purpose: 'password_reset',
    code,
  })
  const salt = crypto.randomBytes(16).toString('hex')
  db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?')
    .run(hashPassword(password, salt), salt, user.id)
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id)
  db.prepare('DELETE FROM email_challenges WHERE id = ?').run(challenge.id)
}

function getMeditationActorKey({ user, visitorId }) {
  if (user?.id) return `user:${user.id}`
  if (typeof visitorId !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(visitorId)) {
    throw new Error('Không thể xác định phiên tham gia đạo tràng')
  }
  return `guest:${visitorId}`
}

export function getMeditationStream({ user, visitorId }) {
  const actorKey = getMeditationActorKey({ user, visitorId })
  const now = Date.now()
  db.prepare('UPDATE meditation_presence SET last_seen_at = ? WHERE actor_key = ?')
    .run(now, actorKey)
  db.prepare('DELETE FROM meditation_presence WHERE last_seen_at < ?').run(now - 30_000)

  const comments = db.prepare(`
    SELECT id, actor_key, author, text, created_at
    FROM meditation_comments
    ORDER BY id DESC
    LIMIT 30
  `).all().map((comment) => ({
    id: comment.id,
    author: comment.author,
    text: comment.text,
    createdAt: comment.created_at,
    isCurrentUser: comment.actor_key === actorKey,
  }))

  const participants = db.prepare(`
    SELECT actor_key, author, last_comment, last_comment_at
    FROM meditation_presence
    WHERE last_seen_at >= ?
    ORDER BY last_comment_at DESC
    LIMIT ?
  `).all(now - 30_000, TOTAL_MEDITATION_SEATS).map((participant) => ({
    author: participant.author,
    lastComment: participant.last_comment,
    lastCommentAt: participant.last_comment_at,
    isCurrentUser: participant.actor_key === actorKey,
  }))

  return { comments, participants }
}

const TOTAL_MEDITATION_SEATS = 16

export function postMeditationComment({ user, visitorId, name, text }) {
  const actorKey = getMeditationActorKey({ user, visitorId })
  const cleanText = typeof text === 'string' ? text.trim() : ''
  if (!cleanText || cleanText.length > 280) {
    throw new Error('Bình luận phải có từ 1 đến 280 ký tự')
  }
  const cleanName = typeof name === 'string'
    ? Array.from(name)
      .filter((character) => {
        const code = character.codePointAt(0)
        return code >= 32 && code !== 127
      })
      .join('')
      .trim()
    : ''
  const author = (cleanName || user?.dharmaName || user?.username || 'Phật tử').slice(0, 40)
  const now = Date.now()
  const previous = db.prepare(`
    SELECT last_comment_at FROM meditation_presence
    WHERE actor_key = ?
  `).get(actorKey)
  if (previous && now - previous.last_comment_at < 3_000) {
    throw new Error('Vui lòng đợi vài giây trước khi bình luận tiếp')
  }

  db.prepare(`
    INSERT INTO meditation_comments (actor_key, author, text, created_at)
    VALUES (?, ?, ?, ?)
  `).run(actorKey, author, cleanText, now)
  db.prepare(`
    INSERT INTO meditation_presence (actor_key, author, last_comment, last_comment_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(actor_key) DO UPDATE SET
      author = excluded.author,
      last_comment = excluded.last_comment,
      last_comment_at = excluded.last_comment_at,
      last_seen_at = excluded.last_seen_at
  `).run(actorKey, author, cleanText, now, now)
  db.prepare(`
    DELETE FROM meditation_comments
    WHERE id NOT IN (SELECT id FROM meditation_comments ORDER BY id DESC LIMIT 500)
  `).run()

  return getMeditationStream({ user, visitorId })
}

// Tạo tài khoản mới
export function registerUser({ username, password, dharmaName, fullName, email, adminSetupKey }) {
  const cleanUsername = username.trim().toLowerCase()
  const cleanEmail = normalizeEmail(email)
  if (cleanUsername.length < 3) {
    throw new Error('Tên đăng nhập phải có ít nhất 3 ký tự')
  }
  if (!password || password.length < 4) {
    throw new Error('Mật khẩu phải có ít nhất 4 ký tự')
  }

  // Kiểm tra tên đăng nhập đã tồn tại chưa
  const check = db.prepare('SELECT * FROM users WHERE username = ?')
  const existing = check.get(cleanUsername)
  if (existing) {
    if (
      existing.email_required &&
      !existing.email_verified &&
      existing.email === cleanEmail &&
      hashPassword(password, existing.salt) === existing.password_hash
    ) {
      return {
        user: { id: existing.id, username: existing.username, email: existing.email },
        verificationRequired: true,
      }
    }
    throw new Error('Tên đăng nhập này đã được sử dụng')
  }

  const emailOwner = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail)
  if (emailOwner) {
    throw new Error('Email này đã được liên kết với một tài khoản khác')
  }

  if (cleanUsername === adminUsername) {
    const expectedKey = process.env.PAGODA_ADMIN_SETUP_KEY || ''
    const providedKey = typeof adminSetupKey === 'string' ? adminSetupKey : ''
    const expectedBuffer = Buffer.from(expectedKey)
    const providedBuffer = Buffer.from(providedKey)
    if (expectedBuffer.length < 32) {
      throw new Error('Máy chủ chưa cấu hình khóa thiết lập admin đủ mạnh')
    }
    if (
      expectedBuffer.length !== providedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      throw new Error('Mã thiết lập admin không chính xác')
    }
  }

  const salt = crypto.randomBytes(16).toString('hex')
  const passwordHash = hashPassword(password, salt)
  const cleanDharma = (dharmaName && dharmaName.trim()) || 'Phật tử'
  const cleanFull = (fullName && fullName.trim()) || cleanDharma

  const insert = db.prepare(`
    INSERT INTO users (
      username, password_hash, salt, email, email_verified, email_required, dharma_name, full_name
    ) VALUES (?, ?, ?, ?, 0, 1, ?, ?)
  `)
  const result = insert.run(cleanUsername, passwordHash, salt, cleanEmail, cleanDharma, cleanFull)
  const userId = Number(result.lastInsertRowid)

  return {
    user: {
      id: userId,
      username: cleanUsername,
      dharmaName: cleanDharma,
      fullName: cleanFull,
      email: cleanEmail,
      emailVerified: false,
      accountStatus: 'active',
    },
    verificationRequired: true,
  }
}

// Đăng nhập
export function loginUser({ username, password }) {
  const cleanUsername = username.trim().toLowerCase()
  const query = db.prepare('SELECT * FROM users WHERE username = ?')
  let user = query.get(cleanUsername)

  if (!user) {
    throw new Error('Tên đăng nhập hoặc mật khẩu không chính xác')
  }

  const checkHash = hashPassword(password, user.salt)
  if (checkHash !== user.password_hash) {
    throw new Error('Tên đăng nhập hoặc mật khẩu không chính xác')
  }

  if (user.email_required && !user.email_verified) {
    throw new Error('Email chưa được xác minh. Hãy hoàn tất xác minh email để đăng nhập.')
  }

  user = refreshRestriction(user)
  if (user.account_status === 'banned') {
    throw new Error('Tài khoản đã bị quản trị viên ban vĩnh viễn')
  }

  return {
    user: publicUser(user),
    token: createSession(user.id),
  }
}

// Xác thực session token
export function getUserByToken(token) {
  if (!token) return null
  const query = db.prepare(`
    SELECT
      u.id, u.username, u.dharma_name, u.full_name, u.created_at,
      u.account_status, u.restriction_until, u.status_reason,
      u.email, u.email_verified, u.email_required
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ?
  `)
  let row = query.get(token)
  if (!row) return null
  row = refreshRestriction(row)
  if (row.account_status === 'banned') return null
  return { ...publicUser(row), createdAt: row.created_at }
}

// Đăng xuất
export function logoutToken(token) {
  if (!token) return
  const del = db.prepare('DELETE FROM sessions WHERE token = ?')
  del.run(token)
}

// Lấy toàn bộ dữ liệu để người dùng trực tiếp theo dõi database
export function getManagedUsers() {
  const rows = db.prepare(`
    SELECT id, username, dharma_name, created_at, account_status, restriction_until, status_reason
    FROM users
    WHERE lower(username) != ?
    ORDER BY id DESC
  `).all(adminUsername)

  return rows.map((row) => {
    const user = refreshRestriction(row)
    return {
      id: user.id,
      username: user.username,
      dharmaName: user.dharma_name,
      createdAt: user.created_at,
      accountStatus: user.account_status,
      restrictionUntil: user.restriction_until,
      statusReason: user.status_reason,
    }
  })
}

export function updateUserModeration({ userId, status, duration, reason }) {
  const id = Number(userId)
  if (!Number.isInteger(id) || id < 1) {
    throw new Error('Tài khoản không hợp lệ')
  }

  const target = db.prepare('SELECT id, username FROM users WHERE id = ?').get(id)
  if (!target) {
    throw new Error('Không tìm thấy tài khoản')
  }
  if (isAdminUser(target)) {
    throw new Error('Không thể thay đổi trạng thái tài khoản quản trị')
  }

  let restrictionUntil = null
  if (status === 'restricted') {
    if (duration !== 'indefinite') {
      const durationMinutes = Number(duration)
      const permittedDurations = new Set([60, 1440, 10080, 43200])
      if (!permittedDurations.has(durationMinutes)) {
        throw new Error('Thời hạn hạn chế không hợp lệ')
      }
      restrictionUntil = Date.now() + durationMinutes * 60 * 1000
    }
  } else if (status !== 'active' && status !== 'banned') {
    throw new Error('Trạng thái tài khoản không hợp lệ')
  }

  const cleanReason = typeof reason === 'string' ? reason.trim().slice(0, 500) : ''
  db.prepare(`
    UPDATE users
    SET account_status = ?, restriction_until = ?, status_reason = ?
    WHERE id = ?
  `).run(status, restrictionUntil, status === 'active' ? null : cleanReason || null, id)

  if (status === 'banned') {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id)
  }

  return getManagedUsers().find((user) => user.id === id)
}

export function getDanaMeritSummary(userId) {
  const id = Number(userId)
  if (!Number.isInteger(id) || id < 1) {
    throw new Error('Tài khoản không hợp lệ')
  }
  const row = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM dana_records
    WHERE user_id = ?
  `).get(id)
  const total = Number(row.total)
  let achievedRankIndex = -1
  for (let index = 0; index < danaRanks.length; index += 1) {
    if (total >= danaRanks[index].threshold) achievedRankIndex = index
  }

  const nextRank = danaRanks[achievedRankIndex + 1] || null
  const lowerThreshold = achievedRankIndex >= 0
    ? danaRanks[achievedRankIndex].threshold
    : 0
  const progress = nextRank
    ? Math.min(100, Math.floor(
      ((total - lowerThreshold) / (nextRank.threshold - lowerThreshold)) * 100
    ))
    : 100

  return {
    total,
    rank: achievedRankIndex >= 0 ? danaRanks[achievedRankIndex].rank : 'Phật tử phát tâm',
    nextRank: nextRank?.rank || null,
    nextThreshold: nextRank?.threshold || null,
    progress,
    levels: danaRanks,
  }
}

export function createDanaRecord({ userId, name, intent, amount, note }) {
  if (
    amount !== undefined && amount !== null &&
    typeof amount !== 'string' && typeof amount !== 'number'
  ) {
    throw new Error('Số tiền công đức không hợp lệ')
  }
  const rawAmount = typeof amount === 'string' ? amount.trim() : amount
  const cleanAmount = rawAmount === '' || rawAmount === undefined || rawAmount === null
    ? 0
    : Number(rawAmount)
  if (!Number.isSafeInteger(cleanAmount) || cleanAmount < 0) {
    throw new Error('Số tiền công đức phải là số nguyên không âm')
  }

  const result = db.prepare(
    'INSERT INTO dana_records (user_id, name, intent, amount, note) VALUES (?, ?, ?, ?, ?)'
  ).run(
    userId || null,
    name || 'Phật tử',
    intent || 'tuy-duyen',
    cleanAmount,
    note || ''
  )
  return Number(result.lastInsertRowid)
}

function getActivitySummary(totalMs) {
  const totalSeconds = Math.floor(totalMs / 1000)
  let achievedLevelIndex = -1
  for (let index = 0; index < activityRanks.length; index += 1) {
    if (totalSeconds >= activityRanks[index].thresholdSeconds) achievedLevelIndex = index
  }

  const nextLevel = activityRanks[achievedLevelIndex + 1] || null
  const lowerThreshold = achievedLevelIndex >= 0
    ? activityRanks[achievedLevelIndex].thresholdSeconds
    : 0
  const progress = nextLevel
    ? Math.min(100, Math.floor(
      ((totalSeconds - lowerThreshold) / (nextLevel.thresholdSeconds - lowerThreshold)) * 100
    ))
    : 100

  return {
    totalSeconds,
    level: achievedLevelIndex >= 0 ? activityRanks[achievedLevelIndex].rank : 'Chưa đạt cấp',
    levelIndex: achievedLevelIndex + 1,
    nextLevel: nextLevel?.rank || null,
    nextThresholdSeconds: nextLevel?.thresholdSeconds || null,
    progress,
  }
}

export function recordMeditationActivityHeartbeat(userId) {
  const id = Number(userId)
  if (!Number.isInteger(id) || id < 1) {
    throw new Error('Tài khoản không hợp lệ')
  }

  const now = Date.now()
  const previousPresence = db.prepare(`
    SELECT last_seen_at FROM meditation_activity_presence WHERE user_id = ?
  `).get(id)
  const previousTotal = db.prepare(`
    SELECT total_ms FROM meditation_activity_totals WHERE user_id = ?
  `).get(id)
  const previousTotalMs = Number(previousTotal?.total_ms || 0)
  const gap = previousPresence ? now - previousPresence.last_seen_at : 0
  const elapsedMs = gap > 0 && gap <= MAX_ACTIVITY_HEARTBEAT_GAP_MS ? gap : 0

  db.prepare(`
    INSERT INTO meditation_activity_presence (user_id, last_seen_at)
    VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET last_seen_at = excluded.last_seen_at
  `).run(id, now)
  db.prepare(`
    INSERT INTO meditation_activity_totals (user_id, total_ms)
    VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET total_ms = total_ms + excluded.total_ms
  `).run(id, elapsedMs)

  const totalMs = previousTotalMs + elapsedMs
  const summary = getActivitySummary(totalMs)
  const levelUps = activityRanks
    .filter((level) => (
      previousTotalMs < level.thresholdSeconds * 1000
      && totalMs >= level.thresholdSeconds * 1000
    ))
    .map((level) => level.rank)
  return { summary, levelUps }
}

export function getManagedMeditationActivity() {
  return db.prepare(`
    SELECT
      u.id,
      u.username,
      u.dharma_name AS dharmaName,
      COALESCE(a.total_ms, 0) AS totalMs
    FROM users u
    LEFT JOIN meditation_activity_totals a ON a.user_id = u.id
    ORDER BY totalMs DESC, u.id
  `).all().map((row) => ({
    id: row.id,
    username: row.username,
    dharmaName: row.dharmaName,
    ...getActivitySummary(Number(row.totalMs)),
  }))
}

