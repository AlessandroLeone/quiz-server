const { v4: uuidv4 } = require('uuid');
const he = require('he');
const axios = require('axios')
const categories = require('./categories.json');

let key = "***";
let endpoint = "https://api.cognitive.microsofttranslator.com";
let loc = "francecentral";

function decode(str) {
    return he.decode(str);
}


async function generateQuestions(maxQuestions, language, trophy) {

    let quizes = {
        response_code: 0,
        results: []
    };

    let difficult = 'easy';

    for(let x = 0; x < maxQuestions; x++) {

        if(trophy < 2500) {
            if(x <= 3) {
                difficult = 'easy';
            } else if(x <= 5) {
                difficult = 'medium';
            } else {
                difficult = 'hard';
            }
        } else if(trophy < 5500) {
            if(x <= 1) {
                difficult = 'easy';
            } else if(x <= 5) {
                difficult = 'medium';
            } else {
                difficult = 'hard';
            }
        } else {
            if(x <= 0) {
                difficult = 'easy';
            } else if(x <= 2) {
                difficult = 'medium';
            } else {
                difficult = 'hard';
            }
        }

        
        
        let retries = 0;
        let success = false;
        // ############### controllo sulle stesse domande
        while (!success) {
            let categoryId = categories.cat[Math.floor(Math.random() * categories.cat.length)].id;
            if(categoryId === 0) {
                categoryId = "";
            }

            const testURL = `https://opentdb.com/api.php?amount=1&category=${categoryId}&difficulty=${difficult}&type=${categories.type}`;

            await axios
                .get(testURL)
                .then((response) => {

                    response.data.results[0].question =  decode(decodeURI(response.data.results[0].question));
                    response.data.results[0].correct_answer =  decode(decodeURI(response.data.results[0].correct_answer));
                    response.data.results[0].incorrect_answers = response.data.results[0].incorrect_answers.map(decodeURI).map(decode);
                    
                    quizes.results[x] = response.data.results[0];

                    success = true
                    
                }).catch(e => {
                    console.log("errors axios : " + e + " : " + testURL)
                    retries++
                })

                
        }

        console.log("domanda["+x+"] : " + retries )
    }

    if(language === "it") {
        quizes.results.forEach( async (single, index)  => {
            const [a, b, c] = [...single.incorrect_answers].map(x => decode(decodeURI(x)))
            //question - correct - incorrectA - incorrectB - incorrectC
            const data = [
                {
                    'text': decode(decodeURI(single.question))
                },
                {
                    'text': decode(decodeURI(single.correct_answer))
                },
                {
                    'text': a
                },
                {
                    'text': b
                },
                {
                    'text': c
                },
            ];
            console.log(data)

            axios({
                baseURL: endpoint,
                url: '/translate',
                method: 'post',
                headers: {
                    'Ocp-Apim-Subscription-Key': key,
                    // location required if you're using a multi-service or regional (not global) resource.
                    'Ocp-Apim-Subscription-Region': loc,
                    'Content-type': 'application/json',
                    'X-ClientTraceId': uuidv4().toString()
                },
                params: {
                    'api-version': '3.0',
                    'from': 'en',
                    'to': 'it'
                },
                data,
                responseType: 'json'
            }).then(function(response){
                quizes.results[index].question = response.data[0].translations[0].text
                quizes.results[index].correct_answer = response.data[1].translations[0].text
                quizes.results[index].incorrect_answers[0] = response.data[2].translations[0].text
                quizes.results[index].incorrect_answers[1] = response.data[3].translations[0].text
                quizes.results[index].incorrect_answers[2] = response.data[4].translations[0].text

                return setForEmit(quizes);
            })
            
        });
    } else {
        return setForEmit(quizes);
    }

}

function setForEmit(quizes) {
    let set = [];


    quizes.results.forEach((quiz, index) => {
        let single = {
            difficulty: '',
            category: '',
            question: '',
            answers: [],
        }

        single.difficulty = quiz.difficulty;
        single.category = quiz.category;
        single.question = quiz.question;
        single.answers.push(quiz.correct_answer, ...quiz.incorrect_answers);

        set[index] = single;
    });
    quizes.set = set;
    console.log(quizes)
    return quizes;
}

module.exports = generateQuestions;