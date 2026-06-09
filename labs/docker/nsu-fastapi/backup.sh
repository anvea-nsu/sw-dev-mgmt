#!/bin/bash
# Скрипт для создания резервной копии базы test и обновления образа
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="test_${TIMESTAMP}.bkp"
echo "Создаю бэкап ${BACKUP_FILE}..."
docker exec postgres-lab pg_dump -U test -d test -F c -f /backup/${BACKUP_FILE}
echo "Бэкап сохранён в work/pgsql/${BACKUP_FILE}"
ls -lh work/pgsql/${BACKUP_FILE}

# Копируем в postgres-docker и обновляем образ
echo "Обновляю образ postgres..."
cp work/pgsql/${BACKUP_FILE} postgres-docker/test.bkp
docker compose build postgres
echo "Готово! Теперь можно сделать docker compose down -v && docker compose up -d для проверки."
