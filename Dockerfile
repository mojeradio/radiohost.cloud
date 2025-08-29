# Użyj oficjalnego obrazu Pythona jako bazowego
FROM python:3.9-slim

# Ustaw katalog roboczy w kontenerze
WORKDIR /app

# Skopiuj plik z zależnościami do katalogu roboczego
COPY requirements.txt .

# Zainstaluj zależności
RUN pip install --no-cache-dir -r requirements.txt

# Skopiuj pozostałe pliki aplikacji do kontenera
COPY . .

# Określ port, na którym aplikacja będzie nasłuchiwać
EXPOSE 5000

# Komenda uruchomienia aplikacji
CMD ["python", "app.py"]
