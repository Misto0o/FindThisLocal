// firebaseActions.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
    getFirestore,
    collection,
    addDoc,
    getDocs
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import {
    FIREBASE_KEY,
    FIREBASE_AUTH_DOMAIN,
    FIREBASE_PROJECT_ID,
    FIREBASE_STORAGE_BUCKET,
    FIREBASE_MESSAGING_SENDER_ID,
    FIREBASE_APP_ID,
    FIREBASE_MEASUREMENT_ID
} from "../config.js";

// Init Firebase
const firebaseConfig = {
    apiKey: FIREBASE_KEY,
    authDomain: FIREBASE_AUTH_DOMAIN,
    projectId: FIREBASE_PROJECT_ID,
    storageBucket: FIREBASE_STORAGE_BUCKET,
    messagingSenderId: FIREBASE_MESSAGING_SENDER_ID,
    appId: FIREBASE_APP_ID,
    measurementId: FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const businessesRef = collection(db, "businesses");

export async function addCustomBusiness(biz) {
    const docRef = await addDoc(businessesRef, biz);
    return docRef.id;
}

// Get all businesses
export async function getCustomBusinesses() {
    const snapshot = await getDocs(businessesRef);
    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));
}