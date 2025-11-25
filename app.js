import { addCustomBusiness, getCustomBusinesses } from "./src/firebaseActions.js";

/*** Wait for Mapbox to load ***/
window.addEventListener("load", () => initApp());

function initApp() {
    /*** CONFIGURATION ***/
    const YELP_API_KEY =
        "xoC3zwZWcX3bPzdpsLP0RLJgGU_4FydVGDba2ldClfr0xf_3-5hGU_wO37pqIYnsqVQpYJDkaX8tpRE20YJi9DAeKs-gzVKqOBe_P6CP7qKKaGk-RCCHvs2Mb5MjaXYx";
    const YELP_PROXY_URL = "https://yelp-proxy.crystal-cook07.workers.dev";
    const MAPBOX_TOKEN =
        "pk.eyJ1IjoibWlzdDAtMCIsImEiOiJjbTQ0Z2dhY2owNmVwMnFxMDM2aHdnc2ZuIn0.xCY4lNhcea_biZVA6SIFbA";

    /*** STATE ***/
    mapboxgl.accessToken = MAPBOX_TOKEN;
    let map = null;
    let markers = [];
    let userLocation = null;
    let currentBusinesses = [];
    let currentOffset = 0;

    /*** ELEMENTS ***/
    const keywordInput = document.getElementById("keywordInput");
    const locationInput = document.getElementById("locationInput");
    const radiusSelect = document.getElementById("radiusSelect");
    const categoryFilter = document.getElementById("categoryFilter");
    const searchBtn = document.getElementById("searchBtn");
    const useMyLocationBtn = document.getElementById("useMyLocation");
    const businessList = document.getElementById("businessList");
    const paginationEl = document.getElementById("pagination");
    const resultCount = document.getElementById("resultCount");
    const modalEl = document.getElementById("modal");
    const modalBody = document.getElementById("modalBody");

    const addBizModal = document.getElementById("addBizModal");
    const addBizModalBody = document.getElementById("addBizModalBody");
    const addBizModalClose = document.getElementById("addBizModalClose");
    const openAddBizModalBtn = document.getElementById("openAddBizModal");

    function openAddBizModal() {
        addBizModalBody.innerHTML = `
        <h3>Add Your Business</h3>
        <div class="control-row">
            <label>Name:<input type="text" id="modalBizName" /></label>
        </div>
        <div class="control-row">
            <label>Category:
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
        </div>
        <div class="control-row">
            <label>Address:<input type="text" id="modalBizAddress" placeholder="123 Main Street" /></label>
        </div>
        <div class="control-row">
            <label>Latitude:<input type="number" id="modalBizLat" step="any" /></label>
            <label>Longitude:<input type="number" id="modalBizLng" step="any" /></label>
        </div>
        <div class="control-row">
            <label>Rating:<input type="number" id="modalBizRating" min="0" max="5" step="0.1" /></label>
        </div>
        <button id="submitBizBtn" class="primary">➕ Add Business</button>
    `;
        addBizModal.classList.remove("hidden");

        document.getElementById("submitBizBtn").addEventListener("click", async () => {
            const name = document.getElementById("modalBizName").value;
            const category = document.getElementById("modalBizCategory").value;
            const address = document.getElementById("modalBizAddress").value;
            const lat = parseFloat(document.getElementById("modalBizLat").value);
            const lng = parseFloat(document.getElementById("modalBizLng").value);
            const rating = parseFloat(document.getElementById("modalBizRating").value) || null;

            if (!name || !category || !address || !lat || !lng) {
                return alert("Please fill all fields!");
            }

            const newBiz = { name, category, address, lat, lng, rating };

            try {
                const id = await addCustomBusiness(newBiz);
                console.log("Added user business:", id);

                currentBusinesses.push({ id, ...newBiz });
                renderBusinessList();
                addMarker({ id, ...newBiz });
                fitMapToBounds(currentBusinesses);

                addBizModal.classList.add("hidden");
                alert("Business added!");
            } catch (err) {
                console.error(err);
                alert("Error adding business: " + err.message);
            }
        });
    }

    // Open/Close events
    openAddBizModalBtn.addEventListener("click", openAddBizModal);
    addBizModalClose.addEventListener("click", () => addBizModal.classList.add("hidden"));
    addBizModal.querySelector(".modal-backdrop").addEventListener("click", () => addBizModal.classList.add("hidden"));


    /*** UTILITIES ***/
    function createEl(tag, attrs = {}, children = []) {
        const el = document.createElement(tag);

        Object.entries(attrs).forEach(([k, v]) => {
            if (k === "class") el.className = v;
            else if (k === "text") el.textContent = v;
            else el.setAttribute(k, v);
        });

        children.forEach((child) =>
            child
                ? el.appendChild(
                    typeof child === "string"
                        ? document.createTextNode(child)
                        : child
                )
                : null
        );

        return el;
    }

    const metersToMiles = (m) => (m ? m / 1609.34 : null);

    function formatMiles(mi) {
        if (mi == null) return "";
        if (mi < 1) return `${mi.toFixed(1)} mi`;
        if (mi < 10) return `${mi.toFixed(1)} mi`;
        return `${Math.round(mi)} mi`;
    }

    /*** YELP CATEGORY MAPPING ***/
    function mapYelpCategories(yelpCats) {
        if (!Array.isArray(yelpCats) || yelpCats.length === 0)
            return "Services";

        const aliasSet = new Set(yelpCats.map((c) => c.alias));

        const isAny = (arr) => arr.some((a) => aliasSet.has(a));

        if (
            isAny([
                "restaurants",
                "food",
                "cafes",
                "coffee",
                "pizza",
                "burgers",
                "mexican",
                "chinese",
                "japanese",
                "sushi",
                "thai",
                "bbq",
                "seafood",
                "desserts",
                "donuts",
            ])
        )
            return "Food";

        if (
            isAny([
                "shopping",
                "fashion",
                "clothing",
                "shoes",
                "mensclothing",
                "womensclothing",
            ])
        )
            return "Clothing";

        if (isAny(["beautysvc", "barbers", "hair", "makeupartists", "spas"]))
            return "Beauty";

        if (isAny(["education", "schools", "tutors"])) return "Education";

        if (
            isAny([
                "health",
                "medical",
                "fitness",
                "gym",
                "chiropractors",
                "physiotherapy",
            ])
        )
            return "Health";

        if (
            isAny([
                "itservices",
                "computers",
                "electronics",
                "mobilephones",
                "tech",
            ])
        )
            return "Technology";

        if (isAny(["arts", "galleries", "museum", "musicvenues", "theater"]))
            return "Art";

        return yelpCats[0].title || "Services";
    }
    /*** MAPBOX ***/
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
        if (!business.lat || !business.lng) return;

        const el = document.createElement("div");
        Object.assign(el.style, {
            width: "20px",
            height: "20px",
            borderRadius: "50%",
            backgroundColor: "#58a6ff",
            border: "2px solid white",
            cursor: "pointer",
        });

        const marker = new mapboxgl.Marker(el)
            .setLngLat([business.lng, business.lat])
            .addTo(map);

        marker.setPopup(
            new mapboxgl.Popup({ offset: 25 }).setHTML(`
                <strong style="color:#58a6ff;">${business.name}</strong><br>
                <span style="color:#8b949e;">${business.category}</span><br>
                ${business.rating ? `⭐ ${business.rating}` : ""}
            `)
        );

        el.addEventListener("click", () => openBusinessModal(business));
        markers.push(marker);
    }

    function fitMapToBounds(businesses) {
        if (!map || businesses.length === 0) return;

        const bounds = new mapboxgl.LngLatBounds();
        businesses.forEach((b) =>
            b.lat && b.lng ? bounds.extend([b.lng, b.lat]) : null
        );

        try {
            map.fitBounds(bounds, { padding: 50 });
        } catch {
            const first = businesses.find((b) => b.lat && b.lng);
            if (first)
                map.flyTo({
                    center: [first.lng, first.lat],
                    zoom: 12,
                });
        }
    }

    /*** YELP API ***/
    async function yelpSearch(params) {
        const payload = {
            term: (params.term || "").replace(/-/g, " "),
            latitude: params.latitude ?? null,
            longitude: params.longitude ?? null,
            location: params.locationText ?? null,
            radius: params.radiusMeters ?? null,
            offset: params.offset ?? 0,
            limit: 20,
        };

        const res = await fetch(YELP_PROXY_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${YELP_API_KEY}`,
            },
            body: JSON.stringify(payload),
        });

        if (!res.ok)
            throw new Error(`Yelp API error: ${res.status} - ${await res.text()}`);

        return res.json();
    }

    async function yelpReviews(businessId) {
        const res = await fetch(YELP_PROXY_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${YELP_API_KEY}`,
            },
            body: JSON.stringify({ businessId, endpoint: "reviews" }),
        });

        return res.ok ? res.json() : { reviews: [] };
    }

    function businessCard(biz) {
        const card = createEl("li", { class: "card" }, [
            createEl("div", { class: "card-header" }, [
                createEl("div", { class: "card-title", text: biz.name }),
                createEl("span", { class: "badge", text: biz.category }),
            ]),
            createEl("div", { class: "card-body" }, [
                createEl("div", {}, [
                    document.createTextNode(
                        biz.rating ? `⭐ ${biz.rating} (${biz.review_count})` : "No rating"
                    ),
                ]),
                biz.distanceMi
                    ? createEl("div", {}, [
                        document.createTextNode(`📍 ${formatMiles(biz.distanceMi)}`),
                    ])
                    : null,
                createEl("div", {}, [
                    document.createTextNode(biz.address || "Address unavailable"),
                ]),
                biz.phone
                    ? createEl("div", {}, [document.createTextNode(`📞 ${biz.phone}`)])
                    : null,
                biz.hours
                    ? createEl(
                        "div",
                        { class: "hours" },
                        biz.hours.map((h) => createEl("div", { text: h }))
                    )
                    : null,
                biz.payment
                    ? createEl(
                        "div",
                        { class: "payment" },
                        [`💳 Accepted: ${biz.payment.join(", ")}`]
                    )
                    : null,
                createEl(
                    "div",
                    { class: "gallery" },
                    (biz.images || []).slice(0, 3).map((i) =>
                        createEl("img", { src: i, alt: biz.name })
                    )
                ),
            ]),
        ]);

        card.addEventListener("click", () => openBusinessModal(biz));
        return card;
    }

    /*** MODAL ***/
    async function fetchBusinessDetails(businessId) {
        const res = await fetch(YELP_PROXY_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${YELP_API_KEY}`,
            },
            body: JSON.stringify({ businessId, endpoint: "business" }),
        });
        if (!res.ok) throw new Error(`Yelp business fetch error: ${res.status}`);
        return res.json();
    }

    async function fetchBusinessReviews(businessId) {
        const res = await fetch(YELP_PROXY_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${YELP_API_KEY}`,
            },
            body: JSON.stringify({ businessId, endpoint: "reviews" }),
        });
        if (!res.ok) return { reviews: [] };
        return res.json();
    }

    async function openBusinessModal(biz) {
        modalBody.innerHTML = "<p>Loading...</p>";
        modalEl.classList.remove("hidden");

        try {
            // Fetch full business details
            const fullBiz = await fetchBusinessDetails(biz.id);
            const reviewsData = await fetchBusinessReviews(biz.id);

            modalBody.innerHTML = "";

            // Header: name, category, rating
            modalBody.appendChild(
                createEl("div", { class: "modal-header" }, [
                    createEl("div", { class: "modal-title", text: fullBiz.name }),
                    createEl(
                        "div",
                        { class: "modal-subtitle", text: mapYelpCategories(fullBiz.categories) }
                    ),
                    fullBiz.rating
                        ? createEl("div", { class: "rating" }, [
                            `⭐ ${fullBiz.rating} (${fullBiz.review_count})`,
                        ])
                        : null,
                ])
            );

            // Gallery images
            const images = [];
            if (fullBiz.image_url) images.push(fullBiz.image_url);
            if (Array.isArray(fullBiz.photos)) images.push(...fullBiz.photos);
            modalBody.appendChild(
                createEl(
                    "div",
                    { class: "gallery" },
                    images.slice(0, 6).map((i) => createEl("img", { src: i, alt: fullBiz.name }))
                )
            );

            // Address, phone, hours, payment
            const address = [fullBiz.location?.address1, fullBiz.location?.city, fullBiz.location?.state]
                .filter(Boolean)
                .join(", ");
            const phone = fullBiz.display_phone || fullBiz.phone || "N/A";

            let hours = [];
            if (Array.isArray(fullBiz.hours) && fullBiz.hours.length > 0 && fullBiz.hours[0].open) {
                const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
                hours = fullBiz.hours[0].open.map((h) => `${days[h.day]}: ${h.start.slice(0, 2)}:${h.start.slice(2)} - ${h.end.slice(0, 2)}:${h.end.slice(2)}`);
            }

            const payment = Array.isArray(fullBiz.transactions) ? fullBiz.transactions : [];

            modalBody.appendChild(
                createEl("div", {}, [
                    createEl("div", {}, [`📍 ${address || "N/A"}`]),
                    createEl("div", {}, [`📞 ${phone}`]),
                    hours.length ? createEl("div", { class: "hours" }, hours.map((h) => createEl("div", { text: h }))) : null,
                    payment.length ? createEl("div", { class: "payment" }, [`💳 Accepted: ${payment.join(", ")}`]) : null,
                ])
            );

            // Reviews
            if (reviewsData.reviews && reviewsData.reviews.length > 0) {
                modalBody.appendChild(createEl("h3", {}, ["Reviews"]));
                reviewsData.reviews.forEach((r) => {
                    modalBody.appendChild(
                        createEl("div", { class: "review" }, [
                            createEl("div", { class: "review-header" }, [
                                createEl("span", { class: "author", text: r.user?.name || "Anonymous" }),
                                createEl("span", { class: "date", text: r.time_created }),
                            ]),
                            createEl("div", { class: "rating" }, ["⭐".repeat(r.rating)]),
                            createEl("div", { class: "text", text: r.text }),
                        ])
                    );
                });
            }
        } catch (err) {
            modalBody.innerHTML = `<p>Error loading business: ${err.message}</p>`;
        }
    }

    const closeModal = () => modalEl.classList.add("hidden");

    document.getElementById("modalClose").addEventListener("click", closeModal);
    modalEl.querySelector(".modal-backdrop").addEventListener("click", closeModal);

    /*** SEARCH ***/
    async function search(loadMore = false) {
        const term = (keywordInput.value.trim() || "minority-owned").replace(
            /-/g,
            " "
        );
        const radiusMeters = Number(radiusSelect.value);
        const locationText = locationInput.value.trim() || null;

        let latitude = null,
            longitude = null;
        if (userLocation && !locationText) {
            latitude = userLocation.lat;
            longitude = userLocation.lng;
        }

        if (!loadMore) {
            currentOffset = 0;
            currentBusinesses = [];
        }

        businessList.innerHTML =
            "<li class='card'><div class='card-body'>Searching...</div></li>";

        try {
            const data = await yelpSearch({
                term,
                latitude,
                longitude,
                locationText,
                radiusMeters,
                offset: currentOffset,
            });

            const selectedCategory = categoryFilter.value;

            const normalized = (data.businesses || [])
                .map((b) => {
                    const images = [];
                    if (b.image_url) images.push(b.image_url);
                    if (Array.isArray(b.photos)) images.push(...b.photos);

                    // Map payment types (Yelp returns transactions like 'pickup', 'delivery', 'restaurant_reservation')
                    const payment = Array.isArray(b.transactions) ? b.transactions : [];

                    // Hours (Yelp sometimes returns hours as an array of objects)
                    let hours = [];
                    if (Array.isArray(b.hours) && b.hours.length > 0 && b.hours[0].open) {
                        hours = b.hours[0].open.map((h) => {
                            // Convert numeric day 0=Mon to text if you want
                            const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
                            return `${days[h.day]}: ${h.start.slice(0, 2)}:${h.start.slice(2)} - ${h.end.slice(0, 2)}:${h.end.slice(2)}`;
                        });
                    }

                    return {
                        id: b.id,
                        name: b.name,
                        category: mapYelpCategories(b.categories),
                        address: [b.location?.address1, b.location?.city, b.location?.state]
                            .filter(Boolean)
                            .join(", "),
                        lat: b.coordinates?.latitude ?? null,
                        lng: b.coordinates?.longitude ?? null,
                        rating: b.rating ?? null,
                        review_count: b.review_count,
                        images,
                        url: b.url,
                        phone: b.display_phone || b.phone,
                        distanceMi: b.distance ? metersToMiles(b.distance) : null,
                        hours,        // ✅ Added
                        payment,      // ✅ Added
                    };
                })
                .filter(
                    (biz) =>
                        selectedCategory === "all" || biz.category === selectedCategory
                )
                .sort(
                    (a, b) =>
                        (a.distanceMi ?? Infinity) - (b.distanceMi ?? Infinity)
                );

            if (loadMore) {
                currentBusinesses = [...currentBusinesses, ...normalized];
            } else {
                currentBusinesses = normalized;
                clearMarkers();
            }

            renderBusinessList();

            currentBusinesses.forEach(addMarker);
            if (!loadMore && currentBusinesses.length > 0)
                fitMapToBounds(currentBusinesses);

            paginationEl.innerHTML = "";
            currentOffset += 20;

            if (data.businesses.length === 20) {
                const moreBtn = createEl("button", { class: "button" }, [
                    "Load more",
                ]);
                moreBtn.addEventListener("click", () => search(true));
                paginationEl.appendChild(moreBtn);
            }
        } catch (err) {
            businessList.innerHTML = `<li class='card'><div class='card-body'>Error: ${err.message}</div></li>`;
        }
    }

    /*** RENDER ***/
    function renderBusinessList() {
        businessList.innerHTML = "";

        const selectedCategory = categoryFilter.value;
        const filtered = currentBusinesses.filter(
            (b) => selectedCategory === "all" || b.category === selectedCategory
        );

        resultCount.textContent = filtered.length;

        if (filtered.length === 0)
            return (businessList.innerHTML =
                "<li class='card'><div class='card-body'>No results found</div></li>");

        filtered.forEach((biz) =>
            businessList.appendChild(businessCard(biz))
        );
    }

    /*** GEOLOCATION ***/
    useMyLocationBtn.addEventListener("click", () => {
        if (!navigator.geolocation) return alert("Geolocation not supported");
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                userLocation = {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                };
                locationInput.value = "";
                map?.flyTo({
                    center: [userLocation.lng, userLocation.lat],
                    zoom: 12,
                });
                alert("Location detected! Click Search.");
            },
            (err) => alert("Could not detect location: " + err.message)
        );
    });

    /*** EVENTS ***/
    searchBtn.addEventListener("click", () => search(false));
    categoryFilter.addEventListener("change", () => renderBusinessList());

    /*** INIT ***/
    function init() {
        initMap();
        keywordInput.value = "Black-owned";
        locationInput.value = "Greensboro, NC";
    }

    const mobileToggle = document.getElementById("mobileSidebarToggle");
    const sidebar = document.getElementById("sidebar");

    mobileToggle.addEventListener("click", () => {
        sidebar.classList.toggle("open");
        mobileToggle.textContent = sidebar.classList.contains("open") ? "✕ Close" : "☰ Menu";
    });

    if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => {
            navigator.serviceWorker.register("service-worker.js")
                .then(reg => console.log("Service Worker registered:", reg.scope))
                .catch(err => console.error("Service Worker registration failed:", err));
        });
    }

    init();
}
