# WA to ClickUp Bug Bot

Bot WhatsApp ringan (pakai Baileys, tanpa Chrome) yang otomatis meneruskan laporan `#bug` (teks + foto) ke ClickUp.

## 1. Ambil ClickUp API Token & List ID
1. **API Token:** Buka ClickUp $\rightarrow$ klik foto profil (kanan atas) $\rightarrow$ **Settings** $\rightarrow$ **Apps** $\rightarrow$ copy **API Token** (`pk_...`).
2. **List ID:** Buka List `BUG REPORT HERE!!` di ClickUp $\rightarrow$ lihat URL-nya:
   `https://app.clickup.com/123456/v/li/901234567890` $\rightarrow$ angka terakhir (`901234567890`) adalah **List ID**.

## 2. Deploy Gratis 24/7 (Koyeb / Render)
1. Upload folder ini ke **GitHub** (repository private juga bisa).
2. Daftar gratis di **Koyeb** (`koyeb.com`) atau **Render** (`render.com`).
3. Buat **Web Service** baru dari repo GitHub tersebut:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Environment Variables:**
     - `CLICKUP_API_TOKEN` = `pk_...`
     - `CLICKUP_LIST_ID` = `901234567890`
     - `BUG_PREFIX` = `#bug`
4. Setelah deploy jalan, buka **Logs** di dashboard Koyeb/Render $\rightarrow$ **Scan QR Code** yang muncul pakai WhatsApp (**Linked Devices**).
5. Selesai! Coba kirim `#bug karakter nyangkut` + foto di grup WA.
