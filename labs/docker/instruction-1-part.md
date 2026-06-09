# Лабораторная работа: Docker (Часть 1)

**Цель:** Изучить основы Docker: установка (проверка), работа с контейнерами, настройка демона, запуск Nginx с HTTPS, создание микросервиса на FastAPI и связка Nginx + FastAPI через `--link`.

**Окружение:** macOS с Docker Desktop 4.62.0 (Engine 29.2.1).  
**Важно:** Все команды выполняются в терминале macOS.

---

## Шаг 1. Проверка Docker

Проверяем, что клиент и демон Docker работают.

```bash
docker version
```

**Результат:** Вывод версий клиента и сервера, ошибок нет.

---

## Шаг 2. Первый тестовый контейнер (hello-world)

Запускаем образ `hello-world` для проверки работоспособности.

```bash
docker run hello-world
```

**Результат:** Сообщение "Hello from Docker!", подтверждающее корректную работу.

---

## Шаг 3. Удаление отработавшего контейнера

Контейнер `hello-world` остановился сразу после выполнения. Docker присвоил ему случайное имя (например, `nifty_wing`). Удаляем его.

```bash
docker ps -a                # видим остановленный контейнер
docker rm nifty_wing        # или по ID
```

---

## Шаг 4. Работа с BusyBox

Запускаем контейнер с образом `busybox` в фоновом режиме с командой `sleep 3600`.

```bash
docker run -d --name my-busybox busybox sleep 3600
docker ps                                 # проверяем, что контейнер работает
docker exec my-busybox echo "Hello from BusyBox!"   # выполняем команду внутри контейнера (осторожно с '!' в bash, используем одинарные кавычки)
```

Останавливаем и удаляем контейнер.

```bash
docker stop my-busybox
docker rm my-busybox
docker ps -a              # убеждаемся, что контейнера нет (кроме нашего основного ubuntu)
```

---

## Шаг 5. Настройка демона Docker (TCP API + debug)

На macOS настройки демона задаются через Docker Desktop → Settings → Docker Engine.  
Вставляем JSON, включающий debug и TCP API на порту 2375 (без шифрования).

```json
{
  "debug": true,
  "hosts": [
    "unix:///var/run/docker.sock",
    "tcp://0.0.0.0:2375"
  ]
}
```

Нажимаем **Apply & Restart**. Ждём перезапуска Docker Desktop.  
Проверяем, что демон слушает порт (в выводе `docker info` будет предупреждение о незащищённом API, это нормально).

```bash
docker info | grep -A1 "Server Version"
lsof -i :2375            # на macOS может не показывать, т.к. порт внутри виртуальной машины
```

---

## Шаг 6. Запуск Nginx с пробросом портов

Запускаем контейнер nginx с именем `nginx-test`, пробрасывая порт 8080 на хосте на порт 80 в контейнере.

```bash
docker run -d --name nginx-test -p 8080:80 nginx
docker ps --filter "name=nginx-test"
```

В браузере открываем [http://localhost:8080](http://localhost:8080) – видим "Welcome to nginx!".

---

## Шаг 7. Настройка HTTPS с самоподписанным сертификатом

Создаём папку для сертификатов и переходим в неё.

```bash
mkdir -p ~/nginx-ssl && cd ~/nginx-ssl
```

Генерируем самоподписанный сертификат и ключ.

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx.key -out nginx.crt \
  -subj "/C=RU/ST=Moscow/L=Moscow/O=Lab/OU=IT/CN=localhost"
```

Создаём файл конфигурации nginx для HTTPS.

```bash
cat > default.conf << 'EOF'
server {
    listen 443 ssl;
    server_name localhost;

    ssl_certificate     /etc/nginx/ssl/nginx.crt;
    ssl_certificate_key /etc/nginx/ssl/nginx.key;

    location / {
        root   /usr/share/nginx/html;
        index  index.html index.htm;
    }
}
EOF
```

Удаляем старый контейнер `nginx-test`.

```bash
docker stop nginx-test && docker rm nginx-test
```

Запускаем новый контейнер `nginx-ssl` с монтированием конфига и сертификатов, пробрасываем порт 8443 → 443.

```bash
docker run -d --name nginx-ssl \
  -v ~/nginx-ssl/default.conf:/etc/nginx/conf.d/default.conf \
  -v ~/nginx-ssl/nginx.crt:/etc/nginx/ssl/nginx.crt \
  -v ~/nginx-ssl/nginx.key:/etc/nginx/ssl/nginx.key \
  -p 8443:443 \
  nginx
```

Проверяем в браузере [https://localhost:8443](https://localhost:8443). Игнорируем предупреждение о сертификате – видим "Welcome to nginx!".

---

## Шаг 8. Микросервис на FastAPI

Создаём папку проекта и переходим в неё.

```bash
mkdir -p ~/fastapi-app && cd ~/fastapi-app
```

Пишем файл `main.py` с двумя эндпоинтами.

```python
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
async def root():
    return {"message": "Hello from FastAPI inside Docker!"}

@app.get("/health")
async def health():
    return {"status": "ok"}
```

Создаём `requirements.txt`.

```bash
echo "fastapi==0.115.6" > requirements.txt
echo "uvicorn==0.34.0" >> requirements.txt
```

Создаём `Dockerfile`.

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Собираем образ.

```bash
docker build -t fastapi-app .
```

Убеждаемся, что образ появился.

```bash
docker images fastapi-app
```

---

## Шаг 9. Запуск контейнера FastAPI

Запускаем контейнер с именем `fastapi` на порту 8000.

```bash
docker run -d --name fastapi -p 8000:8000 fastapi-app
docker ps --filter "name=fastapi"
curl http://localhost:8000/
```

Ответ: `{"message":"Hello from FastAPI inside Docker!"}`.

---

## Шаг 10. Связка Nginx и FastAPI через `--link`

Создаём новый конфиг nginx, который будет проксировать запросы в контейнер `fastapi`. Для этого переходим в папку с сертификатами.

```bash
cd ~/nginx-ssl

cat > default-proxy.conf << 'EOF'
server {
    listen 443 ssl;
    server_name localhost;

    ssl_certificate     /etc/nginx/ssl/nginx.crt;
    ssl_certificate_key /etc/nginx/ssl/nginx.key;

    location / {
        proxy_pass http://fastapi:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
EOF
```

Останавливаем и удаляем старый `nginx-ssl`.

```bash
docker stop nginx-ssl && docker rm nginx-ssl
```

Запускаем новый контейнер `nginx-proxy`, связанный с `fastapi` (флаг `--link`).

```bash
docker run -d --name nginx-proxy \
  --link fastapi \
  -v ~/nginx-ssl/default-proxy.conf:/etc/nginx/conf.d/default.conf \
  -v ~/nginx-ssl/nginx.crt:/etc/nginx/ssl/nginx.crt \
  -v ~/nginx-ssl/nginx.key:/etc/nginx/ssl/nginx.key \
  -p 8443:443 \
  nginx
```

Проверяем, что оба контейнера работают.

```bash
docker ps --filter "name=nginx-proxy" --filter "name=fastapi"
```

Выполняем тестовый запрос через HTTPS.

```bash
curl -k https://localhost:8443/
```

Ответ: `{"message":"Hello from FastAPI inside Docker!"}` – значит связка работает.

---

## Шаг 11. Очистка (опционально)

Если нужно удалить все созданные в лабораторной работе контейнеры и образы.

```bash
# Останавливаем и удаляем контейнеры
docker stop nginx-proxy fastapi
docker rm nginx-proxy fastapi

# Удаляем образы (при необходимости)
docker rmi fastapi-app nginx busybox

# Удаляем папки с проектами
rm -rf ~/fastapi-app ~/nginx-ssl
```

**Важно:** Основной контейнер `ubuntu` остаётся нетронутым.

---

## Заключение

Мы прошли полный цикл работы с Docker: от тестовых контейнеров до связки веб-сервера с микросервисом. Лабораторная работа выполнена успешно.

