const sqlite3 = require('sqlite3').verbose();

class Database {
    constructor(dbPath = ':memory:') {
        this.db = new sqlite3.Database(dbPath);
        this.db.serialize(() => {
            this.db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                email TEXT
            )`);
        });
    }

    getAllUsers() {
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM users', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    getUserById(id) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM users WHERE id = ?', [id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    deleteUser(id) {
        return new Promise((resolve, reject) => {
            this.db.run('DELETE FROM users WHERE id = ?', [id], function(err) {
                if (err) reject(err);
                else resolve({ deleted: true, id });
            });
        });
    }
}

module.exports = Database;
