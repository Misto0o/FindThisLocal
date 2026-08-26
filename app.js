// Built By Kristian Cook - https://builtbykristian.netlify.app - MIT License
import { addCustomBusiness, getCustomBusinesses } from "./FireStore/firebaseActions.js";
import { MAPBOX_TOKEN } from "./config.js";

window.addEventListener("load", initApp);

function initApp() {
    // ── Configuration ──────────────────────────────────────────────────────────
    const GOOGLE_PROXY_URL = "https://yelp-proxy.crystal-cook07.workers.dev";

    // ── State ──────────────────────────────────────────────────────────────────
    mapboxgl.accessToken = MAPBOX_TOKEN;
    let map = null;
    let markers = [];
    let userLocation = null;
    let currentBusinesses = [];
    let googleBusinesses = [];
    let customBusinesses = [];
    let nextPageToken = null;
    let activeTab = "google";

    // ── Elements ───────────────────────────────────────────────────────────────
    const keywordInput = document.getElementById("keywordInput");
    const locationInput = document.getElementById("locationInput");
    const categoryFilter = document.getElementById("categoryFilter");
    const searchBtn = document.getElementById("searchBtn");
    const useMyLocationBtn = document.getElementById("useMyLocation");
    const businessList = document.getElementById("businessList");
    const customBusinessList = document.getElementById("customBusinessList");
    const paginationEl = document.getElementById("pagination");
    const resultCount = document.getElementById("resultCount");
    const modalEl = document.getElementById("modal");
    const modalBody = document.getElementById("modalBody");
    const addBizModal = document.getElementById("addBizModal");
    const addBizModalBody = document.getElementById("addBizModalBody");
    const addBizModalClose = document.getElementById("addBizModalClose");
    const openAddBizModalBtn = document.getElementById("openAddBizModal");
    const mobileToggle = document.getElementById("mobileSidebarToggle");
    const sidebar = document.getElementById("sidebar");
    const readmeModal = document.getElementById("readme-modal");
    const readmeContent = document.getElementById("readme-content");
    const closeBtn = document.getElementById("close-btn");
    const openReadmeBtn = document.getElementById("openReadmeBtn");

    // ── README modal ───────────────────────────────────────────────────────────
    function openReadmeModal() {
        readmeModal.style.display = "flex";
        loadReadMe();
    }
    window.openReadmeModal = openReadmeModal;
    openReadmeBtn.addEventListener("click", openReadmeModal);
    closeBtn.addEventListener("click", () => readmeModal.style.display = "none");
    window.addEventListener("click", (e) => {
        if (e.target === readmeModal) readmeModal.style.display = "none";
    });

    function loadReadMe() {
        fetch("./README.md")
            .then((r) => r.text())
            .then((data) => {
                const converter = new showdown.Converter();
                readmeContent.innerHTML = converter.makeHtml(data);
            })
            .catch((err) => {
                console.error(err);
                readmeContent.innerHTML = "<p>Error loading ReadMe content.</p>";
            });
    }

    // ── Utilities ──────────────────────────────────────────────────────────────
    function createEl(tag, attrs = {}, children = []) {
        const el = document.createElement(tag);
        Object.entries(attrs).forEach(([k, v]) => {
            if (k === "class") el.className = v;
            else if (k === "text") el.textContent = v;
            else el.setAttribute(k, v);
        });
        children.forEach((child) => {
            if (!child) return;
            el.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
        });
        return el;
    }

    function formatMiles(mi) {
        if (mi == null) return "";
        if (mi < 10) return `${mi.toFixed(1)} mi`;
        return `${Math.round(mi)} mi`;
    }

    // ── Google category mapper ─────────────────────────────────────────────────
    function mapGoogleCategories(types = []) {
        if (!Array.isArray(types) || types.length === 0) return "Services";
        const t = new Set(types);
        const has = (...keys) => keys.some((k) => t.has(k));

        if (has("restaurant", "food", "cafe", "bakery", "meal_delivery",
            "meal_takeaway", "bar", "night_club", "pizza_restaurant",
            "fast_food_restaurant", "coffee_shop", "sandwich_shop",
            "dessert_shop", "ice_cream_shop", "seafood_restaurant",
            "sushi_restaurant", "thai_restaurant", "mexican_restaurant")) return "Food";

        if (has("clothing_store", "shoe_store", "jewelry_store",
            "shopping_mall", "department_store", "boutique")) return "Clothing";

        if (has("beauty_salon", "hair_salon", "barber_shop", "nail_salon",
            "spa", "hair_care", "makeup_artist")) return "Beauty";

        if (has("school", "university", "primary_school", "secondary_school",
            "tutoring_center", "library")) return "Education";

        if (has("hospital", "doctor", "dentist", "pharmacy", "gym",
            "fitness_center", "physiotherapist", "chiropractor",
            "wellness_center", "yoga_studio", "sports_club")) return "Health";

        if (has("electronics_store", "computer_store", "mobile_phone_store",
            "telecommunications_service_provider")) return "Technology";

        if (has("art_gallery", "museum", "performing_arts_theater",
            "movie_theater", "music_venue")) return "Art";

        return "Services";
    }

    // ── Query builder ──────────────────────────────────────────────────────────
    // Google Places Text Search returns much better results when you combine
    // the ownership term with a business type hint.
    // "Black-owned restaurant Greensboro NC" >> "Black-owned Greensboro NC"
    const CATEGORY_HINTS = {
        "Food": "restaurant",
        "Clothing": "clothing store",
        "Beauty": "hair salon or beauty salon",
        "Education": "school or tutoring center",
        "Health": "gym or health clinic",
        "Technology": "tech or electronics store",
        "Art": "art gallery or studio",
        "Services": "business",
        "all": "business",
    };

    function buildSearchTerm(ownershipTerm, selectedCategory) {
        if (ownershipTerm.includes(" ")) {
            // Custom search — user typed their own thing, use as-is
            return ownershipTerm;
        }
        const hint = CATEGORY_HINTS[selectedCategory] || "business";
        return `${ownershipTerm} ${hint}`;
    }

    // ── Map ────────────────────────────────────────────────────────────────────
    function initMap() {
        map = new mapboxgl.Map({
            container: "map",
            style: "mapbox://styles/mapbox/dark-v11",
            center: [-79.792, 36.0726],
            zoom: 12,
        });
        map.addControl(new mapboxgl.NavigationControl());
    }

    const clearMarkers = () => {
        markers.forEach((m) => m.remove());
        markers = [];
    };

    function addMarker(business) {
        if (!business || business.lat == null || business.lng == null || !map) return;
        const el = document.createElement("div");
        Object.assign(el.style, {
            width: "20px", height: "20px", borderRadius: "50%",
            backgroundColor: "#58a6ff", border: "2px solid white", cursor: "pointer",
        });
        const marker = new mapboxgl.Marker(el).setLngLat([business.lng, business.lat]).addTo(map);
        marker.setPopup(
            new mapboxgl.Popup({ offset: 25 }).setHTML(`
                <strong style="color:#58a6ff;">${business.name}</strong><br>
                <span style="color:#8b949e;">${business.category || ""}</span><br>
                ${business.rating ? `⭐ ${business.rating}` : ""}
            `)
        );
        el.addEventListener("click", () => openBusinessModal(business));
        markers.push(marker);
    }

    function fitMapToBounds(businesses) {
        if (!map || !businesses || businesses.length === 0) return;
        const bounds = new mapboxgl.LngLatBounds();
        businesses.forEach((b) => b.lat && b.lng ? bounds.extend([b.lng, b.lat]) : null);
        try {
            map.fitBounds(bounds, { padding: 50 });
        } catch (e) {
            const first = businesses.find((b) => b.lat && b.lng);
            if (first) map.flyTo({ center: [first.lng, first.lat], zoom: 12 });
        }
    }

    // ── Google Places proxy ────────────────────────────────────────────────────
    async function googleProxy(payload) {
        const res = await fetch(GOOGLE_PROXY_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" }, // no Authorization header
            body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`Places proxy error: ${res.status} - ${await res.text()}`);
        return res.json();
    }

    async function googleSearch({ term, locationText, pageToken }) {
        return googleProxy({
            endpoint: "search",
            term,
            location: locationText ?? null,
            pageToken: pageToken ?? null,
        });
    }

    async function fetchGoogleBusiness(placeId) {
        return googleProxy({ endpoint: "business", placeId });
    }

    async function fetchGoogleReviews(placeId) {
        try {
            const data = await googleProxy({ endpoint: "reviews", placeId });
            return data.reviews || [];
        } catch {
            return [];
        }
    }

    // ── Image validation helper ───────────────────────────────────────────────
    function createValidatedImage(src, alt) {
        const img = createEl("img", { src, alt });
        img.addEventListener("error", () => {
            img.style.display = "none";
        });
        img.addEventListener("load", () => {
            img.style.display = "block";
        });
        return img;
    }

    // ── Rendering ──────────────────────────────────────────────────────────────
    function businessCard(biz) {
        const card = createEl("li", { class: "card" }, [
            createEl("div", { class: "card-header" }, [
                createEl("div", { class: "card-title", text: biz.name }),
                createEl("span", { class: "badge", text: biz.category || "" }),
            ]),
            createEl("div", { class: "card-body" }, [
                createEl("div", {}, [document.createTextNode(biz.rating ? `⭐ ${biz.rating} (${biz.review_count || 0})` : "No rating")]),
                biz.distanceMi ? createEl("div", {}, [document.createTextNode(`📍 ${formatMiles(biz.distanceMi)}`)]) : null,
                createEl("div", {}, [document.createTextNode(biz.address || "Address unavailable")]),
                biz.phone ? createEl("div", {}, [document.createTextNode(`📞 ${biz.phone}`)]) : null,
                biz.hours && biz.hours.length
                    ? createEl("div", { class: "hours" }, biz.hours.map((h) => createEl("div", { text: h })))
                    : null,
                biz.payment && biz.payment.length
                    ? createEl("div", { class: "payment" }, [`💳 Accepted: ${biz.payment.join(", ")}`])
                    : null,
                createEl("div", { class: "gallery" },
                    (biz.images || []).slice(0, 3).map((i) => createValidatedImage(i, biz.name))
                ),
            ]),
        ]);
        card.addEventListener("click", () => openBusinessModal(biz));
        return card;
    }

    function renderBusinessList() {
        const listContainer = activeTab === "custom" ? customBusinessList : businessList;
        listContainer.innerHTML = "";
        const selectedCategory = categoryFilter.value;
        const filtered = currentBusinesses.filter((b) => selectedCategory === "all" || b.category === selectedCategory);
        resultCount.textContent = filtered.length;
        if (filtered.length === 0) {
            listContainer.innerHTML = "<li class='card'><div class='card-body'>No results found</div></li>";
            return;
        }
        filtered.forEach((biz) => listContainer.appendChild(businessCard(biz)));
    }

    // ── Business modal ─────────────────────────────────────────────────────────
    async function openBusinessModal(biz) {
        modalBody.innerHTML = "<p>Loading...</p>";
        modalEl.classList.remove("hidden");
        try {
            let fullBiz = biz;
            let reviews = [];

            if (biz?.id && !biz.isCustom) {
                const data = await fetchGoogleBusiness(biz.id).catch(() => null);
                if (data && !data.error) {
                    fullBiz = {
                        ...biz,
                        phone: data.nationalPhoneNumber || data.internationalPhoneNumber || biz.phone,
                        url: data.websiteUri || biz.url,
                        hours: data.regularOpeningHours?.weekdayDescriptions || biz.hours || [],
                        images: (data.photos || []).slice(0, 6).map((photo) =>
                            `${GOOGLE_PROXY_URL}?endpoint=photo&name=${encodeURIComponent(photo.name)}&maxWidthPx=600`
                        ),
                    };
                }
                reviews = await fetchGoogleReviews(biz.id);
                // Filter to only 4-5 star reviews
                reviews = reviews.filter((r) => r.rating >= 4);
            }

            modalBody.innerHTML = "";

            modalBody.appendChild(createEl("div", { class: "modal-header" }, [
                createEl("div", { class: "modal-title", text: fullBiz.name }),
                createEl("div", { class: "modal-subtitle", text: fullBiz.category || "" }),
                fullBiz.rating
                    ? createEl("div", { class: "rating" }, [`⭐ ${fullBiz.rating} (${fullBiz.review_count || 0})`])
                    : null,
            ]));

            const images = fullBiz.images || [];
            if (images.length) {
                const galleryContainer = createEl("div", { class: "gallery" });
                images.forEach((i) => {
                    galleryContainer.appendChild(createValidatedImage(i, fullBiz.name));
                });
                modalBody.appendChild(galleryContainer);
            }

            modalBody.appendChild(createEl("div", {}, [
                createEl("div", {}, [`📍 ${fullBiz.address || "N/A"}`]),
                createEl("div", {}, [`📞 ${fullBiz.phone || "N/A"}`]),
                fullBiz.hours?.length
                    ? createEl("div", { class: "hours" }, fullBiz.hours.map((h) => createEl("div", { text: h })))
                    : null,
                fullBiz.payment?.length
                    ? createEl("div", { class: "payment" }, [`💳 Accepted: ${fullBiz.payment.join(", ")}`])
                    : null,
                fullBiz.url
                    ? createEl("div", {}, [createEl("a", { href: fullBiz.url, target: "_blank", text: "Open Website" })])
                    : null,
            ]));

            if (reviews.length) {
                modalBody.appendChild(createEl("h3", {}, ["⭐ High-Rated Reviews (4-5 stars)"]));
                reviews.forEach((r) => {
                    modalBody.appendChild(createEl("div", { class: "review" }, [
                        createEl("div", { class: "review-header" }, [
                            createEl("span", { class: "author", text: r.authorAttribution?.displayName || "Anonymous" }),
                            createEl("span", { class: "date", text: r.relativePublishTimeDescription || "" }),
                        ]),
                        createEl("div", { class: "rating" }, ["⭐".repeat(r.rating || 0)]),
                        createEl("div", { class: "text", text: r.text?.text || "" }),
                    ]));
                });
            } else if (!biz.isCustom) {
                modalBody.appendChild(createEl("div", {}, ["📝 No 4-5 star reviews yet"]));
            }
        } catch (err) {
            modalBody.innerHTML = `<p>Error loading business: ${err.message}</p>`;
        }
    }

    const closeModal = () => modalEl.classList.add("hidden");
    document.getElementById("modalClose").addEventListener("click", closeModal);
    modalEl.querySelector(".modal-backdrop").addEventListener("click", closeModal);

    // ── Add Business modal ─────────────────────────────────────────────────────
    async function openAddBizModal() {
        addBizModalBody.innerHTML = `
            <h3>Add Your Business</h3>
            <div class="modal-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                <label>
                    Business Name
                    <input type="text" id="modalBizName" placeholder="Example Business Name" />
                </label>
                <label>
                    Ownership Type
                    <select id="modalBizOwnership">
                        <option value="Black-owned">Black-owned</option>
                        <option value="Latino-owned">Latino-owned</option>
                        <option value="Asian-owned">Asian-owned</option>
                        <option value="Women-owned">Women-owned</option>
                        <option value="LGBTQ-owned">LGBTQ-owned</option>
                        <option value="Veteran-owned">Veteran-owned</option>
                        <option value="Native American-owned">Native American-owned</option>
                        <option value="minority-owned">Minority-owned</option>
                    </select>
                </label>
                <label style="grid-column: 1 / -1;">
                    Business Category
                    <input type="text" id="modalBizCategory" placeholder="restaurant, hair salon, gym, clothing store, auto repair..." />
                </label>
                <label>
                    Address
                    <input type="text" id="modalBizAddress" placeholder="234 Example Street, Greensboro, NC" />
                </label>
                <label>
                    Phone
                    <input type="tel" id="modalBizPhone" placeholder="(123) 456-7890" />
                </label>
                <label style="grid-column: 1 / -1;">
                    Business Images
                    <div id="imageDropZone" style="border: 2px dashed #58a6ff; border-radius: 8px; padding: 20px; text-align: center; cursor: pointer; background: rgba(88, 166, 255, 0.05); transition: all 0.3s;">
                        <div style="color: #58a6ff; margin-bottom: 10px;">📸 Drop images here or click to browse</div>
                        <div style="font-size: 12px; color: #8b949e;">Up to 6 images (JPG, PNG, WebP)</div>
                        <input type="file" id="modalBizImages" accept="image/*" multiple style="display: none;" />
                    </div>
                    <div id="imagePreview" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 10px; margin-top: 10px;"></div>
                </label>
                <label style="grid-column: 1 / -1;">
                    Website URL
                    <input type="url" id="modalBizWebsite" placeholder="https://yourwebsite.com" />
                </label>
                <label style="grid-column: 1 / -1;">
                    Hours (one per line)
                    <textarea id="modalBizHours" rows="4" placeholder="Mon: 11:00 - 16:00&#10;Tue: 11:00 - 16:00&#10;Wed: 11:00 - 16:00&#10;Thu: 11:00 - 21:00&#10;Fri: 11:00 - 21:00&#10;Sat: 12:00 - 21:00&#10;Sun: Closed"></textarea>
                </label>
                <label style="grid-column: 1 / -1;">
                    Accepted Services
                    <input type="text" id="modalBizPayment" placeholder="delivery, pickup, online ordering" />
                </label>
                <button id="submitBizBtn" class="primary" style="grid-column: 1 / -1;">➕ Add Business</button>
            </div>
        `;

        addBizModal.classList.remove("hidden");

        const imageInput = document.getElementById("modalBizImages");
        const dropZone = document.getElementById("imageDropZone");
        const imagePreview = document.getElementById("imagePreview");
        let selectedImages = [];

        function handleFiles(files) {
            const fileArray = Array.from(files).slice(0, 6);
            selectedImages = fileArray;
            imagePreview.innerHTML = "";
            fileArray.forEach((file, index) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const container = document.createElement("div");
                    container.style.cssText = "position: relative; border-radius: 8px; overflow: hidden; border: 2px solid #30363d;";
                    const img = document.createElement("img");
                    img.src = e.target.result;
                    img.style.cssText = "width: 100%; height: 80px; object-fit: cover; display: block;";
                    const removeBtn = document.createElement("button");
                    removeBtn.textContent = "×";
                    removeBtn.style.cssText = "position: absolute; top: 2px; right: 2px; background: #da3633; color: white; border: none; border-radius: 4px; width: 20px; height: 20px; cursor: pointer; font-size: 16px; line-height: 1;";
                    removeBtn.onclick = () => { selectedImages.splice(index, 1); container.remove(); };
                    container.appendChild(img);
                    container.appendChild(removeBtn);
                    imagePreview.appendChild(container);
                };
                reader.readAsDataURL(file);
            });
        }

        dropZone.addEventListener("click", () => imageInput.click());
        imageInput.addEventListener("change", (e) => handleFiles(e.target.files));
        dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.style.background = "rgba(88, 166, 255, 0.15)"; });
        dropZone.addEventListener("dragleave", () => { dropZone.style.background = "rgba(88, 166, 255, 0.05)"; });
        dropZone.addEventListener("drop", (e) => { e.preventDefault(); dropZone.style.background = "rgba(88, 166, 255, 0.05)"; handleFiles(e.dataTransfer.files); });

        document.getElementById("submitBizBtn").addEventListener("click", async () => {
            const name = document.getElementById("modalBizName").value.trim();
            const category = document.getElementById("modalBizCategory").value.trim();
            const address = document.getElementById("modalBizAddress").value.trim();
            const phone = document.getElementById("modalBizPhone").value.trim();
            const website = document.getElementById("modalBizWebsite").value.trim();
            const hoursText = document.getElementById("modalBizHours").value.trim();
            const paymentText = document.getElementById("modalBizPayment").value.trim();

            if (!name || !category || !address) return alert("Please fill in Business Name, Category, and Address!");

            const submitBtn = document.getElementById("submitBizBtn");
            const originalText = submitBtn.textContent;
            submitBtn.textContent = "🔄 Geocoding address...";
            submitBtn.disabled = true;

            try {
                const geocodeUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX_TOKEN}&limit=1`;
                const geocodeData = await (await fetch(geocodeUrl)).json();

                if (!geocodeData.features || geocodeData.features.length === 0) {
                    throw new Error("Could not find coordinates for this address. Please check and try again.");
                }

                const [lng, lat] = geocodeData.features[0].center;
                const hours = hoursText ? hoursText.split("\n").filter((h) => h.trim()) : [];
                const payment = paymentText ? paymentText.split(",").map((p) => p.trim()).filter((p) => p) : [];

                submitBtn.textContent = "📸 Processing images...";
                const imageUrls = await Promise.all(
                    selectedImages.map((file) => new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onload = (e) => resolve(e.target.result);
                        reader.readAsDataURL(file);
                    }))
                );

                const newBiz = {
                    name, category, address, lat, lng,
                    rating: null, review_count: 0,
                    phone: phone || null, url: website || null,
                    hours, payment, images: imageUrls, isCustom: true,
                };

                submitBtn.textContent = "💾 Saving to database...";
                const id = await addCustomBusiness(newBiz);
                const bizWithId = { id, ...newBiz };
                customBusinesses.push(bizWithId);

                if (activeTab === "custom") {
                    currentBusinesses = customBusinesses;
                    renderBusinessList();
                    addMarker(bizWithId);
                    fitMapToBounds(currentBusinesses);
                }

                addBizModal.classList.add("hidden");
                alert("✅ Business added successfully!");

                if (activeTab !== "custom") {
                    const btn = Array.from(document.querySelectorAll("#tabs .tab-btn")).find((b) => b.dataset.tab === "custom");
                    if (btn) btn.click();
                }
            } catch (err) {
                console.error(err);
                alert("❌ Error: " + err.message);
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            }
        });
    }

    openAddBizModalBtn.addEventListener("click", openAddBizModal);
    addBizModalClose.addEventListener("click", () => addBizModal.classList.add("hidden"));
    addBizModal.querySelector(".modal-backdrop").addEventListener("click", () => addBizModal.classList.add("hidden"));

    // ── Search ─────────────────────────────────────────────────────────────────
    async function search(loadMore = false) {
        let longitude = null;
        let latitude = null;
        // Get the location text from the form
        const locationText = locationInput.value.trim();

        // Get the ownership/keyword term
        let ownershipTerm = "";
        if (keywordInput.value === "custom") {
            const customInput = document.getElementById("customKeywordInput");
            ownershipTerm = (customInput?.value || "").trim() || "minority-owned business";
        } else {
            ownershipTerm = (keywordInput.value || "").trim() || "minority-owned";
        }

        if (!ownershipTerm) {
            alert("🔍 Please select an ownership type or enter a custom search term.");
            return;
        }

        // Build the search term with category hint
        const selectedCategory = categoryFilter.value;
        const term = buildSearchTerm(ownershipTerm, selectedCategory);

        // Priority: Use GPS location if available, otherwise use location input
        if (userLocation && !locationText) {
            latitude = userLocation.lat;
            longitude = userLocation.lng;
        } else if (locationText) {
            // Geocode the location text to coordinates
            businessList.innerHTML = "<li class='card'><div class='card-body'>📍 Finding coordinates for " + locationText + "...</div></li>";

            try {
                const geocodeUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(locationText)}.json?access_token=${MAPBOX_TOKEN}&limit=1`;
                const geocodeResponse = await fetch(geocodeUrl);
                const geocodeData = await geocodeResponse.json();

                if (geocodeData.features && geocodeData.features.length > 0) {
                    [longitude, latitude] = geocodeData.features[0].center;
                    console.log(`✅ Geocoded "${locationText}" to [${longitude}, ${latitude}]`);
                } else {
                    alert(`❌ Could not find coordinates for "${locationText}". Please check the location and try again.`);
                    return;
                }
            } catch (err) {
                alert(`❌ Error geocoding location: ${err.message}`);
                return;
            }
        } else {
            alert("📍 Please enter a location or click '📍 Use GPS' to search.");
            return;
        }

        if (!loadMore) {
            nextPageToken = null;
            businessList.innerHTML = "<li class='card'><div class='card-body'>🔍 Searching for " + term + " near " + (locationText || "your location") + "...</div></li>";
        }

        try {
            const data = await googleSearch({
                term, latitude, longitude, locationText: locationText || null,
                pageToken: loadMore ? nextPageToken : null,
            });

            if (!data || !data.places || data.places.length === 0) {
                businessList.innerHTML = "<li class='card'><div class='card-body'>😔 No businesses found. Try a different search or location.</div></li>";
                clearMarkers();
                paginationEl.innerHTML = "";
                return;
            }

            nextPageToken = data.nextPageToken || null;

            const normalized = (data.places || []).map((p) => {
                const images = (p.photos || []).slice(0, 6).map((photo) =>
                    `${GOOGLE_PROXY_URL}?endpoint=photo&name=${encodeURIComponent(photo.name)}&maxWidthPx=600`
                );
                const hours = p.regularOpeningHours?.weekdayDescriptions || [];

                return {
                    id: p.id,
                    name: p.displayName?.text || "Unknown",
                    category: mapGoogleCategories(p.types),
                    address: p.formattedAddress || "Address unavailable",
                    lat: p.location?.latitude ?? null,
                    lng: p.location?.longitude ?? null,
                    rating: p.rating ?? null,
                    review_count: p.userRatingCount ?? 0,
                    images, url: p.websiteUri || null,
                    phone: p.nationalPhoneNumber || null,
                    distanceMi: null,
                    hours, payment: [], isCustom: false,
                };
            }).filter((biz) => {
                // Filter out results without ratings or with very low ratings (show only 3.5+)
                if (!biz.rating || biz.rating < 3.5) return false;
                return selectedCategory === "all" || biz.category === selectedCategory;
            });

            if (normalized.length === 0) {
                businessList.innerHTML = "<li class='card'><div class='card-body'>📊 No highly-rated businesses found. Try different filters.</div></li>";
                clearMarkers();
                paginationEl.innerHTML = "";
                return;
            }

            if (loadMore) {
                googleBusinesses = [...googleBusinesses, ...normalized];
            } else {
                googleBusinesses = normalized;
                clearMarkers();
            }

            currentBusinesses = googleBusinesses;
            activeTab = "google";

            renderBusinessList();
            currentBusinesses.forEach(addMarker);
            if (!loadMore && currentBusinesses.length) fitMapToBounds(currentBusinesses);

            paginationEl.innerHTML = "";
            if (nextPageToken) {
                const moreBtn = createEl("button", { class: "button" }, ["📄 Load more results"]);
                moreBtn.addEventListener("click", () => search(true));
                paginationEl.appendChild(moreBtn);
            }
        } catch (err) {
            console.error("Search error:", err);
            businessList.innerHTML = `<li class='card'><div class='card-body'>❌ Search error: ${err.message}</div></li>`;
        }
    }

    // ── Geolocation ────────────────────────────────────────────────────────────
    useMyLocationBtn.addEventListener("click", () => {
        if (!navigator.geolocation) return alert("Geolocation not supported");
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                locationInput.value = "";
                map?.flyTo({ center: [userLocation.lng, userLocation.lat], zoom: 12 });
                alert("Location detected! Click Search.");
            },
            (err) => alert("Could not detect location: " + err.message)
        );
    });

    // ── Tab switching ──────────────────────────────────────────────────────────
    const tabButtons = document.querySelectorAll("#tabs .tab-btn");
    const tabContents = document.querySelectorAll(".tab-content");

    tabButtons.forEach((btn) => btn.addEventListener("click", async () => {
        const target = btn.dataset.tab;
        tabButtons.forEach((b) => b.classList.remove("active"));
        tabContents.forEach((c) => c.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById(`tab-${target}`).classList.add("active");

        if (target === "custom") {
            activeTab = "custom";
            if (customBusinesses.length === 0) {
                customBusinessList.innerHTML = "<li class='card'><div class='card-body'>Loading your businesses...</div></li>";
                try {
                    customBusinesses = await getCustomBusinesses();
                } catch (err) {
                    console.error("Error loading custom businesses:", err);
                    customBusinesses = [];
                }
            }
            currentBusinesses = customBusinesses;
            clearMarkers();
            currentBusinesses.forEach(addMarker);
            renderBusinessList();
            if (currentBusinesses.length > 0) fitMapToBounds(currentBusinesses);
        }

        if (target === "google") {
            activeTab = "google";
            currentBusinesses = googleBusinesses;
            clearMarkers();
            currentBusinesses.forEach(addMarker);
            renderBusinessList();
            if (currentBusinesses.length > 0) fitMapToBounds(currentBusinesses);
        }
    }));

    // ── Event listeners ────────────────────────────────────────────────────────
    searchBtn.addEventListener("click", () => search(false));
    categoryFilter.addEventListener("change", () => {
        // Re-run search when category changes so the query updates too
        if (activeTab === "google") search(false);
        else renderBusinessList();
    });

    mobileToggle.addEventListener("click", () => {
        sidebar.classList.toggle("open");
        mobileToggle.textContent = sidebar.classList.contains("open") ? "✕ Close" : "☰ Menu";
    });

    let startY = 0, currentY = 0, touchingSidebar = false;

    sidebar.addEventListener("touchstart", (e) => {
        if (!sidebar.classList.contains("open")) return;
        if (!addBizModal.classList.contains("hidden") || readmeModal.style.display === "flex") return;
        startY = e.touches[0].clientY;
        touchingSidebar = true;
    });

    sidebar.addEventListener("touchmove", (e) => {
        if (!touchingSidebar) return;
        if (!addBizModal.classList.contains("hidden") || readmeModal.style.display === "flex") return;
        currentY = e.touches[0].clientY;
        const deltaY = currentY - startY;
        if (deltaY > 0) { e.preventDefault(); sidebar.style.transform = `translateY(${deltaY}px)`; }
    }, { passive: false });

    sidebar.addEventListener("touchend", () => {
        touchingSidebar = false;
        const deltaY = currentY - startY;
        if (!addBizModal.classList.contains("hidden") || readmeModal.style.display === "flex") return;
        if (deltaY > 125) { sidebar.classList.remove("open"); mobileToggle.textContent = "☰ Menu"; }
        sidebar.style.transform = "";
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            const customInput = document.getElementById("customKeywordInput");
            if (customInput && keywordInput.value === "custom" && document.activeElement === customInput) search(false);
            if (document.activeElement === locationInput) search(false);
        }
    });

    keywordInput.addEventListener("change", () => {
        const customSearchRow = document.getElementById("customSearchRow");
        if (keywordInput.value === "custom") {
            customSearchRow.style.display = "flex";
            document.getElementById("customKeywordInput").focus();
        } else {
            customSearchRow.style.display = "none";
        }
    });

    // ── Service Worker ─────────────────────────────────────────────────────────
    if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => {
            navigator.serviceWorker
                .register("service-worker.js")
                .then((reg) => console.log("SW registered:", reg.scope))
                .catch((err) => console.error("SW registration failed:", err));
        });
    }

    // ── Init ───────────────────────────────────────────────────────────────────
    async function init() {
        initMap();
        keywordInput.value = "Black-owned";
        locationInput.value = "Greensboro, NC";
    }

    init();
}