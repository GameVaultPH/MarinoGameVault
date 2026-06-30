const categories = ["All", "Action", "Adventure", "Open World", "RPG", "Shooter", "Racing", "Sports", "Horror", "Fighting", "Simulation", "Strategy", "Indie"];
const driveSizes = [
  { id: "portable-500", label: "500GB", product: "Portable HDD", stockKey: "Portable HDD 500GB", gb: 456, price: 1599 },
  { id: "portable-1tb", label: "1TB", product: "Portable HDD", stockKey: "Portable HDD 1TB", gb: 931, price: 2599 },
  { id: "seagate-1tb", label: "1TB", product: "Seagate One Touch", stockKey: "Seagate One Touch 1TB", gb: 931, price: 4500 },
  { id: "seagate-2tb", label: "2TB", product: "Seagate External HDD", stockKey: "Seagate External HDD 2TB", gb: 1810, price: 6500 },
  { id: "seagate-4tb", label: "4TB", product: "Seagate External HDD", stockKey: "Seagate External HDD 4TB", gb: 3630, price: 9800 }
];
const graphicsLevels = {
  All: {
    title: "All Graphics Levels",
    cpu: "CPU requirements vary by game",
    gpu: "GPU requirements vary by game"
  },
  Low: {
    title: "Low Graphics",
    cpu: "Intel Core i5-4460 / AMD Ryzen 3 1200 or better",
    gpu: "NVIDIA GTX 1050 Ti / AMD RX 560 or better"
  },
  Mid: {
    title: "Mid Graphics",
    cpu: "Intel Core i5-8400 / AMD Ryzen 5 2600 or better",
    gpu: "NVIDIA GTX 1660 / AMD RX 5600 XT or better"
  },
  High: {
    title: "High Graphics",
    cpu: "Intel Core i5-12400 / AMD Ryzen 5 5600 or better",
    gpu: "NVIDIA RTX 3060 / AMD RX 6700 XT or better"
  }
};
let deviceProfiles = {};
const graphicsRank = { Low: 1, Mid: 2, High: 3 };
const lbcStartingRates = { "Metro Manila": 125, Luzon: 175, Visayas: 215, Mindanao: 240 };
const pesoFormatter = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });
const isLocalSite = ["localhost", "127.0.0.1", "::1"].includes(location.hostname) || location.protocol === "file:";
const roundShippingUp = (value) => Math.ceil(value / 10) * 10;
const locationApiBase = "https://psgc.cloud/api/v2";
const postalApiBase = "https://nominatim.openstreetmap.org/search";
const messengerPageUrl = "https://m.me/MarinoGameVault";

function readStoredValue(key, fallback = "") {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch (error) {
    return fallback;
  }
}

function readStoredJson(key, fallback, validator = () => true) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const value = JSON.parse(raw);
    if (!validator(value)) throw new Error("Invalid stored data");
    return value;
  } catch (error) {
    removeStoredValue(key);
    return fallback;
  }
}

function writeStoredValue(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    return false;
  }
}

function removeStoredValue(key) {
  try { localStorage.removeItem(key); } catch (error) { return false; }
  return true;
}

const state = {
  games: [],
  selected: readStoredJson("msgv-selection", [], Array.isArray),
  delivery: readStoredJson("msgv-delivery", {}, (value) => value && typeof value === "object" && !Array.isArray(value)),
  category: "All",
  graphics: "All",
  query: "",
  sort: "az",
  page: 1,
  pageSize: 40,
  lastAdded: "",
  lastFilled: "",
  drive: Number(readStoredValue("msgv-drive", "456")),
  driveProduct: readStoredValue("msgv-drive-product"),
  orderReference: readStoredValue("msgv-order-reference"),
  stock: {}
};
const initialDrive = driveSizes.find((drive) => drive.id === state.driveProduct)
  || driveSizes.find((drive) => drive.gb === state.drive)
  || driveSizes[0];
state.drive = initialDrive.gb;
state.driveProduct = initialDrive.id;

function formatGB(value) {
  return `${Number(value).toLocaleString(undefined, { minimumFractionDigits: value % 1 ? 2 : 0, maximumFractionDigits: 2 })}GB`;
}

function formatPrice(value) {
  return pesoFormatter.format(Number(value) || 0);
}

const $ = (selector) => document.querySelector(selector);
const gameGrid = $("#gameGrid");
const selectedList = $("#selectedList");
const selectedCount = $("#selectedCount");
const usedSpace = $("#usedSpace");
const remainingSpace = $("#remainingSpace");
const capacityBar = $("#capacityBar");
const capacityText = $("#capacityText");

function hideLoader() {
  $("#loader")?.classList.add("hidden");
}
setTimeout(hideLoader, 1600);

async function init() {
  ["region", "city", "barangay"].forEach((field) => {
    state.delivery[field] = repairEncodedText(state.delivery[field]);
  });
  delete state.delivery.origin;
  writeStoredValue("msgv-delivery", JSON.stringify(state.delivery));
  renderSkeletons();
  const [gamesResponse, stockResponse, devicesResponse] = await Promise.all([
    fetch("data/games.json"),
    fetch(`data/drive-stock.json?ts=${Date.now()}`),
    fetch("data/devices.json?v=expanded-models")
  ]);
  state.games = await gamesResponse.json();
  const fileDevices = devicesResponse.ok ? await devicesResponse.json() : {};
  const localDevices = readStoredJson("msgv-devices", {}, (value) => value && typeof value === "object" && !Array.isArray(value));
  deviceProfiles = isLocalSite && Object.keys(localDevices).length ? localDevices : fileDevices;
  const fileStock = stockResponse.ok ? await stockResponse.json() : {};
  const localStock = readStoredJson("msgv-drive-stock", {}, (value) => value && typeof value === "object" && !Array.isArray(value));
  state.stock = { ...fileStock, ...(isLocalSite ? localStock : {}) };
  const currentDrive = getSelectedDrive();
  const selectedTotal = getSelectedTotal();
  if (!currentDrive || getDriveStock(currentDrive) <= 0 || selectedTotal > currentDrive.gb) {
    const firstAvailable = driveSizes.find((drive) => getDriveStock(drive) > 0 && selectedTotal <= drive.gb)
      || driveSizes.find((drive) => getDriveStock(drive) > 0);
    if (firstAvailable) {
      state.drive = firstAvailable.gb;
      state.driveProduct = firstAvailable.id;
      writeStoredValue("msgv-drive", String(state.drive));
      writeStoredValue("msgv-drive-product", state.driveProduct);
    }
  }
  buildFilters();
  initDeviceChecker();
  buildGraphicsFilters();
  buildDriveOptions();
  renderShowcases();
  renderGames();
  renderSelection();
  bindEvents();
  initLocationSelectors();
  revealOnScroll();
  trackActiveNavigation();
  requestAnimationFrame(() => setTimeout(hideLoader, 120));
}

function renderSkeletons() {
  gameGrid.innerHTML = Array.from({ length: 16 }, () => `
    <div class="skeleton-card" aria-hidden="true">
      <div></div><span></span><small></small>
    </div>`).join("");
}

function bindEvents() {
  $("#searchInput").addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    state.page = 1;
    renderGames();
  });

  $("#clearSelectionTop").addEventListener("click", () => {
    clearBuild();
  });

  $("#vaultToggle").addEventListener("click", () => {
    const panel = $("#floatingVault");
    const isOpen = panel.classList.toggle("open");
    $("#vaultToggle").setAttribute("aria-expanded", String(isOpen));
  });

  $("#navToggle").addEventListener("click", () => {
    const links = $("#navLinks");
    links.classList.toggle("open");
    $("#navToggle").setAttribute("aria-expanded", links.classList.contains("open"));
  });

  document.querySelectorAll(".nav-links a").forEach((link) => {
    link.addEventListener("click", () => $("#navLinks").classList.remove("open"));
  });

  $("#checkoutButton").addEventListener("click", openCheckout);
  $("#editDetails").addEventListener("click", openCheckout);
  $("#exportPdfPanel").addEventListener("click", exportOrderPdf);
  $("#sendMessenger").addEventListener("click", sendOrderToMessenger);
  $("#closeCheckout").addEventListener("click", closeCheckout);
  $("#continueToDelivery").addEventListener("click", showDeliveryOptions);
  $("#backToOrderReview").addEventListener("click", showOrderReview);
  document.querySelectorAll(".delivery-service[data-service]").forEach((button) => {
    button.addEventListener("click", () => setDeliveryService(button.dataset.service));
  });
  $("#backToDeliveryOptions").addEventListener("click", showDeliveryOptions);
  $("#deliveryForm").addEventListener("submit", saveDeliveryDetails);
  $("#deliveryContact").addEventListener("input", (event) => {
    event.target.value = contactDigits(event.target.value);
    validateDeliveryContact(Boolean(event.target.value));
  });
  $("#deliveryContact").addEventListener("invalid", () => validateDeliveryContact(true));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("#checkoutModal").hidden) closeCheckout();
  });

  $("#backTop").addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  document.querySelectorAll("[data-select-drive]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!setDrive(button.dataset.selectDrive)) return;
      const panel = $("#floatingVault");
      panel.classList.add("open");
      $("#vaultToggle").setAttribute("aria-expanded", "true");
    });
  });
  let backTopFrame = 0;
  window.addEventListener("scroll", () => {
    if (backTopFrame) return;
    backTopFrame = requestAnimationFrame(() => {
      $("#backTop").classList.toggle("visible", window.scrollY > 650);
      backTopFrame = 0;
    });
  }, { passive: true });

  $("#sortSelect").addEventListener("change", (event) => {
    state.sort = event.target.value;
    state.page = 1;
    renderGames();
  });

  $("#previousPage").addEventListener("click", () => changeCatalogPage(-1));
  $("#nextPage").addEventListener("click", () => changeCatalogPage(1));
}

function normalizeLocationList(payload) {
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload?.data) ? payload.data : [];
}

function repairEncodedText(value) {
  const text = String(value ?? "");
  if (!/[ÃÂâ]/.test(text)) return text;
  try {
    const bytes = Uint8Array.from(text, (character) => character.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    return text;
  }
}

async function fetchLocationList(path, cacheKey) {
  const cached = readStoredValue(cacheKey);
  try {
    const response = await fetch(`${locationApiBase}${path}`);
    if (!response.ok) throw new Error("Location request failed");
    const items = normalizeLocationList(await response.json());
    if (!items.length) throw new Error("No locations returned");
    writeStoredValue(cacheKey, JSON.stringify(items));
    return items;
  } catch (error) {
    if (cached) return JSON.parse(cached);
    throw error;
  }
}

async function fetchPostalCode(cityCode, cityName, barangayCode, barangayName) {
  const cacheKey = "msgv-postal-codes-v1";
  const cache = readStoredJson(cacheKey, {}, (value) => value && typeof value === "object" && !Array.isArray(value));
  const locationKey = `${cityCode}:${barangayCode}`;
  if (cache[locationKey]) return cache[locationKey];
  const query = `${repairEncodedText(barangayName)}, ${repairEncodedText(cityName)}, Philippines`;
  const places = await searchMapPlaces(query, 5);
  const zip = places.map((place) => String(place?.address?.postcode || "").match(/\d{4}/)?.[0]).find(Boolean) || "";
  if (zip) {
    cache[locationKey] = zip;
    writeStoredValue(cacheKey, JSON.stringify(cache));
  }
  return zip;
}

async function searchMapPlaces(query, limit = 10) {
  const params = new URLSearchParams({ q: query, format: "jsonv2", addressdetails: "1", countrycodes: "ph", limit: String(limit) });
  const response = await fetch(`${postalApiBase}?${params}`);
  if (!response.ok) throw new Error("Location search failed");
  return response.json();
}

async function autofillZipFromLocation() {
  const barangaySelect = $("#deliveryBarangay");
  const citySelect = $("#deliveryCity");
  if (!barangaySelect.value || !citySelect.value) return;
  const selectedCityCode = citySelect.value;
  const selectedCityName = selectedLocationName("#deliveryCity");
  const selectedBarangayCode = barangaySelect.value;
  const selectedBarangayName = selectedLocationName("#deliveryBarangay");
  const zipInput = $("#deliveryZip");
  const fallbackZip = cityPostalCodes[selectedCityCode] || "";
  zipInput.value = fallbackZip;
  updateShippingEstimate();
  try {
    const zip = await fetchPostalCode(selectedCityCode, selectedCityName, selectedBarangayCode, selectedBarangayName);
    if (citySelect.value !== selectedCityCode || barangaySelect.value !== selectedBarangayCode) return;
    if (!zip && fallbackZip) {
      zipInput.title = `Using the standard postal code for ${selectedCityName}. You can edit this if needed.`;
      return;
    }
    if (!zip) {
      zipInput.title = "No automatic postal code is available for this location. Please enter it manually.";
      return;
    }
    zipInput.value = zip;
    zipInput.title = `Auto-filled for ${selectedBarangayName}, ${selectedCityName}. You can edit this if needed.`;
    updateShippingEstimate();
  } catch (error) {
    zipInput.title = fallbackZip
      ? `Using the standard postal code for ${selectedCityName}. You can edit this if needed.`
      : "Postal code could not be loaded automatically. Please enter it manually.";
  }
}

function setLocationOptions(select, items, placeholder, selectedCode = "") {
  const sorted = items
    .map((item) => ({ ...item, name: repairEncodedText(item.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  select.innerHTML = `<option value="">${placeholder}</option>${sorted.map((item) => `<option value="${escapeHtml(item.code)}">${escapeHtml(item.name)}</option>`).join("")}`;
  select.disabled = false;
  if (selectedCode && sorted.some((item) => item.code === selectedCode)) select.value = selectedCode;
}

function resetLocationSelect(select, label) {
  select.innerHTML = `<option value="">${label}</option>`;
  select.disabled = true;
}

async function initLocationSelectors() {
  const regionSelect = $("#deliveryRegion");
  const citySelect = $("#deliveryCity");
  const barangaySelect = $("#deliveryBarangay");
  regionSelect.addEventListener("change", async () => {
    await loadCities(regionSelect.value);
    updateShippingEstimate();
  });
  citySelect.addEventListener("change", async () => {
    $("#deliveryZip").value = cityPostalCodes[citySelect.value] || "";
    if ($("#deliveryForm").dataset.service !== "LBC") await loadBarangays(citySelect.value);
    updateShippingEstimate();
  });
  barangaySelect.addEventListener("change", autofillZipFromLocation);

  try {
    const regions = await fetchLocationList("/regions", "msgv-psgc-regions");
    setLocationOptions(regionSelect, regions, "Select region", state.delivery.regionCode);
    if (regionSelect.value) await loadCities(regionSelect.value, state.delivery.cityCode, state.delivery.barangayCode);
  } catch (error) {
    setLocationOptions(regionSelect, [{ code: "1300000000", name: "National Capital Region (NCR)" }], "Select region", state.delivery.regionCode);
    regionSelect.title = "Live location list unavailable. NCR fallback is active.";
  }
}

const lalamoveNearbyCities = [
  { code: "0402103000", name: "City of Bacoor (Cavite)", distance: 38 },
  { code: "0402109000", name: "City of Imus (Cavite)", distance: 42 },
  { code: "0405805000", name: "Cainta (Rizal)", distance: 22 },
  { code: "0405813000", name: "Taytay (Rizal)", distance: 27 },
  { code: "0405802000", name: "City of Antipolo (Rizal)", distance: 30 },
  { code: "0405811000", name: "San Mateo (Rizal)", distance: 18 },
  { code: "0403425000", name: "City of San Pedro (Laguna)", distance: 40 },
  { code: "0301412000", name: "City of Meycauayan (Bulacan)", distance: 24 },
  { code: "0301410000", name: "Marilao (Bulacan)", distance: 27 },
  { code: "0301420000", name: "City of San Jose del Monte (Bulacan)", distance: 30 }
];

const cityPostalCodes = {
  "1380600000": "1000",
  "1380601000": "1012",
  "1380602000": "1006",
  "1380603000": "1001",
  "1380604000": "1010",
  "1380605000": "1014",
  "1380606000": "1008",
  "1380607000": "1005",
  "1380608000": "1000",
  "1380609000": "1002",
  "1380610000": "1004",
  "1380611000": "1007",
  "1380612000": "1011",
  "1380613000": "1018",
  "1380614000": "1009",
  "1380500000": "1550",
  "1380700000": "1800",
  "1381200000": "1600",
  "1381300000": "1100",
  "1381400000": "1500",
  "1380100000": "1400",
  "1380400000": "1470",
  "1380900000": "1485",
  "1381600000": "1440",
  "1380200000": "1740",
  "1380300000": "1200",
  "1380800000": "1770",
  "1381000000": "1700",
  "1381100000": "1300",
  "1381701000": "1620",
  "1381500000": "1630",
  "0402103000": "4102",
  "0402109000": "4103",
  "0405805000": "1900",
  "0405813000": "1920",
  "0405802000": "1870",
  "0405811000": "1850",
  "0403425000": "4023",
  "0301412000": "3020",
  "0301410000": "3019",
  "0301420000": "3023"
};

async function loadCities(regionCode, selectedCityCode = "", selectedBarangayCode = "") {
  const citySelect = $("#deliveryCity");
  resetLocationSelect($("#deliveryBarangay"), "Select city first");
  if (!regionCode) {
    resetLocationSelect(citySelect, "Select region first");
    return;
  }
  resetLocationSelect(citySelect, "Loading cities...");
  try {
    let cities = await fetchLocationList(`/regions/${encodeURIComponent(regionCode)}/cities-municipalities`, `msgv-psgc-cities-${regionCode}`);
    if ($("#deliveryForm").dataset.service === "Lalamove" && regionCode === "1300000000") {
      const existingCodes = new Set(cities.map((city) => city.code));
      cities = [...cities, ...lalamoveNearbyCities.filter((city) => !existingCodes.has(city.code))]
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    setLocationOptions(citySelect, cities, "Select city / municipality", selectedCityCode);
    if (citySelect.value) {
      if (!/^\d{4}$/.test($("#deliveryZip").value.trim())) {
        $("#deliveryZip").value = cityPostalCodes[citySelect.value] || "";
      }
      if ($("#deliveryForm").dataset.service !== "LBC") {
        await loadBarangays(citySelect.value, selectedBarangayCode);
      }
      updateShippingEstimate();
    }
  } catch (error) {
    const fallback = regionCode === "1300000000"
      ? [{ code: "1381300000", name: "Quezon City" }, ...lalamoveNearbyCities]
      : [];
    if (fallback.length) {
      setLocationOptions(citySelect, fallback, "Select city / municipality", selectedCityCode);
      if (citySelect.value) {
        if (!/^\d{4}$/.test($("#deliveryZip").value.trim())) {
          $("#deliveryZip").value = cityPostalCodes[citySelect.value] || "";
        }
        if ($("#deliveryForm").dataset.service !== "LBC") {
          await loadBarangays(citySelect.value, selectedBarangayCode);
        }
      }
      updateShippingEstimate();
    }
    else resetLocationSelect(citySelect, "Cities unavailable");
  }
}

async function loadBarangays(cityCode, selectedBarangayCode = "") {
  const barangaySelect = $("#deliveryBarangay");
  if (!cityCode) {
    resetLocationSelect(barangaySelect, "Select city first");
    return;
  }
  resetLocationSelect(barangaySelect, "Loading barangays...");
  try {
    const barangays = await fetchLocationList(`/cities-municipalities/${encodeURIComponent(cityCode)}/barangays`, `msgv-psgc-barangays-${cityCode}`);
    setLocationOptions(barangaySelect, barangays, "Select barangay", selectedBarangayCode);
  } catch (error) {
    const fallback = cityCode === "1381300000"
      ? [{ code: "fallback-pasong-tamo", name: "Pasong Tamo" }, { code: "fallback-other", name: "Other / Not listed" }]
      : cityPostalCodes[cityCode]
        ? [{ code: `fallback-${cityCode}`, name: "Other / Not listed" }]
        : [];
    if (fallback.length) setLocationOptions(barangaySelect, fallback, "Select barangay", selectedBarangayCode);
    else resetLocationSelect(barangaySelect, "Barangays unavailable");
  }
}

function selectedLocationName(selector) {
  const select = $(selector);
  return select.value ? select.options[select.selectedIndex].textContent : "";
}

function contactDigits(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("63") && digits.length >= 12) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  return digits.slice(0, 10);
}

function validateDeliveryContact(showError = false) {
  const input = $("#deliveryContact");
  const digits = contactDigits(input.value);
  const valid = digits.length === 10;
  input.value = digits;
  input.setCustomValidity(valid ? "" : "Enter exactly 10 digits after +63.");
  input.closest(".phone-input").classList.toggle("invalid", showError && !valid);
  $("#deliveryContactError").textContent = showError && !valid ? "Enter exactly 10 digits after +63." : "";
  return valid;
}

function openCheckout() {
  if (!getSelectedGames().length || !isSelectionWithinCapacity()) return;
  ensureOrderReference();
  renderOrderReview();
  const delivery = state.delivery || {};
  $("#deliveryName").value = delivery.name || "";
  $("#deliveryMessengerName").value = delivery.messengerName || "";
  $("#deliveryContact").value = contactDigits(delivery.contact || "");
  validateDeliveryContact(false);
  $("#deliveryAddress").value = delivery.address || "";
  $("#deliveryLandmark").value = delivery.landmark || "";
  $("#deliveryLbcBranch").value = delivery.lbcBranch || "";
  $("#deliveryZip").value = delivery.zip || "";
  $("#compatibilityConsent").checked = Boolean(delivery.compatibilityAccepted);
  const modal = $("#checkoutModal");
  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add("open"));
  document.body.classList.add("modal-open");
  showOrderReview();
}

function generateOrderReference() {
  const now = new Date();
  const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("");
  const time = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  const random = String(crypto.getRandomValues(new Uint16Array(1))[0] % 10000).padStart(4, "0");
  return `MGV-${date}-${time}-${random}`;
}

function ensureOrderReference() {
  if (!state.orderReference) {
    state.orderReference = state.delivery.orderReference || generateOrderReference();
    writeStoredValue("msgv-order-reference", state.orderReference);
  }
  if (state.delivery.orderReference !== state.orderReference) {
    state.delivery.orderReference = state.orderReference;
    writeStoredValue("msgv-delivery", JSON.stringify(state.delivery));
  }
  return state.orderReference;
}

function renderOrderReview() {
  const details = getOrderDetails();
  const remaining = Math.max(state.drive - details.total, 0);
  $("#reviewOrderReference").textContent = details.orderReference;
  $("#checkoutReviewSummary").innerHTML = `
    <div><span>Drive</span><strong>${escapeHtml(details.driveLabel)}</strong></div>
    <div><span>Drive Price</span><strong>${formatPrice(details.drivePrice)}</strong></div>
    <div><span>Selected Games</span><strong>${details.selectedGames.length}</strong></div>
    <div><span>Storage</span><strong>${formatGB(details.total)} / ${formatGB(state.drive)}</strong></div>
    <div><span>Remaining</span><strong>${formatGB(remaining)}</strong></div>`;
  $("#checkoutReviewGames").innerHTML = details.selectedGames.map((game, index) => `
    <div class="checkout-review-game"><span>${index + 1}. ${escapeHtml(game.title)}</span><strong>${formatGB(game.size)}</strong></div>`).join("");
}

function showOrderReview() {
  $("#checkoutReviewStep").hidden = false;
  $("#deliveryChoiceStep").hidden = true;
  $("#deliveryForm").hidden = true;
  $("#checkoutTitle").textContent = "Review Your Order";
  $("#continueToDelivery").focus();
}

function showDeliveryOptions() {
  $("#checkoutReviewStep").hidden = true;
  $("#deliveryChoiceStep").hidden = false;
  $("#deliveryForm").hidden = true;
  $("#deliveryForm").dataset.service = "";
  document.querySelectorAll(".delivery-service[data-service]").forEach((button) => {
    button.classList.remove("active");
    button.setAttribute("aria-pressed", "false");
  });
  $("#checkoutTitle").textContent = "Choose Delivery Service";
  $("#selectLbc").focus();
}

function closeCheckout() {
  const modal = $("#checkoutModal");
  modal.classList.remove("open");
  document.body.classList.remove("modal-open");
  setTimeout(() => {
    if (!modal.classList.contains("open")) modal.hidden = true;
  }, 180);
  const focusTarget = hasCompleteDeliveryDetails() && !$("#postCheckoutActions").hidden ? $("#editDetails") : $("#checkoutButton");
  focusTarget.focus();
}

function isMetroManilaZip(zip) {
  const value = Number(zip);
  return /^\d{4}$/.test(zip) && value >= 1000 && value <= 1820;
}

function selectedLalamoveCity() {
  const cityCode = $("#deliveryCity")?.value || "";
  return lalamoveNearbyCities.find((city) => city.code === cityCode) || null;
}

function isLalamoveServiceArea(zip) {
  return isMetroManilaZip(zip) || Boolean(selectedLalamoveCity());
}

function destinationZone(zip) {
  const value = Number(zip);
  if (!/^\d{4}$/.test(zip)) return "";
  if (isMetroManilaZip(zip)) return "Metro Manila";
  if (value >= 2000 && value <= 4999) return "Luzon";
  if (value >= 5000 && value <= 6999) return "Visayas";
  if (value >= 7000 && value <= 9999) return "Mindanao";
  return "";
}

function lbcZoneFromRegion(regionCode) {
  if (!regionCode) return "";
  if (regionCode === "1300000000") return "Metro Manila";
  if (["0600000000", "0700000000", "0800000000", "1800000000"].includes(regionCode)) return "Visayas";
  if (["0900000000", "1000000000", "1100000000", "1200000000", "1600000000", "1900000000"].includes(regionCode)) return "Mindanao";
  return "Luzon";
}

function estimatedMetroDistance(zip) {
  const nearbyCity = selectedLalamoveCity();
  if (nearbyCity) return nearbyCity.distance;
  const value = Number(zip);
  const quezonCityDistances = {
    1100: 10, 1101: 11, 1102: 9, 1103: 10, 1104: 13, 1105: 8, 1106: 6,
    1107: 3, 1108: 9, 1109: 10, 1110: 10, 1111: 12, 1112: 8, 1113: 9,
    1114: 7, 1115: 6, 1116: 5, 1117: 8, 1118: 6, 1119: 8, 1120: 10,
    1121: 12, 1122: 13, 1123: 9, 1124: 12, 1125: 14, 1126: 15, 1127: 13, 1128: 12
  };
  if (quezonCityDistances[value]) return quezonCityDistances[value];
  if (value < 1100) return 15;
  if (value < 1200) return 9;
  if (value < 1300) return 18;
  if (value < 1400) return 21;
  if (value < 1500) return 17;
  if (value < 1600) return 14;
  if (value < 1700) return 19;
  if (value < 1800) return 25;
  return 16;
}

function getShippingQuote(service, zip, regionCode = "") {
  if (service === "LBC") {
    const zone = lbcZoneFromRegion(regionCode);
    if (!zone) return null;
    return { service, amount: roundShippingUp(lbcStartingRates[zone]), zone, detail: `Rounded starting estimate for ${zone}` };
  }
  const zone = destinationZone(zip);
  if (!zone) return null;
  if (!isLalamoveServiceArea(zip)) return null;
  const distance = estimatedMetroDistance(zip);
  const regularFare = 49 + Math.min(distance, 5) * 6 + Math.max(distance - 5, 0) * 5;
  const amount = roundShippingUp(regularFare * 1.3);
  return { service, amount, zone, distance, detail: `Priority estimate for ${distance} km, including a 30% priority allowance` };
}

function deliveryServiceLabel(service) {
  if (service === "Lalamove") return "Lalamove (Priority)";
  if (service === "LBC") return "LBC (Cash on Pickup)";
  return service || "Not selected";
}

async function setDeliveryService(service) {
  state.delivery.service = service;
  const form = $("#deliveryForm");
  const regionSelect = $("#deliveryRegion");
  form.dataset.service = service;
  $("#deliveryChoiceStep").hidden = true;
  form.hidden = false;
  const isLbc = service === "LBC";
  const ncrOption = Array.from(regionSelect.options).find((option) => option.value === "1300000000");
  if (ncrOption) ncrOption.textContent = isLbc ? "National Capital Region (NCR)" : "Metro Manila & Nearby Areas";
  document.querySelectorAll(".lbc-only").forEach((element) => { element.hidden = !isLbc; });
  document.querySelectorAll(".lalamove-only").forEach((element) => { element.hidden = isLbc; });
  $("#deliveryLbcBranch").required = isLbc;
  $("#deliveryBarangay").required = !isLbc;
  $("#deliveryAddress").required = !isLbc;
  $("#deliveryLandmark").required = !isLbc;
  $("#deliveryFormTitle").textContent = deliveryServiceLabel(service);
  $("#checkoutTitle").textContent = deliveryServiceLabel(service);
  regionSelect.disabled = !isLbc;
  document.querySelectorAll(".delivery-service[data-service]").forEach((button) => {
    const active = button.dataset.service === service;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (!isLbc) {
    const ncrCode = "1300000000";
    const savedNcrCity = state.delivery.regionCode === ncrCode ? state.delivery.cityCode || "" : "";
    const savedBarangay = state.delivery.regionCode === ncrCode ? state.delivery.barangayCode || "" : "";
    regionSelect.value = ncrCode;
    await loadCities(ncrCode, savedNcrCity, savedBarangay);
  }
  updateShippingEstimate();
  $("#deliveryName").focus();
}

function updateShippingEstimate() {
  const zip = $("#deliveryZip").value.trim();
  const validZip = /^\d{4}$/.test(zip) && Boolean(destinationZone(zip));
  const selectedRegion = $("#deliveryRegion").value;
  const metro = isLalamoveServiceArea(zip) && (!selectedRegion || selectedRegion === "1300000000");
  const service = $("#deliveryForm").dataset.service || state.delivery.service || "LBC";
  const quote = service === "LBC"
    ? getShippingQuote(service, zip, selectedRegion)
    : validZip ? getShippingQuote(service, zip, selectedRegion) : null;
  $("#shippingSummary").innerHTML = quote
    ? `<span>${deliveryServiceLabel(quote.service)} Estimated Shipping<small>${quote.detail}</small></span><strong>${pesoFormatter.format(quote.amount)}</strong>`
    : service === "Lalamove" && validZip && !metro
      ? `<span>Lalamove (Priority)</span><strong>Outside selected service area</strong>`
    : `<span>Estimated Shipping</span><strong>${service === "Lalamove" ? "Select city and barangay" : "Select region and city"}</strong>`;
  renderPriceSummaries(quote?.amount || 0);
}

function saveDeliveryDetails(event) {
  event.preventDefault();
  if (!validateDeliveryContact(true)) {
    $("#deliveryContact").reportValidity();
    return;
  }
  if (!isSelectionWithinCapacity()) {
    closeCheckout();
    renderSelection();
    return;
  }
  const zip = $("#deliveryZip").value.trim();
  const service = $("#deliveryForm").dataset.service;
  const isLbc = service === "LBC";
  if (!isLbc && $("#deliveryRegion").value !== "1300000000") {
    $("#shippingSummary").innerHTML = `<span>Lalamove (Priority)</span><strong>Metro Manila and selected nearby areas only</strong>`;
    return;
  }
  const locationComplete = $("#deliveryRegion").value
    && $("#deliveryCity").value
    && (isLbc ? $("#deliveryLbcBranch").value.trim() : $("#deliveryBarangay").value);
  if (!locationComplete) {
    $("#shippingSummary").innerHTML = `<span>Delivery Location</span><strong>Select region, city, and ${isLbc ? "LBC branch" : "barangay"}</strong>`;
    return;
  }
  const quote = getShippingQuote(service, zip, $("#deliveryRegion").value);
  if (!quote) {
    $("#shippingSummary").innerHTML = `<span>${deliveryServiceLabel(service)}</span><strong>${service === "Lalamove" ? "Outside selected service area" : "Select a valid region"}</strong>`;
    return;
  }
  state.delivery = {
    orderReference: ensureOrderReference(),
    name: $("#deliveryName").value.trim(),
    messengerName: $("#deliveryMessengerName").value.trim(),
    contact: `+63${contactDigits($("#deliveryContact").value)}`,
    address: isLbc ? "" : $("#deliveryAddress").value.trim(),
    landmark: isLbc ? "" : $("#deliveryLandmark").value.trim(),
    zip: isLbc ? "" : zip,
    regionCode: $("#deliveryRegion").value,
    region: selectedLocationName("#deliveryRegion"),
    cityCode: $("#deliveryCity").value,
    city: selectedLocationName("#deliveryCity"),
    barangayCode: isLbc ? "" : $("#deliveryBarangay").value,
    barangay: isLbc ? "" : selectedLocationName("#deliveryBarangay"),
    lbcBranch: isLbc ? $("#deliveryLbcBranch").value.trim() : "",
    lbcBranchAddress: "",
    compatibilityAccepted: $("#compatibilityConsent").checked,
    service: quote.service,
    shippingEstimate: quote.amount,
    shippingDetail: quote.detail
  };
  writeStoredValue("msgv-delivery", JSON.stringify(state.delivery));
  renderSelection();
  closeCheckout();
}

function buildFilters() {
  $("#filters").innerHTML = categories.map((category) => `<button class="filter-btn${category === "All" ? " active" : ""}" data-category="${category}">${category}</button>`).join("");
  document.querySelectorAll("#filters .filter-btn").forEach((button) => {
    button.addEventListener("click", () => {
      state.category = button.dataset.category;
      state.page = 1;
      document.querySelectorAll("#filters .filter-btn").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      renderGames();
    });
  });
}

function buildGraphicsFilters() {
  const levels = ["All", "Low", "Mid", "High"];
  $("#graphicsFilters").innerHTML = levels.map((level) => {
    const spec = graphicsLevels[level];
    const details = level === "All" ? spec.title : `Shows games up to ${level}. ${spec.cpu}; ${spec.gpu}`;
    return `<button class="graphics-btn${level === state.graphics ? " active" : ""}" type="button" data-graphics="${level}" data-tip="${details}" aria-label="${level} graphics. ${details}">${level}</button>`;
  }).join("");
  document.querySelectorAll("[data-graphics]").forEach((button) => {
    button.addEventListener("click", () => {
      state.graphics = button.dataset.graphics;
      state.page = 1;
      document.querySelectorAll("[data-graphics]").forEach((item) => item.classList.toggle("active", item === button));
      renderGames();
    });
  });
}

function initDeviceChecker() {
  const brandSelect = $("#deviceBrand");
  const modelSelect = $("#deviceModel");
  const savedBrand = readStoredValue("msgv-device-brand");
  const savedModel = readStoredValue("msgv-device-model");
  brandSelect.innerHTML = `<option value="">Select brand</option>${Object.keys(deviceProfiles).sort((a, b) => a.localeCompare(b)).map((brand) => `<option value="${brand}">${brand}</option>`).join("")}`;

  const populateModels = (brand, selectedModel = "") => {
    const profiles = deviceProfiles[brand] || [];
    modelSelect.innerHTML = profiles.length
      ? `<option value="">Select model</option>${profiles.map((profile) => `<option value="${profile.id}">${profile.model}</option>`).join("")}`
      : `<option value="">Select brand first</option>`;
    modelSelect.disabled = !profiles.length;
    if (profiles.some((profile) => profile.id === selectedModel)) modelSelect.value = selectedModel;
  };

  const applyDevice = (brand, modelId, filterGames = true) => {
    const profile = (deviceProfiles[brand] || []).find((item) => item.id === modelId);
    const result = $("#deviceResult");
    if (!profile) {
      result.dataset.tier = "";
      result.innerHTML = `<span>Detected Tier</span><strong>Not checked</strong><small>Choose a device model</small>`;
      return;
    }
    result.dataset.tier = profile.tier.toLowerCase();
    result.innerHTML = `<span>Detected Tier</span><strong>${profile.tier}</strong><small>${profile.cpu} · ${profile.gpu}</small>`;
    writeStoredValue("msgv-device-brand", brand);
    writeStoredValue("msgv-device-model", modelId);
    state.graphics = profile.tier;
    state.page = 1;
    if (filterGames) {
      buildGraphicsFilters();
      renderGames();
    }
  };

  brandSelect.addEventListener("change", () => {
    populateModels(brandSelect.value);
    writeStoredValue("msgv-device-brand", brandSelect.value);
    removeStoredValue("msgv-device-model");
    applyDevice("", "", false);
  });
  modelSelect.addEventListener("change", () => applyDevice(brandSelect.value, modelSelect.value));

  if (deviceProfiles[savedBrand]) {
    brandSelect.value = savedBrand;
    populateModels(savedBrand, savedModel);
    applyDevice(savedBrand, savedModel, false);
  }
}

function getDriveStock(drive) {
  const stock = Number(state.stock[drive.stockKey]);
  return Number.isFinite(stock) ? Math.max(0, stock) : 0;
}

function getSelectedDrive() {
  return driveSizes.find((drive) => drive.id === state.driveProduct) || driveSizes[0];
}

function isDriveAvailable(gb) {
  const drive = gb === state.drive
    ? getSelectedDrive()
    : driveSizes.find((item) => item.gb === gb && getDriveStock(item) > 0);
  return Boolean(drive && getDriveStock(drive) > 0);
}

function buildDriveOptions() {
  const selectedTotal = getSelectedTotal();
  const markup = driveSizes.map((drive) => {
    const active = drive.id === state.driveProduct ? " active" : "";
    const stock = getDriveStock(drive);
    const soldOut = stock <= 0;
    const tooSmall = selectedTotal > drive.gb;
    const disabled = soldOut || tooSmall;
    const lowStock = stock > 0 && stock <= 2;
    const bestValue = drive.id === "portable-1tb";
    const status = soldOut ? 'Sold out' : tooSmall ? 'Too small' : stock + ' left';
    const title = tooSmall ? 'Selected games need ' + formatGB(selectedTotal) : '';
    return '<button class="drive-btn' + active + (soldOut ? ' sold-out' : '') + (tooSmall ? ' too-small' : '') + (lowStock ? ' low-stock' : '') + (bestValue ? ' best-value' : '') + '" data-drive-id="' + drive.id + '"' + (disabled ? ' disabled' : '') + (title ? ' title="' + title + '"' : '') + '>' + (bestValue ? '<em>Best Value</em>' : '') + '<span>' + drive.label + '</span><b>' + drive.product + '</b><strong>' + formatPrice(drive.price) + '</strong><small>' + status + '</small></button>';
  }).join("");
  $("#driveOptions").innerHTML = markup;
  const selectMarkup = driveSizes.map((drive) => {
    const soldOut = getDriveStock(drive) <= 0;
    const tooSmall = selectedTotal > drive.gb;
    const stock = getDriveStock(drive);
    const stockLabel = stock <= 2 ? 'Only ' + stock + ' left' : stock + ' left';
    return '<option value="' + drive.id + '"' + (drive.id === state.driveProduct ? ' selected' : '') + (soldOut || tooSmall ? ' disabled' : '') + '>' + drive.product + ' ' + drive.label + ' - ' + formatPrice(drive.price) + (soldOut ? ' - Sold out' : tooSmall ? ' - Too small' : ' - ' + stockLabel) + '</option>';
  }).join("");
  const catalogDriveSelect = $("#driveSelectCatalog");
  if (catalogDriveSelect) catalogDriveSelect.innerHTML = selectMarkup;
  document.querySelectorAll(".drive-btn").forEach((button) => {
    button.onclick = () => setDrive(button.dataset.driveId);
  });
  if (catalogDriveSelect) catalogDriveSelect.onchange = (event) => setDrive(event.target.value);
  updateProductStocks();
}

function updateProductStocks() {
  document.querySelectorAll("[data-product-stock]").forEach((element) => {
    const stock = Math.max(0, Number(state.stock[element.dataset.productStock]) || 0);
    const button = element.closest("[data-select-drive]");
    const drive = driveSizes.find((item) => item.id === button?.dataset.selectDrive);
    const tooSmall = Boolean(drive && getSelectedTotal() > drive.gb);
    element.textContent = stock <= 0 ? "Sold out" : tooSmall ? "Too small" : `${stock} in stock`;
    element.classList.toggle("sold-out", stock <= 0);
    if (button) {
      button.disabled = stock <= 0 || tooSmall;
      button.classList.toggle("active", button.dataset.selectDrive === state.driveProduct);
    }
  });
}

function setDrive(id) {
  const drive = driveSizes.find((item) => item.id === id);
  if (!drive || getDriveStock(drive) <= 0 || getSelectedTotal() > drive.gb) {
    if ($("#driveSelectCatalog")) $("#driveSelectCatalog").value = state.driveProduct;
    return false;
  }
  state.driveProduct = drive.id;
  state.drive = drive.gb;
  writeStoredValue("msgv-drive", String(drive.gb));
  writeStoredValue("msgv-drive-product", drive.id);
  document.querySelectorAll(".drive-btn").forEach((button) => button.classList.toggle("active", button.dataset.driveId === id));
  if ($("#driveSelectCatalog")) $("#driveSelectCatalog").value = id;
  renderSelection();
  renderGames();
  return true;
}

function renderShowcases() {
  const releaseTitles = ["007 First Light", "Battlefield 6", "Doom - The Dark Ages", "Invincible VS", "Pragmata", "Resident Evil 9 - Requiem"];
  const featured = state.games
    .filter((game) => game.newRelease)
    .sort((a, b) => String(b.releaseDate || "").localeCompare(String(a.releaseDate || "")))
    .slice(0, 6);
  const usingFallback = !featured.length;
  if (usingFallback) featured.push(...releaseTitles.map((title) => state.games.find((game) => game.title === title)).filter(Boolean));
  if (usingFallback && featured.length < 6) {
    state.games.forEach((game) => {
      if (featured.length < 6 && !featured.includes(game)) featured.push(game);
    });
  }
  $("#featuredCarousel").innerHTML = featured.map((game) => `
    <article class="feature-card" data-feature-title="${game.title}" role="button" tabindex="0" aria-label="Select ${game.title}">
      <img src="${game.image}" alt="${game.title} cover" loading="lazy" decoding="async">
      <span class="new-release-badge">NEW</span>
      <div><small>${formatReleaseDate(game.releaseDate)}</small><h3>${game.title}</h3><p>${formatGB(game.size)} · <span class="tier-text tier-${getGraphicsTier(game).toLowerCase()}">${getGraphicsTier(game)}</span></p></div>
    </article>`).join("");
  document.querySelectorAll("[data-feature-title]").forEach((card) => {
    card.addEventListener("click", () => addGame(card.dataset.featureTitle));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        addGame(card.dataset.featureTitle);
      }
    });
  });
}

function formatReleaseDate(value) {
  if (!value) return "Recently Added";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "Recently Added" : date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}
function filteredGames() {
  const filtered = state.games.filter((game) => {
    const categoryMatch = state.category === "All" || game.genre === state.category;
    const gameTier = getGraphicsTier(game);
    const graphicsMatch = state.graphics === "All" || graphicsRank[gameTier] <= graphicsRank[state.graphics];
    const queryMatch = !state.query || game.title.toLowerCase().includes(state.query) || game.genre.toLowerCase().includes(state.query);
    return categoryMatch && graphicsMatch && queryMatch;
  });
  return filtered.sort((a, b) => {
    if (state.sort === "za") return b.title.localeCompare(a.title);
    if (state.sort === "sizeAsc") return a.size - b.size;
    if (state.sort === "sizeDesc") return b.size - a.size;
    return a.title.localeCompare(b.title);
  });
}

function getGraphicsTier(game) {
  if (["Low", "Mid", "High"].includes(game.graphics)) return game.graphics;
  if (game.size <= 20) return "Low";
  if (game.size <= 75) return "Mid";
  return "High";
}

function getSelectedTotal() {
  return getSelectedGames().reduce((sum, game) => sum + game.size, 0);
}

function isSelectionWithinCapacity() {
  return getSelectedTotal() <= state.drive;
}

function canFitGame(game) {
  if (!isDriveAvailable(state.drive)) return false;
  if (state.selected.includes(game.title)) return true;
  return getSelectedTotal() + game.size <= state.drive;
}

function renderGames() {
  const games = filteredGames();
  const totalPages = Math.max(1, Math.ceil(games.length / state.pageSize));
  state.page = Math.min(Math.max(state.page, 1), totalPages);
  const pageStart = (state.page - 1) * state.pageSize;
  const pageGames = games.slice(pageStart, pageStart + state.pageSize);
  const selectedTotal = getSelectedTotal();
  const selectedGameCount = getSelectedGames().length;
  $("#resultCount").textContent = `${games.length} Games  •  ${selectedGameCount} Selected  •  ${formatGB(selectedTotal)} Used`;
  $("#resultCount").textContent = `${games.length} Games \u2022 Page ${state.page} of ${totalPages} \u2022 ${selectedGameCount} Selected \u2022 ${formatGB(selectedTotal)} Used`;
  $("#pageStatus").textContent = `Page ${state.page} of ${totalPages}`;
  $("#previousPage").disabled = state.page <= 1;
  $("#nextPage").disabled = state.page >= totalPages;
  $("#catalogPagination").hidden = totalPages <= 1;
  gameGrid.classList.toggle("has-selection", selectedGameCount > 0);
  gameGrid.innerHTML = pageGames.map((game) => {
    const added = state.selected.includes(game.title);
    const fits = added || (isDriveAvailable(state.drive) && selectedTotal + game.size <= state.drive);
    return `
      <article class="game-card reveal visible${added ? " is-selected" : ""}${added && state.lastAdded === game.title ? " just-selected" : ""}${added && state.lastFilled === game.title ? " fills-drive" : ""}${!fits && !added ? " is-locked" : ""}" data-card-title="${game.title}" role="button" tabindex="0" aria-label="${!fits && !added ? "Does not fit" : added ? "Selected" : "Select"} ${game.title}">
        <div class="game-cover">
          <img src="${game.image}" alt="${game.title} cover" loading="lazy" decoding="async">
        </div>
        <div class="game-card-body">
          <h3>${game.title}</h3>
          <div class="meta"><span>${formatGB(game.size)}</span><span class="graphics-quality tier-${getGraphicsTier(game).toLowerCase()}">${getGraphicsTier(game)}</span></div>
        </div>
      </article>`;
  }).join("");
  document.querySelectorAll("[data-card-title]").forEach((card) => {
    card.addEventListener("click", () => addGame(card.dataset.cardTitle));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        addGame(card.dataset.cardTitle);
      }
    });
  });
  if (state.lastAdded) {
    const addedTitle = state.lastAdded;
    setTimeout(() => {
      if (state.lastAdded === addedTitle) state.lastAdded = "";
    }, 450);
  }
  if (state.lastFilled) {
    const filledTitle = state.lastFilled;
    setTimeout(() => {
      if (state.lastFilled !== filledTitle) return;
      state.lastFilled = "";
      document.querySelectorAll("[data-card-title]").forEach((card) => {
        if (card.dataset.cardTitle === filledTitle) card.classList.remove("fills-drive");
      });
      $("#floatingVault").classList.remove("just-filled");
    }, 900);
  }
}

function changeCatalogPage(direction) {
  const totalPages = Math.max(1, Math.ceil(filteredGames().length / state.pageSize));
  const nextPage = Math.min(Math.max(state.page + direction, 1), totalPages);
  if (nextPage === state.page) return;
  state.page = nextPage;
  renderGames();
  $("#resultCount").scrollIntoView({ behavior: "smooth", block: "center" });
}

function addGame(title) {
  const game = state.games.find((item) => item.title === title);
  if (!game) return;
  if (state.selected.includes(title)) {
    removeGame(title);
    return;
  }
  if (!canFitGame(game)) {
    if (getSelectedTotal() + game.size > state.drive) triggerCapacityWarning(title);
    return;
  }
  state.selected.push(title);
  state.lastAdded = title;
  if ((getSelectedTotal() / state.drive) * 100 >= 99) state.lastFilled = title;
  persistSelection();
}

function triggerCapacityWarning(title) {
  const card = Array.from(document.querySelectorAll("[data-card-title]")).find((item) => item.dataset.cardTitle === title);
  if (!card) return;
  const token = String(Date.now());
  card.dataset.warningToken = token;
  card.querySelector(".capacity-alert")?.remove();
  const capacityAlert = document.createElement("div");
  capacityAlert.className = "capacity-alert";
  capacityAlert.setAttribute("aria-hidden", "true");
  capacityAlert.innerHTML = "<span>FULL</span><small>CAPACITY LIMIT</small>";
  card.append(capacityAlert);
  card.classList.remove("capacity-warning");
  void card.offsetWidth;
  card.classList.add("capacity-warning");
  const floatingVault = $("#floatingVault");
  floatingVault.classList.remove("capacity-denied");
  void floatingVault.offsetWidth;
  floatingVault.classList.add("capacity-denied");
  setTimeout(() => {
    if (card.dataset.warningToken !== token) return;
    card.classList.remove("capacity-warning");
    capacityAlert.remove();
    floatingVault.classList.remove("capacity-denied");
  }, 1050);
}

function removeGame(title) {
  state.selected = state.selected.filter((item) => item !== title);
  persistSelection();
}

function persistSelection() {
  writeStoredValue("msgv-selection", JSON.stringify(state.selected));
  renderSelection();
  renderGames();
}

function clearBuild() {
  state.selected = [];
  state.delivery = {};
  state.orderReference = "";
  removeStoredValue("msgv-delivery");
  removeStoredValue("msgv-order-reference");
  persistSelection();
}

function getSelectedGames() {
  return state.selected.map((title) => state.games.find((game) => game.title === title)).filter(Boolean);
}

function hasCompleteDeliveryDetails() {
  const delivery = state.delivery || {};
  const shared = delivery.name && delivery.messengerName && delivery.contact && delivery.region && delivery.city && delivery.service && delivery.shippingEstimate && delivery.compatibilityAccepted;
  if (delivery.service === "LBC") return Boolean(shared && delivery.lbcBranch);
  return Boolean(shared && delivery.zip && delivery.address && delivery.barangay);
}

function renderSelection() {
  const selectedGames = getSelectedGames();
  const total = selectedGames.reduce((sum, game) => sum + game.size, 0);
  const remaining = Math.max(state.drive - total, 0);
  const percent = Math.min((total / state.drive) * 100, 100);
  const isFull = percent >= 99;
  const checkoutButton = $("#checkoutButton");
  const hasGames = selectedGames.length > 0;
  const isOverCapacity = total > state.drive;
  const checkoutComplete = hasCompleteDeliveryDetails();

  selectedCount.textContent = selectedGames.length;
  checkoutButton.disabled = !hasGames || isOverCapacity;
  checkoutButton.textContent = isOverCapacity ? "Over Capacity" : "Checkout";
  $("#preCheckoutActions").hidden = checkoutComplete && hasGames && !isOverCapacity;
  $("#postCheckoutActions").hidden = !(checkoutComplete && hasGames && !isOverCapacity);
  usedSpace.textContent = formatGB(total);
  remainingSpace.textContent = formatGB(remaining);
  capacityBar.style.width = `${percent}%`;
  capacityBar.style.background = percent >= 90 ? "#ff4757" : percent >= 70 ? "#ffc048" : "#29d17d";
  capacityText.textContent = isOverCapacity
    ? `Over capacity by ${formatGB(total - state.drive)}`
    : `${Math.round(percent)}% used${isFull ? " - drive full" : ""}`;
  const floatingVault = $("#floatingVault");
  floatingVault.classList.toggle("is-full", isFull);
  floatingVault.classList.toggle("just-filled", Boolean(isFull && state.lastFilled));
  $("#vaultMini").textContent = `${formatGB(total)} used`;
  $("#miniUsedSpace").textContent = formatGB(total);
  $("#miniRemainingSpace").textContent = formatGB(remaining);
  $("#miniCapacityBar").style.width = `${percent}%`;
  $("#miniCapacityBar").style.background = percent >= 90 ? "#ff4757" : percent >= 70 ? "#ffc048" : "#29d17d";
  renderPriceSummaries();

  selectedList.innerHTML = selectedGames.length ? `${selectedGames.map((game) => `
    <div class="selected-item">
      <div><p>${game.title}</p><small>${game.genre} - ${formatGB(game.size)}</small></div>
      <button class="remove" data-remove="${game.title}" aria-label="Remove ${game.title}">x</button>
    </div>`).join("")}
    <button class="btn btn-muted selected-clear" id="clearSelection" type="button">Clear All</button>` : `<p class="empty">No games selected yet.</p>`;

  document.querySelectorAll("[data-remove]").forEach((button) => {
    button.addEventListener("click", () => removeGame(button.dataset.remove));
  });
  $("#clearSelection")?.addEventListener("click", () => {
    clearBuild();
  });
  buildDriveOptions();

}

function renderPriceSummaries(shippingAmount = Number(state.delivery.shippingEstimate) || 0) {
  const drive = getSelectedDrive();
  const shipping = Math.max(0, Number(shippingAmount) || 0);
  const estimatedTotal = drive.price + shipping;
  const shippingText = shipping ? formatPrice(shipping) : "Calculated at checkout";
  const totalLabel = shipping ? "Estimated Total" : "Drive Subtotal";
  const markup = `
    <div><span>${drive.product} ${drive.label}</span><strong>${formatPrice(drive.price)}</strong></div>
    <div><span>Shipping</span><strong>${shippingText}</strong></div>
    <div class="price-total"><span>${totalLabel}</span><strong>${formatPrice(estimatedTotal)}</strong></div>`;
  $("#vaultPricing").innerHTML = markup;
  $("#checkoutPricing").innerHTML = markup;
}

function getOrderDetails() {
  const selectedGames = getSelectedGames();
  const total = selectedGames.reduce((sum, game) => sum + game.size, 0);
  const selectedDrive = getSelectedDrive();
  const driveLabel = `${selectedDrive.product} ${selectedDrive.label}`;
  const shippingEstimate = Number(state.delivery.shippingEstimate) || 0;
  return {
    orderReference: ensureOrderReference(),
    customerName: state.delivery.name || "",
    messengerName: state.delivery.messengerName || "",
    phoneNumber: state.delivery.contact || "",
    driveLabel,
    drivePrice: selectedDrive.price,
    shippingEstimate,
    grandTotal: selectedDrive.price + shippingEstimate,
    total,
    selectedGames,
    delivery: state.delivery || {}
  };
}

function formatOrderSheet(details) {
  const locationLines = details.delivery.service === "LBC"
    ? [
        `Region: ${details.delivery.region || "Not provided"}`,
        `City / Municipality: ${details.delivery.city || "Not provided"}`,
        `LBC Branch: ${details.delivery.lbcBranch || "Not provided"}`
      ]
    : [
        `Complete Address: ${details.delivery.address || "Not provided"}`,
        `Region: ${details.delivery.region || "Not provided"}`,
        `City / Municipality: ${details.delivery.city || "Not provided"}`,
        `Barangay: ${details.delivery.barangay || "Not provided"}`,
        `Nearest Landmark: ${details.delivery.landmark || "Not provided"}`
      ];
  const zipLines = details.delivery.service === "LBC"
    ? []
    : [`ZIP Code: ${details.delivery.zip || "Not provided"}`];
  return [
    "MARINO GAME VAULT ORDER SHEET",
    `Order Reference: ${details.orderReference}`,
    `Customer Name: ${details.customerName || "Not provided"}`,
    `Messenger Name: ${details.messengerName || "Not provided"}`,
    `Phone Number: ${details.phoneNumber || "Not provided"}`,
    ...locationLines,
    ...zipLines,
    `Delivery Service: ${deliveryServiceLabel(details.delivery.service)}`,
    `Compatibility Confirmed: ${details.delivery.compatibilityAccepted ? "Yes" : "No"}`,
    `Drive Product: ${details.driveLabel}`,
    `Drive Price: ${formatPrice(details.drivePrice)}`,
    `Estimated Shipping: ${details.shippingEstimate ? formatPrice(details.shippingEstimate) : "Not calculated"}`,
    `Estimated Total: ${formatPrice(details.grandTotal)}`,
    `Total Storage Used: ${formatGB(details.total)}`,
    "",
    "Selected Games:",
    details.selectedGames.length ? details.selectedGames.map((game, index) => `${index + 1}. ${game.title} - ${game.genre} - ${formatGB(game.size)}`).join("\n") : "No games selected."
  ].join("\n");
}

function fallbackCopyText(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  return copied;
}

async function sendOrderToMessenger() {
  const details = getOrderDetails();
  if (!details.selectedGames.length || !hasCompleteDeliveryDetails() || !isSelectionWithinCapacity()) return;
  const orderText = formatOrderSheet(details);
  const button = $("#sendMessenger");
  const messengerWindow = window.open("about:blank", "_blank");
  if (messengerWindow) messengerWindow.opener = null;
  let copied = false;
  try {
    await navigator.clipboard.writeText(orderText);
    copied = true;
  } catch (error) {
    copied = fallbackCopyText(orderText);
  }
  if (messengerWindow) messengerWindow.location.href = messengerPageUrl;
  const note = $("#vaultActionNote");
  note.textContent = copied
    ? "Order copied. In Messenger, press and hold the message box, then choose Paste."
    : "Copy failed. Export the PDF and attach it in the Marino Game Vault chat.";
  note.hidden = false;
  button.textContent = copied ? "Copied - Paste in Chat" : "Export PDF Instead";
  setTimeout(() => {
    button.textContent = "Send to Messenger";
    note.hidden = true;
  }, 6000);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function exportOrderPdf() {
  if (!isSelectionWithinCapacity()) return;
  const details = getOrderDetails();
  const deliveryRows = details.delivery.service === "LBC"
    ? `
        <div><span class="label">Region</span><span class="value">${escapeHtml(details.delivery.region || "Not provided")}</span></div>
        <div><span class="label">City / Municipality</span><span class="value">${escapeHtml(details.delivery.city || "Not provided")}</span></div>
        <div><span class="label">LBC Branch</span><span class="value">${escapeHtml(details.delivery.lbcBranch || "Not provided")}</span></div>`
    : `
        <div><span class="label">Complete Address</span><span class="value">${escapeHtml(details.delivery.address || "Not provided")}</span></div>
        <div><span class="label">Region</span><span class="value">${escapeHtml(details.delivery.region || "Not provided")}</span></div>
        <div><span class="label">City / Municipality</span><span class="value">${escapeHtml(details.delivery.city || "Not provided")}</span></div>
        <div><span class="label">Barangay</span><span class="value">${escapeHtml(details.delivery.barangay || "Not provided")}</span></div>
        <div><span class="label">Nearest Landmark</span><span class="value">${escapeHtml(details.delivery.landmark || "Not provided")}</span></div>`;
  const zipRow = details.delivery.service === "LBC"
    ? ""
    : `<div><span class="label">ZIP Code</span><span class="value">${escapeHtml(details.delivery.zip || "Not provided")}</span></div>`;
  const gameRows = details.selectedGames.length
    ? details.selectedGames.map((game, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(game.title)}</td>
        <td>${escapeHtml(game.genre)}</td>
        <td>${formatGB(game.size)}</td>
      </tr>`).join("")
    : `<tr><td colspan="4">No games selected.</td></tr>`;

  const pdfWindow = window.open("", "_blank", "width=900,height=700");
  if (!pdfWindow) {
    alert("Please allow popups to export the order sheet as PDF.");
    return;
  }

  pdfWindow.document.write(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Marino Game Vault Order Sheet</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Orbitron:wght@700;800&family=Poppins:wght@500;700;800&display=swap" rel="stylesheet">
      <style>
        body { margin: 0; padding: 40px; color: #111; font-family: Inter, Poppins, Arial, sans-serif; }
        .pdf-header { display: flex; align-items: center; gap: 16px; margin-bottom: 18px; }
        .pdf-logo { width: 76px; height: 76px; object-fit: cover; border-radius: 8px; }
        h1 { margin: 0 0 8px; font-family: Orbitron, Arial, sans-serif; font-size: 28px; letter-spacing: 1px; }
        .subtitle { margin: 0; color: #8B6F24; font-weight: 800; }
        .send-note { margin: 0 0 24px; padding: 14px 16px; background: #111; color: #D4AF37; border-radius: 8px; font-weight: 800; }
        .details { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; margin-bottom: 28px; }
        .details div { border-bottom: 1px solid #ddd; padding-bottom: 8px; }
        .label { display: block; color: #666; font-size: 12px; text-transform: uppercase; }
        .value { font-weight: 700; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #111; color: #D4AF37; text-align: left; }
        th, td { border: 1px solid #ddd; padding: 10px; }
        tfoot td { font-weight: 700; }
        @media print { body { padding: 24px; } button { display: none; } .send-note { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      </style>
    </head>
    <body>
      <header class="pdf-header">
        <img class="pdf-logo" src="${new URL("images/logo.png", window.location.href).href}" alt="Marino Game Vault logo">
        <div>
          <h1>MARINO GAME VAULT ORDER SHEET</h1>
          <p class="subtitle">Selected games and customer order details</p>
        </div>
      </header>
      <p class="send-note">Instruction: Please save this PDF and send it to Marino Game Vault to confirm your game drive order.</p>
      <section class="details">
        <div><span class="label">Order Reference</span><span class="value">${escapeHtml(details.orderReference)}</span></div>
        <div><span class="label">Customer Name</span><span class="value">${escapeHtml(details.customerName || "Not provided")}</span></div>
        <div><span class="label">Messenger Name</span><span class="value">${escapeHtml(details.messengerName || "Not provided")}</span></div>
        <div><span class="label">Phone Number</span><span class="value">${escapeHtml(details.phoneNumber || "Not provided")}</span></div>
        ${deliveryRows}
        ${zipRow}
        <div><span class="label">Delivery Service</span><span class="value">${escapeHtml(deliveryServiceLabel(details.delivery.service))}</span></div>
        <div><span class="label">Compatibility Confirmed</span><span class="value">${details.delivery.compatibilityAccepted ? "Yes" : "No"}</span></div>
        <div><span class="label">Drive Product</span><span class="value">${escapeHtml(details.driveLabel)}</span></div>
        <div><span class="label">Drive Price</span><span class="value">${formatPrice(details.drivePrice)}</span></div>
        <div><span class="label">Estimated Shipping</span><span class="value">${details.shippingEstimate ? formatPrice(details.shippingEstimate) : "Not calculated"}</span></div>
        <div><span class="label">Estimated Total</span><span class="value">${formatPrice(details.grandTotal)}</span></div>
        <div><span class="label">Selected Games</span><span class="value">${details.selectedGames.length}</span></div>
        <div><span class="label">Total Storage Used</span><span class="value">${formatGB(details.total)}</span></div>
      </section>
      <table>
        <thead><tr><th>#</th><th>Game</th><th>Genre</th><th>Size</th></tr></thead>
        <tbody>${gameRows}</tbody>
      </table>
      <script>
        window.onload = () => {
          window.focus();
          window.print();
        };
      <\/script>
    </body>
    </html>
  `);
  pdfWindow.document.close();
}

function revealOnScroll() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add("visible");
    });
  }, { threshold: .12 });
  document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));
}

function trackActiveNavigation() {
  const sections = ["home", "games", "builder", "guide"]
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  const links = [...document.querySelectorAll(".nav-links a")];
  const updateActiveLink = () => {
    let activeId = "home";
    sections.forEach((section) => {
      if (section.getBoundingClientRect().top <= 170) activeId = section.id;
    });
    links.forEach((link) => link.classList.toggle("active", link.getAttribute("href") === `#${activeId}`));
  };
  let navigationFrame = 0;
  window.addEventListener("scroll", () => {
    if (navigationFrame) return;
    navigationFrame = requestAnimationFrame(() => {
      updateActiveLink();
      navigationFrame = 0;
    });
  }, { passive: true });
  updateActiveLink();
}

init().catch((error) => {
  console.error("Game Vault failed to initialize", error);
  if (gameGrid) gameGrid.innerHTML = `<p class="catalog-empty">The catalog could not load. Refresh the page to try again.</p>`;
}).finally(hideLoader);
