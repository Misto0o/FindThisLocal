import { addCustomBusiness, getCustomBusinesses } from "./src/firebaseActions.js";

// Initialize when window loads
window.addEventListener("load", initApp);

function initApp() {
    // Configuration (kept tokens as in original - consider moving to environment later)
    const MAPBOX_TOKEN = "pk.eyJ1IjoibWlzdDAtMCIsImEiOiJjbTQ0Z2dhY2owNmVwMnFxMDM2aHdnc2ZuIn0.xCY4lNhcea_biZVA6SIFbA";
    const YELP_API_KEY = "xoC3zwZWcX3bPzdpsLP0RLJgGU_4FydVGDba2ldClfr0xf_3-5hGU_wO37pqIYnsqVQpYJDkaX8tpRE20YJi9DAeKs-gzVKqOBe_P6CP7qKKaGk-RCCHvs2Mb5MjaXYx";
    const YELP_PROXY_URL = "https://yelp-proxy.crystal-cook07.workers.dev";

    // State
    mapboxgl.accessToken = MAPBOX_TOKEN;
    let map = null;
    let markers = [];
    let userLocation = null;
    let currentBusinesses = [];
    let yelpBusinesses = [];
    let customBusinesses = []; // 🔥 NEW: Separate storage for custom businesses
    let currentOffset = 0;
    let activeTab = "yelp"; // 🔥 NEW: Track which tab is active

    // Elements
    const keywordInput = document.getElementById("keywordInput");
    const locationInput = document.getElementById("locationInput");
    const radiusSelect = document.getElementById("radiusSelect");
    const categoryFilter = document.getElementById("categoryFilter");
    const searchBtn = document.getElementById("searchBtn");
    const useMyLocationBtn = document.getElementById("useMyLocation");
    const businessList = document.getElementById("businessList");
    const customBusinessList = document.getElementById("customBusinessList"); // 🔥 NEW: Custom business list
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

    // Utilities
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

    const metersToMiles = (m) => (m ? m / 1609.34 : null);
    function formatMiles(mi) {
        if (mi == null) return "";
        if (mi < 10) return `${mi.toFixed(1)} mi`;
        return `${Math.round(mi)} mi`;
    }

    function mapYelpCategories(yelpCats) {
        if (!Array.isArray(yelpCats) || yelpCats.length === 0) return "Services";
        const aliasSet = new Set(yelpCats.map((c) => c.alias));
        const isAny = (arr) => arr.some((a) => aliasSet.has(a));
        if (isAny(["restaurants", "food", "cafes", "coffee", "pizza", "burgers", "mexican", "chinese", "japanese", "sushi", "thai", "bbq", "seafood", "desserts", "donuts"])) return "Food";
        if (isAny(["shopping", "fashion", "clothing", "shoes", "mensclothing", "womensclothing"])) return "Clothing";
        if (isAny(["beautysvc", "barbers", "hair", "makeupartists", "spas"])) return "Beauty";
        if (isAny(["education", "schools", "tutors"])) return "Education";
        if (isAny(["health", "medical", "fitness", "gym", "chiropractors", "physiotherapy"])) return "Health";
        if (isAny(["itservices", "computers", "electronics", "mobilephones", "tech"])) return "Technology";
        if (isAny(["arts", "galleries", "museum", "musicvenues", "theater"])) return "Art";
        return yelpCats[0].title || "Services";
    }

    // Map
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
            width: "20px",
            height: "20px",
            borderRadius: "50%",
            backgroundColor: "#58a6ff",
            border: "2px solid white",
            cursor: "pointer",
        });
        const marker = new mapboxgl.Marker(el).setLngLat([business.lng, business.lat]).addTo(map);
        marker.setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(`
            <strong style="color:#58a6ff;">${business.name}</strong><br>
            <span style="color:#8b949e;">${business.category || ""}</span><br>
            ${business.rating ? `⭐ ${business.rating}` : ""}
        `));
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

    // Yelp proxy helper
    async function yelpProxy(payload) {
        const res = await fetch(YELP_PROXY_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${YELP_API_KEY}` },
            body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`Yelp proxy error: ${res.status} - ${await res.text()}`);
        return res.json();
    }

    async function yelpSearch({ term, latitude, longitude, locationText, radiusMeters, offset = 0 }) {
        return yelpProxy({ term: (term || "").replace(/-/g, " "), latitude: latitude ?? null, longitude: longitude ?? null, location: locationText ?? null, radius: radiusMeters ?? null, offset: offset ?? 0, limit: 20 });
    }

    async function fetchYelpBusiness(businessId) {
        return yelpProxy({ businessId, endpoint: "business" });
    }

    async function fetchYelpReviews(businessId) {
        try {
            const data = await yelpProxy({ businessId, endpoint: "reviews" });
            return data.reviews || [];
        } catch (e) {
            return [];
        }
    }

    // Rendering
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
                biz.hours && biz.hours.length ? createEl("div", { class: "hours" }, biz.hours.map((h) => createEl("div", { text: h }))) : null,
                biz.payment && biz.payment.length ? createEl("div", { class: "payment" }, [`💳 Accepted: ${biz.payment.join(", ")}`]) : null,
                createEl("div", { class: "gallery" }, (biz.images || []).slice(0, 3).map((i) => createEl("img", { src: i, alt: biz.name })))
            ]),
        ]);
        card.addEventListener("click", () => openBusinessModal(biz));
        return card;
    }

    function renderBusinessList() {
        // 🔥 FIXED: Use correct list container based on active tab
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

    // Modal: show details for Yelp or custom business
    async function openBusinessModal(biz) {
        modalBody.innerHTML = "<p>Loading...</p>";
        modalEl.classList.remove("hidden");
        try {
            let fullBiz = biz;
            let reviews = [];
            // If business has a Yelp-like id and url points to Yelp, fetch full details
            if (biz && biz.id && biz.url && biz.url.includes("yelp.com")) {
                const data = await fetchYelpBusiness(biz.id).catch(() => null);
                if (data) fullBiz = data;
                reviews = await fetchYelpReviews(biz.id);
            }

            modalBody.innerHTML = "";
            // Header
            modalBody.appendChild(createEl("div", { class: "modal-header" }, [
                createEl("div", { class: "modal-title", text: fullBiz.name }),
                createEl("div", { class: "modal-subtitle", text: mapYelpCategories(fullBiz.categories || []) }),
                fullBiz.rating ? createEl("div", { class: "rating" }, [`⭐ ${fullBiz.rating} (${fullBiz.review_count || 0})`]) : null,
            ]));

            // Images
            const images = [];
            if (fullBiz.image_url) images.push(fullBiz.image_url);
            if (Array.isArray(fullBiz.photos)) images.push(...fullBiz.photos);
            modalBody.appendChild(createEl("div", { class: "gallery" }, images.slice(0, 6).map((i) => createEl("img", { src: i, alt: fullBiz.name }))));

            // Contact, hours, payment
            const address = [fullBiz.location?.address1, fullBiz.location?.city, fullBiz.location?.state].filter(Boolean).join(", ") || fullBiz.address || "N/A";
            const phone = fullBiz.display_phone || fullBiz.phone || "N/A";

            let hours = [];
            if (Array.isArray(fullBiz.hours) && fullBiz.hours.length > 0 && fullBiz.hours[0].open) {
                const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
                hours = fullBiz.hours[0].open.map((h) => `${days[h.day]}: ${h.start.slice(0, 2)}:${h.start.slice(2)} - ${h.end.slice(0, 2)}:${h.end.slice(2)}`);
            } else if (Array.isArray(fullBiz.hours_text)) {
                hours = fullBiz.hours_text;
            }

            const payment = Array.isArray(fullBiz.transactions) ? fullBiz.transactions : fullBiz.payment || [];

            modalBody.appendChild(createEl("div", {}, [
                createEl("div", {}, [`📍 ${address}`]),
                createEl("div", {}, [`📞 ${phone}`]),
                hours.length ? createEl("div", { class: "hours" }, hours.map((h) => createEl("div", { text: h }))) : null,
                payment.length ? createEl("div", { class: "payment" }, [`💳 Accepted: ${payment.join(", ")}`]) : null,
                fullBiz.url ? createEl("div", {}, [createEl("a", { href: fullBiz.url, target: "_blank", text: "Open on Yelp/Website" })]) : null,
            ]));

            // Reviews
            if (reviews && reviews.length) {
                modalBody.appendChild(createEl("h3", {}, ["Reviews"]));
                reviews.forEach((r) => {
                    modalBody.appendChild(createEl("div", { class: "review" }, [
                        createEl("div", { class: "review-header" }, [
                            createEl("span", { class: "author", text: r.user?.name || "Anonymous" }),
                            createEl("span", { class: "date", text: r.time_created }),
                        ]),
                        createEl("div", { class: "rating" }, ["⭐".repeat(r.rating || 0)]),
                        createEl("div", { class: "text", text: r.text || "" }),
                    ]));
                });
            }
        } catch (err) {
            modalBody.innerHTML = `<p>Error loading business: ${err.message}</p>`;
        }
    }

    const closeModal = () => modalEl.classList.add("hidden");
    document.getElementById("modalClose").addEventListener("click", closeModal);
    modalEl.querySelector(".modal-backdrop").addEventListener("click", closeModal);

    function openAddBizModal() {
        addBizModalBody.innerHTML = `
        <h3>Add Your Business</h3>
        <div class="modal-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
            <label>
                Business Name
                <input type="text" id="modalBizName" placeholder="Ben's Boyz Premium Comfort" />
            </label>
            
            <label>
                Category
                <select id="modalBizCategory">
                    <option value="Food">Food</option>
                    <option value="Clothing">Clothing</option>
                    <option value="Services">Services</option>
                    <option value="Beauty">Beauty</option>
                    <option value="Education">Education</option>
                    <option value="Health">Health</option>
                    <option value="Technology">Technology</option>
                    <option value="Art">Art</option>
                </select>
            </label>
            
            <label>
                Address
                <input type="text" id="modalBizAddress" placeholder="2711 Grandview Ave, Greensboro, NC" />
            </label>
            
            <label>
                Phone
                <input type="tel" id="modalBizPhone" placeholder="(336) 907-8161" />
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
                Website / Yelp URL
                <input type="url" id="modalBizWebsite" placeholder="https://www.yelp.com/biz/..." />
            </label>
            
            <label style="grid-column: 1 / -1;">
                Hours (one per line)
                <textarea id="modalBizHours" rows="4" placeholder="Mon: 11:00 - 16:00
Tue: 11:00 - 16:00
Wed: 11:00 - 16:00
Thu: 11:00 - 21:00
Fri: 11:00 - 21:00
Sat: 12:00 - 21:00
Sun: Closed"></textarea>
            </label>
            
            <label style="grid-column: 1 / -1;">
                Accepted Services
                <input type="text" id="modalBizPayment" placeholder="delivery, pickup, online ordering" />
            </label>
            
            <button id="submitBizBtn" class="primary" style="grid-column: 1 / -1;">➕ Add Business</button>
        </div>
    `;
        addBizModal.classList.remove("hidden");

        // 🔥 Image upload handling
        const imageInput = document.getElementById("modalBizImages");
        const dropZone = document.getElementById("imageDropZone");
        const imagePreview = document.getElementById("imagePreview");
        let selectedImages = [];

        function handleFiles(files) {
            const fileArray = Array.from(files).slice(0, 6); // Max 6 images
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
                    removeBtn.onclick = () => {
                        selectedImages.splice(index, 1);
                        container.remove();
                    };
                    
                    container.appendChild(img);
                    container.appendChild(removeBtn);
                    imagePreview.appendChild(container);
                };
                reader.readAsDataURL(file);
            });
        }

        dropZone.addEventListener("click", () => imageInput.click());
        imageInput.addEventListener("change", (e) => handleFiles(e.target.files));

        // Drag and drop
        dropZone.addEventListener("dragover", (e) => {
            e.preventDefault();
            dropZone.style.background = "rgba(88, 166, 255, 0.15)";
            dropZone.style.borderColor = "#58a6ff";
        });

        dropZone.addEventListener("dragleave", () => {
            dropZone.style.background = "rgba(88, 166, 255, 0.05)";
            dropZone.style.borderColor = "#58a6ff";
        });

        dropZone.addEventListener("drop", (e) => {
            e.preventDefault();
            dropZone.style.background = "rgba(88, 166, 255, 0.05)";
            handleFiles(e.dataTransfer.files);
        });

        document.getElementById("submitBizBtn").addEventListener("click", async () => {
            const name = document.getElementById("modalBizName").value.trim();
            const category = document.getElementById("modalBizCategory").value;
            const address = document.getElementById("modalBizAddress").value.trim();
            const phone = document.getElementById("modalBizPhone").value.trim();
            const website = document.getElementById("modalBizWebsite").value.trim();
            const hoursText = document.getElementById("modalBizHours").value.trim();
            const paymentText = document.getElementById("modalBizPayment").value.trim();

            if (!name || !category || !address) {
                return alert("Please fill in Business Name, Category, and Address!");
            }

            const submitBtn = document.getElementById("submitBizBtn");
            const originalText = submitBtn.textContent;
            submitBtn.textContent = "🔄 Geocoding address...";
            submitBtn.disabled = true;

            try {
                const geocodeUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX_TOKEN}&limit=1`;
                const geocodeResponse = await fetch(geocodeUrl);
                const geocodeData = await geocodeResponse.json();

                if (!geocodeData.features || geocodeData.features.length === 0) {
                    throw new Error("Could not find coordinates for this address. Please check the address and try again.");
                }

                const [lng, lat] = geocodeData.features[0].center;

                const hours = hoursText ? hoursText.split('\n').filter(h => h.trim()) : [];
                const payment = paymentText ? paymentText.split(',').map(p => p.trim()).filter(p => p) : [];

                // 🔥 Convert images to base64
                submitBtn.textContent = "📸 Processing images...";
                const imageUrls = await Promise.all(selectedImages.map(file => {
                    return new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onload = (e) => resolve(e.target.result);
                        reader.readAsDataURL(file);
                    });
                }));

                const newBiz = {
                    name,
                    category,
                    address,
                    lat,
                    lng,
                    rating: null,
                    review_count: 0,
                    phone: phone || null,
                    url: website || null,
                    hours,
                    payment,
                    images: imageUrls // 🔥 Save base64 images
                };

                // 🔥 Save to Firebase
                submitBtn.textContent = "💾 Saving to database...";
                const id = await addCustomBusiness(newBiz);

                // Add ID to the business object
                const bizWithId = { id, ...newBiz };

                // 🔥 FIXED: Add to customBusinesses array
                customBusinesses.push(bizWithId);

                // 🔥 FIXED: If we're on the custom tab, update the view immediately
                if (activeTab === "custom") {
                    currentBusinesses.push(bizWithId);
                    renderBusinessList();
                    addMarker(bizWithId);
                    fitMapToBounds(currentBusinesses);
                }

                // Close modal
                addBizModal.classList.add("hidden");
                alert("✅ Business added successfully!");
                
                // 🔥 FIXED: Auto-switch to "Your Business" tab to show the new business
                if (activeTab !== "custom") {
                    // Find and click the "Your Businesses" tab button
                    const yourBizTabBtn = Array.from(document.querySelectorAll("#tabs .tab-btn")).find(btn => btn.dataset.tab === "custom");
                    if (yourBizTabBtn) yourBizTabBtn.click();
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

    // Search (single consolidated implementation)
    async function search(loadMore = false) {
        let term = "";
        if (keywordInput.value === "custom") {
            const customInput = document.getElementById("customKeywordInput");
            term = (customInput?.value || "").trim() || "business";
        } else {
            term = (keywordInput.value || "").trim() || "minority-owned";
        }
        term = term.replace(/-/g, " ");

        const radiusMeters = Number(radiusSelect.value);
        const locationText = locationInput.value.trim() || null;
        let latitude = null, longitude = null;
        if (userLocation && !locationText) {
            latitude = userLocation.lat;
            longitude = userLocation.lng;
        }

        if (!loadMore) { currentOffset = 0; }
        businessList.innerHTML = "<li class='card'><div class='card-body'>Searching...</div></li>";

        try {
            const data = await yelpSearch({ term, latitude, longitude, locationText, radiusMeters, offset: currentOffset });
            const selectedCategory = categoryFilter.value;

            const normalized = (data.businesses || []).map((b) => {
                const images = [];
                if (b.image_url) images.push(b.image_url);
                if (Array.isArray(b.photos)) images.push(...b.photos);
                const payment = Array.isArray(b.transactions) ? b.transactions : [];
                let hours = [];
                if (Array.isArray(b.hours) && b.hours.length > 0 && b.hours[0].open) {
                    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
                    hours = b.hours[0].open.map((h) => `${days[h.day]}: ${h.start.slice(0, 2)}:${h.start.slice(2)} - ${h.end.slice(0, 2)}:${h.end.slice(2)}`);
                }
                return {
                    id: b.id,
                    name: b.name,
                    category: mapYelpCategories(b.categories),
                    address: [b.location?.address1, b.location?.city, b.location?.state].filter(Boolean).join(", "),
                    lat: b.coordinates?.latitude ?? null,
                    lng: b.coordinates?.longitude ?? null,
                    rating: b.rating ?? null,
                    review_count: b.review_count,
                    images,
                    url: b.url,
                    phone: b.display_phone || b.phone,
                    distanceMi: b.distance ? metersToMiles(b.distance) : null,
                    hours,
                    payment,
                };
            }).filter((biz) => selectedCategory === "all" || biz.category === selectedCategory)
                .sort((a, b) => (a.distanceMi ?? Infinity) - (b.distanceMi ?? Infinity));

            if (loadMore) {
                yelpBusinesses = [...yelpBusinesses, ...normalized];
            } else {
                yelpBusinesses = normalized;
                clearMarkers();
            }

            // 🔥 FIXED: Update currentBusinesses and view
            currentBusinesses = yelpBusinesses;
            activeTab = "yelp";
            
            renderBusinessList();
            currentBusinesses.forEach(addMarker);
            if (!loadMore && currentBusinesses.length) fitMapToBounds(currentBusinesses);

            paginationEl.innerHTML = "";
            currentOffset += 20;
            if ((data.businesses || []).length === 20) {
                const moreBtn = createEl("button", { class: "button" }, ["Load more"]);
                moreBtn.addEventListener("click", () => search(true));
                paginationEl.appendChild(moreBtn);
            }
        } catch (err) {
            businessList.innerHTML = `<li class='card'><div class='card-body'>Error: ${err.message}</div></li>`;
        }
    }

    // Geolocation
    useMyLocationBtn.addEventListener("click", () => {
        if (!navigator.geolocation) return alert("Geolocation not supported");
        navigator.geolocation.getCurrentPosition((pos) => {
            userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            locationInput.value = "";
            map?.flyTo({ center: [userLocation.lng, userLocation.lat], zoom: 12 });
            alert("Location detected! Click Search.");
        }, (err) => alert("Could not detect location: " + err.message));
    });

    // Tab switching
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
            // Load custom businesses if not loaded yet
            if (customBusinesses.length === 0) {
                customBusinessList.innerHTML = "<li class='card'><div class='card-body'>Loading your businesses...</div></li>";
                try {
                    customBusinesses = await getCustomBusinesses();
                    console.log("Loaded custom businesses:", customBusinesses); // 🔥 Debug log
                } catch (err) {
                    console.error("Error loading custom businesses:", err);
                    customBusinesses = [];
                }
            }
            currentBusinesses = customBusinesses;
            clearMarkers();
            currentBusinesses.forEach(addMarker);
            renderBusinessList();
            if (currentBusinesses.length > 0) {
                fitMapToBounds(currentBusinesses);
            }
        }
        if (target === "yelp") {
            activeTab = "yelp";
            currentBusinesses = yelpBusinesses;
            clearMarkers();
            currentBusinesses.forEach(addMarker);
            renderBusinessList();
            if (currentBusinesses.length > 0) {
                fitMapToBounds(currentBusinesses);
            }
        }
    }));

    // Listeners
    searchBtn.addEventListener("click", () => search(false));
    categoryFilter.addEventListener("change", () => renderBusinessList());
    mobileToggle.addEventListener("click", () => {
        sidebar.classList.toggle("open");
        mobileToggle.textContent = sidebar.classList.contains("open") ? "✕ Close" : "☰ Menu";
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
        if (keywordInput.value === "custom") { customSearchRow.style.display = "flex"; document.getElementById("customKeywordInput").focus(); } else { customSearchRow.style.display = "none"; }
    });

    // Service worker registration
    if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => {
            navigator.serviceWorker.register("service-worker.js").then((reg) => console.log("Service Worker registered:", reg.scope)).catch((err) => console.error("Service Worker registration failed:", err));
        });
    }

    async function init() {
        initMap();
        keywordInput.value = "Black-owned";
        locationInput.value = "Greensboro, NC";
    }

    init();
}