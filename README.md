# ESP-01 Clicker

Amaç: ESP-01 üzerindeki bir butona her basışta Render üstündeki Node.js servisine istek göndermek ve web panelde timestamp olarak görmek.

## Yapı

- `server.js`: Express + Socket.IO sunucusu
- `public/index.html`: canlı panel
- `esp01_clicker.ino`: ESP-01 Arduino kodu
- `render.yaml`: Render Blueprint dosyası

## Render deploy

1. Bu klasörü GitHub repo olarak yükle.
2. Render'da `New +` -> `Blueprint` veya `Web Service` ile bağla.
3. `API_KEY` env değişkeni ekle.
4. Deploy bitince sana `https://servis-adi.onrender.com` URL'i verilecek.
5. ESP kodunda `HOST` ve `API_KEY` alanlarını değiştir.

## Not

Bu sürüm eventleri bellekte tutar. Servis yeniden başlarsa liste sıfırlanır.
