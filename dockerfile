# Użyj oficjalnego obrazu Node.js jako bazowego
FROM node:20-alpine

# Ustaw katalog roboczy w kontenerze
WORKDIR /app

# Skopiuj pliki z zależnościami do obrazu
COPY package*.json ./

# Zainstaluj zależności projektu
RUN npm install

# Skopiuj resztę plików aplikacji do kontenera
COPY . .

# Zbuduj aplikację produkcyjną
RUN npm run build

# Otwórz port dla aplikacji (domyślnie Vite preview: 5173)
EXPOSE 6080

# Komenda uruchamiania (preview build Vite)
CMD ["npm", "run", "preview"]
