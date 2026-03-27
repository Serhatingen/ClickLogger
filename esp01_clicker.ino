#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecureBearSSL.h>

const char* WIFI_SSID = "Love";
const char* WIFI_PASS = "Aa123321";

const char* HOST = "senin-servisin.onrender.com";
const uint16_t HTTPS_PORT = 443;
const char* API_PATH = "/api/click";
const char* API_KEY = "BURAYA_RENDER_API_KEY";
const char* DEVICE_ID = "esp01-01";

// ESP-01 için en güvenlisi GPIO2.
// Buton: GPIO2 -> buton -> GND
const uint8_t BUTTON_PIN = 2;

bool lastStableState = HIGH;
bool lastReading = HIGH;
unsigned long lastDebounceAt = 0;
unsigned long lastSentAt = 0;
const unsigned long debounceMs = 35;
const unsigned long minGapMs = 250;

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  Serial.print("WiFi baglaniyor");
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());
}

bool sendClick() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  BearSSL::WiFiClientSecure client;
  client.setInsecure();

  HTTPClient https;
  String url = String("https://") + HOST + API_PATH;

  if (!https.begin(client, url)) {
    Serial.println("https.begin olmadi");
    return false;
  }

  https.addHeader("Content-Type", "application/json");
  https.addHeader("x-api-key", API_KEY);

  String payload = String("{") +
    "\"deviceId\":\"" + DEVICE_ID + "\"," +
    "\"millis\":" + String(millis()) + "," +
    "\"rssi\":" + String(WiFi.RSSI()) +
  "}";

  int code = https.POST(payload);
  String resp = https.getString();
  https.end();

  Serial.print("HTTP code: ");
  Serial.println(code);
  Serial.println(resp);

  return code > 0 && code < 300;
}

void setup() {
  Serial.begin(115200);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  delay(100);
  connectWiFi();
}

void loop() {
  bool reading = digitalRead(BUTTON_PIN);

  if (reading != lastReading) {
    lastDebounceAt = millis();
    lastReading = reading;
  }

  if ((millis() - lastDebounceAt) > debounceMs) {
    if (reading != lastStableState) {
      lastStableState = reading;

      // INPUT_PULLUP: basili = LOW
      if (lastStableState == LOW) {
        if (millis() - lastSentAt > minGapMs) {
          bool ok = sendClick();
          if (ok) {
            lastSentAt = millis();
          }
        }
      }
    }
  }
}
