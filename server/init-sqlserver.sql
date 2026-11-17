-- ========================================================
-- SCRIPT TẠO DATABASE VÀ BẢNG CHO CHÙA TỪ QUANG TRÊN SQL SERVER
-- Bạn hãy copy toàn bộ đoạn này vào SQL Server Management Studio (SSMS)
-- và bấm nút "Execute" (F5) để chạy.
-- ========================================================

-- 1. Tạo Database
IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'PagodaDB')
BEGIN
    CREATE DATABASE PagodaDB;
END
GO

USE PagodaDB;
GO

-- 2. Tạo bảng lưu tài khoản Phật tử (users)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'users')
BEGIN
    CREATE TABLE users (
        id INT IDENTITY(1,1) PRIMARY KEY,
        username NVARCHAR(50) UNIQUE NOT NULL,
        password_hash NVARCHAR(255) NOT NULL,
        salt NVARCHAR(255) NOT NULL,
        dharma_name NVARCHAR(100),
        full_name NVARCHAR(100),
        created_at DATETIME DEFAULT GETDATE()
    );
END
GO

-- 3. Tạo bảng lưu phiên đăng nhập (sessions)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'sessions')
BEGIN
    CREATE TABLE sessions (
        token NVARCHAR(255) PRIMARY KEY,
        user_id INT NOT NULL,
        created_at DATETIME DEFAULT GETDATE(),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
END
GO

-- 4. Tạo bảng lưu sổ cầu an (prayers)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'prayers')
BEGIN
    CREATE TABLE prayers (
        id INT IDENTITY(1,1) PRIMARY KEY,
        user_id INT NULL,
        name NVARCHAR(100) NOT NULL,
        wish NVARCHAR(MAX) NOT NULL,
        created_at DATETIME DEFAULT GETDATE()
    );
END
GO

-- 5. Tạo bảng lưu sổ công đức (dana_records)
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'dana_records')
BEGIN
    CREATE TABLE dana_records (
        id INT IDENTITY(1,1) PRIMARY KEY,
        user_id INT NULL,
        name NVARCHAR(100),
        intent NVARCHAR(50),
        amount BIGINT DEFAULT 0,
        note NVARCHAR(MAX),
        created_at DATETIME DEFAULT GETDATE()
    );
END
GO

PRINT N'>>> Đã khởi tạo thành công Database PagodaDB trên SQL Server! <<<';

