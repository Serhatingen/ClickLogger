# ESP-01 Clicker

ESP-01 butona her basıldığında Render üzerinde çalışan Node sunucusuna istek yollar. Sunucu da server timestamp üretip panelde canlı gösterir.

## Dosyalar

- `server.js`: Express + Socket.IO backend
- `public/index.html`: canlı panel
- `esp01_clicker.ino`: ESP-01 Arduino kodu
- `render.yaml`: Render deploy ayarı
- `package.json`: Node bağımlılıkları

## Render

Environment Variables:

- `API_KEY` = kendi gizli anahtarın
- `MAX_EVENTS` = 300
- `NODE_VERSION` = 22.22.0

Build Command:

```bash
npm install
```

Start Command:

```bash
npm start
```

Health Check Path:

```text
/health
```

## ESP tarafında değiştir

`esp01_clicker.ino` içinde şunları doldur:

- `HOST`
- `API_KEY`
- `DEVICE_ID`
- gerekirse `WIFI_SSID` ve `WIFI_PASS`

## Buton bağlantısı

- GPIO2 -> buton -> GND

INPUT_PULLUP kullanıldığı için butona basılınca LOW okunur.
