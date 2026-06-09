const Database = require('./db');

describe('Тестирование базы данных', () => {
    let db;

    beforeEach(() => {
        // Создаем экземпляр БД (без реального подключения)
        db = new Database();

        // Мокируем методы db
        db.db = {
            all: jest.fn(),
            get: jest.fn(),
            run: jest.fn(),
        };
    });

    it('должен возвращать список пользователей', async () => {
        // Мокируем метод all
        db.db.all.mockImplementation((query, callback) => {
            callback(null, [
                { id: 1, name: 'Anna Ivanova', email: 'annaivanova@example.com' },
                { id: 2, name: 'Pavel Petrov', email: 'pavelpetrov@example.com' }
            ]);
        });

        const users = await db.getAllUsers();
        expect(users).toEqual([
            { id: 1, name: 'Anna Ivanova', email: 'annaivanova@example.com' },
            { id: 2, name: 'Pavel Petrov', email: 'pavelpetrov@example.com' }
        ]);
        expect(db.db.all).toHaveBeenCalledWith('SELECT * FROM users', expect.any(Function));
    });

    it('должен возвращать пользователя по ID', async () => {
        // Мокируем метод get
        db.db.get.mockImplementation((query, params, callback) => {
            callback(null, { id: 1, name: 'Anna Ivanova', email: 'annaivanova@example.com' });
        });

        const user = await db.getUserById(1);
        expect(user).toEqual({ id: 1, name: 'Anna Ivanova', email: 'annaivanova@example.com' });
        expect(db.db.get).toHaveBeenCalledWith(
            'SELECT * FROM users WHERE id = ?',
            [1],
            expect.any(Function)
        );
    });

    it('должен удалять пользователя по ID', async () => {
        // Мокируем метод run
        db.db.run.mockImplementation((query, params, callback) => {
            callback(null); // Успешное выполнение запроса
        });

        const result = await db.deleteUser(1);
        expect(result).toEqual({ deleted: true, id: 1 });
        expect(db.db.run).toHaveBeenCalledWith(
            'DELETE FROM users WHERE id = ?',
            [1],
            expect.any(Function)
        );
    });
});
