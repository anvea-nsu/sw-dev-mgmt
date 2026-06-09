# Лабораторная работа: Docker (Часть 2) — Docker Compose

**Цель:** Изучить углублённую работу с Docker: настройка демона (bip, registry-mirrors), работа с BusyBox и Alpine (сетевые утилиты), связка Nginx + FastAPI через пользовательскую сеть и автоматизация запуска с помощью Docker Compose.

**Окружение:** macOS с Docker Desktop 4.62.0 (Engine 29.2.1).  
**Рабочая директория:** `~/work/nsu-fastapi`.  
**Важно:** Основной контейнер `ubuntu` (из предыдущих работ) не затрагивается.

---

## Шаг 1. Настройка демона Docker (bip и registry-mirrors)

Открываем Docker Desktop → Settings → Docker Engine.  
Добавляем параметры `bip` (подсеть для моста) и `registry-mirrors` (зеркало реестра). Полный конфиг:

```json
{
  "debug": true,
  "hosts": [
    "unix:///var/run/docker.sock",
    "tcp://0.0.0.0:2375"
  ],
  "bip": "10.0.0.1/16",
  "registry-mirrors": ["https://mirror.gcr.io"]
}
```

Нажимаем **Apply & Restart**, ждём перезапуска Docker Desktop.

Проверяем применение настроек:

```bash
docker info | grep -A1 "Server Version"
docker network inspect bridge | grep -A2 "IPAM"
```

В выводе `docker network inspect bridge` должна появиться подсеть `10.0.0.0/16`.

---

## Шаг 2. Очистка контейнеров и папок от первой части

Удаляем контейнеры и директорию `~/nginx-ssl`, оставшиеся после первой лабораторной работы.

```bash
docker stop nginx-proxy fastapi 2>/dev/null
docker rm nginx-proxy fastapi 2>/dev/null
rm -rf ~/nginx-ssl
```

---

## Шаг 3. Создание рабочей директории

Создаём структуру `~/work/nsu-fastapi` для второй части.

```bash
mkdir -p ~/work/nsu-fastapi && cd ~/work/nsu-fastapi
```

---

## Шаг 4. Работа с BusyBox

Запускаем контейнер BusyBox в фоне и заходим внутрь.

```bash
docker run -d --name busybox-lab busybox sleep 3600
docker exec -it busybox-lab sh
```

Внутри контейнера:

```bash
whoami              # root
hostname -i         # получаем IP-адрес (10.0.0.2)
ip addr             # альтернативный просмотр
exit                # выход
```

---

## Шаг 5. Работа с Alpine (ping, nslookup)

Запускаем контейнер Alpine, входим, устанавливаем сетевые утилиты и тестируем связь с BusyBox.

```bash
docker run -d --name alpine-lab alpine sleep 3600
docker exec -it alpine-lab sh
```

Внутри Alpine:

```bash
apk update && apk add iputils bind-tools
ping -c 2 10.0.0.2        # IP busybox
nslookup example.com
exit
```

Проверяем, что ping проходит без потерь, а nslookup разрешает имя.

---

## Шаг 6. Создание структуры проекта и статической HTML-страницы

В `~/work/nsu-fastapi` создаём папки `html` и `fastapi`. Формируем `html/index.html`.

```bash
mkdir -p html fastapi

cat > html/index.html << 'EOF'
<!DOCTYPE html>
<html>
<head><title>Docker Lab</title></head>
<body>
<h1>Hello from Nginx inside Docker!</h1>
<p>This is a static page served by Nginx.</p>
</body>
</html>
EOF
```

Проверяем:

```bash
ls -R
```

---

## Шаг 7. Запуск Nginx с HTML

Запускаем Nginx, монтируя нашу папку `html` в `/usr/share/nginx/html`, пробросив порт `8080`.

```bash
docker run -d --name nginx-lab -v $(pwd)/html:/usr/share/nginx/html -p 8080:80 nginx
docker ps --filter "name=nginx-lab"
```

Открываем [http://localhost:8080](http://localhost:8080) — видим «Hello from Nginx inside Docker!».

---

## Шаг 8. Создание FastAPI-приложения

Переходим в папку `fastapi` и создаём три файла: `main.py`, `requirements.txt`, `Dockerfile`.

```bash
cd ~/work/nsu-fastapi/fastapi

cat > main.py << 'EOF'
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
async def root():
    return {"message": "Hello from FastAPI (part 2)!"}

@app.get("/health")
async def health():
    return {"status": "ok"}
EOF

echo "fastapi==0.115.6" > requirements.txt
echo "uvicorn==0.34.0" >> requirements.txt

cat > Dockerfile << 'EOF'
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

EXPOSE 9090

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "9090"]
EOF

ls -la
```

Собираем образ:

```bash
docker build -t fastapi-lab .
```

---

## Шаг 9. Проверка FastAPI (одиночный запуск)

Запускаем контейнер, проверяем работоспособность и останавливаем (позже запустим в связке).

```bash
docker run -d --name fastapi-lab -p 9090:9090 -v $(pwd):/app fastapi-lab
curl http://localhost:9090/
# Ответ: {"message":"Hello from FastAPI (part 2)!"}

docker stop fastapi-lab && docker rm fastapi-lab
```

---

## Шаг 10. Ручная связка Nginx + FastAPI через сеть

Возвращаемся в корень `~/work/nsu-fastapi`. Создаём прокси-конфиг для Nginx и отдельную сеть.

```bash
cd ~/work/nsu-fastapi

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

Останавливаем старый `nginx-lab`, создаём сеть `lab-net` и запускаем оба контейнера в этой сети.

```bash
docker stop nginx-lab && docker rm nginx-lab
docker network create lab-net

docker run -d --name fastapi-lab --network lab-net -v $(pwd)/fastapi:/app fastapi-lab
docker run -d --name nginx-proxy --network lab-net \
  -v $(pwd)/nginx-proxy.conf:/etc/nginx/conf.d/default.conf \
  -p 8080:80 \
  nginx
```

Проверяем и тестируем:

```bash
docker ps --filter "network=lab-net"
curl http://localhost:8080/
# Ответ: {"message":"Hello from FastAPI (part 2)!"}
```

---

## Шаг 11. Docker Compose

Очищаем ручную связку:

```bash
docker stop nginx-proxy fastapi-lab && docker rm nginx-proxy fastapi-lab
docker network rm lab-net
```

Создаём файл `docker-compose.yml` в корне проекта:

```yaml
version: '3.8'

services:
  fastapi:
    build: ./fastapi
    container_name: fastapi-compose
    volumes:
      - ./fastapi:/app
    networks:
      - app-net

  nginx:
    image: nginx:latest
    container_name: nginx-compose
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
```

Запускаем Compose:

```bash
docker compose up -d
docker compose ps
```

Видим оба сервиса: `fastapi-compose` (порт 9090) и `nginx-compose` (порт 8080).  
Финальный тест:

```bash
curl http://localhost:8080/
# Ответ: {"message":"Hello from FastAPI (part 2)!"}
```

---

## Шаг 12. Очистка (опционально)

Если нужно удалить все созданные во второй части ресурсы:

```bash
# Останавливаем и удаляем контейнеры Compose
cd ~/work/nsu-fastapi
docker compose down

# Удаляем все созданные контейнеры (если остались)
docker rm -f busybox-lab alpine-lab 2>/dev/null

# Удаляем образы (опционально)
docker rmi fastapi-lab nsu-fastapi-fastapi nginx busybox alpine 2>/dev/null

# Удаляем рабочую папку
rm -rf ~/work/nsu-fastapi
```

Основной контейнер `ubuntu` остаётся нетронутым.

---

## Заключение

Мы изучили расширенную настройку демона Docker, работу с сетями, ручное связывание сервисов и автоматизацию с помощью Docker Compose. Лабораторная работа (часть 2) выполнена успешно.

