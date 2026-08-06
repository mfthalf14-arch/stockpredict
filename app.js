/*
  StockPredict — app.js (v4, clean)

  LOGIKA:
  - Upload file = data historis (bebas jumlahnya)
  - Pilih 1/2/3 = berapa bulan ke DEPAN yang diprediksi
  - Bulan prediksi dihitung dari bulan terakhir data
  - Demo & file upload state BENAR-BENAR terpisah
  - resetData() dipanggil setiap kali file/sumber data berubah
*/

"use strict";

/* ══════════════════════════════════════════════
   STATE — satu-satunya sumber kebenaran
══════════════════════════════════════════════ */
var S = {
  files: [], // File[] dari input — kosong saat demo
  isDemo: false,
  nPred: 1, // berapa bulan ke depan

  // diisi setelah runPrediction
  rawData: null, // {products[], months[], monthYears[], sales{}}
  results: null, // {produk: result}
  predMonths: [], // ["Januari 2026", "Februari 2026", ...]

  stokMap: {},
  safetyPct: 10,
  charts: {},
  activeProd: null,
};

/* ══════════════════════════════════════════════
   KONSTANTA
══════════════════════════════════════════════ */
var BULAN = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];
var WARNA = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#d97706",
  "#7c3aed",
  "#0891b2",
  "#be185d",
  "#65a30d",
  "#9333ea",
  "#0f766e",
];
var DEMO_PROD = [
  "Beras 5kg",
  "Minyak Goreng",
  "Gula Pasir",
  "Telur Ayam",
  "Tepung Terigu",
  "Kecap Manis",
  "Sambal Botol",
  "Sabun Mandi",
  "Shampoo",
  "Detergen",
];
var DEMO_BASE = [1200, 850, 600, 950, 400, 320, 280, 760, 540, 900];
var DEMO_SLOPE = [80, 45, 20, 60, 15, 10, 12, 30, 25, 50];

/* ══════════════════════════════════════════════
   HELPER
══════════════════════════════════════════════ */
function $(id) {
  return document.getElementById(id);
}
function fmt(n) {
  return Math.round(n).toLocaleString("id-ID");
}
function fix2(n) {
  return Number(n).toFixed(2);
}
function fix1(n) {
  return Number(n).toFixed(1);
}
function fix4(n) {
  return Number(n).toFixed(4);
}
function esc(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function addBln(my, n) {
  var t = my.month - 1 + n;
  return { year: my.year + Math.floor(t / 12), month: (t % 12) + 1 };
}
function fmtBln(my) {
  return BULAN[my.month - 1] + " " + my.year;
}

// Deteksi bulan & tahun dari string nama file
function detekBulan(str) {
  if (!str) return null;
  str = String(str).trim();

  // Pola angka: 2025-11, 11-2025, 2025/11, 11/2025
  var r;
  r = str.match(/(\d{4})[-\/](\d{1,2})/);
  if (r) return { year: parseInt(r[1]), month: parseInt(r[2]) };
  r = str.match(/(\d{1,2})[-\/](\d{4})/);
  if (r) return { year: parseInt(r[2]), month: parseInt(r[1]) };

  // Pola nama bulan Indonesia/Inggris
  var aliases = [
    ["januari", "jan", "january"],
    ["februari", "feb", "february"],
    ["maret", "mar", "march"],
    ["april", "apr"],
    ["mei", "may"],
    ["juni", "jun", "june"],
    ["juli", "jul", "july"],
    ["agustus", "ags", "aug", "august"],
    ["september", "sep", "sept"],
    ["oktober", "okt", "oct", "october"],
    ["november", "nov"],
    ["desember", "des", "dec", "december"],
  ];
  var lower = str.toLowerCase();
  for (var i = 0; i < aliases.length; i++) {
    for (var j = 0; j < aliases[i].length; j++) {
      if (lower.indexOf(aliases[i][j]) !== -1) {
        var yr = str.match(/\d{4}/);
        return {
          year: yr ? parseInt(yr[0]) : new Date().getFullYear(),
          month: i + 1,
        };
      }
    }
  }
  return null;
}

function seededRng(seed) {
  var s = seed;
  return function () {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

/* ══════════════════════════════════════════════
   RESET — bersihkan semua data hasil proses
   Dipanggil setiap kali sumber data berubah
══════════════════════════════════════════════ */
function resetData() {
  S.rawData = null;
  S.results = null;
  S.predMonths = [];
  S.stokMap = {};
  S.activeProd = null;

  // Hancurkan semua chart agar tidak ada sisa render lama
  Object.keys(S.charts).forEach(function (k) {
    try {
      S.charts[k].destroy();
    } catch (e) {}
  });
  S.charts = {};

  // Reset badge topbar & footer sidebar
  $("tb-badge").textContent = "Belum ada data";
  $("tb-badge").className = "tb-chip status";
  $("sb-footer-hist").textContent = "Historis: —";
  $("sb-footer-pred").textContent = "Prediksi: —";

  // Sembunyikan result card di kelola stok
  var src = $("stok-result-card");
  if (src) src.style.display = "none";
}

/* ══════════════════════════════════════════════
   NAVIGASI
══════════════════════════════════════════════ */
var PAGE_TITLE = {
  upload: "Upload Data Penjualan",
  dashboard: "Dashboard",
  detail: "Detail Produk",
  prediksi: "Tabel Prediksi & Kurva",
  stok: "Kelola Stok",
};
var PAIR = {
  dashboard: ["dash-empty", "dash-content"],
  detail: ["detail-empty", "detail-content"],
  prediksi: ["prediksi-empty", "prediksi-content"],
  stok: ["stok-empty", "stok-content"],
};

function goTo(name) {
  document.querySelectorAll(".page").forEach(function (p) {
    p.classList.remove("active");
  });
  document.querySelectorAll(".sb-item").forEach(function (i) {
    i.classList.remove("active");
  });

  var pg = $("page-" + name);
  if (pg) pg.classList.add("active");

  var mn = document.querySelector('.sb-item[data-page="' + name + '"]');
  if (mn) mn.classList.add("active");

  $("tb-title").textContent = PAGE_TITLE[name] || name;

  // Tampilkan empty state atau konten
  if (PAIR[name]) {
    var ada = !!S.results;
    $(PAIR[name][0]).style.display = ada ? "none" : "flex";
    $(PAIR[name][1]).style.display = ada ? "block" : "none";
  }

  if (name === "dashboard") renderDashboard();
  if (name === "detail") renderDetail();
  if (name === "prediksi") renderPrediksi();
  if (name === "stok") renderStok();
}

/* ══════════════════════════════════════════════
   PILIH JUMLAH BULAN PREDIKSI
══════════════════════════════════════════════ */
function setPred(n) {
  n = parseInt(n);
  if (isNaN(n) || n < 1) n = 1;
  if (n > 12) n = 12;
  S.nPred = n;
  var inp = $("pred-input");
  if (inp) inp.value = n;
  updateInfoPrediksi();
}

function updateInfoPrediksi() {
  var el = $("prediksi-info");
  if (!el) return;
  var lastMY = getLastMY();
  if (!lastMY) {
    el.innerHTML =
      "Upload file terlebih dahulu. Bulan prediksi dihitung otomatis dari bulan terakhir data.";
    return;
  }
  var list = [];
  for (var i = 1; i <= S.nPred; i++) {
    list.push("<strong>" + fmtBln(addBln(lastMY, i)) + "</strong>");
  }
  el.innerHTML =
    "Data terakhir: <strong>" +
    fmtBln(lastMY) +
    "</strong> &rarr; Prediksi: " +
    list.join(", ") +
    ".";
}

// Bulan terakhir dari file yang diupload (deteksi nama file)
function getLastMY() {
  if (S.isDemo && S.rawData && S.rawData.monthYears.length) {
    var my = S.rawData.monthYears;
    return my[my.length - 1];
  }
  if (!S.files.length) return null;
  var det = [];
  S.files.forEach(function (f) {
    var m = detekBulan(f.name);
    if (m) det.push(m);
  });
  if (!det.length) return null;
  det.sort(function (a, b) {
    return a.year * 12 + a.month - (b.year * 12 + b.month);
  });
  return det[det.length - 1];
}

/* ══════════════════════════════════════════════
   HANDLE FILE UPLOAD
══════════════════════════════════════════════ */
function onDrop(e) {
  e.preventDefault();
  $("dropZone").classList.remove("dragover");
  onFiles(e.dataTransfer.files);
}

function onFiles(fileList) {
  // Bersihkan semua data lama — termasuk sisa data demo jika ada
  resetData();

  // Paksa flag & data bersih — tidak ada yang boleh tersisa dari sesi sebelumnya
  S.isDemo = false;
  S.rawData = null;
  S.files = Array.from(fileList);

  renderFileList();
  updateInfoPrediksi();

  if (S.files.length > 0) {
    $("upload-status-card").style.display = "block";
    $("status-text").innerHTML =
      '<span class="text-success"><strong>' +
      S.files.length +
      " file</strong> dipilih. Pilih jumlah bulan prediksi, lalu klik Jalankan Prediksi.</span>";
    var btn = $("btn-run");
    btn.disabled = false;
    btn.style.opacity = "1";
  } else {
    $("upload-status-card").style.display = "none";
  }
}

function renderFileList() {
  var el = $("file-list");
  if (!el) return;
  if (!S.files.length) {
    el.innerHTML =
      '<div class="file-item" style="opacity:.4">' +
      '<span class="f-icon">📂</span>' +
      '<span class="f-name" style="color:var(--text-muted)">Belum ada file dipilih</span>' +
      '<span class="f-status missing">—</span></div>';
    return;
  }
  el.innerHTML = S.files
    .map(function (f, i) {
      var my = detekBulan(f.name);
      var info = my ? fmtBln(my) : "Bulan " + (i + 1);
      var size = (f.size / 1024).toFixed(1);
      return (
        '<div class="file-item">' +
        '<span class="f-icon">📊</span>' +
        '<span class="f-name">' +
        f.name +
        "</span>" +
        '<span class="f-size">' +
        info +
        "&nbsp;|&nbsp;" +
        size +
        " KB</span>" +
        '<span class="f-status ready">✓ Siap</span>' +
        "</div>"
      );
    })
    .join("");
}

/* ══════════════════════════════════════════════
   DATA DEMO
══════════════════════════════════════════════ */
function loadDemo() {
  resetData();
  S.files = [];
  S.isDemo = true;

  var rng = seededRng(42);
  var demoMY = [
    { year: 2025, month: 8 },
    { year: 2025, month: 9 },
    { year: 2025, month: 10 },
    { year: 2025, month: 11 },
    { year: 2025, month: 12 },
  ];
  var months = demoMY.map(fmtBln);
  var sales = {};
  DEMO_PROD.forEach(function (p, pi) {
    sales[p] = months.map(function (_, mi) {
      return Math.round(
        DEMO_BASE[pi] + DEMO_SLOPE[pi] * (mi + 1) + (rng() - 0.5) * 200,
      );
    });
  });

  // rawData langsung di-set — tidak ada file yang dibaca
  S.rawData = {
    products: DEMO_PROD,
    months: months,
    monthYears: demoMY,
    sales: sales,
  };

  // Tampilkan daftar file simulasi
  $("file-list").innerHTML = demoMY
    .map(function (my) {
      return (
        '<div class="file-item">' +
        '<span class="f-icon">📊</span>' +
        '<span class="f-name" style="font-style:italic;color:var(--text-muted)">Demo_' +
        fmtBln(my).replace(" ", "_") +
        ".xlsx</span>" +
        '<span class="f-size">' +
        fmtBln(my) +
        "&nbsp;|&nbsp;Demo</span>" +
        '<span class="f-status ready">✓ Demo</span>' +
        "</div>"
      );
    })
    .join("");

  updateInfoPrediksi();

  $("upload-status-card").style.display = "block";
  $("status-text").innerHTML =
    '<span class="text-success">✓ Data demo dimuat — <strong>5 bulan (Ags–Des 2025)</strong>, <strong>10 produk</strong>.</span>';
  $("btn-run").disabled = false;
  $("btn-run").style.opacity = "1";

  runPrediction();
}

/* ══════════════════════════════════════════════
   PARSE EXCEL
══════════════════════════════════════════════ */
function parseXLS(file) {
  return new Promise(function (res, rej) {
    var r = new FileReader();
    r.onload = function (e) {
      try {
        var wb = XLSX.read(e.target.result, { type: "binary" });
        var ws = wb.Sheets[wb.SheetNames[0]];
        res(XLSX.utils.sheet_to_json(ws));
      } catch (err) {
        rej(err);
      }
    };
    r.onerror = rej;
    r.readAsBinaryString(file);
  });
}

/* ══════════════════════════════════════════════
   BACA DATA DARI FILE
══════════════════════════════════════════════ */
async function bacaFile() {
  var allSales = {};
  var months = [];
  var monthYears = [];

  // Urutkan file berdasarkan bulan
  var sorted = S.files
    .map(function (f, i) {
      return { f: f, my: detekBulan(f.name), i: i };
    })
    .sort(function (a, b) {
      if (!a.my && !b.my) return a.i - b.i;
      if (!a.my) return 1;
      if (!b.my) return -1;
      return a.my.year * 12 + a.my.month - (b.my.year * 12 + b.my.month);
    });

  for (var i = 0; i < sorted.length; i++) {
    var item = sorted[i];
    var rows = await parseXLS(item.f);
    var label = item.my
      ? fmtBln(item.my)
      : item.f.name.replace(/\.(xlsx?|csv)$/i, "").trim() || "Bulan " + (i + 1);

    months.push(label);
    if (item.my) monthYears.push(item.my);

    rows.forEach(function (row) {
      var keys = Object.keys(row);
      var kProd = keys.find(function (k) {
        return /produk|nama|item|barang|name/i.test(k);
      });
      var kQty = keys.find(function (k) {
        return /qty|jumlah|jual|terjual|unit|penjualan|sell|sold/i.test(k);
      });
      if (!kProd || !kQty) return;

      var pName = String(row[kProd]).trim();
      var qty = parseInt(row[kQty]) || 0;
      if (!pName || pName === "-") return;

      if (!allSales[pName]) {
        // Produk pertama kali muncul di file ke-i: isi bulan sebelumnya dengan 0
        allSales[pName] = new Array(months.length - 1).fill(0);
      }
      allSales[pName].push(qty);
    });
  }

  // Ratakan panjang array semua produk
  var prods = Object.keys(allSales);
  prods.forEach(function (p) {
    while (allSales[p].length < months.length) allSales[p].push(0);
  });

  // Simpan ke S.rawData
  S.rawData = {
    products: prods,
    months: months,
    monthYears: monthYears,
    sales: allSales,
  };
}

/* ══════════════════════════════════════════════
   LINEAR REGRESSION (OLS)
══════════════════════════════════════════════ */
function olsReg(xs, ys) {
  var n = xs.length;
  if (n < 2) {
    var m = ys[0] || 0;
    return {
      sl: 0,
      ic: m,
      pred: function () {
        return m;
      },
      r2: 1,
      mae: 0,
      mape: 0,
    };
  }
  var sx = 0,
    sy = 0,
    sxy = 0,
    sx2 = 0;
  for (var i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
    sxy += xs[i] * ys[i];
    sx2 += xs[i] * xs[i];
  }
  var den = n * sx2 - sx * sx;
  var sl = den !== 0 ? (n * sxy - sx * sy) / den : 0;
  var ic = (sy - sl * sx) / n;

  var ym = sy / n,
    sst = 0,
    ssr = 0,
    mae = 0,
    mape = 0;
  for (var i = 0; i < n; i++) {
    var p = sl * xs[i] + ic;
    sst += (ys[i] - ym) ** 2;
    ssr += (ys[i] - p) ** 2;
    mae += Math.abs(ys[i] - p);
    mape += ys[i] !== 0 ? Math.abs((ys[i] - p) / ys[i]) * 100 : 0;
  }
  return {
    sl: sl,
    ic: ic,
    pred: function (x) {
      return sl * x + ic;
    },
    r2: sst > 0 ? 1 - ssr / sst : 1,
    mae: mae / n,
    mape: mape / n,
  };
}

/* ══════════════════════════════════════════════
   HITUNG REGRESI — menggunakan S.rawData & S.nPred
══════════════════════════════════════════════ */
function hitungRegresi() {
  var D = S.rawData;
  var nPred = S.nPred; // ← pakai nilai terkini dari State
  var res = {};

  // Hitung nama bulan prediksi
  var lastMY = D.monthYears.length
    ? D.monthYears[D.monthYears.length - 1]
    : null;
  S.predMonths = [];
  for (var i = 1; i <= nPred; i++) {
    S.predMonths.push(lastMY ? fmtBln(addBln(lastMY, i)) : "Prediksi +" + i);
  }

  D.products.forEach(function (p) {
    var ys = (D.sales[p] || []).map(function (v) {
      return Math.max(0, v);
    });
    var xs = ys.map(function (_, i) {
      return i + 1;
    });
    var m = olsReg(xs, ys);

    // Prediksi untuk SETIAP bulan ke depan sesuai nPred
    var preds = [];
    for (var i = 1; i <= nPred; i++) {
      preds.push(Math.max(0, Math.round(m.pred(xs.length + i))));
    }

    var avg = Math.round(
      ys.reduce(function (a, b) {
        return a + b;
      }, 0) / ys.length,
    );
    var trend = m.sl > 5 ? "naik" : m.sl < -5 ? "turun" : "stabil";
    var fitted = xs.map(function (x) {
      return Math.max(0, Math.round(m.pred(x)));
    });

    res[p] = {
      m: m,
      xs: xs,
      ys: ys,
      months: D.months,
      preds: preds, // array panjang nPred
      pred: preds[0], // shortcut bulan pertama
      avg: avg,
      trend: trend,
      sl: m.sl,
      ic: m.ic,
      r2: m.r2,
      mae: m.mae,
      mape: m.mape,
      fitted: fitted,
    };
  });

  S.results = res;
  S.activeProd = D.products[0] || null;

  // Init stokMap hanya untuk produk baru
  D.products.forEach(function (p) {
    if (!(p in S.stokMap)) S.stokMap[p] = Math.round(res[p].avg * 0.5);
  });
}

/* ══════════════════════════════════════════════
   JALANKAN PREDIKSI
══════════════════════════════════════════════ */
async function runPrediction() {
  var btn = $("btn-run");
  btn.innerHTML = "⏳ Memproses...";
  btn.disabled = true;

  try {
    // Kalau sumber data adalah file (bukan demo), selalu baca ulang dari file
    // S.isDemo harus false = berasal dari upload user, bukan dari loadDemo()
    if (!S.isDemo) {
      if (S.files.length === 0) {
        $("status-text").innerHTML =
          '<span class="text-danger">❌ Pilih file terlebih dahulu.</span>';
        return;
      }
      S.rawData = null; // paksa null agar tidak pakai sisa data demo/file lama
      await bacaFile();
    }
    // rawData sudah ada (dari file atau demo), hitung regresi
    hitungRegresi();

    // Update UI
    $("tb-badge").textContent = "✓ Prediksi Selesai";
    $("tb-badge").className = "tb-chip ready";

    var h = S.rawData.months;
    $("sb-footer-hist").textContent =
      "Historis: " + h[0] + " – " + h[h.length - 1];
    $("sb-footer-pred").textContent =
      "Prediksi: " +
      (S.predMonths.length > 1
        ? S.predMonths[0] + " – " + S.predMonths[S.predMonths.length - 1]
        : S.predMonths[0]);

    goTo("dashboard");
    generateAIInsight();
  } catch (err) {
    console.error(err);
    $("status-text").innerHTML =
      '<span class="text-danger">❌ Gagal membaca file. ' +
      "Pastikan kolom Excel: <strong>Produk</strong> &amp; <strong>Qty</strong>.</span>";
  } finally {
    btn.innerHTML = "🧠 Jalankan Prediksi";
    btn.disabled = false;
  }
}

/* ══════════════════════════════════════════════
   CHART HELPER
══════════════════════════════════════════════ */
function killChart(k) {
  if (S.charts[k]) {
    try {
      S.charts[k].destroy();
    } catch (e) {}
    delete S.charts[k];
  }
}

/* ══════════════════════════════════════════════
   RENDER: DASHBOARD
══════════════════════════════════════════════ */
function renderDashboard() {
  if (!S.results) return;
  var R = S.results,
    prods = Object.keys(R);

  var tPred = prods.reduce(function (a, p) {
    return a + R[p].pred;
  }, 0);
  var tAvg = prods.reduce(function (a, p) {
    return a + R[p].avg;
  }, 0);
  var tSS = Math.round((tPred * S.safetyPct) / 100);
  var naik = prods.filter(function (p) {
    return R[p].trend === "naik";
  }).length;
  var turun = prods.filter(function (p) {
    return R[p].trend === "turun";
  }).length;

  var pLabel =
    S.predMonths.length > 1
      ? S.predMonths[0] + " – " + S.predMonths[S.predMonths.length - 1]
      : S.predMonths[0] || "Bulan Depan";

  $("dash-metrics").innerHTML =
    '<div class="metric-card accent">' +
    '<div class="metric-label">Total Prediksi (' +
    pLabel +
    ")</div>" +
    '<div class="metric-value">' +
    fmt(tPred) +
    "</div>" +
    '<div class="metric-sub">unit penjualan</div></div>' +
    '<div class="metric-card">' +
    '<div class="metric-label">Rata-rata Historis/Bulan</div>' +
    '<div class="metric-value">' +
    fmt(tAvg) +
    "</div>" +
    '<div class="metric-sub">unit/bulan</div></div>' +
    '<div class="metric-card warning">' +
    '<div class="metric-label">Safety Stock (' +
    S.safetyPct +
    "%)</div>" +
    '<div class="metric-value">' +
    fmt(tSS) +
    "</div>" +
    '<div class="metric-sub">unit buffer</div></div>' +
    '<div class="metric-card success">' +
    '<div class="metric-label">Produk Trend Naik</div>' +
    '<div class="metric-value">' +
    naik +
    '<span style="font-size:14px;font-weight:400"> / ' +
    prods.length +
    "</span></div>" +
    '<div class="metric-sub">' +
    turun +
    " turun, " +
    (prods.length - naik - turun) +
    " stabil</div></div>";

  // Chart 1: Total prediksi per bulan prediksi
  killChart("cBln");
  var totPerPredBln = S.predMonths.map(function (_, mi) {
    return prods.reduce(function (a, p) {
      return a + (R[p].preds[mi] || 0);
    }, 0);
  });
  S.charts["cBln"] = new Chart($("chartBulanan"), {
    type: "bar",
    data: {
      labels: S.predMonths,
      datasets: [
        {
          label: "Total Prediksi",
          data: totPerPredBln,
          backgroundColor: "#2563eb",
          borderRadius: 6,
          borderSkipped: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, grid: { color: "#f1f5f9" } } },
    },
  });

  // Chart 2: Prediksi per produk — hanya bulan prediksi, tanpa historis
  killChart("cProd");
  var dsPred = S.predMonths.map(function (m, mi) {
    return {
      label: m,
      data: prods.map(function (p) {
        return R[p].preds[mi] || 0;
      }),
      backgroundColor: WARNA[mi % WARNA.length],
      borderRadius: 4,
    };
  });
  S.charts["cProd"] = new Chart($("chartProduk"), {
    type: "bar",
    data: { labels: prods, datasets: dsPred },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { boxWidth: 12, font: { size: 11 } } } },
      scales: { y: { beginAtZero: true, grid: { color: "#f1f5f9" } } },
    },
  });
}

/* ══════════════════════════════════════════════
   RENDER: DETAIL PRODUK
══════════════════════════════════════════════ */
function renderDetail() {
  if (!S.results) return;
  var prods = Object.keys(S.results);

  $("prod-tabs").innerHTML = prods
    .map(function (p) {
      return (
        '<div class="prod-tab ' +
        (p === S.activeProd ? "active" : "") +
        '" onclick="pickProd(\'' +
        esc(p) +
        "')\">" +
        p +
        "</div>"
      );
    })
    .join("");

  if (S.activeProd) showProdDetail(S.activeProd);
}

function pickProd(p) {
  S.activeProd = p;
  renderDetail();
}

function showProdDetail(p) {
  var d = S.results[p];
  var ss = Math.round((d.pred * S.safetyPct) / 100);
  var pL = S.predMonths[0] || "Bulan Depan";

  $("detail-prod-name").textContent = "📦 " + p;

  $("detail-metrics").innerHTML =
    '<div class="metric-card accent">' +
    '<div class="metric-label">Prediksi ' +
    pL +
    "</div>" +
    '<div class="metric-value">' +
    fmt(d.pred) +
    "</div>" +
    '<div class="metric-sub">unit</div></div>' +
    '<div class="metric-card warning">' +
    '<div class="metric-label">Safety Stock (' +
    S.safetyPct +
    "%)</div>" +
    '<div class="metric-value">' +
    fmt(ss) +
    "</div>" +
    '<div class="metric-sub">unit buffer</div></div>' +
    '<div class="metric-card">' +
    '<div class="metric-label">Total Kebutuhan</div>' +
    '<div class="metric-value">' +
    fmt(d.pred + ss) +
    "</div>" +
    '<div class="metric-sub">unit</div></div>' +
    '<div class="metric-card ' +
    (d.trend === "naik" ? "success" : d.trend === "turun" ? "danger" : "") +
    '">' +
    '<div class="metric-label">Trend</div>' +
    '<div class="metric-value" style="font-size:18px;">' +
    (d.trend === "naik" ? "📈" : d.trend === "turun" ? "📉" : "➡️") +
    " " +
    d.trend +
    "</div>" +
    '<div class="metric-sub">kecenderungan</div></div>';

  killChart("cDet");
  // Tampilkan hanya bulan prediksi + 1 titik terakhir historis sebagai jangkar
  var jangkarLabel = d.months[d.months.length - 1];
  var jangkarVal = d.ys[d.ys.length - 1];
  var chartLabels = [jangkarLabel].concat(S.predMonths);
  var aktualLine = [jangkarVal].concat(
    S.predMonths.map(function () {
      return null;
    }),
  );
  var predLine = [jangkarVal].concat(d.preds);
  var regExt = [d.fitted[d.fitted.length - 1]].concat(
    d.preds.map(function (_, i) {
      return Math.max(0, Math.round(d.m.pred(d.xs.length + i + 1)));
    }),
  );

  S.charts["cDet"] = new Chart($("chartDetail"), {
    type: "line",
    data: {
      labels: chartLabels,
      datasets: [
        {
          label: "Data Terakhir",
          data: aktualLine,
          borderColor: "#2563eb",
          backgroundColor: "rgba(37,99,235,0.07)",
          borderWidth: 2,
          pointRadius: 6,
          fill: true,
          tension: 0.3,
        },
        {
          label: "Kurva Regresi",
          data: regExt,
          borderColor: "#94a3b8",
          borderDash: [6, 4],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
          tension: 0,
        },
        {
          label: "Prediksi",
          data: predLine,
          borderColor: "#dc2626",
          backgroundColor: "rgba(220,38,38,0.12)",
          borderWidth: 2.5,
          pointRadius: 8,
          pointStyle: "triangle",
          fill: false,
          tension: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { boxWidth: 12, font: { size: 12 } } } },
      scales: { y: { beginAtZero: false, grid: { color: "#f1f5f9" } } },
    },
  });

  $("detail-info").innerHTML =
    '<div class="info-row"><span class="info-key">Persamaan Regresi</span>' +
    '<span class="info-val font-mono">y = ' +
    fix2(d.sl) +
    "x + " +
    fix2(d.ic) +
    "</span></div>" +
    '<div class="info-row"><span class="info-key">R²</span><span class="info-val">' +
    fix4(d.r2) +
    "</span></div>" +
    '<div class="info-row"><span class="info-key">MAE</span><span class="info-val">' +
    fmt(d.mae) +
    " unit</span></div>" +
    '<div class="info-row"><span class="info-key">MAPE</span><span class="info-val">' +
    fix2(d.mape) +
    "%</span></div>" +
    '<div class="info-row"><span class="info-key">Data Historis</span><span class="info-val">' +
    d.months.length +
    " bulan</span></div>" +
    '<div class="info-row"><span class="info-key">Bulan Prediksi</span><span class="info-val">' +
    S.predMonths.join(", ") +
    "</span></div>" +
    '<div class="info-row"><span class="info-key">Rata-rata/Bulan</span><span class="info-val">' +
    fmt(d.avg) +
    " unit</span></div>";
}

/* ══════════════════════════════════════════════
   RENDER: TABEL PREDIKSI
══════════════════════════════════════════════ */
function renderPrediksi() {
  if (!S.results) return;
  var R = S.results,
    prods = Object.keys(R);

  // Kurva: gabungkan historis + prediksi dalam 1 grafik
  killChart("cReg");
  var allLabels = R[prods[0]].months.concat(S.predMonths);
  S.charts["cReg"] = new Chart($("chartRegresi"), {
    type: "line",
    data: {
      labels: allLabels,
      datasets: prods.map(function (p, i) {
        return {
          label: p,
          data: R[p].ys.concat(R[p].preds),
          borderColor: WARNA[i % WARNA.length],
          backgroundColor: "transparent",
          borderWidth: 2,
          pointRadius: 4,
          tension: 0.3,
        };
      }),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { boxWidth: 12, font: { size: 11 }, padding: 10 } },
      },
      scales: { y: { beginAtZero: false, grid: { color: "#f1f5f9" } } },
    },
  });

  // Header tabel dinamis sesuai jumlah bulan prediksi
  $("thead-prediksi").innerHTML =
    "<tr><th>Produk</th><th>Trend</th><th>Rata-rata/Bln</th>" +
    S.predMonths
      .map(function (m) {
        return "<th>Prediksi " + m + "</th>";
      })
      .join("") +
    "<th>Safety Stock</th><th>Total Kebutuhan</th><th>MAPE</th></tr>";

  var ss = S.safetyPct / 100;
  $("tbody-prediksi").innerHTML = prods
    .map(function (p) {
      var d = R[p];
      var sfU = Math.round(d.pred * ss);
      var tH =
        d.trend === "naik"
          ? '<span class="trend-naik">↑ Naik</span>'
          : d.trend === "turun"
            ? '<span class="trend-turun">↓ Turun</span>'
            : '<span class="trend-stabil">→ Stabil</span>';
      var predCols = d.preds
        .map(function (v) {
          return '<td class="font-mono text-accent fw-600">' + fmt(v) + "</td>";
        })
        .join("");
      return (
        "<tr>" +
        "<td><strong>" +
        p +
        "</strong></td>" +
        "<td>" +
        tH +
        "</td>" +
        '<td class="font-mono">' +
        fmt(d.avg) +
        "</td>" +
        predCols +
        '<td class="font-mono" style="color:var(--warning)">' +
        fmt(sfU) +
        "</td>" +
        '<td class="font-mono fw-600">' +
        fmt(d.pred + sfU) +
        "</td>" +
        '<td style="font-size:11px;color:var(--text-muted)">' +
        fix1(d.mape) +
        "%</td>" +
        "</tr>"
      );
    })
    .join("");
}

/* ══════════════════════════════════════════════
   RENDER: KELOLA STOK
══════════════════════════════════════════════ */
function renderStok() {
  if (!S.results) return;
  var R = S.results,
    prods = Object.keys(R);
  $("safety-pct-input").value = S.safetyPct;

  // Style reusable
  var thBase =
    "padding:9px 14px;font-size:11px;font-weight:600;text-transform:uppercase;" +
    "letter-spacing:.05em;background:var(--bg-secondary);border-bottom:1px solid var(--border-color);white-space:nowrap;";
  var tdBase =
    "padding:10px 14px;border-bottom:1px solid rgba(0,0,0,.05);vertical-align:middle;";

  // Header: Produk | Pred Jan | Pred Feb | ... | Stok Saat Ini
  var thCols =
    '<th style="' +
    thBase +
    'text-align:left;color:var(--text-secondary);">Produk</th>';
  S.predMonths.forEach(function (m) {
    thCols +=
      '<th style="' +
      thBase +
      'text-align:right;color:var(--accent);">Pred ' +
      m +
      "</th>";
  });
  thCols +=
    '<th style="' +
    thBase +
    'text-align:right;color:var(--text-secondary);">Stok Saat Ini</th>';

  // Baris per produk
  var tbRows = prods
    .map(function (p) {
      var sid = "si_" + p.replace(/\W/g, "_");
      var tdPreds = R[p].preds
        .map(function (v) {
          return (
            '<td style="' +
            tdBase +
            'text-align:right;font-weight:700;color:var(--accent);font-family:var(--font-mono);">' +
            fmt(v) +
            "</td>"
          );
        })
        .join("");
      return (
        "<tr>" +
        '<td style="' +
        tdBase +
        'font-weight:600;color:var(--text-primary);">' +
        p +
        "</td>" +
        tdPreds +
        '<td style="' +
        tdBase +
        'text-align:right;">' +
        '<input type="number" id="' +
        sid +
        '" value="' +
        (S.stokMap[p] || 0) +
        '" min="0"' +
        ' style="width:120px;padding:6px 10px;border:1.5px solid var(--border-color);' +
        "border-radius:6px;font-size:13px;text-align:right;font-family:var(--font-mono);" +
        'color:var(--text-primary);background:var(--bg-primary);">' +
        "</td>" +
        "</tr>"
      );
    })
    .join("");

  $("stok-inputs-grid").innerHTML =
    '<div class="table-wrap" style="overflow-x:auto;">' +
    '<table style="width:100%;border-collapse:collapse;font-size:13px;min-width:400px;">' +
    "<thead><tr>" +
    thCols +
    "</tr></thead>" +
    "<tbody>" +
    tbRows +
    "</tbody>" +
    "</table></div>";
}

function hitungStok() {
  if (!S.results) return;
  var R = S.results,
    prods = Object.keys(R);

  prods.forEach(function (p) {
    var el = $("si_" + p.replace(/\W/g, "_"));
    if (el) S.stokMap[p] = parseInt(el.value) || 0;
  });
  S.safetyPct = parseFloat($("safety-pct-input").value) || 10;
  var ss = S.safetyPct / 100;

  // Render section per bulan prediksi
  var htmlBulan = S.predMonths
    .map(function (bulan, mi) {
      var rows = prods.map(function (p) {
        var pred = R[p].preds[mi] || 0;
        var sfU = Math.round(pred * ss);
        var need = pred + sfU;
        var stok = S.stokMap[p] || 0;
        var sel = need - stok;
        return { p: p, pred: pred, sfU: sfU, need: need, stok: stok, sel: sel };
      });

      var tP = rows.reduce(function (a, r) {
        return a + r.pred;
      }, 0);
      var tS = rows.reduce(function (a, r) {
        return a + r.stok;
      }, 0);
      var tN = rows.reduce(function (a, r) {
        return a + r.need;
      }, 0);
      var tSel = tN - tS;
      var ac = tSel > 0 ? "danger" : "success";

      var tbRows = rows
        .map(function (r) {
          var dc =
            r.sel > 0
              ? "tambah"
              : r.sel < -(r.pred * 0.05)
                ? "kurangi"
                : "aman";
          var dl =
            r.sel > 0
              ? "+ Tambah " + fmt(r.sel)
              : r.sel < -(r.pred * 0.05)
                ? "− Kurangi " + fmt(Math.abs(r.sel))
                : "✓ Aman";
          return (
            "<tr>" +
            "<td><strong>" +
            r.p +
            "</strong></td>" +
            '<td class="font-mono">' +
            fmt(r.pred) +
            "</td>" +
            '<td class="font-mono" style="color:var(--warning)">' +
            fmt(r.sfU) +
            "</td>" +
            '<td class="font-mono">' +
            fmt(r.need) +
            "</td>" +
            '<td class="font-mono">' +
            fmt(r.stok) +
            "</td>" +
            '<td class="font-mono fw-600" style="color:' +
            (r.sel > 0 ? "var(--danger)" : "var(--success)") +
            ';">' +
            (r.sel > 0 ? "+" : "") +
            fmt(r.sel) +
            "</td>" +
            '<td><span class="badge ' +
            dc +
            '">' +
            dl +
            "</span></td>" +
            "</tr>"
          );
        })
        .join("");

      return (
        '<div style="margin-bottom:28px;">' +
        // Header bulan
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">' +
        '<div style="width:4px;height:24px;background:var(--accent);border-radius:2px;"></div>' +
        '<span style="font-size:16px;font-weight:700;color:var(--text-primary);">' +
        bulan +
        "</span>" +
        "</div>" +
        // Kartu ringkasan
        '<div class="metrics-grid" style="margin-bottom:12px;">' +
        '<div class="metric-card accent"><div class="metric-label">Total Prediksi</div><div class="metric-value">' +
        fmt(tP) +
        "</div></div>" +
        '<div class="metric-card"><div class="metric-label">Total Stok Ada</div><div class="metric-value">' +
        fmt(tS) +
        "</div></div>" +
        '<div class="metric-card"><div class="metric-label">Total Kebutuhan</div><div class="metric-value">' +
        fmt(tN) +
        "</div></div>" +
        '<div class="metric-card ' +
        ac +
        '"><div class="metric-label">' +
        (tSel > 0 ? "Kekurangan" : "Kelebihan") +
        '</div><div class="metric-value">' +
        fmt(Math.abs(tSel)) +
        "</div></div>" +
        "</div>" +
        // Alert
        '<div class="summary-alert ' +
        ac +
        '" style="margin-bottom:14px;">' +
        '<div class="sa-title">' +
        (tSel > 0 ? "⚠️ Stok Kurang!" : "✅ Stok Cukup") +
        "</div>" +
        '<div class="sa-sub">' +
        (tSel > 0
          ? "Perlu tambah <strong>" +
            fmt(tSel) +
            "</strong> unit untuk memenuhi kebutuhan " +
            bulan +
            " + safety stock " +
            S.safetyPct +
            "%."
          : "Stok saat ini melebihi kebutuhan sebesar <strong>" +
            fmt(Math.abs(tSel)) +
            "</strong> unit.") +
        "</div></div>" +
        // Tabel detail
        '<div class="table-wrap"><table>' +
        "<thead><tr>" +
        "<th>Produk</th><th>Prediksi</th><th>Safety Stock</th>" +
        "<th>Total Kebutuhan</th><th>Stok Ada</th><th>Selisih</th><th>Keputusan</th>" +
        "</tr></thead>" +
        "<tbody>" +
        tbRows +
        "</tbody>" +
        "</table></div>" +
        "</div>"
      );
    })
    .join(
      '<hr style="margin:4px 0 28px;border:none;border-top:1.5px solid var(--border-color);">',
    );

  $("stok-summary").innerHTML = htmlBulan;
  $("stok-result-card").style.display = "block";
  $("stok-result-card").scrollIntoView({ behavior: "smooth", block: "start" });
}
function generateAIInsight() {
  if (!S.results) return;

  let R = S.results;
  let prods = Object.keys(R);

  let html = "";

  prods.forEach(function (p) {
    let d = R[p];

    let safety = Math.round((d.pred * S.safetyPct) / 100);

    let total = d.pred + safety;

    let status = "";

    let rekomendasi = "";

    if (d.trend == "naik") {
      status = "📈 Permintaan meningkat";

      rekomendasi = "Disarankan menambah stok.";
    } else if (d.trend == "turun") {
      status = "📉 Permintaan menurun";

      rekomendasi = "Kurangi pembelian agar tidak overstock.";
    } else {
      status = "➡ Permintaan stabil";

      rekomendasi = "Pertahankan stok seperti sekarang.";
    }

    html += `

        <div class="ai-card">

            <h3>${p}</h3>

            <p><b>Prediksi :</b> ${fmt(d.pred)} unit</p>

            <p><b>Safety Stock :</b> ${fmt(safety)} unit</p>

            <p><b>Total Kebutuhan :</b> ${fmt(total)} unit</p>

            <p><b>Status :</b> ${status}</p>

            <p><b>AI Insight :</b> ${rekomendasi}</p>

        </div>

        <hr>

        `;
  });

  document.getElementById("aiResult").innerHTML = html;

  document.getElementById("aiModal").style.display = "block";
}

function closeAI() {
  document.getElementById("aiModal").style.display = "none";
}
/* ══════════════════════════════════════════════
   INIT
══════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", function () {
  setPred(1);
  renderFileList();

  // Sidebar navigasi
  document.querySelectorAll(".sb-item").forEach(function (el) {
    el.addEventListener("click", function () {
      goTo(el.dataset.page);
    });
  });

  // Pilih bulan prediksi via input number
  var predInp = $("pred-input");
  if (predInp) {
    predInp.addEventListener("change", function () {
      setPred(parseInt(this.value));
    });
    predInp.addEventListener("input", function () {
      setPred(parseInt(this.value));
    });
  }

  // Drop zone
  var dz = $("dropZone");
  dz.addEventListener("dragover", function (e) {
    e.preventDefault();
    dz.classList.add("dragover");
  });
  dz.addEventListener("dragleave", function () {
    dz.classList.remove("dragover");
  });
  dz.addEventListener("drop", onDrop);
  dz.addEventListener("click", function () {
    $("fileInput").click();
  });
  $("fileInput").addEventListener("change", function (e) {
    onFiles(e.target.files);
  
    function logout(){

sessionStorage.removeItem("login");

window.location.href="login.html";

}
  });
});
