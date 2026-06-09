const axios = require('axios');
const API_URL = 'http://localhost:3000/users';

const initialUsers = [
  { id: "1", name: "Anna Ivanova", email: "annaivanova@example.com" },
  { id: "2", name: "Pavel Petrov", email: "pavelpetrov@example.com" }
];

describe('Тестирование API', () => {
    beforeEach(async () => {
        // Сброс данных к исходному состоянию через запросы к серверу
        // 1. Получаем текущих пользователей
        const { data: currentUsers } = await axios.get(API_URL);
        // 2. Удаляем каждого
        for (const user of currentUsers) {
            await axios.delete(`${API_URL}/${user.id}`);
        }
        // 3. Добавляем исходных Анну и Павла
        for (const user of initialUsers) {
            await axios.post(API_URL, user);
        }
    });

    it('должен возвращать список пользователей', async () => {
        const response = await axios.get(API_URL);
        expect(response.status).toBe(200);
        // Сравниваем только имена и email, потому что id назначает сервер
        const simplified = response.data.map(({ name, email }) => ({ name, email }));
        expect(simplified).toEqual(initialUsers.map(({ name, email }) => ({ name, email })));
    });

    it('должен возвращать пользователя по ID', async () => {
        const { data: users } = await axios.get(API_URL);
        const firstUser = users[0];
        const response = await axios.get(`${API_URL}/${firstUser.id}`);
        expect(response.status).toBe(200);
        expect(response.data).toMatchObject({ name: 'Anna Ivanova', email: 'annaivanova@example.com' });
    });

    it('должен создавать нового пользователя', async () => {
        const newUser = { name: 'Alice Timofeeva', email: 'alicetimofeeva@example.com' };
        const response = await axios.post(API_URL, newUser);
        expect(response.status).toBe(201);
        expect(response.data).toMatchObject(newUser);
    });

    it('должен возвращать ошибку 404 при удалении несуществующего пользователя', async () => {
        const nonExistentId = '999';
        try {
            await axios.delete(`${API_URL}/${nonExistentId}`);
            throw new Error('Запрос должен был завершиться ошибкой 404');
        } catch (error) {
            expect(error.response.status).toBe(404);
        }
    });
});
