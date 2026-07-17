# Social Live Notifier

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
