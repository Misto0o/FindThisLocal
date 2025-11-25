// src/firebaseActions.js
// Make sure this file is loaded with <script type="module">

import { getFirestore, collection, addDoc, getDocs } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";

// Initialize Firebase (only once, can also put in a separate firebase.js if you prefer)
const firebaseConfig = {
    apiKey: "AIzaSyBEfCH1Ae5ybESaZwpBQlCJ4EUt6wy0ZKE",
    authDomain: "findthislocaldb.firebaseapp.com",
    projectId: "findthislocaldb",
    storageBucket: "findthislocaldb.firebasestorage.app",
    messagingSenderId: "524976503992",
    appId: "1:524976503992:web:e0de88522eaead92e6484d",
    measurementId: "G-L4JFDWE2R3"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export async function addCustomBusiness(biz) {
    try {
        const docRef = await addDoc(collection(db, "businesses"), biz);
        console.log("Added business with ID:", docRef.id);
        return docRef.id;
    } catch (e) {
        console.error("Error adding business:", e);
    }
}

export async function getCustomBusinesses() {
    const snapshot = await getDocs(collection(db, "businesses"));
    const results = [];
    snapshot.forEach(doc => results.push({ id: doc.id, ...doc.data() }));
    return results;
}
