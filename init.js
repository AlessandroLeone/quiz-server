const { initializeApp } = require("firebase/app");
const { getFirestore } = require("firebase/firestore");
const { getDatabase } = require("firebase/database");

const firebaseConfig = {
    apiKey: "AIzaSyDEUDVmEhhbb3Ck7qBt6vZM1Oaa5hHdE-8",
    authDomain: "vue-quiz-composition.firebaseapp.com",
    projectId: "vue-quiz-composition",
    storageBucket: "vue-quiz-composition.appspot.com",
    messagingSenderId: "570966230990",
    appId: "1:570966230990:web:4b255d04692c57dff94d9f",
    databaseURL: "https://vue-quiz-composition-default-rtdb.europe-west1.firebasedatabase.app/",
};

// init firebase
const app = initializeApp(firebaseConfig)

// init firestore service
const db = getFirestore()
const database = getDatabase(app)

module.exports = { db, database }