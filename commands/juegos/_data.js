export const HANGMAN_WORDS = [
  "goku",
  "vegeta",
  "naruto",
  "sasuke",
  "ichigo",
  "pikachu",
  "charizard",
  "luffy",
  "zoro",
  "sanji",
  "tanjiro",
  "nezuko",
  "saitama",
  "artoria",
  "avalon",
  "excalibur",
  "whatsapp",
  "subbot",
  "spotify",
  "instagram",
];

export const SCRAMBLE_WORDS = [
  "comando",
  "descarga",
  "botvip",
  "youtube",
  "anime",
  "caballero",
  "subbot",
  "velocidad",
  "ranking",
  "vinculacion",
  "premium",
  "artoria",
  "dragonball",
  "whatsapp",
  "mantenimiento",
];

export const TRIVIA_QUESTIONS = [
  {
    question: "Que planeta destruyo Freezer en Dragon Ball Z?",
    options: ["Planeta Namek", "Planeta Vegeta", "Planeta Kaiosama", "Planeta Yardrat"],
    answer: 2,
  },
  {
    question: "Cual es el metal del escudo de Capitan America?",
    options: ["Adamantium", "Vibranium", "Kryptonita", "Beskar"],
    answer: 2,
  },
  {
    question: "Que comando muestra el estado de las APIs del bot?",
    options: ["apiestado", "exploit", "crashhost", "superpanel"],
    answer: 1,
  },
  {
    question: "Quien es el capitan de los Sombrero de Paja?",
    options: ["Zoro", "Luffy", "Law", "Shanks"],
    answer: 2,
  },
  {
    question: "Que red usa el bot para conectarse?",
    options: ["Telegram", "Discord", "WhatsApp", "Messenger"],
    answer: 3,
  },
  {
    question: "Cual es el lenguaje principal de este bot?",
    options: ["Python", "Java", "Node.js", "PHP"],
    answer: 3,
  },
  {
    question: "Quien usa el Sharingan en Naruto?",
    options: ["Rock Lee", "Sasuke", "Jiraiya", "Gaara"],
    answer: 2,
  },
  {
    question: "Que anime tiene a Tanjiro como protagonista?",
    options: ["Bleach", "One Piece", "Kimetsu no Yaiba", "Jujutsu Kaisen"],
    answer: 3,
  },
  {
    question: "Cual de estos es un comando nuevo del bot?",
    options: ["apiestado", "exploit", "superadmin", "crashhost"],
    answer: 1,
  },
  {
    question: "Que comando sirve para reiniciar el bot?",
    options: ["status", "restart", "logs", "owner"],
    answer: 2,
  },
];

export const EMOJI_QUIZZES = [
  { emojis: "🐉 ⚽", answer: "dragon ball" },
  { emojis: "👒 ☠️", answer: "one piece" },
  { emojis: "🦊 🍥", answer: "naruto" },
  { emojis: "⚔️ 👹", answer: "kimetsu no yaiba" },
  { emojis: "📱 💬", answer: "whatsapp" },
  { emojis: "🤖 🎵", answer: "bot musical" },
  { emojis: "⬇️ 🎬", answer: "descargar video" },
  { emojis: "🎧 🎶", answer: "spotify" },
  { emojis: "📸 ❤️", answer: "instagram" },
  { emojis: "🕹️ 👑", answer: "rey del juego" },
];

export const TRUE_FALSE_QUESTIONS = [
  {
    statement: "Luffy quiere convertirse en Rey de los Piratas.",
    answer: true,
    explanation: "Ese es el sueno principal de Luffy en One Piece.",
  },
  {
    statement: "Naruto pertenece al anime Bleach.",
    answer: false,
    explanation: "Naruto es el protagonista de Naruto, no de Bleach.",
  },
  {
    statement: "WhatsApp es la plataforma principal de este bot.",
    answer: true,
    explanation: "El bot esta pensado para funcionar en WhatsApp.",
  },
  {
    statement: "Vegeta fue entrenado por All Might.",
    answer: false,
    explanation: "All Might pertenece a My Hero Academia, no a Dragon Ball.",
  },
  {
    statement: "Kimetsu no Yaiba tiene a Tanjiro como protagonista.",
    answer: true,
    explanation: "Tanjiro Kamado lidera la historia de Kimetsu no Yaiba.",
  },
  {
    statement: "El comando .status muestra el estado del bot.",
    answer: true,
    explanation: "Status es el comando pensado para revisar el estado del bot.",
  },
  {
    statement: "Sasuke usa el Sharingan.",
    answer: true,
    explanation: "El Sharingan es una de las tecnicas mas conocidas de Sasuke.",
  },
  {
    statement: "Pikachu es un Digimon.",
    answer: false,
    explanation: "Pikachu es un Pokemon.",
  },
];

export const ANIME_QUIZ_QUESTIONS = [
  {
    question: "En que anime aparece Gojo Satoru?",
    options: ["Bleach", "Jujutsu Kaisen", "Naruto", "Black Clover"],
    answer: 2,
  },
  {
    question: "Quien es el hermano de Tanjiro?",
    options: ["Nezuko", "Mitsuri", "Shinobu", "Kanao"],
    answer: 1,
  },
  {
    question: "Como se llama el shinigami protagonista de Bleach?",
    options: ["Ichigo", "Renji", "Byakuya", "Aizen"],
    answer: 1,
  },
  {
    question: "Que tripulacion lidera Monkey D. Luffy?",
    options: ["Los Akatsuki", "Los Sombrero de Paja", "Los Titanes", "La Armada Roja"],
    answer: 2,
  },
  {
    question: "Quien heredo el poder de One For All?",
    options: ["Bakugo", "Todoroki", "Deku", "Shigaraki"],
    answer: 3,
  },
  {
    question: "Cual es el apellido de Naruto?",
    options: ["Uchiha", "Uzumaki", "Hatake", "Hyuga"],
    answer: 2,
  },
  {
    question: "Que personaje dice normalmente 'ore wa monkey d luffy'?",
    options: ["Luffy", "Zoro", "Sanji", "Ace"],
    answer: 1,
  },
  {
    question: "Quien es el rival principal de Goku en varias sagas?",
    options: ["Krillin", "Vegeta", "Yamcha", "Piccolo"],
    answer: 2,
  },
];

export const FLAG_QUIZZES = [
  {
    flag: "🇯🇵",
    country: "Japon",
    answers: ["japon", "japan"],
  },
  {
    flag: "🇲🇽",
    country: "Mexico",
    answers: ["mexico"],
  },
  {
    flag: "🇵🇪",
    country: "Peru",
    answers: ["peru"],
  },
  {
    flag: "🇦🇷",
    country: "Argentina",
    answers: ["argentina"],
  },
  {
    flag: "🇨🇴",
    country: "Colombia",
    answers: ["colombia"],
  },
  {
    flag: "🇨🇱",
    country: "Chile",
    answers: ["chile"],
  },
  {
    flag: "🇪🇸",
    country: "Espana",
    answers: ["espana", "espanya", "espana"],
  },
  {
    flag: "🇺🇸",
    country: "Estados Unidos",
    answers: ["estados unidos", "usa", "eeuu", "united states"],
  },
  {
    flag: "🇧🇷",
    country: "Brasil",
    answers: ["brasil", "brazil"],
  },
  {
    flag: "🇫🇷",
    country: "Francia",
    answers: ["francia", "france"],
  },
];
