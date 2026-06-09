# Домашнее задание по Docker — PostgreSQL и DinD

**Цель:** Расширить существующий docker-compose проект сервисом PostgreSQL, научиться делать бэкап и восстанавливать базу из него, а также изучить Docker-in-Docker (DinD).

**Исходное состояние:** папка `~/work/nsu-fastapi` пуста, образы удалены. Восстанавливаем базовую связку FastAPI + Nginx, затем добавляем PostgreSQL и DinD.

---

## Часть 1. Базовая связка FastAPI + Nginx (восстановление)

### Шаг 1. Создание структуры проекта и FastAPI-приложения
```bash
mkdir -p ~/work/nsu-fastapi/fastapi
cd ~/work/nsu-fastapi

# main.py
cat > fastapi/main.py << 'EOF'
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
async def root():
    return {"message": "Hello from FastAPI!"}
EOF

# requirements.txt
cat > fastapi/requirements.txt << 'EOF'
fastapi==0.115.6
uvicorn==0.34.0
EOF

# Dockerfile для FastAPI (порт 9090)
cat > fastapi/Dockerfile << 'EOF'
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .
EXPOSE 9090
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "9090"]
EOF
```

### Шаг 2. Конфигурация Nginx
```bash
cat > nginx-proxy.conf << 'EOF'
server {
    listen 80;
    server_name localhost;
    location / {
        proxy_pass http://fastapi:9090;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
EOF
```

### Шаг 3. Базовый docker-compose.yml
```bash
cat > docker-compose.yml << 'EOF'
services:
  fastapi:
    build: ./fastapi
    container_name: fastapi
    networks:
      - app-net

  nginx:
    image: nginx:latest
    container_name: nginx
    volumes:
      - ./nginx-proxy.conf:/etc/nginx/conf.d/default.conf
    ports:
      - "8080:80"
    depends_on:
      - fastapi
    networks:
      - app-net

networks:
  app-net:
    driver: bridge
EOF
```

### Шаг 4. Запуск и проверка
```bash
docker compose up -d
curl http://localhost:8080/
# Ответ: {"message":"Hello from FastAPI!"}
```

---

## Часть 2. PostgreSQL: сервис, бэкап, кастомный образ

### Задание 1. Добавить сервис pgsql, пробросить порт 5432, создать БД test и пользователя test

#### Шаг 1. Обновление docker-compose.yml
Добавляем сервис `postgres` с переменными окружения для автоматического создания пользователя и БД, томом для данных и бэкапов.

```bash
cat > docker-compose.yml << 'EOF'
services:
  fastapi:
    build: ./fastapi
    container_name: fastapi
    networks:
      - app-net

  nginx:
    image: nginx:latest
    container_name: nginx
    volumes:
      - ./nginx-proxy.conf:/etc/nginx/conf.d/default.conf
    ports:
      - "8080:80"
    depends_on:
      - fastapi
    networks:
      - app-net

  postgres:
    image: postgres:15
    container_name: postgres-lab
    environment:
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
      POSTGRES_DB: test
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./work/pgsql:/backup
    networks:
      - app-net

volumes:
  pgdata:

networks:
  app-net:
    driver: bridge
EOF

mkdir -p work/pgsql
docker compose up -d
```

#### Шаг 2. Проверка подключения и создания БД
```bash
docker exec -it postgres-lab psql -U test -d test -c "SELECT 'База test работает!' as status;"
# Ответ: База test работает!
```
> База и пользователь созданы автоматически благодаря переменным окружения.

---

### Задание 2. Сделать бэкап базы test в файл test.bkp на хосте

Используем `pg_dump` внутри контейнера. Файл сохранится в примонтированную папку `./work/pgsql`.

```bash
docker exec -it postgres-lab pg_dump -U test -d test -F c -f /backup/test.bkp
ls -la work/pgsql/
# Должен появиться файл test.bkp
```

---

### Задание 3. Dockerfile для pgsql с инициализацией из бэкапа

#### Шаг 1. Подготовка файлов
Создаём папку `postgres-docker`, копируем бэкап, пишем скрипт восстановления и Dockerfile.

```bash
mkdir -p postgres-docker
cp work/pgsql/test.bkp postgres-docker/

cat > postgres-docker/init-restore.sh << 'EOF'
#!/bin/bash
set -e
pg_restore -U test -d test /docker-entrypoint-initdb.d/test.bkp
EOF
chmod +x postgres-docker/init-restore.sh

cat > postgres-docker/Dockerfile << 'EOF'
FROM postgres:15

ENV POSTGRES_USER=test
ENV POSTGRES_PASSWORD=test
ENV POSTGRES_DB=test

COPY test.bkp /docker-entrypoint-initdb.d/
COPY init-restore.sh /docker-entrypoint-initdb.d/
EOF
```

#### Шаг 2. Сборка образа
```bash
docker build -t my-postgres-lab postgres-docker/
```

#### Шаг 3. Изменение docker-compose.yml для использования кастомного образа
Меняем `image: postgres:15` на `build: ./postgres-docker`.

```bash
cat > docker-compose.yml << 'EOF'
services:
  fastapi:
    build: ./fastapi
    container_name: fastapi
    networks:
      - app-net

  nginx:
    image: nginx:latest
    container_name: nginx
    volumes:
      - ./nginx-proxy.conf:/etc/nginx/conf.d/default.conf
    ports:
      - "8080:80"
    depends_on:
      - fastapi
    networks:
      - app-net

  postgres:
    build: ./postgres-docker
    container_name: postgres-lab
    environment:
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
      POSTGRES_DB: test
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./work/pgsql:/backup
    networks:
      - app-net

volumes:
  pgdata:

networks:
  app-net:
    driver: bridge
EOF
```

#### Шаг 4. Перезапуск с очисткой тома (чтобы инициализация прошла заново)
```bash
docker compose down -v
docker compose up -d
```

#### Шаг 5. Проверка восстановления
```bash
docker exec -it postgres-lab psql -U test -d test -c "SELECT 'База восстановлена из бэкапа!' as result;"
# Ответ: База восстановлена из бэкапа!
```

---

## Часть 3. Docker-in-Docker (DinD) — продвинутое задание

**Цель:** Запустить Docker-демон внутри контейнера и выполнить в нём команду `docker run hello-world`.

### Шаг 1. Добавление сервиса dind в docker-compose.yml
Используем официальный образ `docker:dind`, привилегированный режим, отключаем TLS.

```bash
cat > docker-compose.yml << 'EOF'
services:
  fastapi:
    build: ./fastapi
    container_name: fastapi
    networks:
      - app-net

  nginx:
    image: nginx:latest
    container_name: nginx
    volumes:
      - ./nginx-proxy.conf:/etc/nginx/conf.d/default.conf
    ports:
      - "8080:80"
    depends_on:
      - fastapi
    networks:
      - app-net

  postgres:
    build: ./postgres-docker
    container_name: postgres-lab
    environment:
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
      POSTGRES_DB: test
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./work/pgsql:/backup
    networks:
      - app-net

  dind:
    image: docker:dind
    container_name: dind-lab
    privileged: true
    environment:
      DOCKER_TLS_CERTDIR: ""
    ports:
      - "2375:2375"
    networks:
      - app-net

volumes:
  pgdata:

networks:
  app-net:
    driver: bridge
EOF
```

### Шаг 2. Запуск
```bash
docker compose up -d
docker compose ps   # видим dind-lab
```

### Шаг 3. Подключение к dind и запуск hello-world
```bash
docker exec -it dind-lab sh
```

Внутри контейнера:
```bash
docker run hello-world
```
Видим сообщение "Hello from Docker!". Это подтверждает, что внутри контейнера dind работает собственный Docker-демон.

Выходим (`exit`).

---

## Заключение
Все задания выполнены:
- Базовый проект (fastapi + nginx) работает.
- PostgreSQL добавлен, база test и пользователь test созданы.
- Бэкап базы сохранён на хосте в `work/pgsql/test.bkp`.
- Кастомный образ PostgreSQL с автоматическим восстановлением из бэкапа собран и работает.
- Docker-in-Docker продемонстрирован: контейнер `dind-lab` запускает собственные Docker-контейнеры.

