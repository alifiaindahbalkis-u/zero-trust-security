# Zero Trust Security System

Sistem keamanan aplikasi akademik berbasis **Zero Trust Architecture** menggunakan Node.js, Express.js, dan SQLite. Sistem ini menerapkan prinsip *Never Trust, Always Verify*, yaitu setiap permintaan akses harus melalui proses autentikasi, verifikasi perangkat, dan pemeriksaan hak akses sebelum pengguna dapat mengakses layanan.

## 1. Deskripsi Proyek

Zero Trust Security System merupakan sistem keamanan untuk layanan akademik yang mengelola data nilai dan transkrip mahasiswa. Sistem dirancang dengan pendekatan Zero Trust untuk memastikan bahwa setiap pengguna hanya dapat mengakses sumber daya sesuai identitas, peran, dan hak akses yang dimiliki.

Sistem memiliki tiga jenis pengguna, yaitu:
- **Admin:** Memiliki hak untuk melihat transkrip seluruh mahasiswa.
- **Dosen:** Dapat melihat dan mengubah nilai mahasiswa pada kelas yang diampu serta melakukan finalisasi nilai.
- **Mahasiswa:** Hanya dapat melihat nilai dan transkrip miliknya sendiri.

Seluruh permintaan pengguna harus melewati API Gateway sebagai pintu masuk utama sistem.

## 2. Arsitektur Sistem

Sistem terdiri dari tiga layanan utama:

1. **API Gateway (Port 3000)**  
   Berfungsi sebagai pintu masuk utama (*Policy Enforcement Point/PEP*). Gateway melakukan verifikasi token, pemeriksaan perangkat terdaftar, evaluasi kebijakan akses, pencatatan audit, dan meneruskan permintaan ke layanan tujuan.

2. **Service Nilai (Port 3001)**  
   Menangani pengelolaan nilai mahasiswa, termasuk melihat nilai, mengubah nilai, dan melakukan finalisasi nilai. Setelah finalisasi, layanan ini meminta sinkronisasi data ke Service Transkrip.

3. **Service Transkrip (Port 3002)**  
   Menangani pengambilan dan sinkronisasi data transkrip mahasiswa. Sinkronisasi hanya dapat dilakukan menggunakan token khusus layanan (*service token*).

Ketiga layanan menggunakan database SQLite yang sama.

### Alur Komunikasi

```text
                 CLIENT / POSTMAN
                        |
                        v
              +-------------------+
              |    API GATEWAY    |
              |     Port 3000     |
              | Authentication   |
              | Device Checking  |
              | Policy Checking  |
              | Audit Logging    |
              +-------------------+
                    |       |
           +--------+       +----------+
           |                           |
           v                           v
 +-------------------+       +-------------------+
 |   SERVICE NILAI   |       | SERVICE TRANSKRIP |
 |    Port 3001      |       |     Port 3002     |
 |                   |       |                   |
 | View / Update     |       | View Transcript   |
 | Finalisasi Nilai  |------>| Sync Transcript   |
 +-------------------+       +-------------------+
           |                           |
           +-------------+-------------+
                         |
                         v
               +-------------------+
               |   SQLite Database |
               | Users, Devices,   |
               | Classes, Grades,  |
               | Transcripts,      |
               | Refresh Tokens,   |
               | Audit Logs        |
               +-------------------+
```

## 3. Teknologi yang Digunakan

| Teknologi | Kegunaan |
|---|---|
| Node.js | Runtime JavaScript |
| Express.js | Membangun REST API |
| SQLite | Penyimpanan database |
| Better-SQLite3 | Koneksi dan pengelolaan SQLite |
| JSON Web Token (JWT) | Autentikasi dan otorisasi token |
| Bcryptjs | Pengamanan password |
| Dotenv | Pengelolaan konfigurasi lingkungan |
| HTTP Proxy Middleware | Meneruskan permintaan dari Gateway ke layanan |

## 4. Struktur Folder

```text
zero-trust-security/
│
├── data/
│   └── zero-trust.db
│
├── src/
│   ├── config/
│   │   ├── database.js
│   │   └── seed.js
│   │
│   ├── middleware/
│   │   ├── auth.js
│   │   ├── gateway-secret.js
│   │   └── policy-engine.js
│   │
│   ├── services/
│   │   ├── auth.routes.js
│   │   ├── nilai.js
│   │   └── transkrip.js
│   │
│   ├── utils/
│   │   ├── policy.js
│   │   └── tokens.js
│   │
│   └── gateway.js
│
├── .env
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
├── README.md
└── cek-audit.js
```

## 5. Instalasi dan Konfigurasi

### A. Persyaratan

Pastikan perangkat telah memiliki:
- Node.js
- NPM
- Visual Studio Code
- Postman

### B. Clone Repository

```bash
git clone <URL_REPOSITORY>
cd zero-trust-security
```

### C. Instalasi Dependensi

Jalankan perintah berikut:

```bash
npm install
```

### D. Konfigurasi Environment

Buat file `.env` pada direktori utama proyek berdasarkan `.env.example`.

Contoh konfigurasi:

```env
PORT_GATEWAY=3000
PORT_NILAI=3001
PORT_TRANSKRIP=3002

JWT_SECRET=your_jwt_secret
ACCESS_TOKEN_EXPIRES=10m
REFRESH_TOKEN_EXPIRES=1d
SERVICE_TOKEN_EXPIRES=5m

GATEWAY_SECRET=your_gateway_secret

SERVICE_CLIENT_ID=nilai-service
SERVICE_CLIENT_SECRET=your_service_secret

ACCESS_START_HOUR=7
ACCESS_END_HOUR=21
```

Sesuaikan nilai secret dengan konfigurasi lokal. Jangan mengunggah file `.env` ke repository publik.

### E. Database

Database menggunakan SQLite dengan nama `zero-trust.db` yang berada di direktori `data/`.

File `database.js` digunakan untuk membuat dan mengelola tabel yang dibutuhkan sistem. File `seed.js` digunakan untuk menyiapkan data awal pengguna, perangkat, kelas, nilai, dan data pendukung lainnya.

**Catatan:** Jalankan proses seeding hanya ketika ingin membuat ulang data awal karena proses tersebut akan menghapus dan membangun kembali data yang sudah ada.

## 6. Menjalankan Aplikasi

Jalankan ketiga layanan menggunakan terminal yang berbeda.

**Terminal 1 – API Gateway**

```bash
npm run start:gateway
```

**Terminal 2 – Service Nilai**

```bash
npm run start:nilai
```

**Terminal 3 – Service Transkrip**

```bash
npm run start:transkrip
```

Jika berhasil, masing-masing layanan berjalan pada alamat:

| Layanan | Alamat |
|---|---|
| API Gateway | http://localhost:3000 |
| Service Nilai | http://localhost:3001 |
| Service Transkrip | http://localhost:3002 |

Pengujian permintaan pengguna dilakukan melalui API Gateway pada port 3000.

## 7. Akun Demo dan Device ID

Berikut akun yang tersedia untuk pengujian sistem:

| Role | Username | Password | Device ID |
|---|---|---|---|
| Admin | `admin` | `Admin123!` | `DEV-ADMIN-001` |
| Dosen | `dosen1` | `Dosen123!` | `DEV-DOSEN-001` |
| Dosen | `dosen2` | `Dosen123!` | `DEV-DOSEN-002` |
| Mahasiswa | `mahasiswa1` | `Mhs123!` | `DEV-MHS-001` |
| Mahasiswa | `mahasiswa2` | `Mhs123!` | `DEV-MHS-002` |
| Mahasiswa | `mahasiswa3` | `Mhs123!` | `DEV-MHS-003` |

### Data Mahasiswa

| Username | NIM |
|---|---|
| mahasiswa1 | `247006111101` |
| mahasiswa2 | `247006111102` |
| mahasiswa3 | `247006111103` |

### Data Kelas

| ID Kelas | Nama Mata Kuliah | Dosen |
|---|---|---|
| 1 | Pemrograman Dasar (IF101) | dosen1 |
| 2 | Keamanan Informasi (IF102) | dosen2 |

Akun tersebut merupakan akun demo untuk pengujian lokal.

## 8. Mekanisme Keamanan

Sistem menerapkan beberapa mekanisme keamanan berdasarkan prinsip Zero Trust:

### A. Authentication

Setiap pengguna harus melakukan login untuk mendapatkan access token dan refresh token.

### B. JWT Access Token

Access token digunakan untuk mengakses layanan dan memiliki masa berlaku selama 10 menit. Token memuat informasi identitas dan role pengguna.

### C. Refresh Token

Refresh token memiliki masa berlaku selama satu hari dan disimpan dalam database dalam bentuk hash. Token dapat digunakan untuk memperoleh access token baru dan dapat dicabut melalui proses logout.

### D. Device Verification

Setiap permintaan pengguna harus menyertakan `X-Device-ID`. Sistem memeriksa apakah perangkat tersebut telah terdaftar untuk pengguna yang bersangkutan.

### E. Policy Enforcement

API Gateway memeriksa kebijakan akses berdasarkan identitas pengguna, role, endpoint, kepemilikan kelas, dan hak akses.

### F. Gateway Secret

Setiap komunikasi dari API Gateway ke layanan internal menggunakan header `X-Gateway-Secret`. Layanan internal menolak permintaan langsung yang tidak memiliki secret yang valid.

### G. Service Token

Komunikasi antar layanan menggunakan service token khusus dengan masa berlaku lima menit. Token ini digunakan untuk proses sinkronisasi transkrip.

### H. Access Time Restriction

Perubahan dan finalisasi nilai dibatasi pada pukul 07.00–21.00 sesuai konfigurasi pada file `.env`.

### I. Audit Logging

Sistem mencatat aktivitas akses, termasuk waktu, identitas pengguna, endpoint, perangkat, keputusan akses, dan alasan keputusan. Pencatatan dilakukan untuk keputusan yang diizinkan maupun ditolak.

## 9. Daftar Endpoint API

Seluruh endpoint berikut diakses melalui API Gateway pada `http://localhost:3000`.

| Method | Endpoint | Fungsi |
|---|---|---|
| POST | `/auth/login` | Login pengguna |
| POST | `/auth/refresh` | Memperbarui access token |
| POST | `/auth/logout` | Logout dan mencabut refresh token |
| POST | `/auth/service` | Meminta service token |
| GET | `/health` | Memeriksa status Gateway |
| GET | `/me` | Melihat informasi pengguna yang sedang login |
| GET | `/nilai` | Melihat data nilai |
| PUT | `/nilai/:id` | Mengubah nilai berdasarkan ID |
| POST | `/kelas/:id/finalisasi` | Melakukan finalisasi nilai kelas |
| GET | `/transkrip/:nim` | Melihat transkrip mahasiswa |
| POST | `/transkrip/sinkron` | Sinkronisasi transkrip menggunakan service token |

### Header Permintaan Pengguna

Untuk endpoint yang membutuhkan autentikasi pengguna, gunakan:

```http
Authorization: Bearer <ACCESS_TOKEN>
X-Device-ID: <DEVICE_ID>
Content-Type: application/json
```

### Contoh Login

**POST** `/auth/login`

```json
{
  "username": "mahasiswa1",
  "password": "Mhs123!"
}
```

### Contoh Mengubah Nilai

**PUT** `/nilai/:id`

```json
{
  "nilai": 95
}
```

### Contoh Finalisasi Nilai

**POST** `/kelas/2/finalisasi`

Finalisasi dilakukan oleh dosen yang mengampu kelas terkait.

### Contoh Melihat Transkrip

**GET** `/transkrip/247006111101`

Mahasiswa hanya dapat melihat transkrip miliknya sendiri, sedangkan admin dapat melihat transkrip seluruh mahasiswa.

## 10. Aturan Kebijakan Akses

| Aktivitas | Mahasiswa | Dosen | Admin |
|---|---|---|---|
| Melihat nilai | Nilai sendiri | Kelas yang diampu | Tidak diizinkan |
| Mengubah nilai | Ditolak | Kelas yang diampu | Ditolak |
| Finalisasi nilai | Ditolak | Kelas yang diampu | Ditolak |
| Melihat transkrip sendiri | Diizinkan | Ditolak | Diizinkan |
| Melihat transkrip mahasiswa lain | Ditolak | Ditolak | Diizinkan |
| Sinkronisasi transkrip | Ditolak | Ditolak | Ditolak |

Sinkronisasi transkrip hanya dapat dilakukan oleh service token yang valid.

## 11. Pengujian Sistem

Pengujian dilakukan menggunakan Postman untuk memastikan setiap mekanisme keamanan berjalan sesuai kebijakan.

Pengujian mencakup:

1. Login menggunakan akun yang terdaftar.
2. Mengakses endpoint menggunakan access token.
3. Memeriksa perangkat melalui Device ID.
4. Mengakses nilai sesuai role pengguna.
5. Menguji penolakan akses dosen terhadap kelas dosen lain.
6. Mengubah nilai menggunakan dosen yang berwenang.
7. Menguji finalisasi nilai.
8. Memeriksa sinkronisasi nilai ke transkrip.
9. Menguji pembatasan akses transkrip mahasiswa.
10. Menguji akses admin terhadap transkrip mahasiswa lain.
11. Menguji penolakan token pengguna pada endpoint sinkronisasi.
12. Menguji refresh token dan pencabutan token melalui logout.
13. Menguji akses langsung ke layanan internal tanpa Gateway Secret.
14. Memeriksa pencatatan audit log.

## 12. Audit Log

Audit log disimpan dalam tabel `audit_logs` pada database SQLite.

Untuk melihat ringkasan audit log, jalankan:

```bash
node cek-audit.js
```

Hasilnya menampilkan daftar endpoint, keputusan akses, alasan keputusan, dan jumlah kejadian berdasarkan kelompok data.

## 13. Keamanan Repository

File `.gitignore` digunakan untuk mencegah file sensitif dan file yang tidak diperlukan masuk ke repository.

Contoh konfigurasi:

```gitignore
node_modules/
.env
data/*.db
data/*.db-shm
data/*.db-wal
coverage/
```

File `.env` dan database lokal tidak disertakan dalam repository. Pengguna yang menjalankan proyek perlu membuat konfigurasi `.env` sendiri berdasarkan `.env.example`.

## 14. Penutup

Zero Trust Security System menerapkan pendekatan keamanan dengan melakukan verifikasi terhadap identitas pengguna, perangkat, token, dan kebijakan akses pada setiap permintaan. Dengan penggunaan API Gateway, JWT, Device Verification, Gateway Secret, Service Token, pembatasan waktu akses, serta Audit Logging, sistem diharapkan mampu meningkatkan keamanan pengelolaan data akademik dan mencegah akses yang tidak sesuai dengan kewenangan pengguna.

---

**Proyek:** Zero Trust Security System  
**Teknologi:** Node.js, Express.js, SQLite, JWT  
**Pengujian API:** Postman