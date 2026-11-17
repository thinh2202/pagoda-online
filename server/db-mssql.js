import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

// Đọc cấu hình từ file server/mssql-config.json
const configPath = path.resolve('server', 'mssql-config.json')
let mssqlConfig = {
  user: 'sa',
  password: 'mat_khau_cua_ban',
  server: 'localhost',
  database: 'PagodaDB',
  port: 1433,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
}

if (fs.existsSync(configPath)) {
  try {
    mssqlConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  } catch {}
}

let poolPromise = null

// Hàm kết nối SQL Server
export async function getSqlPool() {
  if (!poolPromise) {
    try {
      const sql = await import('mssql')
      poolPromise = new sql.default.ConnectionPool(mssqlConfig)
        .connect()
        .then((pool) => {
          console.log('✅ Đã kết nối thành công tới Microsoft SQL Server (PagodaDB)!')
          return pool
        })
        .catch((err) => {
          console.error('❌ Lỗi kết nối SQL Server:', err.message)
          poolPromise = null
          throw err
        })
    } catch (e) {
      console.error('Chưa cài thư viện mssql. Hãy chạy: npm install mssql')
      throw e
    }
  }
  return poolPromise
}

// Mã hóa mật khẩu an toàn
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex')
}

// Đăng ký tài khoản trên SQL Server
export async function registerUserMssql({ username, password, dharmaName, fullName }) {
  const pool = await getSqlPool()
  const cleanUsername = username.trim().toLowerCase()
  const cleanDharma = (dharmaName && dharmaName.trim()) || 'Phật tử'
  const cleanFull = (fullName && fullName.trim()) || cleanDharma

  // Kiểm tra trùng lặp
  const check = await pool
    .request()
    .input('username', cleanUsername)
    .query('SELECT id FROM users WHERE username = @username')

  if (check.recordset.length > 0) {
    throw new Error('Tên đăng nhập này đã được sử dụng trên SQL Server')
  }

  const salt = crypto.randomBytes(16).toString('hex')
  const passwordHash = hashPassword(password, salt)

  // Thêm tài khoản mới
  const result = await pool
    .request()
    .input('username', cleanUsername)
    .input('password_hash', passwordHash)
    .input('salt', salt)
    .input('dharma_name', cleanDharma)
    .input('full_name', cleanFull)
    .query(`
      INSERT INTO users (username, password_hash, salt, dharma_name, full_name)
      OUTPUT INSERTED.id
      VALUES (@username, @password_hash, @salt, @dharma_name, @full_name)
    `)

  const userId = result.recordset[0].id
  const token = crypto.randomBytes(32).toString('hex')

  // Tạo phiên đăng nhập
  await pool
    .request()
    .input('token', token)
    .input('user_id', userId)
    .query('INSERT INTO sessions (token, user_id) VALUES (@token, @user_id)')

  return {
    user: {
      id: userId,
      username: cleanUsername,
      dharmaName: cleanDharma,
      fullName: cleanFull,
    },
    token,
  }
}

// Đăng nhập trên SQL Server
export async function loginUserMssql({ username, password }) {
  const pool = await getSqlPool()
  const cleanUsername = username.trim().toLowerCase()

  const result = await pool
    .request()
    .input('username', cleanUsername)
    .query('SELECT * FROM users WHERE username = @username')

  if (result.recordset.length === 0) {
    throw new Error('Tên đăng nhập hoặc mật khẩu không chính xác')
  }

  const user = result.recordset[0]
  const checkHash = hashPassword(password, user.salt)
  if (checkHash !== user.password_hash) {
    throw new Error('Tên đăng nhập hoặc mật khẩu không chính xác')
  }

  const token = crypto.randomBytes(32).toString('hex')
  await pool
    .request()
    .input('token', token)
    .input('user_id', user.id)
    .query('INSERT INTO sessions (token, user_id) VALUES (@token, @user_id)')

  return {
    user: {
      id: user.id,
      username: user.username,
      dharmaName: user.dharma_name,
      fullName: user.full_name,
    },
    token,
  }
}

// Lấy thông tin user bằng token
export async function getUserByTokenMssql(token) {
  if (!token) return null
  try {
    const pool = await getSqlPool()
    const result = await pool
      .request()
      .input('token', token)
      .query(`
        SELECT u.id, u.username, u.dharma_name, u.full_name, u.created_at
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = @token
      `)

    if (result.recordset.length === 0) return null
    const row = result.recordset[0]
    return {
      id: row.id,
      username: row.username,
      dharmaName: row.dharma_name,
      fullName: row.full_name,
      createdAt: row.created_at,
    }
  } catch {
    return null
  }
}

// Đăng xuất
export async function logoutTokenMssql(token) {
  if (!token) return
  try {
    const pool = await getSqlPool()
    await pool.request().input('token', token).query('DELETE FROM sessions WHERE token = @token')
  } catch {}
}

