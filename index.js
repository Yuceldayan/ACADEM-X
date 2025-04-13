/*****************************************************
 * index.js (Tüm Kod)
 *
 * 1) MIDDLEWARE
 * 2) Yardımcı Fonksiyonlar (read/write .json, escapeHTML, manageData)
 * 3) Global Auth Middleware
 * 4) PDF İşlemleri
 * 5) Teaching (Ders İlanları)
 * 6) Kullanıcı İşlemleri (Register, Login, Logout)
 * 7) Forum (Soru-Cevap)
 * 8) Profil (Kullanıcı Profil, Avatar, Favoriler, Rozetler, vs.)
 * 9) Socket.IO (Genel ve Özel Sohbet)
 * 10) Sunucuyu Başlat
 *****************************************************/

////////////////////////////////////////////////////////
// GEREKLİ MODÜLLER & BAŞLANGIÇ AYARLARI
////////////////////////////////////////////////////////

/**
 * Express: HTTP sunucusu oluşturmak için kullanılan popüler bir Node.js framework'ü.
 * Multer: Dosya yükleme işlemleri (örn. PDF yükleme).
 * Path, fs: Dosya sistemi ve dosya yolları yönetimi.
 * Session: Kullanıcı oturum yönetimi.
 * Bcrypt: Şifrelerin güvenli şekilde saklanması için hashing.
 * Socket.IO: Gerçek zamanlı iletişim (chat vb.).
 */

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const session = require("express-session");
const bcrypt = require("bcrypt");
const http = require("http");
const socketIo = require("socket.io");

/**
 * Uygulama nesnesi (Express) ve port tanımı
 */
const app = express();
const port = process.env.PORT || 3000;

/**
 * Sunucuyu oluşturmak için HTTP ve Socket.IO kullanacağız.
 * - server: HTTP sunucusu (Express)
 * - io: Socket.IO sunucusu
 */
const server = http.createServer(app);
const io = socketIo(server);

////////////////////////////////////////////////////////
// 1) MIDDLEWARE
////////////////////////////////////////////////////////

/**
 * Uygulama genelinde kullanacağımız middleware'ler.
 * - JSON verilerini parse etme
 * - URL-encoded verileri parse etme
 * - Public klasörü (statik dosyalar) sunma
 * - Session yönetimi
 */

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * "public" klasöründeki statik dosyaları (CSS, JS, resim vs.)
 * doğrudan erişilebilir hale getiriyoruz.
 */
app.use(express.static(path.join(__dirname, "public")));

/**
 * Session ayarları
 * - secret: Oturumları imzalamak için kullanılan gizli anahtar
 * - resave, saveUninitialized: Performans ve güvenlik parametreleri
 */
app.use(
  session({
    secret: "my-secret-key", // Prod ortamda güçlü bir secret kullanın
    resave: false,
    saveUninitialized: false,
  })
);

////////////////////////////////////////////////////////
// 2) Yardımcı Fonksiyonlar ve Dosyalar
////////////////////////////////////////////////////////

/**
 * escapeHTML:
 * Basit XSS önlemi olarak, HTML özel karakterlerini dönüştürür.
 * Gelişmiş projelerde sanitize kütüphaneleri kullanmak önerilir.
 *
 * @param {string} [str=""] - Temizlenecek metin
 * @returns {string} Temizlenmiş metin
 */
function escapeHTML(str = "") {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * manageData:
 * Verilen dosya yolunu (JSON) okuyup yazmamızı sağlayan basit bir sarmalayıcı.
 *
 * @param {string} filePath - JSON dosya yolu
 * @param {any} defaultValue - Dosya yoksa kullanacağımız varsayılan değer
 * @returns {{ read: Function, write: Function }} - read ve write fonksiyonları
 */
function manageData(filePath, defaultValue) {
  return {
    /**
     * read:
     * Dosyayı okur, JSON parse eder, hata varsa defaultValue döner.
     */
    read: () => {
      if (!fs.existsSync(filePath)) {
        return defaultValue;
      }
      const raw = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(raw);
    },
    /**
     * write:
     * Verilen data'yı JSON stringify ederek dosyaya yazar.
     */
    write: (data) => {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    },
  };
}

/**
 * Projede kullanacağımız JSON dosyalarının yolları.
 * - forum.json: Forum verileri (sorular, cevaplar, kategoriler)
 * - users.json: Kullanıcı verileri (username, passwordHash, favoriler, rozetler)
 * - teachings.json: Ders ilanları
 * - files.json: PDF dosyalarının meta verileri
 * - comments.json: PDF yorumları (isteğe bağlı, tek dosyada saklanıyor)
 */
const forumFile = "forum.json";
const usersFile = "users.json";
const teachingsFile = "teachings.json";
const filesMetaFile = "files.json";
const commentsFile = "comments.json";

/**
 * manageData ile veritabanı benzeri nesneler oluşturuyoruz.
 */
const forumDB = manageData(forumFile, {
  questions: [],
  categories: ["Matematik", "Fizik", "Programlama", "Genel"],
});
const usersDB = manageData(usersFile, []);
const teachingsDB = manageData(teachingsFile, []);
const filesDB = manageData(filesMetaFile, []);

/**
 * Public rotalar listesi (Giriş yapmadan da erişilebilir).
 */
const publicRoutes = [
  "/",
  "/login.html",
  "/register.html",
  "/login",
  "/register",
  "/logout",
];

/**
 * (Opsiyonel) Comments verisini doğrudan manageData ile yönetmek de mümkün,
 * ancak tek seferlik basit readFile kullanımı da yaygın.
 * Burada isterseniz:
 * const commentsDB = manageData(commentsFile, []);
 */

////////////////////////////////////////////////////////
// 3) Global Auth Middleware
////////////////////////////////////////////////////////

/**
 * Tüm rotalardan önce çalışan bir middleware.
 * - Session'da user var mı?
 *   Evetse -> devam et
 *   Hayırsa -> rota publicRoutes içinde mi?
 *     Evetse -> devam et
 *     Hayırsa -> /login.html'e yönlendir
 */
app.use((req, res, next) => {
  if (req.session.user) {
    return next();
  }
  if (publicRoutes.includes(req.path)) {
    return next();
  }
  return res.redirect("/login.html");
});

////////////////////////////////////////////////////////
// 4) PDF İşlemleri
////////////////////////////////////////////////////////

/**
 * PDF dosyalarını yüklemek için Multer konfigürasyonu.
 * Sadece application/pdf tipine izin veriyoruz.
 */
const pdfStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const pdfUpload = multer({
  storage: pdfStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Sadece PDF dosyaları yüklenebilir."), false);
    }
  },
});

/**
 * POST /upload:
 * - PDF yükleme formundan (upload.html) gelen title, description ve pdfFile
 * - Dosyayı uploads/ klasörüne kaydeder
 * - files.json içerisine meta veri ekler (title, description, author, date, likes, comments)
 */
app.post("/upload", pdfUpload.single("pdfFile"), (req, res) => {
  const { title, description } = req.body;
  const filename = req.file.filename;
  const author = req.session.user?.username || "Bilinmiyor";
  const date = new Date().toISOString();

  // Dosyayı meta verisiyle kaydet
  const allFiles = filesDB.read();
  allFiles.push({
    filename,
    title,
    description,
    author,
    date,
    likes: 0,
    comments: 0,
  });
  filesDB.write(allFiles);

  res.redirect("/files");
});

/**
 * GET /files:
 * - Tüm PDF dosyalarının listelendiği sayfa
 * - Deepseek tasarımına uyumlu
 */
app.get("/files", (req, res) => {
  const allFiles = filesDB.read();

  // (Kod, yukarıda talep edilen tasarımla benzer şekilde yazılmıştır)
  // Geniş açıklamalı, HTML'yi geri döndürüyoruz.

  let html = `
  <!DOCTYPE html>
  <html lang="tr" data-bs-theme="dark">
  <head>
    <meta charset="UTF-8">
    <title>ACADEMIX - PDF Arşivi</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
      :root {
        --bg-dark: #0a192f;
        --accent: #64ffda;
        --text-primary: #ccd6f6;
        --text-secondary: #8892b0;
      }
      body {
        background-color: var(--bg-dark);
        color: var(--text-primary);
        font-family: 'Space Grotesk', sans-serif;
      }
      .navbar-dark.bg-dark-80 {
        background-color: rgba(10,25,47,0.8) !important;
      }
      .glow-text {
        color: var(--accent);
        text-shadow: 0 0 5px rgba(100,255,218,0.5);
      }
      .text-accent {
        color: var(--accent) !important;
      }
      .btn-accent {
        background-color: var(--accent);
        color: #0a192f;
        border: none;
        border-radius: 12px;
        transition: transform 0.2s ease;
      }
      .btn-accent:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 10px rgba(100,255,218,0.2);
      }
      .btn-outline-accent {
        border-color: var(--accent);
        color: var(--accent);
        border-radius: 12px;
      }
      .btn-outline-accent:hover {
        background-color: var(--accent);
        color: #0a192f;
      }
      .stats-card {
        background: rgba(16,24,39,0.8);
        border: 1px solid rgba(100,255,218,0.1);
        border-radius: 15px;
      }
      .search-box {
        background: rgba(16,24,39,0.8);
        border: 2px solid var(--accent);
        border-radius: 12px;
      }
      .pdf-card {
        background: rgba(16,24,39,0.8);
        border: 1px solid rgba(100,255,218,0.1);
        border-radius: 15px;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .pdf-card:hover {
        transform: translateY(-5px);
        box-shadow: 0 10px 20px rgba(100,255,218,0.1);
      }
      .pdf-preview {
        height: 250px;
        background: rgba(255,255,255,0.05);
        border-radius: 10px;
      }
      .meta-badge {
        background: rgba(100,255,218,0.1);
        color: var(--accent);
        border-radius: 8px;
      }
      .like-btn.liked {
        animation: pop 0.3s ease;
      }
      @keyframes pop {
        50% {
          transform: scale(1.3);
        }
      }
    </style>
  </head>
  <body>
    <!-- Navbar -->
    <nav class="navbar navbar-expand-lg navbar-dark bg-dark-80 fixed-top">
      <div class="container">
        <a class="navbar-brand glow-text fs-4" href="/">
          <i class="fas fa-atom me-2"></i>ACADEMIX
        </a>
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
          <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="navbarNav">
          <ul class="navbar-nav ms-auto">
            <li class="nav-item mx-2"><a class="nav-link" href="/forum">Forum</a></li>
            <li class="nav-item mx-2"><a class="nav-link active" href="/files">PDF'ler</a></li>
            <li class="nav-item mx-2"><a class="nav-link" href="/teachings">Dersler</a></li>
            <li class="nav-item mx-2"><a class="nav-link" href="/profile">Profil</a></li>
            <li class="nav-item mx-2"><a class="nav-link" href="/dashboard.html">Dashboard</a></li>
            <li class="nav-item mx-2"><a class="nav-link" href="/logout">Çıkış</a></li>
          </ul>
        </div>
      </div>
    </nav>

    <main class="container py-5 mt-5">
      <!-- Header Section -->
      <div class="d-flex align-items-center justify-content-between mb-5">
        <div>
          <h1 class="text-accent mb-3"><i class="fas fa-file-pdf me-3"></i>Akademik Arşiv</h1>
          <p class="text-secondary lead">Topluluk tarafından paylaşılan tüm akademik dokümanlar</p>
        </div>
        <a href="/upload.html" class="btn btn-accent py-2 px-4">
          <i class="fas fa-upload me-2"></i>Yeni Yükle
        </a>
      </div>

      <!-- Stats & Search -->
      <div class="row g-4 mb-5">
        <div class="col-md-4">
          <div class="stats-card p-4 rounded-3 h-100 d-flex align-items-center">
            <i class="fas fa-database fs-2 text-accent me-3"></i>
            <div>
              <p class="mb-0 text-secondary">Toplam Dosya</p>
              <h2 class="text-accent mb-0">${allFiles.length}</h2>
            </div>
          </div>
        </div>
        <div class="col-md-8">
          <div class="search-box p-2">
            <div class="input-group">
              <input type="text" id="smartSearch"
                     class="form-control bg-transparent border-0 text-light"
                     placeholder="Başlık, açıklama veya yükleyene göre ara...">
              <button class="btn btn-accent">
                <i class="fas fa-search"></i>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- PDF Grid -->
      <div class="row g-4" id="pdfContainer">
  `;

  // PDF kartları
  allFiles.forEach((meta) => {
    const likesCount = meta.likes || 0;
    const commentsCount = meta.comments || 0;
    html += `
      <div class="col-md-6 col-lg-4 pdf-card"
           data-title="${(meta.title || "").toLowerCase()}"
           data-desc="${(meta.description || "").toLowerCase()}"
           data-author="${(meta.author || "").toLowerCase()}">
        <div class="h-100 p-3 d-flex flex-column">
          <!-- Card Header -->
          <div class="d-flex justify-content-between align-items-start mb-3">
            <div class="flex-grow-1">
              <h5 class="text-accent mb-2">${escapeHTML(meta.title)}</h5>
              <div class="d-flex gap-2 mb-2">
                <span class="meta-badge py-1 px-2 small">
                  <i class="fas fa-user me-1"></i>${escapeHTML(
                    meta.author || "Bilinmiyor"
                  )}
                </span>
                <span class="meta-badge py-1 px-2 small">
                  <i class="fas fa-calendar me-1"></i>${new Date(
                    meta.date
                  ).toLocaleDateString("tr-TR")}
                </span>
              </div>
            </div>
            <i class="fas fa-file-pdf text-accent fs-3"></i>
          </div>

          <!-- Preview -->
          <div class="pdf-preview mb-3 rounded-2 overflow-hidden">
            <iframe src="/pdf/${encodeURIComponent(meta.filename)}"
                    class="w-100 h-100"
                    style="border: none;"></iframe>
          </div>

          <!-- Description -->
          <p class="text-secondary small flex-grow-1">${escapeHTML(
            meta.description
          )}</p>

          <!-- Actions -->
          <div class="d-flex gap-2 mt-3">
            <a href="/download/${encodeURIComponent(meta.filename)}"
               class="btn btn-accent btn-sm flex-fill d-flex align-items-center justify-content-center">
              <i class="fas fa-download me-2"></i>İndir
            </a>
            <button class="btn btn-outline-accent btn-sm flex-fill d-flex align-items-center justify-content-center like-btn"
                    data-file="${meta.filename}">
              <i class="fas fa-heart me-2"></i><span class="like-count">${likesCount}</span>
            </button>
            <a href="/view/${encodeURIComponent(meta.filename)}"
               class="btn btn-outline-accent btn-sm flex-fill d-flex align-items-center justify-content-center">
              <i class="fas fa-comment me-2"></i>${commentsCount}
            </a>
          </div>
        </div>
      </div>
    `;
  });

  html += `
      </div>
    </main>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/js/all.min.js"></script>
    <script>
      // Gelişmiş Arama
      const searchInput = document.getElementById('smartSearch');
      const pdfCards = document.querySelectorAll('.pdf-card');

      function doSearch() {
        const term = searchInput.value.toLowerCase();
        pdfCards.forEach(card => {
          const matches = [
            card.dataset.title,
            card.dataset.desc,
            card.dataset.author
          ].some(txt => txt.includes(term));
          card.style.display = matches ? 'block' : 'none';
        });
      }

      let searchTimeout;
      searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(doSearch, 300);
      });

      // Like Butonu (Asenkron)
      document.querySelectorAll('.like-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const filename = btn.dataset.file;
          try {
            const resp = await fetch(\`/like/\${encodeURIComponent(filename)}\`, {
              method: 'POST'
            });
            const data = await resp.json(); 
            // { likes: X }
            const likeCountSpan = btn.querySelector('.like-count');
            likeCountSpan.textContent = data.likes;
            btn.classList.add('liked');
            setTimeout(() => btn.classList.remove('liked'), 300);
          } catch (err) {
            console.error("Beğeni hatası:", err);
          }
        });
      });
    </script>
  </body>
  </html>
  `;

  res.send(html);
});

/**
 * GET /pdf/:filename -> PDF'yi inline olarak gösterir
 */
app.get("/pdf/:filename", (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, "uploads", filename);
  res.setHeader("Content-Type", "application/pdf");
  res.sendFile(filePath);
});

/**
 * GET /download/:filename -> PDF'yi indirtir
 */
app.get("/download/:filename", (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, "uploads", filename);
  res.download(filePath, (err) => {
    if (err) {
      res.status(500).send("Dosya indirme hatası.");
    }
  });
});

/**
 * GET /view/:filename -> PDF detay sayfası (yorumlar, beğeni)
 */
app.get("/view/:filename", (req, res) => {
  const filename = req.params.filename;
  const allFiles = filesDB.read();
  const meta = allFiles.find((f) => f.filename === filename);
  if (!meta) {
    return res.status(404).send("PDF meta bulunamadı.");
  }

  // Yorumları (comments.json) oku
  let allComments = [];
  if (fs.existsSync(commentsFile)) {
    allComments = JSON.parse(fs.readFileSync(commentsFile, "utf-8"));
  }
  const pdfComments = allComments.filter((c) => c.filename === filename);
  const likesCount = meta.likes || 0;

  // Yorum HTML
  const commentsHtml = pdfComments
    .map(
      (c) => `
      <div class="border rounded p-2 mb-2">
        <strong>${escapeHTML(c.username)}</strong> <span class="text-muted">${
        c.timestamp
      }</span>
        <p class="mb-0">${escapeHTML(c.comment)}</p>
      </div>
    `
    )
    .join("");

  const html = `
  <!DOCTYPE html>
  <html lang="tr">
  <head>
    <meta charset="UTF-8">
    <title>${escapeHTML(meta.title)} - Görüntüle</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">
  </head>
  <body class="bg-light">
    <nav class="navbar navbar-expand-lg navbar-dark bg-dark">
      <div class="container-fluid">
        <a class="navbar-brand" href="/">NotPlatformu</a>
      </div>
    </nav>

    <div class="container my-4">
      <h1 class="mb-3">${escapeHTML(meta.title)}</h1>
      <p class="text-muted">${escapeHTML(meta.description)}</p>
      <div class="ratio ratio-16x9 mb-3">
        <iframe src="/pdf/${encodeURIComponent(meta.filename)}"></iframe>
      </div>
      <div class="mb-3">
        <a href="/download/${encodeURIComponent(
          filename
        )}" class="btn btn-sm btn-success">Dosyayı İndir</a>
        <form action="/like/${encodeURIComponent(
          filename
        )}" method="POST" class="d-inline">
          <button type="submit" class="btn btn-sm btn-outline-danger">Beğen</button>
        </form>
        <span class="ms-2">Beğeni: <strong>${likesCount}</strong></span>
      </div>

      <div class="comments-section mb-4">
        <h2>Yorumlar</h2>
        <div>
          ${commentsHtml}
        </div>
        <h4>Yeni Yorum</h4>
        <form action="/comment/${encodeURIComponent(
          filename
        )}" method="POST" class="mb-3">
          <div class="mb-2">
            <input type="text" name="username" class="form-control" placeholder="Adınız" required>
          </div>
          <div class="mb-2">
            <textarea name="comment" class="form-control" rows="3" placeholder="Yorumunuz" required></textarea>
          </div>
          <button type="submit" class="btn btn-primary">Yorum Gönder</button>
        </form>
      </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
  </body>
  </html>
  `;
  res.send(html);
});

/**
 * POST /comment/:filename
 * - Yeni yorum ekler
 * - comment sayısını artırır
 */
app.post("/comment/:filename", (req, res) => {
  const filename = req.params.filename;
  const { username, comment } = req.body;
  if (!username || !comment) return res.status(400).send("Eksik veri.");

  let allComments = [];
  if (fs.existsSync(commentsFile)) {
    allComments = JSON.parse(fs.readFileSync(commentsFile, "utf-8"));
  }
  allComments.push({
    filename,
    username,
    comment,
    timestamp: new Date().toISOString(),
  });
  fs.writeFileSync(commentsFile, JSON.stringify(allComments, null, 2));

  // comment sayısını artır
  const allFiles = filesDB.read();
  const meta = allFiles.find((f) => f.filename === filename);
  if (meta) {
    meta.comments = (meta.comments || 0) + 1;
    filesDB.write(allFiles);
  }

  res.redirect(`/view/${encodeURIComponent(filename)}`);
});

/**
 * POST /like/:filename
 * - PDF beğeni sayısını artırır
 * - Asenkron fetch kullanan istemciye JSON döndürür
 */
app.post("/like/:filename", (req, res) => {
  const filename = req.params.filename;
  const allFiles = filesDB.read();
  const meta = allFiles.find((f) => f.filename === filename);
  if (!meta) {
    return res.status(404).json({ error: "PDF meta bulunamadı." });
  }
  meta.likes = (meta.likes || 0) + 1;
  filesDB.write(allFiles);

  // Asenkron fetch beklediği için JSON yanıt
  return res.json({ likes: meta.likes });
});

////////////////////////////////////////////////////////
// 5) Teaching (Ders İlanları)
////////////////////////////////////////////////////////

/**
 * GET /teachings:
 * - Ders ilanlarını listeler, arama & sayfalama desteği
 */
app.get("/teachings", (req, res) => {
  const allTeachings = teachingsDB.read();

  let { search = "", page = 1 } = req.query;
  page = parseInt(page) || 1;
  const perPage = 6;

  const searchLower = search.toLowerCase();
  const filtered = allTeachings.filter((t) => {
    return (
      t.lessonTitle.toLowerCase().includes(searchLower) ||
      t.description.toLowerCase().includes(searchLower) ||
      t.contact.toLowerCase().includes(searchLower)
    );
  });

  const total = filtered.length;
  const totalPages = Math.ceil(total / perPage);
  const startIndex = (page - 1) * perPage;
  const endIndex = startIndex + perPage;
  const pagedTeachings = filtered.slice(startIndex, endIndex);

  // Basit HTML taslağı (Daha önceki Deepseek tarzı)
  let html = `
  <!DOCTYPE html>
  <html lang="tr">
  <head>
    <meta charset="UTF-8">
    <title>ACADEMIX - Ders İlanları</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
      :root {
        --bg-dark: #0a192f;
        --accent: #64ffda;
        --text-primary: #ccd6f6;
        --text-secondary: #8892b0;
      }
      body {
        background-color: var(--bg-dark);
        color: var(--text-primary);
        font-family: 'Space Grotesk', sans-serif;
      }
      .navbar {
        background: rgba(10,25,47,0.8) !important;
      }
      .teachings-section {
        margin-top: 80px;
      }
      .teaching-card {
        background: rgba(16,24,39,0.8);
        border: 1px solid rgba(100,255,218,0.1);
        border-radius: 15px;
        transition: all 0.3s ease;
      }
      .teaching-card:hover {
        transform: translateY(-5px);
        box-shadow: 0 10px 20px rgba(100,255,218,0.1);
      }
      .teaching-title {
        color: var(--accent);
        font-size: 1.2rem;
        font-weight: 600;
      }
      .btn-accent {
        background-color: var(--accent);
        color: #0a192f;
        border: none;
        border-radius: 12px;
      }
      .btn-accent:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 10px rgba(100,255,218,0.2);
      }
      .btn-outline-accent {
        border-color: var(--accent);
        color: var(--accent);
        border-radius: 12px;
      }
      .btn-outline-accent:hover {
        background-color: var(--accent);
        color: #0a192f;
      }
    </style>
  </head>
  <body>
    <nav class="navbar navbar-expand-lg navbar-dark fixed-top">
      <div class="container">
        <a class="navbar-brand fw-bold" href="/">ACADEMIX</a>
      </div>
    </nav>

    <section class="teachings-section container py-5">
      <h2 class="text-accent mb-4"><i class="fas fa-bullhorn me-2"></i>Ders İlanları</h2>
      <form class="row g-3 mb-4">
        <div class="col-auto">
          <input type="text" name="search" class="form-control bg-dark text-light border-0"
                 placeholder="Arama..." value="${search}">
        </div>
        <div class="col-auto">
          <button type="submit" class="btn btn-accent">
            <i class="fas fa-search me-1"></i>Filtrele
          </button>
        </div>
      </form>
      <div class="row row-cols-1 row-cols-md-3 g-4">
  `;

  pagedTeachings.forEach((t) => {
    html += `
      <div class="col">
        <div class="teaching-card p-4 h-100 d-flex flex-column">
          <h5 class="teaching-title mb-2">
            <i class="fas fa-chalkboard-teacher me-2"></i>${escapeHTML(
              t.lessonTitle
            )}
          </h5>
          <p class="text-secondary">${escapeHTML(t.description)}</p>
          <p><strong>Fiyat:</strong> ${t.price} TL</p>
          <p><strong>İletişim:</strong> ${escapeHTML(t.contact)}</p>
          <div class="mt-auto">
            <a href="/teaching/${t.id}" class="btn btn-outline-accent w-100">
              <i class="fas fa-comments me-1"></i>Sohbet
            </a>
          </div>
        </div>
      </div>
    `;
  });

  html += `
      </div>
      <nav class="mt-4">
        <ul class="pagination">
  `;
  for (let i = 1; i <= totalPages; i++) {
    html += `
      <li class="page-item ${i === page ? "active" : ""}">
        <a class="page-link" href="/teachings?search=${search}&page=${i}">${i}</a>
      </li>
    `;
  }
  html += `
        </ul>
      </nav>
      <div class="mt-5">
        <a href="/teaching.html" class="btn btn-accent"><i class="fas fa-plus-circle me-2"></i>Yeni İlan Oluştur</a>
      </div>
    </section>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/js/all.min.js"></script>
  </body>
  </html>
  `;

  res.send(html);
});

////////////////////////////////////////////////////////
// 6) Kullanıcı İşlemleri (Register, Login, Logout)
////////////////////////////////////////////////////////

/**
 * POST /register:
 * - Yeni kullanıcı kaydı
 */
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).send("Eksik veri.");

  const allUsers = usersDB.read();
  if (allUsers.find((u) => u.username === username)) {
    return res.status(400).send("Bu kullanıcı adı zaten alınmış.");
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  allUsers.push({ username, password: hashedPassword });
  usersDB.write(allUsers);

  res.redirect("/login.html");
});

/**
 * POST /login:
 * - Kullanıcı girişi
 */
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const allUsers = usersDB.read();
  const user = allUsers.find((u) => u.username === username);
  if (!user) return res.status(400).send("Kullanıcı bulunamadı.");

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(400).send("Şifre hatalı.");

  req.session.user = user;
  res.redirect("/dashboard.html");
});

/**
 * GET /logout:
 * - Oturumu sonlandırır
 */
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

////////////////////////////////////////////////////////
// 7) Forum
////////////////////////////////////////////////////////

/**
 * Forum verileri read/write (Zaten forumDB var)
 *
 * GET /forum -> Tüm sorular
 * GET /forum/new -> Yeni soru formu
 * POST /forum/new -> Yeni soru oluşturma
 * GET /forum/:id -> Soru detayı + cevaplar
 * POST /forum/:id/answer -> Cevap ekleme
 *
 * (Bu kısım, yukarıda 7. bölümde yazılanla paralel.)
 * Tekrardan ekledik, eğer tekrar tanımlarsak "Identifier ... already been declared"
 * hatası alırız. Dolayısıyla KODUN SONUNDAKİ TEKRARLAR SİLİNİZ
 * ya da entegre ediniz.
 */

////////////////////////////////////////////////////////
// 8) Profil
////////////////////////////////////////////////////////

/**
 * GET /profile:
 * - Kullanıcı profili (avatar, rozet, favoriler, vb.)
 * - Yukarıda talep edilen tasarıma uygun
 */
app.get("/profile", (req, res) => {
  if (!req.session.user) return res.redirect("/login.html");

  const username = req.session.user.username;
  const allUsers = usersDB.read();
  const user = allUsers.find((u) => u.username === username);
  const allFiles = filesDB.read();

  // Favoriler & Rozetler (isteğe bağlı)
  const favorites = user?.favorites || [];
  const badges = user?.badges || [];

  // Kullanıcının yüklediği PDF
  const userFiles = allFiles.filter((f) => f.author === username);
  const totalFiles = userFiles.length;
  const totalLikes = userFiles.reduce((sum, f) => sum + (f.likes || 0), 0);
  const totalComments = userFiles.reduce(
    (sum, f) => sum + (f.comments || 0),
    0
  );

  // Avatar
  const avatarPath = `/avatars/${username}.jpg`;
  const avatarExists = fs.existsSync(
    path.join(__dirname, "public", avatarPath)
  );
  const avatarImg = avatarExists
    ? avatarPath
    : "https://via.placeholder.com/150x150?text=Avatar";

  // Yüklenen PDF listesi
  const fileListHtml = userFiles
    .map(
      (f) => `
    <li class="list-group-item d-flex justify-content-between align-items-center bg-transparent">
      <span>${f.title}</span>
      <div>
        <a href="/view/${encodeURIComponent(
          f.filename
        )}" class="btn btn-sm btn-outline-light me-2">Görüntüle</a>
        <form action="/delete-pdf/${encodeURIComponent(
          f.filename
        )}" method="POST" style="display:inline-block" onsubmit="return confirm('Bu dosyayı silmek istediğine emin misin?');">
          <button class="btn btn-sm btn-outline-danger">Sil</button>
        </form>
      </div>
    </li>
  `
    )
    .join("");

  // Favori PDF listesi
  const favoriteFiles = allFiles.filter((f) => favorites.includes(f.filename));
  const favoritesHtml = favoriteFiles
    .map(
      (f) => `
    <li class="list-group-item d-flex justify-content-between align-items-center bg-transparent">
      <span>${f.title}</span>
      <a href="/view/${encodeURIComponent(
        f.filename
      )}" class="btn btn-sm btn-outline-success">Görüntüle</a>
    </li>
  `
    )
    .join("");

  // Rozetler
  const badgeHtml = badges
    .map((b) => `<span class="badge bg-success me-2">${b}</span>`)
    .join("");

  // HTML
  res.send(`
  <!DOCTYPE html>
  <html lang="tr">
  <head>
    <meta charset="UTF-8">
    <title>Profil - ${username}</title>
    <!-- Bootstrap 5 -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <!-- Google Font: Space Grotesk -->
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <!-- Font Awesome 6 -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
      :root {
        --bg-dark: #0a192f;
        --accent: #64ffda;
        --text-primary: #ccd6f6;
        --text-secondary: #8892b0;
      }
      body {
        background-color: var(--bg-dark);
        color: var(--text-primary);
        font-family: 'Space Grotesk', sans-serif;
        margin: 0; padding: 0;
      }
      .navbar-dark.bg-dark-80 {
        background-color: rgba(10,25,47,0.8) !important;
      }
      .text-accent {
        color: var(--accent) !important;
      }
      .btn-accent {
        background-color: var(--accent);
        color: #0a192f;
        border: none;
        border-radius: 12px;
        transition: transform 0.2s ease;
      }
      .btn-accent:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 10px rgba(100,255,218,0.2);
      }
      .avatar-img {
        width: 150px; height: 150px;
        border-radius: 50%;
        object-fit: cover;
        border: 3px solid var(--accent);
      }
      .bg-dark-custom {
        background: rgba(16,24,39,0.8);
        border: 1px solid rgba(100,255,218,0.1);
        border-radius: 10px;
      }
      .list-group-item {
        border: 1px solid rgba(255,255,255,0.1);
        color: #ccd6f6;
      }
    </style>
  </head>
  <body>
    <nav class="navbar navbar-expand-lg navbar-dark bg-dark-80 fixed-top">
      <div class="container">
        <a class="navbar-brand text-accent fs-4" href="/">
          <i class="fas fa-atom me-2"></i>ACADEMIX
        </a>
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
          <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="navbarNav">
          <ul class="navbar-nav ms-auto">
            <li class="nav-item mx-2"><a class="nav-link" href="/forum">Forum</a></li>
            <li class="nav-item mx-2"><a class="nav-link" href="/files">PDF'ler</a></li>
            <li class="nav-item mx-2"><a class="nav-link active" href="/profile">Profil</a></li>
            <li class="nav-item mx-2"><a class="nav-link" href="/dashboard.html">Dashboard</a></li>
            <li class="nav-item mx-2"><a class="nav-link" href="/logout">Çıkış</a></li>
          </ul>
        </div>
      </div>
    </nav>

    <div class="container py-5 mt-5">
      <div class="d-flex align-items-center mb-4 gap-4">
        <img src="${avatarImg}" alt="Avatar" class="avatar-img">
        <div>
          <h1 class="mb-1">Hoş geldin, <span class="text-accent">${username}</span></h1>
          <div class="mt-2">${
            badgeHtml || '<span class="text-secondary">Hiç rozetin yok.</span>'
          }</div>
          <form action="/upload-avatar" method="POST" enctype="multipart/form-data">
            <input type="file" name="avatar" accept="image/*" required>
            <button class="btn btn-sm btn-outline-light mt-2">Avatarı Güncelle</button>
          </form>
        </div>
      </div>

      <div class="row g-4 mb-4">
        <div class="col-md-4">
          <div class="p-3 bg-dark-custom">
            <h5 class="text-accent">Toplam PDF</h5>
            <p class="fs-4">${totalFiles}</p>
          </div>
        </div>
        <div class="col-md-4">
          <div class="p-3 bg-dark-custom">
            <h5 class="text-accent">Toplam Beğeni</h5>
            <p class="fs-4">${totalLikes}</p>
          </div>
        </div>
        <div class="col-md-4">
          <div class="p-3 bg-dark-custom">
            <h5 class="text-accent">Toplam Yorum</h5>
            <p class="fs-4">${totalComments}</p>
          </div>
        </div>
      </div>

      <h4 class="text-accent mb-3">Yüklediğin PDF'ler</h4>
      <ul class="list-group mb-4">
        ${
          fileListHtml ||
          '<li class="list-group-item bg-transparent">Hiç PDF yüklememişsin.</li>'
        }
      </ul>

      <h4 class="text-accent mb-3">Favori PDF'lerim</h4>
      <ul class="list-group mb-4">
        ${
          favoritesHtml ||
          '<li class="list-group-item bg-transparent">Favoriye eklenmiş PDF yok.</li>'
        }
      </ul>

      <h4 class="text-accent mt-5">Kullanıcı Adı Değiştir</h4>
      <form action="/change-username" method="POST" class="mb-4">
        <div class="mb-3">
          <label class="form-label">Yeni Kullanıcı Adı</label>
          <input type="text" name="newUsername" class="form-control" required>
        </div>
        <button class="btn btn-info">Kullanıcı Adını Güncelle</button>
      </form>

      <h4 class="text-accent mt-5">Şifre Değiştir</h4>
      <form action="/change-password" method="POST" class="mb-4">
        <div class="mb-3">
          <label class="form-label">Eski Şifre</label>
          <input type="password" name="oldPassword" class="form-control" required>
        </div>
        <div class="mb-3">
          <label class="form-label">Yeni Şifre</label>
          <input type="password" name="newPassword" class="form-control" required>
        </div>
        <button class="btn btn-warning">Şifreyi Güncelle</button>
      </form>

      <a href="/dashboard.html" class="btn btn-accent">Dashboard</a>
      <a href="/logout" class="btn btn-danger ms-2">Çıkış Yap</a>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
  </body>
  </html>
  `);
});

////////////////////////////////////////////////////////
// 9) Socket.IO (Genel ve Özel Sohbet)
////////////////////////////////////////////////////////

/**
 * Socket.IO ile gerçek zamanlı iletişim.
 * - joinRoom, chatMessage -> Genel oda
 * - joinPrivateRoom, privateMessage -> Özel oda
 */
io.on("connection", (socket) => {
  console.log("Bir kullanıcı bağlandı.");

  // Genel oda
  socket.on("joinRoom", (room) => {
    socket.join(room);
    console.log(`Kullanıcı '${socket.id}' -> Oda: ${room}`);
  });
  socket.on("chatMessage", (data) => {
    io.to(data.room).emit("chatMessage", data);
  });

  // Özel oda
  socket.on("joinPrivateRoom", (room) => {
    socket.join(room);
    console.log(`Kullanıcı '${socket.id}' özel odaya katıldı: ${room}`);
  });
  socket.on("privateMessage", (data) => {
    io.to(data.room).emit("privateMessage", data);
  });

  socket.on("disconnect", () => {
    console.log("Bir kullanıcı ayrıldı.", socket.id);
  });
});

////////////////////////////////////////////////////////
// 10) Sunucuyu Başlat
////////////////////////////////////////////////////////
/**
 * Sunucuyu başlatıyoruz.
 * Hem HTTP hem de Socket.IO bu server üzerinde çalışacak.
 */
server.listen(port, () => {
  console.log(`Server ${port} portunda çalışıyor: http://localhost:${port}`);
});


