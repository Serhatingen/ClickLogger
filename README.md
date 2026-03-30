# ESP-01 Clicker + Google Sheets

Bu sürüm:
- click eventlerini kabul eder
- heartbeat eventlerini kabul eder
- canlı web panel gösterir
- Google Sheets içine ham veriyi append eder
- iş günü kesimini `05:00` kabul eder

## Gerekli Render env değişkenleri

- `API_KEY`
- `MAX_EVENTS` (ör. `300`)
- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_SHEETS_TAB_NAME` (`RawEvents` önerilir)
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `CLUB_TIMEZONE` (`Europe/Istanbul`)
- `CLUB_DAY_CUTOFF_HOUR` (`5`)

## Bu proje için mevcut bilgiler

- Spreadsheet ID: `1nIRSw8Wmm5BM2R2jJGF7QNEgU4gbMvA45ndD7o6gvXA`
- Service account email: `clicker@spherical-jetty-491819-h6.iam.gserviceaccount.com`

## Google Sheet paylaşımı

Google Sheet'i şu hesapla `Editor` olarak paylaş:

`clicker@spherical-jetty-491819-h6.iam.gserviceaccount.com`

Kişisel hesap sahibi (`lovedpturket@gmail.com`) sheet sahibi olarak kalabilir.
Service account yalnızca yazma/okuma için editör olur.

## RawEvents başlıkları

Server ilk açılışta başlığı otomatik yazmayı dener:

- server_timestamp_utc
- event_type
- device_id
- seq
- rssi
- battery
- ip
- device_timestamp_ms
- server_unix_ms
- event_local_time
- club_business_date
- club_day_name
- club_hour
- club_hour_label
- club_session_key

## İş günü mantığı

`CLUB_DAY_CUTOFF_HOUR=5` ise:
- Cumartesi 02:10 kaydı, takvim olarak Cumartesi olsa bile
- `club_business_date` alanında bir önceki geceye, yani Cuma oturumuna yazılır

Bu alanlar yoğun ve seyrek saat analizini kolaylaştırır.
