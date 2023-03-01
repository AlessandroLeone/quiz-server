const { getFirestore,query, doc, getDoc, getDocs, collection, addDoc, setDoc, updateDoc, deleteDoc } = require("firebase/firestore");
const { v4: uuidv4 } = require('uuid');

const { initializeApp } = require("firebase/app");

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

// the firestore instance
const profileColl = collection(db, 'profiles')

class ProfileService {
    async  getAll() {
        const querySnap = await getDocs(query(profileColl));
        var tuts = [];
        querySnap.forEach(doc => {
            var tut = doc.data();
            tut.id = doc.id;
            tuts.push(tut);
        });
        return tuts;
    }

    async create(uid) {
        const profile = {
            coin: 1000,
            exp: 0,
            level: 0,
            trophy: 0,
            token: uuidv4().toString(),
            reward: []
        }
        await setDoc(doc(db, 'profiles', uid), profile);

        await setDoc(doc(db, 'stickers', uid), {
            stickers: []
        });

        await setDoc(doc(db, 'options', uid), {
            choices: [],
            date: ''
        });

        return profile
    }

    async getProfile(id) {
        const docSnap =  await getDoc(doc(db, 'profiles', id));
        if (docSnap.exists()) {
            return docSnap.data()
        } else {
            console.log('Document does not exist')
        }
    }

    async getToken(id) {
        const docSnap =  await getDoc(doc(db, 'profiles', id));
        if (docSnap.exists()) {
            return docSnap.data().token
        } else {
            console.log('Document does not exist')
        }
    }

    async add(tutorial) {
        return await addDoc(profileColl, tutorial);
    }

    async update(id, value) {
        return await updateDoc(doc(db, 'profiles', id), value);
    }

    async updateTrophies(id, value) {
        const docSnap =  await getDoc(doc(db, 'profiles', id));
        let trophy = 0;
        if (docSnap.exists()) {
            trophy = docSnap.data().trophy;
        } else {
            console.log('Document does not exist')
        }
        return await updateDoc(doc(db, 'profiles', id), {
            trophy: trophy + (value)
          }
        );
    }

    async delete(id) {
        return await deleteDoc(doc(db, 'tutorials', id));
    }
}

module.exports = ProfileService;