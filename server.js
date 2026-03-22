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

const ChatSchema = new mongoose.Schema({
  sessionId: String,
  messages: [{ role: String, content: String, timestamp: { type: Date, default: Date.now } }]
});
const Chat = mongoose.model('Chat', ChatSchema);

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'islam-guide-api' }));

app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId, history = [], lang = 'en' } = req.body;
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: `You are Sheikh AI — a knowledgeable, respectful, and accurate Islamic scholar assistant. Your mission:

1. Present Islam ACCURATELY based on authentic Quran and Hadith sources
2. Correct misconceptions about Islam, especially regarding terrorism, extremism, jihad, and women's rights
3. Explain Islamic values: peace (salaam), justice (adl), compassion (rahmah), and mercy (rahma)
4. Share historical contributions of Islamic civilization in science, mathematics, medicine, and philosophy
5. Be welcoming and respectful to people of ALL backgrounds and faiths — Muslim or not
6. Always provide context when quoting religious texts
7. Clearly distinguish between cultural practices and actual Islamic teachings
8. Address jihad accurately: it primarily means personal spiritual struggle, not violence
9. Explain that terrorism and extremism are explicitly FORBIDDEN in Islam — "Whoever kills an innocent soul, it is as if he killed all of mankind" (Quran 5:32)
10. Honor all Abrahamic prophets: Adam, Noah, Abraham, Moses, Jesus, and Muhammad ﷺ
11. Explain Islam's respect for Christians and Jews as "People of the Book"
12. Share the Five Pillars: Shahada, Salat, Zakat, Sawm, Hajj
13. Explain the Quran as the final revelation, and Hadith as the Prophet's traditions
14. Discuss Islamic ethics: honesty, charity, family values, environmental responsibility
15. Respond in the SAME LANGUAGE the user writes in (Arabic, English, or French) — this is critical

Be warm, educational, patient, and academically rigorous. Your goal is to build bridges of understanding between cultures. Always cite Quran verses or Hadith when relevant.`
    });

    const chat = model.startChat({
      history: history.map(h => ({ role: h.role === 'ai' ? 'model' : h.role, parts: [{ text: h.content }] }))
    });

    const result = await chat.sendMessage(message);
    const response = result.response.text();

    await Chat.findOneAndUpdate(
      { sessionId },
      { $push: { messages: [{ role: 'user', content: message }, { role: 'model', content: response }] } },
      { upsert: true }
    );

    res.json({ response });
  } catch (err) {
    console.error('Gemini error:', err.message);
    res.status(500).json({ error: 'AI temporarily unavailable. Please try again.' });
  }
});

app.get('/api/articles', (req, res) => res.json(articles));
app.get('/api/myths', (req, res) => res.json(myths));
app.get('/api/contributions', (req, res) => res.json(contributions));
app.get('/api/pillars', (req, res) => res.json(pillars));
app.get('/api/prophets', (req, res) => res.json(prophets));

// ── DATA ──────────────────────────────────────────────────

const pillars = [
  {
    id: 1, icon: '☝️', number: 'First Pillar',
    en: { name: 'Shahada — Declaration of Faith', desc: 'The testimony that "There is no god but Allah, and Muhammad is His messenger." This simple but profound declaration is the entry point into Islam and the foundation of a Muslim\'s entire worldview.' },
    ar: { name: 'الشهادة — شهادة الإيمان', desc: 'شهادة أن لا إله إلا الله وأن محمداً رسول الله. هذا الإقرار البسيط والعميق هو نقطة الدخول إلى الإسلام وأساس رؤية المسلم للعالم.' },
    fr: { name: 'Shahada — Déclaration de Foi', desc: 'Le témoignage qu\'il n\'y a de dieu qu\'Allah et que Muhammad est Son messager. Cette déclaration simple mais profonde est le point d\'entrée dans l\'Islam.' },
    arabic: 'أَشْهَدُ أَن لَّا إِلَٰهَ إِلَّا ٱللَّٰهُ وَأَشْهَدُ أَنَّ مُحَمَّدًا رَّسُولُ ٱللَّٰهِ'
  },
  {
    id: 2, icon: '🙏', number: 'Second Pillar',
    en: { name: 'Salat — Prayer', desc: 'Muslims pray five times daily — at dawn, midday, afternoon, sunset, and night. Prayer connects the believer directly to God without any intermediary, maintaining spiritual awareness throughout the day.' },
    ar: { name: 'الصلاة', desc: 'يصلي المسلمون خمس مرات يومياً — الفجر والظهر والعصر والمغرب والعشاء. الصلاة تربط المؤمن مباشرة بالله دون أي وسيط.' },
    fr: { name: 'Salat — Prière', desc: 'Les musulmans prient cinq fois par jour — à l\'aube, à midi, l\'après-midi, au coucher du soleil et la nuit. La prière connecte le croyant directement à Dieu.' },
    arabic: 'إِنَّ الصَّلَاةَ كَانَتْ عَلَى الْمُؤْمِنِينَ كِتَابًا مَّوْقُوتًا'
  },
  {
    id: 3, icon: '💰', number: 'Third Pillar',
    en: { name: 'Zakat — Charity', desc: 'Muslims who meet a minimum threshold of wealth must give 2.5% annually to those in need. Zakat purifies wealth and ensures economic justice — it\'s not optional charity but a religious obligation.' },
    ar: { name: 'الزكاة', desc: 'يجب على المسلمين الذين يستوفون الحد الأدنى من الثروة أن يعطوا 2.5% سنوياً للمحتاجين. الزكاة تطهر الثروة وتضمن العدالة الاقتصادية.' },
    fr: { name: 'Zakat — Aumône', desc: 'Les musulmans qui atteignent un seuil minimum de richesse doivent donner 2,5% annuellement aux nécessiteux. La Zakat purifie la richesse et assure la justice économique.' },
    arabic: 'وَأَقِيمُوا الصَّلَاةَ وَآتُوا الزَّكَاةَ'
  },
  {
    id: 4, icon: '🌙', number: 'Fourth Pillar',
    en: { name: 'Sawm — Fasting', desc: 'During the holy month of Ramadan, Muslims fast from dawn to sunset — abstaining from food, drink, and negative behavior. Fasting builds discipline, empathy for the poor, and spiritual closeness to God.' },
    ar: { name: 'الصوم', desc: 'خلال شهر رمضان المبارك، يصوم المسلمون من الفجر إلى غروب الشمس. الصيام يبني الانضباط والتعاطف مع الفقراء والقرب الروحي من الله.' },
    fr: { name: 'Sawm — Jeûne', desc: 'Durant le mois sacré du Ramadan, les musulmans jeûnent de l\'aube au coucher du soleil. Le jeûne renforce la discipline, l\'empathie pour les pauvres et la proximité spirituelle avec Dieu.' },
    arabic: 'يَا أَيُّهَا الَّذِينَ آمَنُوا كُتِبَ عَلَيْكُمُ الصِّيَامُ'
  },
  {
    id: 5, icon: '🕋', number: 'Fifth Pillar',
    en: { name: 'Hajj — Pilgrimage', desc: 'Every Muslim who is physically and financially able must make the pilgrimage to Mecca at least once. Hajj is the world\'s largest annual gathering — a powerful symbol of equality as all pilgrims wear simple white garments.' },
    ar: { name: 'الحج', desc: 'يجب على كل مسلم قادر جسدياً ومادياً أن يحج إلى مكة مرة واحدة على الأقل. الحج هو أكبر تجمع سنوي في العالم — رمز قوي للمساواة.' },
    fr: { name: 'Hajj — Pèlerinage', desc: 'Chaque musulman physiquement et financièrement capable doit faire le pèlerinage à La Mecque au moins une fois. Le Hajj est le plus grand rassemblement annuel au monde.' },
    arabic: 'وَلِلَّهِ عَلَى النَّاسِ حِجُّ الْبَيْتِ مَنِ اسْتَطَاعَ إِلَيْهِ سَبِيلًا'
  }
];

const prophets = [
  { id: 1, icon: '🌱', name: 'Adam (آدم)', en: 'The first human and first prophet. Created by God and given stewardship of the Earth. His story teaches accountability and repentance.', ar: 'أول إنسان وأول نبي. خُلق من الله وأُعطي الخلافة في الأرض. قصته تعلم المسئولية والتوبة.', fr: 'Le premier humain et premier prophète. Créé par Dieu et chargé de la gérance de la Terre.' },
  { id: 2, icon: '⛵', name: 'Noah (نوح)', en: 'Built the Ark to save believers from the great flood. A symbol of unwavering faith in the face of ridicule and adversity.', ar: 'بنى السفينة لإنقاذ المؤمنين من الطوفان العظيم. رمز للإيمان الثابت في مواجهة السخرية والمحن.', fr: 'A construit l\'Arche pour sauver les croyants du grand déluge. Symbole d\'une foi inébranlable.' },
  { id: 3, icon: '🔥', name: 'Abraham (إبراهيم)', en: 'The father of monotheism, honored by Islam, Christianity, and Judaism. He built the Kaaba in Mecca with his son Ishmael and is called "Khalilullah" — Friend of God.', ar: 'أبو التوحيد، يكرمه الإسلام والمسيحية واليهودية. بنى الكعبة المشرفة مع ابنه إسماعيل ويُدعى "خليل الله".', fr: 'Le père du monothéisme, honoré par l\'Islam, le Christianisme et le Judaïsme. Il a construit la Kaaba.' },
  { id: 4, icon: '💧', name: 'Moses (موسى)', en: 'Received the Torah and led the Israelites from Egyptian slavery. The most mentioned prophet in the Quran. Moses and Muhammad ﷺ met during the Night Journey (Isra wal Miraj).', ar: 'تلقّى التوراة وقاد بني إسرائيل من العبودية المصرية. أكثر نبي ذُكر في القرآن الكريم.', fr: 'A reçu la Torah et conduit les Israélites hors de l\'esclavage égyptien. Le prophète le plus mentionné dans le Coran.' },
  { id: 5, icon: '✨', name: 'Jesus (عيسى)', en: 'Born of a virgin birth, performed miracles, and preached the Gospel. Islam honors Jesus as one of the greatest prophets. The Quran dedicates an entire chapter (Maryam) to his mother Mary.', ar: 'وُلد من عذراء وأجرى معجزات وبشّر بالإنجيل. يكرم الإسلام عيسى بوصفه أحد أعظم الأنبياء.', fr: 'Né d\'une vierge, il a accompli des miracles et prêché l\'Évangile. L\'Islam honore Jésus comme l\'un des plus grands prophètes.' },
  { id: 6, icon: '🌟', name: 'Muhammad ﷺ (محمد)', en: 'The final prophet and messenger of God, born in Mecca in 570 CE. He received the Quran over 23 years and united Arabia under monotheism. His character was described by his wife Aisha as "a walking Quran."', ar: 'آخر نبي ورسول لله، وُلد في مكة المكرمة عام 570 م. تلقّى القرآن الكريم على مدى 23 عاماً ووحّد شبه الجزيرة العربية على التوحيد.', fr: 'Le dernier prophète et messager de Dieu, né à La Mecque en 570 EC. Il a reçu le Coran sur 23 ans.' },
];

const articles = [
  {
    id: 1, icon: '☮️',
    en: { title: 'Islam: A Religion of Peace', summary: 'The word Islam derives from "salama" — peace. Understanding this transforms how we see the entire faith.', content: 'Islam, at its core, is a faith built on the pursuit of peace — with God, with oneself, and with all of creation. The Quran states: "And We have not sent you except as a mercy to the worlds" (21:107). The Prophet Muhammad ﷺ said: "None of you truly believes until he loves for his brother what he loves for himself." Terrorism and violence against innocent people are explicitly forbidden. The Quran states: "Whoever kills a soul unless for a soul or for corruption in the land — it is as if he had slain mankind entirely." (5:32)' },
    ar: { title: 'الإسلام: دين السلام', summary: 'كلمة الإسلام مشتقة من "السلام". فهم هذا يغيّر طريقة رؤيتنا للدين كله.', content: 'الإسلام في جوهره دين مبني على السعي إلى السلام — مع الله، ومع النفس، ومع جميع المخلوقات. يقول القرآن الكريم: "وَمَا أَرْسَلْنَاكَ إِلَّا رَحْمَةً لِّلْعَالَمِينَ" (21:107). وقال النبي محمد ﷺ: "لا يؤمن أحدكم حتى يحب لأخيه ما يحب لنفسه." الإرهاب والعنف ضد الأبرياء محرمان صراحةً في الإسلام.' },
    fr: { title: "L'Islam: Une Religion de Paix", summary: 'Le mot Islam dérive de "salama" — paix. Comprendre cela transforme notre vision de toute la foi.', content: "L'Islam, à son cœur, est une foi construite sur la recherche de la paix — avec Dieu, avec soi-même, et avec toute la création. Le Coran déclare: \"Nous ne t'avons envoyé que comme miséricorde pour les mondes\" (21:107)." },
    quran: 'وَمَا أَرْسَلْنَاكَ إِلَّا رَحْمَةً لِّلْعَالَمِينَ',
    quranTranslation: '"And We have not sent you except as a mercy to the worlds." (21:107)'
  },
  {
    id: 2, icon: '🌱',
    en: { title: 'The True Meaning of Jihad', summary: 'Jihad is one of the most misunderstood concepts. Its primary meaning is the internal struggle to become a better person.', content: 'The word "jihad" comes from the Arabic root meaning "to strive" or "to struggle." The Prophet Muhammad ﷺ, returning from a battle, said: "We have returned from the lesser jihad to the greater jihad." When asked what the greater jihad was, he replied: "The struggle against one\'s own soul." This greater jihad — the daily effort to be honest, just, compassionate — is what Islam truly emphasizes. Armed conflict, when permitted, has strict ethical rules: no targeting civilians, no destroying crops, no harming women or children.' },
    ar: { title: 'المعنى الحقيقي للجهاد', summary: 'الجهاد من أكثر المفاهيم سوء فهماً. معناه الأساسي هو الكفاح الداخلي لتحسين النفس.', content: 'كلمة "جهاد" مشتقة من الجذر العربي بمعنى "السعي" أو "الكفاح". قال النبي محمد ﷺ عند عودته من معركة: "رجعنا من الجهاد الأصغر إلى الجهاد الأكبر." وعندما سُئل ما الجهاد الأكبر، أجاب: "جهاد النفس." هذا الجهاد الأكبر — السعي اليومي للصدق والعدل والرحمة — هو ما يؤكد عليه الإسلام حقاً.' },
    fr: { title: 'La Vraie Signification du Jihad', summary: 'Le Jihad est l\'un des concepts les plus mal compris. Son sens premier est la lutte intérieure pour devenir une meilleure personne.', content: 'Le mot "jihad" vient de la racine arabe signifiant "s\'efforcer" ou "lutter." Le Prophète Muhammad ﷺ, revenant d\'une bataille, dit: "Nous sommes revenus du jihad mineur au jihad majeur." Le jihad majeur — l\'effort quotidien pour être honnête, juste, compatissant — est ce que l\'Islam souligne vraiment.' },
    quran: 'وَجَاهِدُوا فِي اللَّهِ حَقَّ جِهَادِهِ',
    quranTranslation: '"And strive for Allah with the striving due to Him." (22:78)'
  },
  {
    id: 3, icon: '🌸',
    en: { title: "Women's Rights in Islam", summary: 'Islam granted women rights 1400 years ago that much of the world only recognized in the 20th century.', content: 'At a time when women were treated as property in much of the world, Islam declared spiritual equality. The Quran states men and women are equal before God (33:35). Islam gave women: the right to own property, the right to education, the right to choose their spouse, the right to divorce, the right to keep their name after marriage, the right to inherit. Khadijah, the Prophet\'s first wife, was a successful businesswoman who employed him before their marriage. Aisha became one of the greatest Islamic scholars in history.' },
    ar: { title: 'حقوق المرأة في الإسلام', summary: 'منح الإسلام المرأة حقوقاً قبل 1400 عام لم يعترف بها كثير من العالم إلا في القرن العشرين.', content: 'في وقت كانت المرأة تُعامل فيه كممتلكات في كثير من أنحاء العالم، أعلن الإسلام المساواة الروحية. يقرر القرآن مساواة الرجال والنساء أمام الله (33:35). منح الإسلام المرأة: حق تملك الممتلكات، وحق التعليم، وحق اختيار الزوج، وحق الطلاق، وحق الإرث.' },
    fr: { title: 'Les Droits des Femmes en Islam', summary: "L'Islam a accordé aux femmes des droits il y a 1400 ans que le monde n'a reconnus qu'au XXe siècle.", content: "À une époque où les femmes étaient traitées comme des propriétés, l'Islam a déclaré l'égalité spirituelle. Le Coran affirme que les hommes et les femmes sont égaux devant Dieu (33:35). L'Islam a donné aux femmes: le droit de posséder des biens, le droit à l'éducation, le droit de choisir leur époux, le droit au divorce, le droit à l'héritage." },
    quran: 'وَلَهُنَّ مِثْلُ الَّذِي عَلَيْهِنَّ بِالْمَعْرُوفِ',
    quranTranslation: '"And women shall have rights similar to the rights against them." (2:228)'
  },
  {
    id: 4, icon: '🤝',
    en: { title: 'Islam and Other Religions', summary: 'The Quran explicitly protects the rights of Christians, Jews, and people of other faiths. Coexistence is a Quranic principle.', content: '"There is no compulsion in religion" (2:256) — this Quranic verse established religious freedom 1400 years ago. The Prophet Muhammad ﷺ signed the Constitution of Medina, one of the world\'s first pluralistic constitutions, guaranteeing rights to all communities. Jews, Christians, and others lived peacefully under Muslim rule for centuries. Islam considers Christians and Jews "People of the Book" — sharing the same Abrahamic prophetic tradition.' },
    ar: { title: 'الإسلام والأديان الأخرى', summary: 'يحمي القرآن صراحةً حقوق المسيحيين واليهود وأتباع الأديان الأخرى. التعايش مبدأ قرآني.', content: '"لَا إِكْرَاهَ فِي الدِّينِ" (2:256) — أرست هذه الآية الكريمة الحرية الدينية قبل 1400 عام. وقّع النبي محمد ﷺ صحيفة المدينة، وهي واحدة من أولى الدساتير التعددية في العالم. عاش اليهود والمسيحيون وغيرهم في سلام تحت الحكم الإسلامي لقرون.' },
    fr: { title: "L'Islam et les Autres Religions", summary: 'Le Coran protège explicitement les droits des chrétiens, juifs et personnes d\'autres fois. La coexistence est un principe coranique.', content: '"Il n\'y a pas de contrainte en religion" (2:256) — ce verset coranique a établi la liberté religieuse il y a 1400 ans. Le Prophète Muhammad ﷺ a signé la Constitution de Médine, l\'une des premières constitutions pluralistes au monde.' },
    quran: 'لَا إِكْرَاهَ فِي الدِّينِ',
    quranTranslation: '"There is no compulsion in religion." (2:256)'
  },
  {
    id: 5, icon: '📖',
    en: { title: 'The Quran: Word of God', summary: 'The Quran is the holy book of Islam, revealed to Prophet Muhammad ﷺ over 23 years. It remains unchanged since its revelation.', content: 'The Quran was revealed to Prophet Muhammad ﷺ through the Angel Gabriel over 23 years (610-632 CE). It contains 114 chapters (suras) and 6,236 verses covering theology, law, ethics, history, and science. Unlike other scriptures, the Quran has remained textually unchanged since its compilation. It was memorized by thousands and written down simultaneously. Today, millions of Muslims (Hafiz) have memorized the entire Quran — one of humanity\'s greatest feats of oral preservation.' },
    ar: { title: 'القرآن الكريم: كلام الله', summary: 'القرآن الكريم هو الكتاب المقدس للإسلام، أُنزل على النبي محمد ﷺ على مدى 23 عاماً. ولا يزال دون تغيير منذ نزوله.', content: 'أُنزل القرآن الكريم على النبي محمد ﷺ عن طريق جبريل عليه السلام على مدى 23 عاماً (610-632 م). يحتوي على 114 سورة و6236 آية. وبخلاف سائر الكتب المقدسة، ظل القرآن الكريم لم يتغير نصياً منذ تجميعه.' },
    fr: { title: 'Le Coran: Parole de Dieu', summary: 'Le Coran est le livre sacré de l\'Islam, révélé au Prophète Muhammad ﷺ sur 23 ans. Il est resté inchangé depuis sa révélation.', content: 'Le Coran a été révélé au Prophète Muhammad ﷺ par l\'Ange Gabriel sur 23 ans (610-632 EC). Il contient 114 chapitres et 6 236 versets. Contrairement à d\'autres écritures, le Coran est resté textuellement inchangé depuis sa compilation.' },
    quran: 'إِنَّا نَحْنُ نَزَّلْنَا الذِّكْرَ وَإِنَّا لَهُ لَحَافِظُونَ',
    quranTranslation: '"Indeed, it is We who sent down the Quran and indeed, We will be its guardian." (15:9)'
  },
  {
    id: 6, icon: '💚',
    en: { title: 'Islamic Ethics & Character', summary: 'The Prophet Muhammad ﷺ said: "I was sent to perfect good character." Ethics and morality are central to Islamic practice.', content: 'Islamic ethics encompass every aspect of life. The Prophet ﷺ emphasized: honesty in business, kindness to neighbors, care for animals, protection of the environment, respect for parents, and generosity to the poor. The concept of "Ihsan" — doing things with excellence and beauty — permeates Islamic ethics. Muslims are taught to be honest even when it hurts, to be just even to enemies, and to show mercy to all living beings. "The best among you are those with the best character." — Prophet Muhammad ﷺ' },
    ar: { title: 'الأخلاق الإسلامية والشخصية', summary: 'قال النبي محمد ﷺ: "إنما بُعثت لأتمم مكارم الأخلاق." الأخلاق والفضيلة محوريتان في الممارسة الإسلامية.', content: 'تشمل الأخلاق الإسلامية كل جانب من جوانب الحياة. أكد النبي ﷺ على: الصدق في التعامل، والإحسان إلى الجيران، والرفق بالحيوانات، وحماية البيئة، وبر الوالدين، والكرم مع الفقراء. مفهوم "الإحسان" — فعل الأشياء بتميز وجمال — يتخلل الأخلاق الإسلامية.' },
    fr: { title: 'Éthique Islamique & Caractère', summary: 'Le Prophète Muhammad ﷺ a dit: "J\'ai été envoyé pour parfaire le bon caractère." L\'éthique est centrale dans la pratique islamique.', content: "L'éthique islamique englobe tous les aspects de la vie. Le Prophète ﷺ a mis l'accent sur: l'honnêteté dans les affaires, la gentillesse envers les voisins, le soin des animaux, la protection de l'environnement, le respect des parents, et la générosité envers les pauvres." },
    quran: 'وَإِنَّكَ لَعَلَىٰ خُلُقٍ عَظِيمٍ',
    quranTranslation: '"And indeed, you are of a great moral character." (68:4)'
  }
];

const myths = [
  { id: 1, myth: { en: 'Islam promotes terrorism', ar: 'الإسلام يروّج للإرهاب', fr: "L'Islam promeut le terrorisme" }, reality: { en: 'The Quran explicitly forbids killing innocent people. "Whoever kills a soul, it is as if he had slain mankind entirely." (5:32). Terrorism contradicts the core of Islamic teaching.', ar: 'يحرم القرآن الكريم صراحةً قتل الأبرياء. "مَن قَتَلَ نَفْسًا بِغَيْرِ نَفْسٍ أَوْ فَسَادٍ فِي الْأَرْضِ فَكَأَنَّمَا قَتَلَ النَّاسَ جَمِيعًا" (5:32). الإرهاب يتناقض مع جوهر التعاليم الإسلامية.', fr: 'Le Coran interdit explicitement de tuer des innocents. "Quiconque tue une âme... c\'est comme s\'il avait tué l\'humanité entière." (5:32).' }, icon: '💣' },
  { id: 2, myth: { en: 'Muslims worship Muhammad', ar: 'المسلمون يعبدون محمداً', fr: 'Les musulmans adorent Muhammad' }, reality: { en: 'Muslims worship only Allah (God). Muhammad ﷺ is revered as the final prophet but is human, not divine. When he died, Abu Bakr said: "Whoever worshipped Muhammad, Muhammad is dead. Whoever worshipped God, God is alive."', ar: 'يعبد المسلمون الله وحده. يُبجّل محمد ﷺ بوصفه آخر الأنبياء لكنه بشر لا إله. لما توفي قال أبو بكر: "من كان يعبد محمداً فإن محمداً قد مات، ومن كان يعبد الله فإن الله حي لا يموت."', fr: 'Les musulmans adorent uniquement Allah (Dieu). Muhammad ﷺ est vénéré comme le dernier prophète mais est humain, pas divin.' }, icon: '🙏' },
  { id: 3, myth: { en: 'Islam oppresses women', ar: 'الإسلام يضطهد المرأة', fr: "L'Islam opprime les femmes" }, reality: { en: 'Islam was the first major religion to grant women legal rights including property ownership and inheritance. Cultural practices in some regions are confused with Islamic teachings. The first Muslim was a woman — Khadijah.', ar: 'كان الإسلام أول دين كبير يمنح المرأة حقوقاً قانونية تشمل تملك الممتلكات والإرث. تُخلط الممارسات الثقافية في بعض المناطق بالتعاليم الإسلامية. أول مسلمة كانت امرأة — السيدة خديجة.', fr: "L'Islam fut la première grande religion à accorder aux femmes des droits légaux incluant la propriété. Les pratiques culturelles sont souvent confondues avec les enseignements islamiques." }, icon: '👩' },
  { id: 4, myth: { en: 'All Muslims are Arab', ar: 'جميع المسلمين عرب', fr: 'Tous les musulmans sont arabes' }, reality: { en: 'Only 20% of Muslims are Arab. The largest Muslim populations are in Indonesia, Pakistan, Bangladesh, and India. Islam is the world\'s second-largest religion with 1.8 billion followers of all ethnicities.', ar: 'فقط 20% من المسلمين عرب. أكبر التجمعات الإسلامية موجودة في إندونيسيا وباكستان وبنغلاديش والهند. الإسلام هو ثاني أكبر الأديان في العالم بـ 1.8 مليار متبع من جميع الأعراق.', fr: 'Seulement 20% des musulmans sont arabes. Les plus grandes populations musulmanes se trouvent en Indonésie, au Pakistan, au Bangladesh et en Inde.' }, icon: '🌍' },
  { id: 5, myth: { en: 'Jihad means holy war', ar: 'الجهاد يعني الحرب المقدسة', fr: 'Le Jihad signifie guerre sainte' }, reality: { en: 'The primary meaning of jihad is the personal, internal struggle to be a better person. The Prophet called this the "greater jihad." Armed conflict is the "lesser jihad" and has strict ethical rules — targeting civilians is strictly forbidden.', ar: 'المعنى الأساسي للجهاد هو الكفاح الشخصي الداخلي لتحسين النفس. سمّى النبي هذا "الجهاد الأكبر". أما القتال المسلح فهو "الجهاد الأصغر" وله قواعد أخلاقية صارمة.', fr: 'Le sens premier du jihad est la lutte personnelle intérieure pour être une meilleure personne. Le Prophète l\'appelait le "grand jihad." Le conflit armé est le "petit jihad" avec des règles éthiques strictes.' }, icon: '⚔️' },
  { id: 6, myth: { en: 'Islam is intolerant of other religions', ar: 'الإسلام لا يتسامح مع الأديان الأخرى', fr: "L'Islam est intolérant envers les autres religions" }, reality: { en: '"There is no compulsion in religion." (Quran 2:256). The Prophet protected churches and synagogues. For centuries, Jews and Christians flourished under Islamic rule in Spain (Al-Andalus) — a period historians call the "Golden Coexistence."', ar: '"لَا إِكْرَاهَ فِي الدِّينِ" (القرآن 2:256). حمى النبي الكنائس والمعابد اليهودية. ازدهر اليهود والمسيحيون لقرون تحت الحكم الإسلامي في الأندلس.', fr: '"Il n\'y a pas de contrainte en religion." (Coran 2:256). Le Prophète a protégé les églises et les synagogues. Pendant des siècles, juifs et chrétiens ont prospéré sous la domination islamique en Espagne.' }, icon: '🕊️' },
  { id: 7, myth: { en: 'Islam is a new religion', ar: 'الإسلام دين جديد', fr: "L'Islam est une nouvelle religion" }, reality: { en: 'Muslims believe Islam is the continuation of the same message given to Abraham, Moses, and Jesus. The Quran honors all prophets of the Abrahamic tradition. Muslims consider themselves successors to the same faith.', ar: 'يعتقد المسلمون أن الإسلام هو استمرار الرسالة ذاتها التي أُنزلت على إبراهيم وموسى وعيسى. يكرم القرآن جميع أنبياء التقليد الإبراهيمي.', fr: "Les musulmans croient que l'Islam est la continuation du même message donné à Abraham, Moïse et Jésus. Le Coran honore tous les prophètes de la tradition abrahamique." }, icon: '📅' },
  { id: 8, myth: { en: 'Muslims don\'t believe in Jesus', ar: 'المسلمون لا يؤمنون بعيسى', fr: 'Les musulmans ne croient pas en Jésus' }, reality: { en: 'Muslims deeply revere Jesus (Isa) as one of the greatest prophets. The Quran dedicates an entire chapter to Mary (Maryam) and describes Jesus\'s virgin birth and miracles. Not believing in Jesus is actually disqualifying in Islam.', ar: 'يبجّل المسلمون عيسى عليه السلام بعمق بوصفه أحد أعظم الأنبياء. يخصص القرآن الكريم سورة كاملة للسيدة مريم ويصف ولادة عيسى المعجزة ومعجزاته. عدم الإيمان بعيسى يُخرج الشخص من الإسلام فعلياً.', fr: 'Les musulmans vénèrent profondément Jésus (Isa) comme l\'un des plus grands prophètes. Le Coran consacre un chapitre entier à Marie (Maryam) et décrit la naissance virginale et les miracles de Jésus.' }, icon: '✝️' },
];

const contributions = [
  { id: 1, field: { en: 'Mathematics', ar: 'الرياضيات', fr: 'Mathématiques' }, icon: '🔢', text: { en: 'Al-Khwarizmi invented algebra — the word "algorithm" comes from his name. Arabic numerals (0-9) were preserved and transmitted by Islamic scholars. Al-Kindi pioneered cryptography.', ar: 'اخترع الخوارزمي علم الجبر — كلمة "algorithm" مشتقة من اسمه. الأرقام العربية (0-9) حُفظت ونُقلت بواسطة العلماء المسلمين.', fr: 'Al-Khwarizmi a inventé l\'algèbre — le mot "algorithme" vient de son nom. Les chiffres arabes (0-9) ont été préservés et transmis par des érudits islamiques.' } },
  { id: 2, field: { en: 'Medicine', ar: 'الطب', fr: 'Médecine' }, icon: '⚕️', text: { en: 'Ibn Sina (Avicenna) wrote the Canon of Medicine, used in European universities for 600 years. Al-Zahrawi invented surgical instruments still used today. Ibn al-Nafis discovered pulmonary circulation 300 years before Europe.', ar: 'كتب ابن سينا القانون في الطب الذي استخدم في الجامعات الأوروبية لـ 600 عام. اخترع الزهراوي أدوات جراحية لا تزال مستخدمة اليوم.', fr: 'Ibn Sina (Avicenne) a écrit le Canon de la Médecine, utilisé dans les universités européennes pendant 600 ans. Al-Zahrawi a inventé des instruments chirurgicaux encore utilisés aujourd\'hui.' } },
  { id: 3, field: { en: 'Astronomy', ar: 'علم الفلك', fr: 'Astronomie' }, icon: '🌙', text: { en: 'Muslim astronomers named most of the stars we know today (Aldebaran, Altair, Deneb). Al-Battani calculated the solar year with remarkable precision. The astrolabe was perfected by Islamic scientists.', ar: 'سمّى علماء الفلك المسلمون معظم النجوم التي نعرفها اليوم. حسب البتاني السنة الشمسية بدقة ملحوظة. طوّر العلماء الإسلاميون الأسطرلاب.', fr: 'Les astronomes musulmans ont nommé la plupart des étoiles que nous connaissons aujourd\'hui. Al-Battani a calculé l\'année solaire avec une précision remarquable.' } },
  { id: 4, field: { en: 'Philosophy', ar: 'الفلسفة', fr: 'Philosophie' }, icon: '💭', text: { en: 'Ibn Rushd (Averroes) preserved and commented on Aristotle, directly sparking the European Renaissance. Ibn Khaldun founded sociology and historiography 400 years before Western scholars.', ar: 'حافظ ابن رشد على أعمال أرسطو وعلّق عليها، مما أشعل مباشرةً النهضة الأوروبية. أسس ابن خلدون علم الاجتماع وعلم التاريخ قبل 400 عام من العلماء الغربيين.', fr: 'Ibn Rushd (Averroès) a préservé et commenté Aristote, déclenchant directement la Renaissance européenne. Ibn Khaldun a fondé la sociologie 400 ans avant les érudits occidentaux.' } },
  { id: 5, field: { en: 'Architecture', ar: 'العمارة', fr: 'Architecture' }, icon: '🕌', text: { en: 'Islamic architecture produced marvels like the Alhambra, the Dome of the Rock, and the great mosques of Cordoba. The pointed arch introduced in Islamic architecture was later adopted in Gothic cathedrals across Europe.', ar: 'أنتجت العمارة الإسلامية روائع كالحمراء وقبة الصخرة ومساجد قرطبة العظيمة. القوس المدبب الذي أُدخل في العمارة الإسلامية اعتُمد لاحقاً في الكاتدرائيات القوطية في أوروبا.', fr: "L'architecture islamique a produit des merveilles comme l'Alhambra, le Dôme du Rocher. L'arc brisé introduit dans l'architecture islamique fut adopté dans les cathédrales gothiques d'Europe." } },
  { id: 6, field: { en: 'Chemistry', ar: 'الكيمياء', fr: 'Chimie' }, icon: '⚗️', text: { en: 'Jabir ibn Hayyan (Geber) is the father of chemistry. He discovered sulfuric acid, nitric acid, and developed early scientific methodology. The words "alkali," "alcohol," and "alchemy" all come from Arabic.', ar: 'جابر بن حيان أبو الكيمياء. اكتشف حمض الكبريتيك وحمض النيتريك وطوّر المنهجية العلمية المبكرة. كلمات "قلوي" و"كحول" و"كيمياء" كلها مشتقة من العربية.', fr: 'Jabir ibn Hayyan (Geber) est le père de la chimie. Il a découvert l\'acide sulfurique et l\'acide nitrique. Les mots "alcali," "alcool" et "alchimie" viennent tous de l\'arabe.' } },
  { id: 7, field: { en: 'Literature & Poetry', ar: 'الأدب والشعر', fr: 'Littérature & Poésie' }, icon: '📜', text: { en: 'One Thousand and One Nights introduced storytelling techniques used in modern literature. The ghazal poetry form influenced Western romantic poetry. Rumi\'s poetry remains among the best-selling in the United States today.', ar: 'ألف ليلة وليلة أدخلت تقنيات رواية القصص المستخدمة في الأدب الحديث. شكل شعر الغزل أثّر في الشعر الرومانسي الغربي. لا يزال شعر الرومي من الأكثر مبيعاً في الولايات المتحدة.', fr: 'Les Mille et Une Nuits ont introduit des techniques narratives utilisées dans la littérature moderne. La poésie de Rumi reste parmi les meilleures ventes aux États-Unis aujourd\'hui.' } },
  { id: 8, field: { en: 'Agriculture', ar: 'الزراعة', fr: 'Agriculture' }, icon: '🌾', text: { en: 'Muslims introduced crops like coffee, citrus fruits, cotton, and sugar cane to Europe. Islamic agricultural revolution developed irrigation systems and crop rotation techniques that transformed medieval farming.', ar: 'أدخل المسلمون محاصيل كالقهوة والحمضيات والقطن وقصب السكر إلى أوروبا. طورت الثورة الزراعية الإسلامية أنظمة الري وتقنيات تناوب المحاصيل.', fr: 'Les musulmans ont introduit des cultures comme le café, les agrumes, le coton et la canne à sucre en Europe. La révolution agricole islamique a développé des systèmes d\'irrigation.' } },
];

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
