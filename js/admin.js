const adminState = {
  games: [],
  query: "",
  coverData: "",
  stock: {},
  devices: {},
  eventsBound: false
};
const adminDriveSizes = [
  "Portable HDD 500GB",
  "Portable HDD 1TB",
  "Seagate One Touch 1TB",
  "Seagate External HDD 2TB",
  "Seagate External HDD 4TB"
];

const ADMIN_PASSWORD_HASH = "80225123f6cbd560e4441d95c3c24f977612479ade7bdbdecc31d861717a3f33";
const ADMIN_UNLOCK_KEY = "msgv-admin-unlocked";
const IS_LOCAL_ADMIN = ["localhost", "127.0.0.1", "::1"].includes(location.hostname) || location.protocol === "file:";
const $ = (selector) => document.querySelector(selector);
const slugify = (value) => value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const escapeAdminHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

async function initAdmin() {
  if (!IS_LOCAL_ADMIN) {
    showOnlineAdminBlocked();
    return;
  }
  bindPasswordGate();
  if (sessionStorage.getItem(ADMIN_UNLOCK_KEY) !== "true") return;
  unlockAdmin();
}

async function loadAdminData() {
  const [gamesResponse, stockResponse, devicesResponse] = await Promise.all([
    fetch("data/games.json"),
    fetch("data/drive-stock.json"),
    fetch("data/devices.json")
  ]);
  adminState.games = await gamesResponse.json();
  const fileStock = stockResponse.ok ? await stockResponse.json() : {};
  const localStock = JSON.parse(localStorage.getItem("msgv-drive-stock") || "{}");
  adminState.stock = { ...fileStock, ...localStock };
  const fileDevices = devicesResponse.ok ? await devicesResponse.json() : {};
  const localDevices = JSON.parse(localStorage.getItem("msgv-devices") || "{}");
  adminState.devices = Object.keys(localDevices).length ? localDevices : fileDevices;
  $("#githubRepo").value = localStorage.getItem("msgv-github-repo") || "";
  $("#githubBranch").value = localStorage.getItem("msgv-github-branch") || "main";
  if (!adminState.eventsBound) bindAdminEvents();
  adminState.eventsBound = true;
  renderStockManager();
  renderAdminList();
  renderDeviceManager();
}

function bindPasswordGate() {
  $("#passwordForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (await sha256($("#adminPassword").value) === ADMIN_PASSWORD_HASH) {
      sessionStorage.setItem(ADMIN_UNLOCK_KEY, "true");
      unlockAdmin();
      return;
    }
    $("#lockError").textContent = "Incorrect password.";
    $("#adminPassword").value = "";
    $("#adminPassword").focus();
  });
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function showOnlineAdminBlocked() {
  $("#adminLock").querySelector(".eyebrow").textContent = "Local Admin Only";
  $("#adminLock").querySelector("h1").textContent = "Online Access Disabled";
  $("#passwordForm").innerHTML = `
    <p class="admin-note">For security, the catalog manager only runs from your local website preview. Public visitors cannot unlock this page.</p>
    <a class="btn btn-primary full" href="index.html#home">Exit</a>`;
}

function unlockAdmin() {
  $("#adminLock").classList.add("hidden");
  $("#adminContent").hidden = false;
  loadAdminData();
}

function bindAdminEvents() {
  $("#gameTitle").addEventListener("input", () => {
    if (!$("#gameImage").value.trim()) {
      $("#gameImage").value = `images/covers-webp/${slugify($("#gameTitle").value)}.webp`;
    }
  });

  $("#coverUpload").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file.");
      return;
    }
    adminState.coverData = await optimizeCover(file);
    $("#gameImage").value = adminState.coverData;
    updateCoverPreview(adminState.coverData, `${file.name} optimized to WebP and embedded in games.json`);
  });

  $("#adminSearch").addEventListener("input", (event) => {
    adminState.query = event.target.value.trim().toLowerCase();
    renderAdminList();
  });

  $("#gameForm").addEventListener("submit", (event) => {
    event.preventDefault();
    saveGame();
  });
  $("#gameNewRelease").addEventListener("change", () => {
    $("#gameReleaseDate").disabled = !$("#gameNewRelease").checked;
    if ($("#gameNewRelease").checked && !$("#gameReleaseDate").value) $("#gameReleaseDate").valueAsDate = new Date();
  });

  $("#cancelEdit").addEventListener("click", resetForm);
  $("#downloadJson").addEventListener("click", downloadJson);
  $("#downloadStock").addEventListener("click", downloadStockJson);
  $("#publishStock").addEventListener("click", publishStockToGitHub);
  $("#resetJson").addEventListener("click", loadAdminData);
  $("#deviceForm").addEventListener("submit", (event) => {
    event.preventDefault();
    saveDevice();
  });
  $("#cancelDeviceEdit").addEventListener("click", resetDeviceForm);
  $("#downloadDevices").addEventListener("click", () => {
    downloadDataFile(adminState.devices, "devices.json");
    $("#deviceStatus").textContent = "devices.json downloaded. Replace the file inside the data folder on GitHub.";
  });
  $("#batchAdd").addEventListener("click", addBatchGames);
  $("#batchClear").addEventListener("click", () => {
    $("#batchInput").value = "";
    $("#batchStatus").textContent = "";
  });

  $("#importJson").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const imported = JSON.parse(await file.text());
    if (!Array.isArray(imported)) {
      alert("Invalid games.json file.");
      return;
    }
    adminState.games = imported;
    renderAdminList();
  });
}

function parseBatchLine(line, defaultGenre) {
  const clean = line.trim().replace(/\s+/g, " ");
  if (!clean) return null;

  const parts = clean.includes("|")
    ? clean.split("|").map((part) => part.trim()).filter(Boolean)
    : clean.split(",").map((part) => part.trim()).filter(Boolean);

  if (parts.length >= 3) {
    const size = Number(String(parts[2]).replace(/gb/i, "").trim());
    if (!parts[0] || Number.isNaN(size)) return null;
    return { title: parts[0], genre: parts[1] || defaultGenre, size };
  }

  const match = clean.match(/^(.*?)\s+(\d+(?:\.\d+)?)\s*(?:gb)?$/i);
  if (!match) return null;

  return {
    title: match[1].trim(),
    genre: defaultGenre,
    size: Number(match[2])
  };
}

function addBatchGames() {
  const defaultGenre = $("#batchGenre").value;
  const graphics = $("#batchGraphics").value;
  const lines = $("#batchInput").value.split(/\r?\n/);
  const existingTitles = new Set(adminState.games.map((game) => game.title.toLowerCase()));
  let added = 0;
  let skipped = 0;

  lines.forEach((line) => {
    const parsed = parseBatchLine(line, defaultGenre);
    if (!parsed || existingTitles.has(parsed.title.toLowerCase())) {
      if (line.trim()) skipped += 1;
      return;
    }

    adminState.games.push({
      title: parsed.title,
      genre: parsed.genre,
      size: parsed.size,
      graphics,
      newRelease: false,
      releaseDate: "",
      controller: true,
      image: `images/covers-webp/${slugify(parsed.title)}.webp`,
      compatibility: ["Windows Laptop", "Windows Desktop", "Windows Handheld Gaming PC"]
    });
    existingTitles.add(parsed.title.toLowerCase());
    added += 1;
  });

  adminState.games.sort((a, b) => a.title.localeCompare(b.title));
  renderAdminList();
  $("#batchStatus").textContent = `${added} games added. ${skipped} skipped. Download games.json when done.`;
}

function selectedCompatibility() {
  return [...document.querySelectorAll(".compat-checks input:checked")].map((input) => input.value);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function optimizeCover(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    const width = 300;
    const height = 400;
    canvas.width = width;
    canvas.height = height;
    const scale = Math.max(width / bitmap.width, height / bitmap.height);
    const drawWidth = bitmap.width * scale;
    const drawHeight = bitmap.height * scale;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#111";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
    bitmap.close();
    return canvas.toDataURL("image/webp", .78);
  } catch (error) {
    return fileToDataUrl(file);
  }
}

function updateCoverPreview(src, status) {
  const preview = $("#coverPreview");
  preview.src = src || "";
  preview.classList.toggle("visible", Boolean(src));
  $("#coverStatus").textContent = status || "No cover uploaded yet.";
}

function saveGame() {
  const game = {
    title: $("#gameTitle").value.trim(),
    genre: $("#gameGenre").value,
    size: Number($("#gameSize").value),
    graphics: $("#gameGraphics").value,
    newRelease: $("#gameNewRelease").checked,
    releaseDate: $("#gameNewRelease").checked ? $("#gameReleaseDate").value : "",
    controller: $("#gameController").checked,
    image: adminState.coverData || $("#gameImage").value.trim(),
    compatibility: selectedCompatibility()
  };

  const editIndex = $("#editIndex").value;
  if (editIndex === "") adminState.games.push(game);
  else adminState.games[Number(editIndex)] = game;

  adminState.games.sort((a, b) => a.title.localeCompare(b.title));
  resetForm();
  renderAdminList();
}

function editGame(index) {
  const game = adminState.games[index];
  $("#formTitle").textContent = "Edit Game";
  $("#editIndex").value = index;
  $("#gameTitle").value = game.title;
  $("#gameGenre").value = game.genre;
  $("#gameSize").value = game.size;
  $("#gameGraphics").value = game.graphics || getDefaultGraphics(game.size);
  $("#gameNewRelease").checked = Boolean(game.newRelease);
  $("#gameReleaseDate").value = game.releaseDate || "";
  $("#gameReleaseDate").disabled = !game.newRelease;
  $("#gameImage").value = game.image;
  adminState.coverData = game.image.startsWith("data:image/") ? game.image : "";
  updateCoverPreview(game.image, adminState.coverData ? "Embedded cover image loaded." : "Using cover file path.");
  $("#gameController").checked = Boolean(game.controller);
  document.querySelectorAll(".compat-checks input").forEach((input) => {
    const compatibility = game.compatibility || [];
    input.checked = compatibility.includes(input.value)
      || (input.value === "Windows Handheld Gaming PC" && (compatibility.includes("Steam Deck") || compatibility.includes("ROG Ally")));
  });
  $("#gameForm").scrollIntoView({ behavior: "smooth", block: "start" });
  setTimeout(() => $("#gameTitle").focus({ preventScroll: true }), 350);
}

function deleteGame(index) {
  const game = adminState.games[index];
  if (!confirm(`Delete ${game.title}?`)) return;
  adminState.games.splice(index, 1);
  renderAdminList();
}

function resetForm() {
  $("#formTitle").textContent = "Add New Game";
  $("#editIndex").value = "";
  adminState.coverData = "";
  $("#gameForm").reset();
  $("#gameGraphics").value = "Mid";
  $("#gameNewRelease").checked = false;
  $("#gameReleaseDate").value = "";
  $("#gameReleaseDate").disabled = true;
  updateCoverPreview("", "No cover uploaded yet.");
  document.querySelectorAll(".compat-checks input").forEach((input) => input.checked = true);
}

function filteredGames() {
  return adminState.games.filter((game) => {
    const haystack = `${game.title} ${game.genre}`.toLowerCase();
    return !adminState.query || haystack.includes(adminState.query);
  });
}

function renderAdminList() {
  const games = filteredGames();
  $("#adminCount").textContent = `${adminState.games.length} games`;
  $("#adminList").innerHTML = games.map((game) => {
    const index = adminState.games.indexOf(game);
    return `
      <article class="admin-game-row">
        <div>
          <strong>${escapeAdminHtml(game.title)}${game.newRelease ? ' <em class="admin-new-badge">NEW</em>' : ""}</strong>
          <span>${escapeAdminHtml(game.genre)} - ${game.graphics || getDefaultGraphics(game.size)} graphics - ${game.size}GB - ${escapeAdminHtml(game.image)}</span>
        </div>
        <div class="row-actions">
          <button class="btn btn-muted" type="button" data-edit="${index}">Edit</button>
          <button class="btn btn-ghost" type="button" data-delete="${index}">Delete</button>
        </div>
      </article>`;
  }).join("");

  document.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => editGame(Number(button.dataset.edit)));
  });
  document.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteGame(Number(button.dataset.delete)));
  });
}

function getDefaultGraphics(size) {
  if (Number(size) <= 20) return "Low";
  if (Number(size) <= 75) return "Mid";
  return "High";
}

function saveDevice() {
  const brand = $("#deviceAdminBrand").value.trim();
  const model = $("#deviceAdminModel").value.trim();
  if (!brand || !model) return;
  const editBrand = $("#deviceEditBrand").value;
  const editId = $("#deviceEditId").value;
  if (editBrand && editId) {
    adminState.devices[editBrand] = (adminState.devices[editBrand] || []).filter((item) => item.id !== editId);
    if (!adminState.devices[editBrand].length) delete adminState.devices[editBrand];
  }
  const profiles = adminState.devices[brand] || [];
  let id = editId || slugify(`${brand}-${model}`);
  if (!editId) {
    let suffix = 2;
    const baseId = id;
    while (Object.values(adminState.devices).flat().some((item) => item.id === id)) id = `${baseId}-${suffix++}`;
  }
  profiles.push({
    id,
    model,
    tier: $("#deviceAdminTier").value,
    cpu: $("#deviceAdminCpu").value.trim(),
    gpu: $("#deviceAdminGpu").value.trim()
  });
  profiles.sort((a, b) => a.model.localeCompare(b.model));
  adminState.devices[brand] = profiles;
  adminState.devices = Object.fromEntries(Object.entries(adminState.devices).sort(([a], [b]) => a.localeCompare(b)));
  persistDevices();
  resetDeviceForm();
  $("#deviceStatus").textContent = "Device saved locally. Download devices.json when finished.";
}

function editDevice(brand, id) {
  const profile = (adminState.devices[brand] || []).find((item) => item.id === id);
  if (!profile) return;
  $("#deviceEditBrand").value = brand;
  $("#deviceEditId").value = id;
  $("#deviceAdminBrand").value = brand;
  $("#deviceAdminModel").value = profile.model;
  $("#deviceAdminTier").value = profile.tier;
  $("#deviceAdminCpu").value = profile.cpu;
  $("#deviceAdminGpu").value = profile.gpu;
  $("#deviceForm").scrollIntoView({ behavior: "smooth", block: "center" });
}

function deleteDevice(brand, id) {
  const profile = (adminState.devices[brand] || []).find((item) => item.id === id);
  if (!profile || !confirm(`Delete ${brand} ${profile.model}?`)) return;
  adminState.devices[brand] = adminState.devices[brand].filter((item) => item.id !== id);
  if (!adminState.devices[brand].length) delete adminState.devices[brand];
  persistDevices();
  $("#deviceStatus").textContent = "Device removed locally. Download devices.json when finished.";
}

function resetDeviceForm() {
  $("#deviceForm").reset();
  $("#deviceEditBrand").value = "";
  $("#deviceEditId").value = "";
  $("#deviceAdminTier").value = "Mid";
}

function persistDevices() {
  localStorage.setItem("msgv-devices", JSON.stringify(adminState.devices));
  renderDeviceManager();
}

function renderDeviceManager() {
  const rows = Object.entries(adminState.devices).flatMap(([brand, profiles]) => profiles.map((profile) => ({ brand, ...profile })));
  $("#deviceAdminList").innerHTML = rows.map((profile) => `
    <article class="device-admin-row">
      <div><strong>${escapeAdminHtml(profile.brand)}</strong><span>${escapeAdminHtml(profile.model)}</span></div>
      <div><strong>${escapeAdminHtml(profile.tier)}</strong><span>${escapeAdminHtml(profile.cpu)} · ${escapeAdminHtml(profile.gpu)}</span></div>
      <div class="row-actions">
        <button class="btn btn-muted" type="button" data-device-edit="${encodeURIComponent(profile.brand)}|${encodeURIComponent(profile.id)}">Edit</button>
        <button class="btn btn-ghost" type="button" data-device-delete="${encodeURIComponent(profile.brand)}|${encodeURIComponent(profile.id)}">Delete</button>
      </div>
    </article>`).join("");
  document.querySelectorAll("[data-device-edit]").forEach((button) => button.addEventListener("click", () => {
    const [brand, id] = button.dataset.deviceEdit.split("|").map(decodeURIComponent);
    editDevice(brand, id);
  }));
  document.querySelectorAll("[data-device-delete]").forEach((button) => button.addEventListener("click", () => {
    const [brand, id] = button.dataset.deviceDelete.split("|").map(decodeURIComponent);
    deleteDevice(brand, id);
  }));
  $("#deviceStatus").textContent = `${rows.length} device profiles across ${Object.keys(adminState.devices).length} brands.`;
}

function renderStockManager() {
  $("#stockGrid").innerHTML = adminDriveSizes.map((label) => `
    <label>${label}
      <input type="number" min="0" step="1" value="${Math.max(0, Number(adminState.stock[label]) || 0)}" data-stock-drive="${label}">
    </label>`).join("");

  document.querySelectorAll("[data-stock-drive]").forEach((input) => {
    input.addEventListener("input", () => {
      adminState.stock[input.dataset.stockDrive] = Math.max(0, Math.floor(Number(input.value) || 0));
      localStorage.setItem("msgv-drive-stock", JSON.stringify(adminState.stock));
      $("#stockStatus").textContent = "Stock saved in this browser. Download the stock file for GitHub.";
    });
  });
}

function downloadStockJson() {
  downloadDataFile(adminState.stock, "drive-stock.json");
  $("#stockStatus").textContent = "drive-stock.json downloaded. Upload it to the data folder on GitHub.";
}

function stockPayload() {
  return {
    ...Object.fromEntries(adminDriveSizes.map((label) => [label, Math.max(0, Math.floor(Number(adminState.stock[label]) || 0))])),
    _updatedAt: new Date().toISOString()
  };
}

function encodeBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  }
  return btoa(binary);
}

async function publishStockToGitHub() {
  const button = $("#publishStock");
  const status = $("#stockStatus");
  const repository = $("#githubRepo").value.trim().replace(/^https:\/\/github\.com\//i, "").replace(/\.git\/?$/i, "").replace(/^\/|\/$/g, "");
  const branch = $("#githubBranch").value.trim() || "main";
  const token = $("#githubToken").value.trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !token) {
    status.textContent = "Enter a valid username/repository and fine-grained GitHub token.";
    return;
  }

  localStorage.setItem("msgv-github-repo", repository);
  localStorage.setItem("msgv-github-branch", branch);
  button.disabled = true;
  button.textContent = "Publishing...";
  status.textContent = "Connecting to GitHub...";
  const apiUrl = `https://api.github.com/repos/${repository}/contents/data/drive-stock.json`;
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28"
  };

  try {
    const currentResponse = await fetch(`${apiUrl}?ref=${encodeURIComponent(branch)}`, { headers });
    if (!currentResponse.ok && currentResponse.status !== 404) throw new Error(`GitHub returned ${currentResponse.status}`);
    const currentFile = currentResponse.ok ? await currentResponse.json() : {};
    const payload = stockPayload();
    const updateResponse = await fetch(apiUrl, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Update drive stock ${new Date().toLocaleString("en-PH")}`,
        content: encodeBase64(`${JSON.stringify(payload, null, 2)}\n`),
        branch,
        ...(currentFile.sha ? { sha: currentFile.sha } : {})
      })
    });
    if (!updateResponse.ok) {
      const error = await updateResponse.json().catch(() => ({}));
      throw new Error(error.message || `GitHub returned ${updateResponse.status}`);
    }
    adminState.stock = payload;
    localStorage.setItem("msgv-drive-stock", JSON.stringify(payload));
    $("#githubToken").value = "";
    status.textContent = "Stock published. GitHub Pages will show the update after deployment completes.";
  } catch (error) {
    status.textContent = `Publish failed: ${error.message}. Check the repository, branch, and token permissions.`;
  } finally {
    button.disabled = false;
    button.textContent = "Publish Stock";
  }
}

function downloadDataFile(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadJson() {
  downloadDataFile(adminState.games, "games.json");
}

initAdmin();
