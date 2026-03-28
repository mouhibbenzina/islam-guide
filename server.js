require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ── Models ────────────────────────────────────────────────
const QuestionSchema = new mongoose.Schema({
  author: { type: String, default: 'Anonymous' },
  authorType: { type: String, enum: ['muslim', 'non-muslim'], default: 'non-muslim' },
  country: { type: String, default: '' },
  question: { type: String, required: true },
  answers: [{
    author: { type: String, default: 'Anonymous' },
    authorType: { type: String, enum: ['muslim', 'non-muslim', 'ai'] },
    content: String,
    likes: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
  }],
  likes: { type: Number, default: 0 },
  category: { type: String, default: 'general' },
  createdAt: { type: Date, default: Date.now }
});

const TestimonySchema = new mongoose.Schema({
  author: { type: String, required: true },
  country: { type: String, default: '' },
  story: { type: String, required: true },
  type: { type: String, enum: ['revert', 'born-muslim', 'non-muslim'], default: 'revert' },
  likes: { type: Number, default: 0 },
  approved: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const ChatSchema = new mongoose.Schema({
  sessionId: String,
  messages: [{ role: String, content: String, timestamp: { type: Date, default: Date.now } }]
});

const Question = mongoose.model('Question', QuestionSchema);
const Testimony = mongoose.model('Testimony', TestimonySchema);
const Chat = mongoose.model('Chat', ChatSchema);

// ── Health ────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'islam-final-v4' }));

// ── AI Chat ───────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId, history = [] } = req.body;
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: `You are Sheikh AI (الشيخ الذكي) — the world's most knowledgeable, compassionate, and accurate Islamic scholar AI. Your mission is sacred:

CORE MISSION: Present authentic Islam to the entire world — Muslims and non-Muslims alike — with wisdom, evidence, and love.

YOU MUST:
1. Answer EVERY question about Islam with Quran verses AND Hadith references
2. Correct misconceptions about terrorism, jihad, women's rights, and extremism with evidence
3. Explain Islamic values: peace (salaam), justice (adl), mercy (rahmah), brotherhood (ukhuwwa)
4. Present Islam as the complete way of life it is — spirituality, ethics, science, community
5. Be WELCOMING to non-Muslims — they are guests in this conversation
6. Speak warmly about all prophets: Adam, Ibrahim, Musa, Isa, Muhammad ﷺ
7. Share historical Islamic achievements that changed civilization
8. ALWAYS respond in the SAME LANGUAGE the user writes in (Arabic, English, French, or any language)
9. For people curious about Islam, share its beauty without pressure
10. For Muslims, provide deep scholarly insight
11. Never promote extremism — it is haram and contradicts authentic Islam
12. Quote specific Quran chapters and verse numbers when relevant
13. Reference authentic Hadith collections (Bukhari, Muslim, Tirmidhi, etc.)

YOUR TONE: Warm like a scholar, accessible like a friend, precise like a scholar.
YOUR GOAL: Every person who speaks with you should leave with more understanding, respect, and curiosity about Islam.`
    });
    const chat = model.startChat({
      history: history.map(h => ({ role: h.role === 'ai' ? 'model' : h.role, parts: [{ text: h.content }] }))
    });
    const result = await chat.sendMessage(message);
    const response = result.response.text();
    await Chat.findOneAndUpdate({ sessionId }, { $push: { messages: [{ role: 'user', content: message }, { role: 'model', content: response }] } }, { upsert: true });
    res.json({ response });
  } catch (err) {
    console.error('Gemini error:', err.message);
    res.status(500).json({ error: 'AI temporarily unavailable. Please try again in a moment.' });
  }
});

// ── Questions ─────────────────────────────────────────────
app.get('/api/questions', async (req, res) => {
  try { res.json(await Question.find().sort({ createdAt: -1 }).limit(100)); }
  catch { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/questions', async (req, res) => {
  try {
    const { author, authorType, country, question, category } = req.body;
    if (!question?.trim()) return res.status(400).json({ error: 'Question required' });
    const q = await Question.create({ author: author || 'Anonymous', authorType: authorType || 'non-muslim', country: country || '', question, category: category || 'general' });
    // Auto AI answer
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', systemInstruction: 'You are Sheikh AI, a knowledgeable Islamic scholar. Answer questions about Islam accurately with Quran and Hadith references. Be welcoming to non-Muslims. Keep answers to 2-3 clear paragraphs. Always cite sources.' });
      const result = await model.generateContent(`Question about Islam: ${question}`);
      q.answers.push({ author: 'Sheikh AI 🤖', authorType: 'ai', content: result.response.text() });
      await q.save();
    } catch (e) { console.error('AI answer failed:', e.message); }
    res.json(q);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/questions/:id/answer', async (req, res) => {
  try {
    const q = await Question.findById(req.params.id);
    if (!q) return res.status(404).json({ error: 'Not found' });
    q.answers.push({ author: req.body.author || 'Anonymous', authorType: req.body.authorType || 'muslim', content: req.body.content });
    await q.save();
    res.json(q);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/questions/:id/like', async (req, res) => {
  try { res.json(await Question.findByIdAndUpdate(req.params.id, { $inc: { likes: 1 } }, { new: true })); }
  catch { res.status(500).json({ error: 'Server error' }); }
});

// ── Testimonies ───────────────────────────────────────────
app.get('/api/testimonies', async (req, res) => {
  try { res.json(await Testimony.find({ approved: true }).sort({ createdAt: -1 }).limit(50)); }
  catch { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/testimonies', async (req, res) => {
  try {
    const { author, country, story, type } = req.body;
    if (!author?.trim() || !story?.trim()) return res.status(400).json({ error: 'Author and story required' });
    const t = await Testimony.create({ author, country: country || '', story, type: type || 'revert' });
    res.json(t);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/testimonies/:id/like', async (req, res) => {
  try { res.json(await Testimony.findByIdAndUpdate(req.params.id, { $inc: { likes: 1 } }, { new: true })); }
  catch { res.status(500).json({ error: 'Server error' }); }
});

// ── Static Data ───────────────────────────────────────────
app.get('/api/hadiths', (req, res) => res.json(hadiths));
app.get('/api/events', (req, res) => res.json(historicalEvents));
app.get('/api/articles', (req, res) => res.json(articles));
app.get('/api/myths', (req, res) => res.json(myths));
app.get('/api/pillars', (req, res) => res.json(pillars));
app.get('/api/prophets', (req, res) => res.json(prophets));
app.get('/api/contributions', (req, res) => res.json(contributions));
app.get('/api/population', (req, res) => res.json(populationData));
app.get('/api/quran-verses', (req, res) => res.json(quranVerses));
app.get('/api/scholars', (req, res) => res.json(scholars));

// ══════════════════════════════════════════════════════════
// ── COMPREHENSIVE ISLAMIC DATA ────────────────────────────
// ══════════════════════════════════════════════════════════

const hadiths = [
  { id: 1, arabic: 'إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ', english: 'Actions are judged by intentions. Every person will get what they intended.', french: 'Les actes ne valent que par les intentions.', source: 'Bukhari & Muslim', narrator: 'Umar ibn al-Khattab', topic: 'Intentions', importance: 'This is considered one of the most important hadiths in Islam — the foundation of all actions.' },
  { id: 2, arabic: 'لَا يُؤْمِنُ أَحَدُكُمْ حَتَّى يُحِبَّ لِأَخِيهِ مَا يُحِبُّ لِنَفْسِهِ', english: 'None of you truly believes until he loves for his brother what he loves for himself.', french: 'Nul d\'entre vous n\'est croyant tant qu\'il n\'aime pour son frère ce qu\'il aime pour lui-même.', source: 'Bukhari & Muslim', narrator: 'Anas ibn Malik', topic: 'Brotherhood', importance: 'The Golden Rule of Islam — the foundation of Islamic brotherhood and social ethics.' },
  { id: 3, arabic: 'الْمُسْلِمُ مَنْ سَلِمَ الْمُسْلِمُونَ مِنْ لِسَانِهِ وَيَدِهِ', english: 'A Muslim is one from whose tongue and hand other Muslims are safe.', french: 'Le musulman est celui dont les musulmans sont à l\'abri de sa langue et de sa main.', source: 'Bukhari', narrator: 'Abdullah ibn Amr', topic: 'Character', importance: 'Defines the true Muslim — not by rituals alone, but by how they treat others.' },
  { id: 4, arabic: 'إِنَّ اللَّهَ لَا يَنْظُرُ إِلَى صُوَرِكُمْ وَأَمْوَالِكُمْ وَلَكِنْ يَنْظُرُ إِلَى قُلُوبِكُمْ وَأَعْمَالِكُمْ', english: 'Allah does not look at your appearance or wealth, but He looks at your hearts and your deeds.', french: 'Allah ne regarde pas vos formes ni vos richesses, mais Il regarde vos coeurs et vos actions.', source: 'Muslim', narrator: 'Abu Hurairah', topic: 'Piety', importance: 'Destroys racism, classism, and superficiality — true value is in character and heart.' },
  { id: 5, arabic: 'خَيْرُكُمْ مَنْ تَعَلَّمَ الْقُرْآنَ وَعَلَّمَهُ', english: 'The best of you are those who learn the Quran and teach it.', french: 'Le meilleur d\'entre vous est celui qui apprend le Coran et l\'enseigne.', source: 'Bukhari', narrator: 'Uthman ibn Affan', topic: 'Knowledge', importance: 'Islam\'s emphasis on education — learning and teaching the Quran is the highest honor.' },
  { id: 6, arabic: 'الدِّينُ النَّصِيحَةُ', english: 'The religion is sincere advice (nasihah).', french: 'La religion est le conseil sincère.', source: 'Muslim', narrator: 'Tamim al-Dari', topic: 'Sincerity', importance: 'Islam is not just rituals — it\'s about genuine care and sincerity toward God, leaders, and all people.' },
  { id: 7, arabic: 'مَنْ كَانَ يُؤْمِنُ بِاللَّهِ وَالْيَوْمِ الآخِرِ فَلْيَقُلْ خَيْرًا أَوْ لِيَصْمُتْ', english: 'Whoever believes in Allah and the Last Day should say something good or remain silent.', french: 'Que celui qui croit en Allah et au Jour dernier dise une bonne parole ou se taise.', source: 'Bukhari & Muslim', narrator: 'Abu Hurairah', topic: 'Speech', importance: 'The Islamic principle of mindful speech — every word is an act of worship or a sin.' },
  { id: 8, arabic: 'ابْتَسَامَتُكَ فِي وَجْهِ أَخِيكَ صَدَقَةٌ', english: 'Your smile in the face of your brother is charity.', french: 'Ton sourire à l\'égard de ton frère est une aumône.', source: 'Tirmidhi', narrator: 'Abu Dharr', topic: 'Charity', importance: 'Islam democratizes goodness — even a smile is a form of worship and charity.' },
  { id: 9, arabic: 'رَحِمَ اللَّهُ رَجُلاً سَمْحاً إِذَا بَاعَ وَإِذَا اشْتَرَى وَإِذَا اقْتَضَى', english: 'May Allah have mercy on the man who is lenient when he sells, buys, and demands repayment.', french: 'Qu\'Allah fasse miséricorde à celui qui est indulgent quand il vend, quand il achète et quand il réclame.', source: 'Bukhari', narrator: 'Jabir ibn Abdullah', topic: 'Business Ethics', importance: 'Islamic business ethics — fairness, leniency, and integrity in all transactions.' },
  { id: 10, arabic: 'إِنَّ مِنْ أَكْمَلِ الْمُؤْمِنِينَ إِيمَانًا أَحْسَنُهُمْ خُلُقًا', english: 'The most complete of believers in faith are those with the best character.', french: 'Les croyants les plus parfaits en foi sont ceux qui ont le meilleur caractère.', source: 'Tirmidhi', narrator: 'Abu Hurairah', topic: 'Character', importance: 'Faith is measured by character — not just prayers and fasting, but how you treat people.' },
  { id: 11, arabic: 'مَنْ قَتَلَ نَفْسًا مُعَاهَدَةً لَمْ يَرَحْ رَائِحَةَ الْجَنَّةِ', english: 'Whoever kills a person under protection (non-Muslim), will not even smell the fragrance of Paradise.', french: 'Quiconque tue une personne sous protection ne sentira pas le parfum du Paradis.', source: 'Bukhari', narrator: 'Abdullah ibn Amr', topic: 'Justice & Non-Muslims', importance: 'Islam explicitly protects non-Muslims — harming them is a grave sin that bars one from Paradise.' },
  { id: 12, arabic: 'تَعَلَّمُوا الْعِلْمَ وَعَلِّمُوهُ النَّاسَ', english: 'Learn knowledge and teach it to the people.', french: 'Apprenez la science et enseignez-la aux gens.', source: 'Tabarani', narrator: 'Ali ibn Abi Talib', topic: 'Knowledge', importance: 'Islam\'s command to seek and spread knowledge — one of the earliest calls to universal education.' },
  { id: 13, arabic: 'إِنَّ اللَّهَ رَفِيقٌ يُحِبُّ الرِّفْقَ', english: 'Indeed Allah is gentle and loves gentleness in all matters.', french: 'En vérité Allah est doux et Il aime la douceur en toutes choses.', source: 'Bukhari & Muslim', narrator: 'Aisha', topic: 'Gentleness', importance: 'Gentleness is a divine attribute — harshness is never Islamic.' },
  { id: 14, arabic: 'النَّظَافَةُ مِنَ الإِيمَانِ', english: 'Cleanliness is part of faith.', french: 'La propreté fait partie de la foi.', source: 'Muslim', narrator: 'Abu Malik al-Ashari', topic: 'Cleanliness', importance: 'Islam made cleanliness — physical and spiritual — a religious obligation 1400 years ago.' },
  { id: 15, arabic: 'الْعِلْمُ فَرِيضَةٌ عَلَى كُلِّ مُسْلِمٍ', english: 'Seeking knowledge is an obligation upon every Muslim.', french: 'La recherche du savoir est une obligation pour tout musulman.', source: 'Ibn Majah', narrator: 'Anas ibn Malik', topic: 'Education', importance: 'Education is a religious duty for every Muslim — the foundation of Islamic civilization.' },
];

const historicalEvents = [
  { id: 1, year: 570, title: 'Birth of Prophet Muhammad ﷺ', arabic: 'مولد النبي محمد ﷺ', description: 'Born in Mecca in the Year of the Elephant, Muhammad ﷺ would grow to transform the world. An orphan who became a shepherd, merchant, and finally the final Prophet of God.', category: 'prophetic', impact: 'World-changing' },
  { id: 2, year: 610, title: 'First Revelation — Cave of Hira', arabic: 'أول وحي في غار حراء', description: 'On the 17th of Ramadan, Archangel Gabriel appeared to Muhammad ﷺ in the Cave of Hira with the first Quranic verse: "Read! In the name of your Lord who created." This night changed human history.', category: 'revelation', impact: 'World-changing' },
  { id: 3, year: 615, title: 'Migration to Abyssinia', arabic: 'الهجرة إلى الحبشة', description: 'Persecuted by Meccan leaders, the early Muslims sought refuge with the Christian King Negus of Abyssinia (Ethiopia) — who protected them. The first Islamic migration and early interfaith cooperation.', category: 'migration', impact: 'Significant' },
  { id: 4, year: 619, title: 'Year of Sorrow — Deaths of Khadijah & Abu Talib', arabic: 'عام الحزن', description: 'Prophet Muhammad ﷺ lost his beloved wife Khadijah and his uncle Abu Talib — his two greatest supporters. He faced increased persecution in Mecca but remained steadfast.', category: 'prophetic', impact: 'Significant' },
  { id: 5, year: 620, title: 'Night Journey & Ascension (Isra wal Miraj)', arabic: 'الإسراء والمعراج', description: 'The miraculous night journey from Mecca to Jerusalem, then the ascension through the heavens. Muhammad ﷺ met all previous prophets including Adam, Moses, Jesus, and Abraham. The 5 daily prayers were ordained.', category: 'miracle', impact: 'World-changing' },
  { id: 6, year: 622, title: 'The Hijra — Migration to Medina', arabic: 'الهجرة إلى المدينة', description: 'The migration to Medina marks Year 1 of the Islamic calendar. Muhammad ﷺ established the first Islamic state based on the Constitution of Medina — one of history\'s first pluralistic constitutions protecting all citizens.', category: 'migration', impact: 'World-changing' },
  { id: 7, year: 624, title: 'Battle of Badr', arabic: 'غزوة بدر', description: 'The first major battle of Islam. 313 Muslim fighters defeated an army of 1,000 Meccans. The Quran calls it "Yawm al-Furqan" — the Day of Distinction. Prisoners were treated with unprecedented mercy.', category: 'battle', impact: 'Significant' },
  { id: 8, year: 628, title: 'Treaty of Hudaybiyyah', arabic: 'صلح الحديبية', description: 'A peace treaty between Muslims and Meccans. Though it seemed a defeat, the Quran called it a "clear victory." It allowed Islam to spread peacefully — within 2 years, thousands accepted Islam.', category: 'treaty', impact: 'World-changing' },
  { id: 9, year: 630, title: 'Conquest of Mecca — The Great Forgiveness', arabic: 'فتح مكة', description: 'Muhammad ﷺ entered Mecca with 10,000 followers and declared a general amnesty — "Go, for you are free." This was unprecedented in ancient warfare. The city that persecuted him for 20 years was forgiven entirely.', category: 'conquest', impact: 'World-changing' },
  { id: 10, year: 632, title: 'The Farewell Sermon & Death of the Prophet ﷺ', arabic: 'خطبة الوداع ووفاة النبي ﷺ', description: 'The Prophet\'s final sermon at Arafat declared universal equality: "No Arab has superiority over a non-Arab, nor white over black, except by piety." One of history\'s greatest declarations of human equality. He passed on June 8, 632 CE.', category: 'prophetic', impact: 'World-changing' },
  { id: 11, year: 636, title: 'Battle of al-Qadisiyyah — Islam Reaches Persia', arabic: 'معركة القادسية', description: 'Muslim forces defeated the Sassanid Persian Empire, bringing Islam to Persia (modern Iran). The Persian civilization would go on to become one of the greatest contributors to Islamic art, science, and culture.', category: 'conquest', impact: 'Significant' },
  { id: 12, year: 638, title: 'Umar Opens Jerusalem', arabic: 'فتح القدس', description: 'Caliph Umar entered Jerusalem and signed the "Covenant of Umar" — personally guaranteeing the safety of all residents, churches, and synagogues. He refused to pray in the Church of the Holy Sepulchre to prevent Muslims from claiming it.', category: 'conquest', impact: 'World-changing' },
  { id: 13, year: 711, title: 'Islam Enters Spain — Al-Andalus', arabic: 'الفتح الإسلامي للأندلس', description: 'Muslim forces crossed into Spain. The 800-year Islamic civilization in Spain (Al-Andalus) became humanity\'s greatest model of coexistence — Muslims, Christians, and Jews lived, worked, and built together.', category: 'conquest', impact: 'World-changing' },
  { id: 14, year: 750, title: 'Abbasid Golden Age Begins', arabic: 'بداية العصر الذهبي العباسي', description: 'The Abbasid Caliphate established Baghdad as the world\'s greatest city. The House of Wisdom (Bayt al-Hikmah) became history\'s greatest library and research center, translating Greek, Persian, and Indian knowledge.', category: 'civilization', impact: 'World-changing' },
  { id: 15, year: 830, title: 'House of Wisdom — Baghdad', arabic: 'بيت الحكمة في بغداد', description: 'Caliph al-Mamun\'s House of Wisdom employed scholars of all faiths — Muslim, Christian, Jewish, Zoroastrian — to translate and advance human knowledge. Algebra, optics, medicine, and astronomy all advanced here.', category: 'civilization', impact: 'World-changing' },
  { id: 16, year: 1258, title: 'Mongol Sack of Baghdad', arabic: 'سقوط بغداد', description: 'The devastating Mongol invasion destroyed Baghdad — the center of Islamic civilization. Libraries burned, scholars fled. Yet within 50 years, the Mongol rulers themselves embraced Islam.', category: 'tragedy', impact: 'Devastating' },
  { id: 17, year: 1492, title: 'Fall of Granada — End of Al-Andalus', arabic: 'سقوط غرناطة', description: 'The last Muslim kingdom in Spain fell. Muslims and Jews who refused conversion were expelled. The loss of Al-Andalus ended 800 years of Islamic civilization in Europe — but its legacy lives in European science, art, and architecture.', category: 'tragedy', impact: 'Significant' },
  { id: 18, year: 1517, title: 'Ottoman Empire at Its Peak', arabic: 'الإمبراطورية العثمانية في أوجها', description: 'The Ottoman Empire under Selim I controlled the holy cities of Mecca and Medina, Egypt, and the Levant. At its peak, the Ottoman Empire was the world\'s most powerful state, spanning 3 continents.', category: 'civilization', impact: 'World-changing' },
  { id: 19, year: 1924, title: 'Abolition of the Caliphate', arabic: 'إلغاء الخلافة', description: 'Turkey abolished the Ottoman Caliphate — ending 1,300 years of the caliphate institution. A watershed moment in Islamic history that shaped the modern Muslim world and its political movements.', category: 'modern', impact: 'Significant' },
  { id: 20, year: 1948, title: 'Muslim Nations Gain Independence', arabic: 'استقلال الدول الإسلامية', description: 'Following WWII, Muslim-majority nations across the Middle East, South Asia, and Africa gained independence from colonial powers. Pakistan was created as an Islamic state in 1947, Indonesia in 1945, and others followed.', category: 'modern', impact: 'World-changing' },
  { id: 21, year: 2001, title: '9/11 — Islam Misrepresented to the World', arabic: '11 سبتمبر - تشويه صورة الإسلام', description: 'Al-Qaeda\'s attacks on America — condemned by Muslim scholars worldwide — led to widespread Islamophobia. Yet in the aftermath, millions of non-Muslims began reading the Quran and learning about Islam, leading to a surge in conversions.', category: 'modern', impact: 'Significant' },
  { id: 22, year: 2024, title: 'Islam — World\'s Fastest Growing Religion', arabic: 'الإسلام: الدين الأسرع نمواً في العالم', description: '2 billion Muslims worldwide — 1 in 4 humans. Islam is the world\'s fastest-growing religion, growing primarily through high birth rates and conversions. By 2050, Muslims will be nearly 30% of humanity.', category: 'modern', impact: 'World-changing' },
];

const quranVerses = [
  { id: 1, arabic: 'وَمَا أَرْسَلْنَاكَ إِلَّا رَحْمَةً لِّلْعَالَمِينَ', english: 'And We have not sent you except as a mercy to the worlds.', french: 'Et Nous ne t\'avons envoyé qu\'en miséricorde pour les mondes.', reference: 'Al-Anbiya 21:107', topic: 'Mercy', context: 'God\'s description of Prophet Muhammad ﷺ — his mission is mercy for ALL creation, not just Muslims.' },
  { id: 2, arabic: 'مَن قَتَلَ نَفْسًا بِغَيْرِ نَفْسٍ أَوْ فَسَادٍ فِي الْأَرْضِ فَكَأَنَّمَا قَتَلَ النَّاسَ جَمِيعًا', english: 'Whoever kills a soul unless for a soul or corruption in the land — it is as if he had slain mankind entirely.', french: 'Quiconque tue une âme — c\'est comme s\'il avait tué l\'humanité entière.', reference: 'Al-Maidah 5:32', topic: 'Sanctity of Life', context: 'The Quran\'s most explicit condemnation of murder and terrorism — killing one innocent person is equal to killing all of humanity.' },
  { id: 3, arabic: 'لَا إِكْرَاهَ فِي الدِّينِ', english: 'There is no compulsion in religion.', french: 'Il n\'y a pas de contrainte en religion.', reference: 'Al-Baqarah 2:256', topic: 'Religious Freedom', context: 'Islam established religious freedom as a divine principle 1400 years before modern human rights declarations.' },
  { id: 4, arabic: 'يَا أَيُّهَا النَّاسُ إِنَّا خَلَقْنَاكُم مِّن ذَكَرٍ وَأُنثَىٰ وَجَعَلْنَاكُمْ شُعُوبًا وَقَبَائِلَ لِتَعَارَفُوا', english: 'O mankind, We created you from male and female, and made you peoples and tribes that you may know one another.', french: 'Ô humanité! Nous vous avons créés d\'un mâle et d\'une femelle et Nous avons fait de vous des nations et des tribus pour que vous vous connaissiez.', reference: 'Al-Hujurat 49:13', topic: 'Human Brotherhood', context: 'The Quran\'s declaration of universal human brotherhood — diversity is God\'s design for mutual understanding, not conflict.' },
  { id: 5, arabic: 'إِنَّ اللَّهَ يَأْمُرُ بِالْعَدْلِ وَالْإِحْسَانِ وَإِيتَاءِ ذِي الْقُرْبَىٰ', english: 'Indeed, Allah commands justice, excellence, and giving to relatives.', french: 'Allah commande l\'équité, la bienfaisance et la générosité.', reference: 'An-Nahl 16:90', topic: 'Justice', context: 'The Quran\'s comprehensive command for a just and compassionate society — recited in every Friday sermon.' },
  { id: 6, arabic: 'وَلَوْ شَاءَ رَبُّكَ لَآمَنَ مَن فِي الْأَرْضِ كُلُّهُمْ جَمِيعًا', english: 'Had your Lord willed, all those on earth would have believed. Would you then compel people until they become believers?', french: 'Si ton Seigneur l\'avait voulu, tous ceux qui sont sur la terre auraient cru. Est-ce à toi de contraindre les gens à devenir croyants?', reference: 'Yunus 10:99', topic: 'No Compulsion', context: 'God explicitly tells the Prophet he cannot force belief — faith must be freely chosen.' },
  { id: 7, arabic: 'وَإِن يَكَادُ الَّذِينَ كَفَرُوا لَيُزْلِقُونَكَ بِأَبْصَارِهِمْ لَمَّا سَمِعُوا الذِّكْرَ', english: 'The servants of the Most Merciful are those who walk upon the earth humbly, and when the ignorant address them, they say peace.', french: 'Les serviteurs du Tout Miséricordieux sont ceux qui marchent humblement sur terre et qui, lorsque les ignorants les interpellent, disent: "Paix".', reference: 'Al-Furqan 25:63', topic: 'Humility & Peace', context: 'The character of true believers — responding to ignorance and aggression with peace and dignity.' },
  { id: 8, arabic: 'وَمَن يَتَوَكَّلْ عَلَى اللَّهِ فَهُوَ حَسْبُهُ', english: 'And whoever relies upon Allah — then He is sufficient for him.', french: 'Et quiconque place sa confiance en Allah — Il lui suffira.', reference: 'At-Talaq 65:3', topic: 'Trust in God', context: 'The Islamic principle of tawakkul — complete trust in God after taking all necessary action.' },
  { id: 9, arabic: 'إِنَّ مَعَ الْعُسْرِ يُسْرًا', english: 'Indeed, with hardship will be ease.', french: 'Certes, avec la difficulté vient la facilité.', reference: 'Ash-Sharh 94:6', topic: 'Hope', context: 'One of the most comforting verses in the Quran — hardship is always accompanied by ease. This verse gave hope to billions.' },
  { id: 10, arabic: 'وَقُل رَّبِّ زِدْنِي عِلْمًا', english: 'And say: My Lord, increase me in knowledge.', french: 'Et dis: Seigneur, accroît mon savoir.', reference: 'Ta-Ha 20:114', topic: 'Knowledge', context: 'The only thing God directly commanded the Prophet to ask for more of was knowledge — establishing education as a divine value.' },
  { id: 11, arabic: 'وَجَعَلْنَا مِنَ الْمَاءِ كُلَّ شَيْءٍ حَيٍّ', english: 'And We made from water every living thing.', french: 'Et Nous avons fait de l\'eau toute chose vivante.', reference: 'Al-Anbiya 21:30', topic: 'Science', context: 'The Quran stated that all life originates from water — a fact confirmed by modern biology 1400 years later.' },
  { id: 12, arabic: 'سَنُرِيهِمْ آيَاتِنَا فِي الْآفَاقِ وَفِي أَنفُسِهِمْ', english: 'We will show them Our signs in the universe and within themselves until it becomes clear that it is the truth.', french: 'Nous leur montrerons Nos signes dans l\'univers et en eux-mêmes, jusqu\'à ce qu\'il leur soit évident que c\'est la vérité.', reference: 'Fussilat 41:53', topic: 'Science & Faith', context: 'The Quran invites humanity to study the universe — scientific inquiry is an act of worship.' },
];

const scholars = [
  { id: 1, name: 'Ibn Sina (Avicenna)', arabic: 'ابن سينا', years: '980-1037', field: 'Medicine & Philosophy', contribution: 'His "Canon of Medicine" was the standard medical textbook in European universities for 600 years. He described the contagious nature of disease, quarantine, and clinical trials.', quote: 'The knowledge of anything, since all things have causes, is not acquired or complete unless it is known by its causes.' },
  { id: 2, name: 'Al-Khwarizmi', arabic: 'الخوارزمي', years: '780-850', field: 'Mathematics', contribution: 'Father of Algebra. His book "Al-Kitab al-mukhtasar fi hisab al-jabr" gave us algebra. His name gave us "algorithm." Without him, modern computing would not exist.', quote: 'What is easiest and most useful in arithmetic.' },
  { id: 3, name: 'Ibn Rushd (Averroes)', arabic: 'ابن رشد', years: '1126-1198', field: 'Philosophy', contribution: 'His commentaries on Aristotle directly sparked the European Renaissance. He argued reason and faith are compatible — a revolutionary idea that shaped Western thought.', quote: 'Knowledge is the conformity of the object and the intellect.' },
  { id: 4, name: 'Al-Zahrawi (Albucasis)', arabic: 'الزهراوي', years: '936-1013', field: 'Surgery', contribution: 'Father of modern surgery. Invented over 200 surgical instruments still used today. His 30-volume medical encyclopedia was used in Europe for 500 years.', quote: 'I have made it my first priority to know what the ancients have said and to perfect what can be perfected.' },
  { id: 5, name: 'Ibn Khaldun', arabic: 'ابن خلدون', years: '1332-1406', field: 'History & Sociology', contribution: 'Founded sociology and historiography 400 years before Western scholars. His "Muqaddimah" is one of history\'s greatest intellectual achievements — analyzing history through economics and social forces.', quote: 'Geography is about maps, but biography is about chaps.' },
  { id: 6, name: 'Fatima al-Fihri', arabic: 'فاطمة الفهرية', years: '800-880', field: 'Education', contribution: 'Founded the University of Al-Qarawiyyin in Morocco in 859 CE — the world\'s oldest continuously operating university. A Muslim woman built the institution that became the model for European universities.', quote: 'Education is the most powerful weapon which you can use to change the world.' },
  { id: 7, name: 'Al-Biruni', arabic: 'البيروني', years: '973-1048', field: 'Science & Anthropology', contribution: 'Calculated the Earth\'s circumference with remarkable accuracy. Wrote the first comprehensive study of India. Pioneer of comparative religion and scientific methodology.', quote: 'I have seen that truth is bitter to those who love falsity.' },
  { id: 8, name: 'Rumi (Jalal al-Din)', arabic: 'جلال الدين الرومي', years: '1207-1273', field: 'Poetry & Spirituality', contribution: 'His Masnavi is called "the Quran in Persian." His poetry of divine love transcends religion — he remains one of the best-selling poets in the United States today, 750 years after his death.', quote: 'Out beyond ideas of wrongdoing and rightdoing, there is a field. I\'ll meet you there.' },
];

const populationData = {
  growth: [
    { year: 610, population: 0.001, event: 'First revelation — Islam begins' },
    { year: 632, population: 0.1, event: 'Prophet\'s death — Islam established across Arabia' },
    { year: 700, population: 5, event: 'Islamic empire from Spain to Central Asia' },
    { year: 900, population: 25, event: 'Islamic Golden Age — science and culture flourish' },
    { year: 1000, population: 40, event: '40 million Muslims — thriving civilization' },
    { year: 1200, population: 80, event: 'Islam reaches Southeast Asia and West Africa' },
    { year: 1400, population: 120, event: 'Ottoman Empire rises' },
    { year: 1600, population: 150, event: 'Mughal Empire — Islam in South Asia' },
    { year: 1800, population: 200, event: 'Colonial era — 200 million Muslims' },
    { year: 1900, population: 200, event: 'Early 20th century' },
    { year: 1950, population: 350, event: 'Independence of Muslim nations' },
    { year: 1970, population: 600, event: 'Fastest growing decade' },
    { year: 1990, population: 900, event: 'Islam becomes fastest growing religion' },
    { year: 2000, population: 1200, event: '1.2 billion Muslims' },
    { year: 2010, population: 1600, event: '1.6 billion Muslims' },
    { year: 2024, population: 1980, event: 'Nearly 2 billion Muslims — 1 in 4 humans' },
  ],
  projections: [
    { year: 2030, population: 2200 },
    { year: 2040, population: 2500 },
    { year: 2050, population: 2760 },
    { year: 2070, population: 3500 },
    { year: 2100, population: 7000 },
  ],
  byRegion: [
    { region: 'Asia-Pacific', population: 1050, percentage: 53, color: '#C9A84C' },
    { region: 'Middle East & N. Africa', population: 400, percentage: 20, color: '#2DD4BF' },
    { region: 'Sub-Saharan Africa', population: 350, percentage: 18, color: '#8B5CF6' },
    { region: 'Europe', population: 44, percentage: 2.2, color: '#EC4899' },
    { region: 'Americas', population: 11, percentage: 0.6, color: '#F59E0B' },
    { region: 'Other', population: 125, percentage: 6.2, color: '#6B7280' },
  ],
  topCountries: [
    { country: 'Indonesia', flag: '🇮🇩', muslims: 231, percentage: 87 },
    { country: 'Pakistan', flag: '🇵🇰', muslims: 212, percentage: 96 },
    { country: 'Bangladesh', flag: '🇧🇩', muslims: 150, percentage: 91 },
    { country: 'Nigeria', flag: '🇳🇬', muslims: 111, percentage: 53 },
    { country: 'Egypt', flag: '🇪🇬', muslims: 95, percentage: 90 },
    { country: 'Iran', flag: '🇮🇷', muslims: 82, percentage: 99 },
    { country: 'Turkey', flag: '🇹🇷', muslims: 79, percentage: 99 },
    { country: 'Algeria', flag: '🇩🇿', muslims: 45, percentage: 99 },
    { country: 'Sudan', flag: '🇸🇩', muslims: 43, percentage: 97 },
    { country: 'Tunisia', flag: '🇹🇳', muslims: 12, percentage: 99 },
  ],
  facts: [
    'Islam is the world\'s fastest-growing religion — growing faster than any other faith',
    'By 2050, Muslims will make up nearly 30% of the global population (2.76 billion)',
    'By 2100, projections suggest Muslims could reach 7 billion — matching today\'s world population',
    'Islam is growing through both high birth rates AND millions of voluntary conversions annually',
    'In the US, Islam is the fastest-growing religion — 25,000+ Americans convert annually',
    'In Europe, Islam grows by 3-4% annually — both through immigration and native converts',
    '1 in 4 people on Earth is Muslim today',
    'The Islamic world spans 57 countries across Asia, Africa, Europe, and beyond',
  ]
};

const pillars = [
  { id: 1, icon: '☝️', en: { name: 'Shahada — Declaration of Faith', desc: 'The testimony that "There is no god but Allah, and Muhammad is His messenger." This declaration transforms a person\'s entire relationship with God, creation, and themselves.' }, ar: { name: 'الشهادة', desc: 'شهادة أن لا إله إلا الله وأن محمداً رسول الله. هذا الإقرار يحول علاقة الإنسان بالله والخلق والنفس.' }, fr: { name: 'Shahada — Déclaration de Foi', desc: 'Le témoignage qu\'il n\'y a de dieu qu\'Allah et que Muhammad est Son messager.' }, arabic: 'أَشْهَدُ أَن لَّا إِلَٰهَ إِلَّا ٱللَّٰهُ وَأَشْهَدُ أَنَّ مُحَمَّدًا رَّسُولُ ٱللَّٰهِ' },
  { id: 2, icon: '🙏', en: { name: 'Salat — Five Daily Prayers', desc: 'Muslims pray five times daily at dawn, midday, afternoon, sunset, and night. Prayer is direct communication with God — no intermediary, no priest. Just the human soul speaking directly to its Creator.' }, ar: { name: 'الصلاة', desc: 'يصلي المسلمون خمس مرات يومياً. الصلاة تواصل مباشر مع الله دون وسيط.' }, fr: { name: 'Salat — Cinq Prières Quotidiennes', desc: 'Les musulmans prient cinq fois par jour. La prière est une communication directe avec Dieu — sans intermédiaire.' }, arabic: 'إِنَّ الصَّلَاةَ كَانَتْ عَلَى الْمُؤْمِنِينَ كِتَابًا مَّوْقُوتًا' },
  { id: 3, icon: '💰', en: { name: 'Zakat — Obligatory Charity', desc: 'Muslims who meet a minimum wealth threshold give 2.5% annually to the poor. Zakat is not optional — it\'s a religious obligation that ensures wealth circulates through society and doesn\'t concentrate among the rich.' }, ar: { name: 'الزكاة', desc: 'المسلمون القادرون يعطون 2.5% من ثروتهم سنوياً للفقراء. الزكاة فريضة تضمن توزيع الثروة.' }, fr: { name: 'Zakat — Aumône Obligatoire', desc: 'Les musulmans capables donnent 2,5% de leur richesse annuellement aux pauvres — une obligation religieuse.' }, arabic: 'وَأَقِيمُوا الصَّلَاةَ وَآتُوا الزَّكَاةَ' },
  { id: 4, icon: '🌙', en: { name: 'Sawm — Ramadan Fasting', desc: 'During the holy month of Ramadan, Muslims fast from dawn to sunset — abstaining from food, drink, and negative behavior. Fasting builds discipline, empathy for the poor, and spiritual closeness to God.' }, ar: { name: 'الصوم', desc: 'في شهر رمضان المبارك، يصوم المسلمون من الفجر إلى غروب الشمس. الصيام يبني الانضباط والتعاطف والقرب من الله.' }, fr: { name: 'Sawm — Jeûne du Ramadan', desc: 'Durant le Ramadan, les musulmans jeûnent de l\'aube au coucher du soleil, renforçant discipline et spiritualité.' }, arabic: 'يَا أَيُّهَا الَّذِينَ آمَنُوا كُتِبَ عَلَيْكُمُ الصِّيَامُ' },
  { id: 5, icon: '🕋', en: { name: 'Hajj — Pilgrimage to Mecca', desc: 'Every capable Muslim makes the pilgrimage to Mecca once in their lifetime. Hajj is the world\'s largest annual gathering — 2-3 million people. All wear simple white garments, erasing all distinctions of class, race, and nationality.' }, ar: { name: 'الحج', desc: 'يحج كل مسلم قادر إلى مكة مرة في حياته. الحج أكبر تجمع سنوي في العالم. الجميع يرتدون الإحرام الأبيض.' }, fr: { name: 'Hajj — Pèlerinage à La Mecque', desc: 'Chaque musulman capable fait le pèlerinage à La Mecque une fois. Le Hajj est le plus grand rassemblement annuel au monde.' }, arabic: 'وَلِلَّهِ عَلَى النَّاسِ حِجُّ الْبَيْتِ مَنِ اسْتَطَاعَ إِلَيْهِ سَبِيلًا' },
];

const prophets = [
  { id: 1, icon: '🌱', name: 'Adam (آدم)', en: 'The first human and first prophet. Created from clay and given the divine breath of life. Taught that humans are God\'s stewards on Earth. His story teaches accountability, repentance, and God\'s infinite mercy.', ar: 'أول إنسان وأول نبي. خُلق من طين ونُفخ فيه الروح الإلهية. قصته تعلم المسئولية والتوبة ورحمة الله.', fr: 'Le premier humain et premier prophète. Créé de l\'argile et animé par le souffle divin. Son histoire enseigne la responsabilité et la repentance.' },
  { id: 2, icon: '⛵', name: 'Noah (نوح)', en: 'Preached for 950 years with patience. Built the Ark to save believers from the great flood by God\'s command. Symbol of unwavering faith and perseverance against rejection.', ar: 'بشّر لـ 950 عاماً بصبر. بنى السفينة لإنقاذ المؤمنين من الطوفان. رمز الإيمان الثابت أمام الرفض.', fr: 'Prêcha pendant 950 ans avec patience. Construisit l\'Arche pour sauver les croyants du déluge.' },
  { id: 3, icon: '🔥', name: 'Abraham / Ibrahim (إبراهيم)', en: 'Father of monotheism — revered by Islam, Christianity, and Judaism. Tested by God through fire (which God made cool), the sacrifice of his son, and exile. Built the Kaaba with his son Ishmael. Called "Khalilullah" — Friend of God.', ar: 'أبو التوحيد يكرمه الإسلام والمسيحية واليهودية. اختُبر بالنار والذبح والنفي. بنى الكعبة مع إسماعيل. يُدعى خليل الله.', fr: 'Père du monothéisme honoré par l\'Islam, le Christianisme et le Judaïsme. Bâtit la Kaaba avec Ismaël. Appelé "ami de Dieu".' },
  { id: 4, icon: '🌊', name: 'Moses / Musa (موسى)', en: 'The most mentioned prophet in the Quran (136 times). Received the Torah. Led the Israelites from Egyptian slavery through divine miracles. Spoke directly to God on Mount Sinai. Met Muhammad ﷺ during the Night Journey.', ar: 'أكثر نبي ذُكر في القرآن (136 مرة). تلقّى التوراة. قاد بني إسرائيل من العبودية. كلّم الله مباشرة في الطور.', fr: 'Le prophète le plus mentionné dans le Coran. Reçut la Torah. Conduisit les Israélites hors de l\'esclavage égyptien.' },
  { id: 5, icon: '✨', name: 'Jesus / Isa (عيسى)', en: 'Born of a virgin birth — a miracle confirmed in the Quran. Performed miracles: healing the blind, raising the dead. The Quran dedicates a chapter (Maryam) to his mother Mary. Islam honors Jesus as one of the greatest prophets. He will return before the Day of Judgment.', ar: 'وُلد من عذراء. أجرى معجزات: شفاء الأعمى وإحياء الموتى. خصص القرآن سورة لأمه مريم. سيعود قبل يوم القيامة.', fr: 'Né d\'une vierge. Accomplit des miracles. Le Coran consacre un chapitre à sa mère Marie. Il reviendra avant le Jour du Jugement.' },
  { id: 6, icon: '🌟', name: 'Muhammad ﷺ (محمد)', en: 'The final and seal of all prophets. Born in Mecca 570 CE. Orphaned at age 6, shepherd, merchant, then Prophet at 40. Received the Quran over 23 years. United Arabia, established the world\'s first pluralistic constitution. His character was "a walking Quran." His mission: mercy for all of creation.', ar: 'خاتم الأنبياء والمرسلين. وُلد في مكة 570 م. يتيم تربّى راعياً وتاجراً ثم نبياً في الأربعين. تلقّى القرآن 23 عاماً.', fr: 'Le dernier et sceau de tous les prophètes. Né à La Mecque en 570 EC. Orphelin devenu berger, marchand puis Prophète à 40 ans.' },
];

const contributions = [
  { id: 1, icon: '🔢', field: { en: 'Mathematics', ar: 'الرياضيات', fr: 'Mathématiques' }, text: { en: 'Al-Khwarizmi invented algebra — "algorithm" comes from his name. Without Arabic numerals (0-9) and the concept of zero, modern computing would be impossible. Al-Kindi pioneered cryptography.', ar: 'اخترع الخوارزمي علم الجبر. دون الأرقام العربية والصفر، لا يمكن الحوسبة الحديثة.', fr: 'Al-Khwarizmi inventa l\'algèbre. Sans les chiffres arabes et le zéro, l\'informatique moderne serait impossible.' } },
  { id: 2, icon: '⚕️', field: { en: 'Medicine', ar: 'الطب', fr: 'Médecine' }, text: { en: 'Ibn Sina\'s Canon of Medicine was Europe\'s medical standard for 600 years. Al-Zahrawi invented 200+ surgical instruments. Ibn al-Nafis discovered pulmonary circulation 300 years before Europe. Hospitals with psychiatric wards first appeared in the Islamic world.', ar: 'قانون ابن سينا كان معيار الطب في أوروبا 600 عام. اخترع الزهراوي أكثر من 200 أداة جراحية. أول مستشفيات نفسية ظهرت في العالم الإسلامي.', fr: 'Le Canon d\'Ibn Sina fut le standard médical européen pendant 600 ans. Al-Zahrawi inventa 200+ instruments chirurgicaux.' } },
  { id: 3, icon: '🌙', field: { en: 'Astronomy', ar: 'علم الفلك', fr: 'Astronomie' }, text: { en: 'Muslim astronomers named most stars we know today (Aldebaran, Altair, Deneb, Betelgeuse). Al-Battani corrected Ptolemy\'s calculations. The words "zenith," "nadir," and "almanac" all come from Arabic.', ar: 'سمّى علماء الفلك المسلمون معظم النجوم المعروفة. كلمات zenith وnadir وalmanac كلها من العربية.', fr: 'Les astronomes musulmans nommèrent la plupart des étoiles connues. Les mots "zénith," "nadir," "almanach" viennent de l\'arabe.' } },
  { id: 4, icon: '💭', field: { en: 'Philosophy', ar: 'الفلسفة', fr: 'Philosophie' }, text: { en: 'Ibn Rushd\'s commentaries on Aristotle sparked the European Renaissance. Ibn Khaldun founded sociology 400 years before Comte. Al-Ghazali\'s "Incoherence of the Philosophers" shaped Islamic theology for centuries.', ar: 'أشعلت تعليقات ابن رشد على أرسطو النهضة الأوروبية. أسس ابن خلدون علم الاجتماع قبل 400 عام.', fr: 'Les commentaires d\'Ibn Rushd sur Aristote déclenchèrent la Renaissance européenne. Ibn Khaldun fonda la sociologie 400 ans avant Comte.' } },
  { id: 5, icon: '🕌', field: { en: 'Architecture', ar: 'العمارة', fr: 'Architecture' }, text: { en: 'The Alhambra, Hagia Sophia additions, and Cordoba mosque are among history\'s greatest buildings. The pointed arch introduced in Islamic architecture was adopted in Gothic cathedrals. Muqarnas (stalactite vaulting) remains architecturally unique.', ar: 'الحمراء وقبة الصخرة ومسجد قرطبة من أعظم المباني التاريخية. القوس المدبب الإسلامي اعتُمد في الكنائس القوطية.', fr: 'L\'Alhambra et la mosquée de Cordoue comptent parmi les plus grands édifices historiques. L\'arc brisé islamique fut adopté dans les cathédrales gothiques.' } },
  { id: 6, icon: '⚗️', field: { en: 'Chemistry', ar: 'الكيمياء', fr: 'Chimie' }, text: { en: 'Jabir ibn Hayyan (Geber) is the father of chemistry — discovered sulfuric acid, nitric acid. The words "alkali," "alcohol," "alchemy," "elixir," "alembic" all come from Arabic. Islamic alchemists developed distillation.', ar: 'جابر بن حيان أبو الكيمياء. اكتشف حمض الكبريتيك والنيتريك. كلمات كحول وكيمياء وإكسير كلها من العربية.', fr: 'Jabir ibn Hayyan est le père de la chimie. Les mots "alcool," "alchimie," "élixir" viennent de l\'arabe.' } },
  { id: 7, icon: '📜', field: { en: 'Literature & Poetry', ar: 'الأدب والشعر', fr: 'Littérature & Poésie' }, text: { en: 'One Thousand and One Nights shaped world literature. Rumi\'s Masnavi is "the Quran in Persian." He remains America\'s best-selling poet today. Ibn Battuta traveled 75,000 miles — more than anyone before the modern era.', ar: 'ألف ليلة وليلة أثّرت في الأدب العالمي. مثنوي الرومي "القرآن الفارسي". ابن بطوطة سافر 75,000 ميل.', fr: 'Les Mille et Une Nuits ont façonné la littérature mondiale. Le Masnavi de Rumi est "le Coran en persan". Rumi reste le poète le plus vendu aux USA.' } },
  { id: 8, icon: '🌾', field: { en: 'Agriculture & Food', ar: 'الزراعة والغذاء', fr: 'Agriculture & Alimentation' }, text: { en: 'Muslims introduced coffee, citrus fruits, cotton, sugar cane, and rice to Europe. Islamic agricultural revolution developed advanced irrigation. The word "coffee" comes from the Arabic "qahwa."', ar: 'أدخل المسلمون القهوة والحمضيات والقطن وقصب السكر إلى أوروبا. كلمة coffee من العربية "قهوة".', fr: 'Les musulmans introduisirent le café, les agrumes, le coton en Europe. Le mot "café" vient de l\'arabe "qahwa".' } },
];

const articles = [
  { id: 1, icon: '☮️', en: { title: 'Islam: A Religion of Peace', summary: 'The word Islam derives from "salama" — peace. Understanding this transforms everything.', content: 'Islam\'s very name announces its essence. Derived from the Arabic "salama" (peace) and "aslama" (submission to God), Islam is built on the pursuit of peace — with God, with oneself, and with all of creation. The Quran states: "And We have not sent you except as a mercy to the worlds" (21:107). The Prophet Muhammad ﷺ said: "None of you truly believes until he loves for his brother what he loves for himself." Terrorism and violence against innocent people are not just forbidden — they are antithetical to Islam\'s very core. "Whoever kills a soul, it is as if he killed all of mankind." (5:32)' }, ar: { title: 'الإسلام: دين السلام', summary: 'كلمة الإسلام مشتقة من السلام. فهم هذا يغير كل شيء.', content: 'اسم الإسلام ذاته يعلن جوهره. مشتق من "السلام" و"الاستسلام لله". الإسلام مبني على السعي إلى السلام مع الله ومع النفس ومع الخلق. يقول القرآن: "وَمَا أَرْسَلْنَاكَ إِلَّا رَحْمَةً لِّلْعَالَمِينَ" (21:107).' }, fr: { title: "L'Islam: Une Religion de Paix", summary: 'Le mot Islam dérive de "salama" — paix.', content: "Le nom même de l'Islam annonce son essence. Dérivé de l'arabe \"salama\" (paix), l'Islam est fondé sur la recherche de la paix. Le Coran déclare: \"Nous ne t'avons envoyé que comme miséricorde pour les mondes\" (21:107)." }, quran: 'وَمَا أَرْسَلْنَاكَ إِلَّا رَحْمَةً لِّلْعَالَمِينَ', quranTranslation: '"And We have not sent you except as a mercy to the worlds." (21:107)' },
  { id: 2, icon: '🌱', en: { title: 'The True Meaning of Jihad', summary: 'Jihad primarily means the internal struggle to become a better person — not holy war.', content: 'The word "jihad" comes from the Arabic "jahada" — to strive or struggle. When the Prophet Muhammad ﷺ returned from a battle, he said: "We have returned from the lesser jihad to the greater jihad." When asked what the greater jihad was: "The struggle against one\'s own soul." The greater jihad is the daily effort to be honest when it\'s easier to lie, to be just when it\'s easier to be biased, to be compassionate when it\'s easier to be indifferent. When armed defense is permitted, Islamic law strictly forbids targeting civilians, women, children, the elderly, crops, places of worship, or animals.' }, ar: { title: 'المعنى الحقيقي للجهاد', summary: 'الجهاد يعني أساساً الكفاح الداخلي لتحسين النفس.', content: 'كلمة "جهاد" من "جاهد" — يسعى ويكافح. قال النبي ﷺ عند عودته من معركة: "رجعنا من الجهاد الأصغر إلى الجهاد الأكبر — جهاد النفس." الجهاد الأكبر هو الجهد اليومي لتكون صادقاً حين يكون الكذب أسهل، وعادلاً حين يكون التحيز أيسر.' }, fr: { title: 'La Vraie Signification du Jihad', summary: 'Le Jihad signifie principalement la lutte intérieure pour s\'améliorer.', content: 'Le mot "jihad" vient de l\'arabe "jahada" — s\'efforcer. Le Prophète ﷺ revenant d\'une bataille dit: "Nous sommes revenus du petit jihad au grand jihad — la lutte contre sa propre âme."' }, quran: 'وَجَاهِدُوا فِي اللَّهِ حَقَّ جِهَادِهِ', quranTranslation: '"And strive for Allah with the striving due to Him." (22:78)' },
  { id: 3, icon: '🌸', en: { title: "Women's Rights in Islam", summary: 'Islam granted women rights 1400 years ago that the world only recognized in the 20th century.', content: 'At a time when women were treated as property in much of the world, Islam declared their spiritual equality with men (33:35). Islam gave women: the right to own property, to run businesses, to keep their name after marriage, to choose their spouse, to divorce, to inherit, and to vote in community decisions. The Prophet\'s first wife Khadijah was a successful businesswoman who employed him. Aisha became one of history\'s greatest scholars, teaching over 2,000 students. The oppression some Muslim women face in certain countries reflects cultural practices — not Islamic teachings.' }, ar: { title: 'حقوق المرأة في الإسلام', summary: 'منح الإسلام المرأة حقوقاً قبل 1400 عام لم يعترف بها العالم إلا في القرن العشرين.', content: 'حين كانت المرأة تُعامل كممتلكات في معظم العالم، أعلن الإسلام مساواتها الروحية بالرجل (33:35). أعطى الإسلام المرأة: حق تملك الممتلكات، وإدارة الأعمال، والحفاظ على اسمها بعد الزواج، واختيار زوجها، والطلاق، والإرث.' }, fr: { title: 'Les Droits des Femmes en Islam', summary: "L'Islam accorda aux femmes des droits il y a 1400 ans que le monde reconnut au XXe siècle.", content: "À une époque où les femmes étaient traitées comme des propriétés, l'Islam déclara leur égalité spirituelle (33:35). L'Islam donna aux femmes: le droit de posséder des biens, de gérer des entreprises, de choisir leur époux, de divorcer, d'hériter." }, quran: 'وَلَهُنَّ مِثْلُ الَّذِي عَلَيْهِنَّ بِالْمَعْرُوفِ', quranTranslation: '"And women shall have rights similar to the rights against them." (2:228)' },
  { id: 4, icon: '🤝', en: { title: 'Islam and Other Religions', summary: '"There is no compulsion in religion." Islam established religious freedom 1400 years ago.', content: '"There is no compulsion in religion" (2:256). The Prophet Muhammad ﷺ signed the Constitution of Medina — one of history\'s first pluralistic constitutions, guaranteeing rights to all religious communities. When Umar conquered Jerusalem, he signed the Covenant of Umar protecting all Christians and Jews. For 800 years in Al-Andalus (Spain), Muslims, Christians, and Jews built one of history\'s greatest civilizations together. Islam considers Christians and Jews "People of the Book" — sharing the same Abrahamic prophetic tradition.' }, ar: { title: 'الإسلام والأديان الأخرى', summary: '"لَا إِكْرَاهَ فِي الدِّينِ." الإسلام أرسى الحرية الدينية قبل 1400 عام.', content: '"لَا إِكْرَاهَ فِي الدِّينِ" (2:256). وقّع النبي صحيفة المدينة ضامناً حقوق جميع المجتمعات. حين فتح عمر القدس، وقّع العهدة العمرية لحماية المسيحيين واليهود.' }, fr: { title: "L'Islam et les Autres Religions", summary: '"Il n\'y a pas de contrainte en religion." L\'Islam établit la liberté religieuse il y a 1400 ans.', content: '"Il n\'y a pas de contrainte en religion" (2:256). Le Prophète signa la Constitution de Médine protégeant toutes les communautés religieuses. Pendant 800 ans en Al-Andalus, musulmans, chrétiens et juifs construisirent ensemble une grande civilisation.' }, quran: 'لَا إِكْرَاهَ فِي الدِّينِ', quranTranslation: '"There is no compulsion in religion." (2:256)' },
  { id: 5, icon: '📖', en: { title: 'The Quran: The Final Revelation', summary: 'Revealed over 23 years, unchanged for 1400 years, memorized by millions.', content: 'The Quran was revealed to Prophet Muhammad ﷺ through Angel Gabriel over 23 years (610-632 CE). It contains 114 chapters (suras) and 6,236 verses. Unlike other scriptures, the Quran has remained textually identical since its compilation — not a word changed. It was simultaneously memorized and written. Today, millions of Muslims (Hafiz) have memorized the entire 604-page text — one of humanity\'s greatest feats of oral preservation. The Quran addresses theology, law, science, ethics, history, and the human condition.' }, ar: { title: 'القرآن الكريم: الوحي الأخير', summary: 'أُنزل على مدى 23 عاماً، لم يتغير لـ 1400 عام، يحفظه الملايين.', content: 'أُنزل القرآن الكريم على النبي ﷺ عن طريق جبريل على مدى 23 عاماً (610-632 م). يحتوي على 114 سورة و6236 آية. ظل نصه متطابقاً منذ تجميعه. حفظه الملايين من الحفاظ.' }, fr: { title: 'Le Coran: La Révélation Finale', summary: 'Révélé sur 23 ans, inchangé depuis 1400 ans, mémorisé par des millions.', content: 'Le Coran fut révélé au Prophète ﷺ sur 23 ans (610-632 EC). Il contient 114 chapitres et 6 236 versets. Son texte est resté identique depuis sa compilation. Des millions de musulmans (Hafiz) l\'ont mémorisé entièrement.' }, quran: 'إِنَّا نَحْنُ نَزَّلْنَا الذِّكْرَ وَإِنَّا لَهُ لَحَافِظُونَ', quranTranslation: '"Indeed, it is We who sent down the Quran and We will be its guardian." (15:9)' },
  { id: 6, icon: '💚', en: { title: 'Islamic Ethics: A Complete Way of Life', summary: '"I was sent to perfect good character." — Prophet Muhammad ﷺ', content: 'Islam is not just a religion of rituals — it\'s a complete way of life covering every dimension of human existence. Islamic ethics address: honesty in business, kindness to neighbors, rights of animals, environmental stewardship, family values, treatment of servants and employees, political justice, and international relations. The Prophet ﷺ said: "The most complete of believers in faith are those with the best character." Islamic law (Sharia) protects five fundamental human rights: life, religion, intellect, lineage, and property.' }, ar: { title: 'الأخلاق الإسلامية: منهج حياة متكامل', summary: '"إنما بُعثت لأتمم مكارم الأخلاق." — النبي محمد ﷺ', content: 'الإسلام ليس مجرد طقوس — إنه منهج حياة متكامل يشمل كل أبعاد الوجود الإنساني. الأخلاق الإسلامية تتناول: الصدق في الأعمال، والإحسان للجيران، وحقوق الحيوانات، وصون البيئة، والقيم الأسرية.' }, fr: { title: "Éthique Islamique: Un Mode de Vie Complet", summary: '"J\'ai été envoyé pour parfaire le bon caractère." — Prophète Muhammad ﷺ', content: "L'Islam n'est pas qu'une religion de rituels — c'est un mode de vie complet. L'éthique islamique aborde: l'honnêteté dans les affaires, la gentillesse envers les voisins, les droits des animaux, l'intendance environnementale." }, quran: 'وَإِنَّكَ لَعَلَىٰ خُلُقٍ عَظِيمٍ', quranTranslation: '"And indeed, you are of a great moral character." (68:4)' },
];

const myths = [
  { id: 1, icon: '💣', myth: { en: 'Islam promotes terrorism', ar: 'الإسلام يروّج للإرهاب', fr: "L'Islam promeut le terrorisme" }, reality: { en: 'The Quran explicitly forbids killing innocents: "Whoever kills a soul — it is as if he killed all of mankind." (5:32). Major Muslim scholar bodies worldwide have unanimously condemned terrorism. The 9/11 attacks were condemned by over 1 billion Muslims globally.', ar: 'يحرم القرآن صراحةً قتل الأبرياء: "مَن قَتَلَ نَفْسًا... فَكَأَنَّمَا قَتَلَ النَّاسَ جَمِيعًا" (5:32). أدان العلماء المسلمون الكبار الإرهاب بالإجماع.', fr: 'Le Coran interdit explicitement de tuer des innocents (5:32). Les organisations islamiques mondiales ont unanimement condamné le terrorisme.' } },
  { id: 2, icon: '🙏', myth: { en: 'Muslims worship Muhammad', ar: 'المسلمون يعبدون محمداً', fr: 'Les musulmans adorent Muhammad' }, reality: { en: 'Muslims worship only Allah (God alone). Muhammad ﷺ is honored as the final prophet but is human. When he died, Abu Bakr declared: "Whoever worshipped Muhammad, Muhammad is dead. Whoever worshipped God, God is alive and never dies."', ar: 'يعبد المسلمون الله وحده. محمد ﷺ يُكرم كآخر الأنبياء لكنه بشر. حين توفي قال أبو بكر: "من كان يعبد محمداً فإن محمداً قد مات، ومن كان يعبد الله فإن الله حي لا يموت."', fr: 'Les musulmans adorent uniquement Allah. Muhammad ﷺ est le dernier prophète mais est humain. À sa mort, Abu Bakr déclara: "Quiconque adorait Muhammad, il est mort. Quiconque adorait Dieu, Dieu est vivant."' } },
  { id: 3, icon: '👩', myth: { en: 'Islam oppresses women', ar: 'الإسلام يضطهد المرأة', fr: "L'Islam opprime les femmes" }, reality: { en: 'Islam was the first major religion to grant women legal rights: property ownership, inheritance, education, and choosing a spouse — in the 7th century. What\'s often called "Islamic oppression" reflects specific cultural practices in certain countries, not Islamic law. The first Muslim was a woman (Khadijah). The greatest Islamic scholar of her era was Aisha.', ar: 'كان الإسلام أول دين كبير يمنح المرأة حقوقاً قانونية في القرن السابع. ما يُسمى "قمع الإسلام للمرأة" يعكس ممارسات ثقافية، لا الشريعة الإسلامية. أول مسلمة كانت خديجة.', fr: "L'Islam fut la première grande religion à accorder des droits légaux aux femmes au 7e siècle. Ce qu'on appelle l'oppression est souvent une pratique culturelle, pas la loi islamique." } },
  { id: 4, icon: '🌍', myth: { en: 'All Muslims are Arab', ar: 'جميع المسلمين عرب', fr: 'Tous les musulmans sont arabes' }, reality: { en: 'Only 20% of Muslims are Arab. The world\'s largest Muslim populations are in Indonesia (231M), Pakistan (212M), Bangladesh (150M), and India (200M). Muslims represent every race, nationality, and ethnicity on Earth. The most racially diverse gathering on Earth is the Hajj.', ar: 'فقط 20% من المسلمين عرب. أكبر التجمعات الإسلامية في إندونيسيا وباكستان وبنغلاديش والهند. أكثر تجمع متنوع عرقياً على الأرض هو الحج.', fr: 'Seulement 20% des musulmans sont arabes. Les plus grandes populations musulmanes sont en Indonésie, Pakistan, Bangladesh et Inde. Le Hajj est le rassemblement le plus racialement diversifié sur Terre.' } },
  { id: 5, icon: '⚔️', myth: { en: 'Jihad means holy war', ar: 'الجهاد يعني الحرب المقدسة', fr: 'Le Jihad signifie guerre sainte' }, reality: { en: 'The primary meaning of jihad is personal spiritual struggle against one\'s ego, desires, and shortcomings. The Prophet called this the "greater jihad." When armed defense is permitted in Islamic law, it has strict ethical rules: no targeting civilians, no destroying crops, no harming women, children, or the elderly.', ar: 'المعنى الأساسي للجهاد هو الكفاح الروحي الشخصي ضد النفس والرغبات والقصور. سمّى النبي هذا "الجهاد الأكبر". للدفاع المسلح قواعد أخلاقية صارمة.', fr: 'Le sens premier du jihad est la lutte spirituelle personnelle contre son ego et ses désirs. Le Prophète l\'appela "le grand jihad." La défense armée a des règles éthiques strictes.' } },
  { id: 6, icon: '🕊️', myth: { en: 'Islam is intolerant of other religions', ar: 'الإسلام لا يتسامح مع الأديان الأخرى', fr: "L'Islam est intolérant envers les autres religions" }, reality: { en: '"There is no compulsion in religion." (2:256). The Prophet protected churches and synagogues. For 800 years in Al-Andalus, Jews, Christians, and Muslims coexisted in one of history\'s most tolerant civilizations. Islamic law (Sharia) explicitly protects non-Muslims\' lives, property, and places of worship.', ar: '"لَا إِكْرَاهَ فِي الدِّينِ" (2:256). حمى النبي الكنائس والمعابد. لـ 800 عام في الأندلس، تعايش اليهود والمسيحيون والمسلمون في أكثر الحضارات تسامحاً.', fr: '"Il n\'y a pas de contrainte en religion." (2:256). Le Prophète protégea les églises et les synagogues. Pendant 800 ans en Al-Andalus, juifs, chrétiens et musulmans coexistèrent dans une civilisation tolérante.' } },
  { id: 7, icon: '✝️', myth: { en: "Muslims don't believe in Jesus", ar: 'المسلمون لا يؤمنون بعيسى', fr: 'Les musulmans ne croient pas en Jésus' }, reality: { en: 'Muslims deeply revere Jesus (Isa) as one of the five greatest prophets (alongside Noah, Abraham, Moses, and Muhammad ﷺ). The Quran confirms his virgin birth, his miracles, and dedicates an entire chapter to his mother Mary (Maryam). Not believing in Jesus would disqualify a person from Islam.', ar: 'يبجّل المسلمون عيسى عليه السلام أحد أعظم خمسة أنبياء. يؤكد القرآن ولادته المعجزة ومعجزاته ويخصص سورة كاملة لأمه مريم. عدم الإيمان بعيسى يُخرج الشخص من الإسلام.', fr: 'Les musulmans vénèrent profondément Jésus (Isa) comme l\'un des cinq plus grands prophètes. Le Coran confirme sa naissance virginale et ses miracles, et consacre un chapitre à sa mère Marie.' } },
  { id: 8, icon: '📅', myth: { en: 'Islam is a new religion', ar: 'الإسلام دين جديد', fr: "L'Islam est une nouvelle religion" }, reality: { en: 'Muslims believe Islam is not new — it is the original and final form of the same message given to all prophets from Adam through Abraham, Moses, and Jesus. The Quran states: "The same religion has He established for you as that which He enjoined on Noah... and that which We enjoined on Abraham, Moses, and Jesus." (42:13)', ar: 'يعتقد المسلمون أن الإسلام ليس جديداً — بل هو الصيغة الأصلية والأخيرة للرسالة ذاتها المُنزلة على جميع الأنبياء.', fr: 'Les musulmans croient que l\'Islam n\'est pas nouveau — c\'est la forme originale et finale du même message donné à tous les prophètes d\'Adam à Jésus.' } },
];

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
