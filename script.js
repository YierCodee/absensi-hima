// ============================================================
// KONFIGURASI — GANTI DENGAN URL WEB APP APPS SCRIPT KAMU
// Contoh: https://script.google.com/macros/s/AKfycb.../exec
// ============================================================
const API_URL =
  "https://script.google.com/macros/s/AKfycbwtNK2zAqpei61Cs_GV27TvsvWYYxzruqzGcHzNQSPKLv5EA26QfrAP6i0-W75a2QBS/exec";

// ============================================================
// STATE
// ============================================================
let peserta = [];
let pesertaFiltered = [];
let html5QrCode = null;
let scanning = false;
let scanCooldown = false;

// ============================================================
// ELEMEN
// ============================================================
const statusEl = document.getElementById("scanStatus");
const btnStart = document.getElementById("btnStart");
const btnStop = document.getElementById("btnStop");
const btnRefresh = document.getElementById("btnRefresh");
const searchBox = document.getElementById("searchBox");
const tbody = document.getElementById("tabelPeserta");

// ============================================================
// UTIL STATUS
// ============================================================
function setStatus(msg, type = "") {
  statusEl.textContent = msg;
  statusEl.className = "scan-status " + type;
}

// ============================================================
// AMBIL DATA PESERTA DARI API
// ============================================================
async function muatPeserta() {
  try {
    const res = await fetch(API_URL + "?action=list", { cache: "no-store" });
    const data = await res.json();
    peserta = data.peserta || [];
    terapkanFilter();
  } catch (err) {
    console.error("Gagal memuat peserta:", err);
    tbody.innerHTML =
      '<tr><td colspan="7" style="text-align:center;color:#f87171">Gagal memuat data. Periksa URL API.</td></tr>';
  }
}

// ============================================================
// FILTER PENCARIAN
// ============================================================
function terapkanFilter() {
  const q = (searchBox.value || "").toLowerCase().trim();
  if (!q) {
    pesertaFiltered = peserta.slice();
  } else {
    pesertaFiltered = peserta.filter(
      (p) =>
        (p.nama || "").toLowerCase().includes(q) ||
        String(p.nim || "")
          .toLowerCase()
          .includes(q),
    );
  }
  render();
}

searchBox.addEventListener("input", terapkanFilter);

// ============================================================
// RENDER TABEL & STATISTIK
// ============================================================
function render() {
  if (pesertaFiltered.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="7" style="text-align:center;opacity:.6">Tidak ada peserta</td></tr>';
  } else {
    tbody.innerHTML = pesertaFiltered
      .map((p) => {
        const idx = peserta.indexOf(p);
        const levelNum = parseInt(p.level) || 0;
        return `
        <tr>
          <td data-label="ID"><code>${p.id}</code></td>
          <td data-label="Nama">${p.nama}</td>
          <td data-label="NIM">${p.nim || "-"}</td>
          <td data-label="Level HTML/CSS">
            <div class="skill">
              <span>${p.level || "-"}</span>
              <div class="skill-bar"><span style="width:${Math.min(levelNum * 10, 100)}%"></span></div>
            </div>
          </td>
          <td data-label="Status"><span class="badge ${p.hadir ? "hadir" : "belum"}">${p.hadir ? "Hadir" : "Belum"}</span></td>
          <td data-label="Jam Absen">${p.jam || "-"}</td>
          <td data-label="Aksi">
            <button class="btn btn-primary btn-small" onclick="tampilBarcode(${idx})">Barcode</button>
          </td>
        </tr>
      `;
      })
      .join("");
  }

  const total = peserta.length;
  const hadir = peserta.filter((p) => p.hadir).length;
  document.getElementById("statTotal").textContent = total;
  document.getElementById("statHadir").textContent = hadir;
  document.getElementById("statBelum").textContent = total - hadir;
}

// ============================================================
// TAMPILKAN BARCODE PESERTA
// ============================================================
function tampilBarcode(i) {
  const p = peserta[i];
  document.getElementById("qrNama").textContent = `${p.nama} (${p.id})`;
  document.getElementById("qrImg").src =
    `https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=10&data=${encodeURIComponent(p.id)}`;
  document.getElementById("qrModal").classList.add("active");
}

document.getElementById("btnTutupQR").addEventListener("click", () => {
  document.getElementById("qrModal").classList.remove("active");
});

// ============================================================
// SCANNER — START (area scan luas & responsif)
// ============================================================
btnStart.addEventListener("click", async () => {
  if (scanning) return;
  try {
    html5QrCode = new Html5Qrcode("reader");
    await html5QrCode.start(
      { facingMode: "environment" },
      {
        fps: 15,
        // Kotak persegi: 70% dari sisi terpendek area kamera, maksimal 320px
        qrbox: function (viewfinderWidth, viewfinderHeight) {
          const sisi = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.7);
          const ukuran = Math.min(sisi, 320);
          return { width: ukuran, height: ukuran };
        },
        aspectRatio: 1.777,
        disableFlip: false,
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true,
        },
      },
      onScanSuccess,
    );

    scanning = true;
    btnStart.style.display = "none";
    btnStop.style.display = "inline-block";
    setStatus("Arahkan kamera ke QR Code peserta...", "info");
  } catch (err) {
    setStatus("Gagal membuka kamera: " + err, "error");
  }
});

// ============================================================
// SCANNER — STOP
// ============================================================
btnStop.addEventListener("click", async () => {
  if (!scanning) return;
  try {
    await html5QrCode.stop();
    html5QrCode.clear();
  } catch (e) {
    /* ignore */
  }
  scanning = false;
  btnStart.style.display = "inline-block";
  btnStop.style.display = "none";
  setStatus("Scan dihentikan.");
});

// ============================================================
// CALLBACK SAAT BARCODE TERBACA
// ============================================================
async function onScanSuccess(decodedText) {
  if (scanCooldown) return;
  scanCooldown = true;
  setTimeout(() => (scanCooldown = false), 2000);

  const id = (decodedText || "").trim();
  const p = peserta.find((x) => String(x.id) === id);

  if (!p) {
    setStatus(`❌ Barcode tidak dikenali: "${id}"`, "error");
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    return;
  }

  if (p.hadir) {
    setStatus(`⚠️ ${p.nama} sudah absen pukul ${p.jam}`, "error");
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    return;
  }

  setStatus("⏳ Mencatat kehadiran...", "info");

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "absen", id: id }),
    });
    const result = await res.json();

    if (result.success) {
      p.hadir = true;
      p.jam = result.jam;
      terapkanFilter();
      setStatus(
        `✅ Absensi berhasil: ${result.nama} pukul ${result.jam}`,
        "success",
      );
      if (navigator.vibrate) navigator.vibrate(150);
    } else {
      setStatus(
        `⚠️ ${result.error}${result.jam ? " pukul " + result.jam : ""}`,
        "error",
      );
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    }
  } catch (err) {
    setStatus("❌ Gagal mencatat kehadiran. Periksa koneksi.", "error");
  }
}

// ============================================================
// REFRESH MANUAL
// ============================================================
btnRefresh.addEventListener("click", () => {
  setStatus("Memuat ulang data...", "info");
  muatPeserta().then(() => setStatus("Data diperbarui.", "info"));
});

// ============================================================
// INIT
// ============================================================
muatPeserta();
setInterval(muatPeserta, 30000);
