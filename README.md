# Veonotes

Mashruucaan wuxuu kuu sahlayaa inaad la socoto marka qof aad rabto uu Live soo galo ama muuqaal cusub soo dhigo YouTube iyo TikTok, isagoo kuu soo diraya Email, Desktop Notification, iyo dhawaaq digniin ah.

---

## 1. Supabase Setup (Habaynta Database-ka)
App-ku wuxuu u baahan yahay Supabase si uu u kaydiyo kanaalada iyo SMTP Settings-ka.
1. Booqo [Supabase.com](https://supabase.com) oo sameyso akoon iyo mashruuc cusub (Free Project).
2. Aad qaybta **SQL Editor** ee ku dhex jirta dashboard-ka Supabase.
3. Nuqul ka qaado (copy) koodhka ku jira faylka `supabase_setup.sql` ee mashruucan, ku paste-garee SQL Editor-ka, dabadeedna riix **Run**.
4. Aad qaybta **Project Settings** -> **API**, ka dibna nuqul ka qaado:
   - **Project URL**
   - **Project API keys (anon public)**

---

## 2. Diyaarinta Environment Variables
1. Gudaha faylka `backend/`, ka guuri faylka `.env.example` oo u beddel `.env`.
2. Ku qor xogta Supabase-kaaga:
   ```env
   PORT=5001
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_KEY=your-anon-key
   ```

---

## 3. Sida loo orodsiye (Running the App)

### A. Server-ka (Backend)
Gudaha galka `backend/`, ku orodso amarradan:
```bash
# Ku shub dependency-yada
npm install

# Shid server-ka
npm start
```
Server-ku wuxuu ka shaqayn doonaa dekedda **5001**.

### B. Shabakadda (Frontend)
Gudaha galka `frontend/`, ku orodso amarradan:
```bash
# Ku shub dependency-yada
npm install

# Shid bogga internet-ka
npm run dev
```
Boggu wuxuu ka shaqayn doonaa dekedda **5173** (http://localhost:5173).

---

## 4. Habaynta Settings (UI Settings)
1. Markaad furto http://localhost:5173, aad tab-ka **Settings**.
2. Geli **Supabase URL** iyo **Supabase Anon Key** si aad u xaqiijiso xiriirka database-ka.
3. Geli **SMTP Settings** (Tusaale Gmail):
   - **Host**: `smtp.gmail.com`
   - **Port**: `587`
   - **User**: Email-kaaga gaarka ah (tusaale@gmail.com)
   - **Password**: Google App Password (ha isticmaalin password-kaaga caadiga ah ee email-ka). [Halkan ka akhri sida loo sameeyo App Password](https://support.google.com/accounts/answer/185833).
   - **Receiver Email**: Email-ka aad rabto in ogeysiiska lagugu soo diro.
4. Riix **Tijaabi Email-ka** si aad u xaqiijiso in email-ku shaqaynayo!

---

## 5. Telegram & Discord Ogeysiisyo (100% Bilaash)
Marka aad u baahato ogeysiisyo aan xad lahayn oo bilaash ah, adeegso Telegram ama Discord — labaduba lama beddelo lacag.

### A. Telegram Bot
1. Ka hadal [@BotFather](https://t.me/BotFather) oo dir `/newbot`, kadibna raac tilmaamaha si aad u hesho **Bot Token**.
2. Ku dar `TELEGRAM_BOT_TOKEN=<token-kaaga>` faylka `backend/.env`.
3. Bilow hadal bot-kaaga (dir fariin kasta si uu u furo chat-ka).
4. Ka hel **Chat ID**-gaaga [@userinfobot](https://t.me/userinfobot) — dir fariin isaguna wuu ku soo celin doonaa.
5. Gudaha app-ka, aad **Settings → Telegram Notifications**, shid switch-ka, ku dheji Chat ID-ga, riix **Save**, kadibna **Test**.

### B. Discord Webhook
1. Gudaha Discord server-kaaga, aad **Server Settings → Integrations → Webhooks → New Webhook**.
2. Nuqul ka qaado **Webhook URL**-ka.
3. Gudaha app-ka, aad **Settings → Discord Notifications**, shid switch-ka, ku dheji URL-ka, riix **Save**, kadibna **Test**.

---

## 6. Cron Ogeysiis Guud (CRON_SECRET) — Kaydinta Render Free Hours
Haddii aad rabto in adeeg cron oo bilaash ah (tusaale [cron-job.org](https://cron-job.org)) uu u yeero backend-ka jadwal ahaan halkii aad ugu tiirsanaan lahayd loop joogto ah, isticmaal `/api/cron/check`:
1. Ku dar `CRON_SECRET=<random-string-dherer>` faylka `backend/.env`.
2. Ka samee jadwal cron-job.org oo u dir `POST` ilaa `https://<backend-url>/api/cron/check?secret=<CRON_SECRET-kaaga>` (ama u dir header `X-Cron-Secret`).
3. Endpoint-kan wuxuu ka duwan yahay `/api/check` ee frontend-ku isticmaalo — kani wuxuu u baahan yahay sirta si looga hortago in qof kasta uu u yeero.

## 7. YouTube Webhook (Real-Time Uploads)
Backend-ku wuxuu si otomaatig ah isugu diiwaan gelinayaa (PubSubHubbub) kanaalada YouTube ee la raacayo si loo helo ogeysiis isla markiiba marka video la soo dhigo, halkii la sugi lahaa jadwalka poll-ka (5 daqiiqo).
1. Ku dar `PUBLIC_BACKEND_URL=https://<backend-url-kaaga>` faylka `backend/.env` (waa URL-ka dadweynaha ah ee backend-ka, sida `https://live-notifier-backend.onrender.com`). Haddii aad ku shaqaynayso Render, tan waa la iska sameeyo `RENDER_EXTERNAL_URL`.
2. **Local development**: PubSubHubbub wuxuu u baahan yahay URL HTTPS oo dadweynaha ah, marka isticmaal [ngrok](https://ngrok.com) si aad u tijaabiso webhook-ka local-kaaga.
3. Ma jirto wax kale oo la sameeyo — backend-ku si otomaatig ah ayuu u diiwaan gelinayaa (oo cusboonaysiinaya) kanaal kasta oo YouTube ah oo lagu daro jadwal 3 maalmood ah.
