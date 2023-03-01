  function botAnswer(question, trophy) {

    let risposte = question.incorrect_answers.map(risposta => {
        return { text: risposta, correct: false };
    });
    
    risposte.push({ text: question.correct_answer, correct: true });
    

    let indiceRisposta;

    if (trophy < 2500) {
        indiceRisposta = Math.floor(Math.random() * risposte.length);

    } else if (trophy < 5500) {
        // aumentare la probabilità di selezionare una risposta corretta
        let probabilitaRispostaCorretta = 0.7;
        let rispostaCorretta = risposte.findIndex(risposta => risposta.correct === true);
        let scelta = Math.random();

        if (scelta <= probabilitaRispostaCorretta) {
            indiceRisposta = rispostaCorretta;
        } else {
            // scegliere una risposta tra quelle sbagliate
            let risposteSbagliate = risposte.filter(risposta => risposta.correct === false);
            indiceRisposta = risposteSbagliate[Math.floor(Math.random() * risposteSbagliate.length)];
        }

    } else {
        // diminuire la probabilità di selezionare una risposta corretta
        let probabilitaRispostaCorretta = 0.3;
        let rispostaCorretta = risposte.findIndex(risposta => risposta.correct === true);
        let scelta = Math.random();

        if (scelta <= probabilitaRispostaCorretta) {
        indiceRisposta = rispostaCorretta;

        } else {
            // scegliere una risposta tra quelle sbagliate
            let risposteSbagliate = risposte.filter(risposta => risposta.correct === false);
            indiceRisposta = risposteSbagliate[Math.floor(Math.random() * risposteSbagliate.length)];
        }
    }
  
    return risposte[indiceRisposta].text;
}
  
module.exports = botAnswer;