/**
 * Compact authoring source for the demo content pack.
 *
 * IMPORTANT: every paradigm, IPA transcription and Chinese gloss here is a
 * rule-derived / sample value with reviewStatus "auto-derived". The build script
 * expands these into the full JSON schema, but a Finnish linguist must verify
 * every form before production use. This file is intentionally kept small so
 * that grading and morphology can be reviewed line by line.
 *
 * n.forms = [gen, par, ine, ela, ill]  (nom is the lemma)
 * n.suffix = optional override for suffixes that do not follow the default
 *            vowel-harmony rules (e.g. -ttA partitive, -seen illative).
 */

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

export const WORD_SEED = [
  // ── A1 · group 1: places and objects ────────────────────────────────────
  { id: 'talo', lemma: 'talo', pos: 'noun', cefr: 'A1', topic: 'home', zh: '房子；房屋', en: 'house', ipa: '/ˈtɑlo/', motif: 'house', image: 'assets/illustrations/talo.png',
    n: { strong: 'talo-', weak: 'talo-', gradation: null, harmony: 'back', kotusType: 1, declensionClass: 'valo 型', forms: ['talon', 'taloa', 'talossa', 'talosta', 'taloon'], plural: 'talot' } },
  { id: 'kauppa', lemma: 'kauppa', pos: 'noun', cefr: 'A1', topic: 'shops-and-services', zh: '商店；店铺', en: 'shop, store', ipa: '/ˈkɑupːɑ/', motif: 'shop', image: 'assets/illustrations/kauppa.png',
    n: { strong: 'kauppa-', weak: 'kaupa-', gradation: 'pp~p', harmony: 'back', kotusType: 10, declensionClass: 'koira 型', forms: ['kaupan', 'kauppaa', 'kaupassa', 'kaupasta', 'kauppaan'], plural: 'kaupat' } },
  { id: 'katu', lemma: 'katu', pos: 'noun', cefr: 'A1', topic: 'travelling', zh: '街道', en: 'street', ipa: '/ˈkɑtu/', motif: 'street',
    n: { strong: 'katu-', weak: 'kadu-', gradation: 't~d', harmony: 'back', kotusType: 1, declensionClass: 'valo 型（带强弱变换）', forms: ['kadun', 'katua', 'kadussa', 'kadusta', 'katuun'], plural: 'kadut' } },
  { id: 'kirja', lemma: 'kirja', pos: 'noun', cefr: 'A1', topic: 'objects', zh: '书；书本', en: 'book', ipa: '/ˈkirjɑ/', motif: 'book',
    n: { strong: 'kirja-', weak: 'kirja-', gradation: null, harmony: 'back', kotusType: 9, declensionClass: 'kala 型', forms: ['kirjan', 'kirjaa', 'kirjassa', 'kirjasta', 'kirjaan'], plural: 'kirjat' } },
  { id: 'auto', lemma: 'auto', pos: 'noun', cefr: 'A1', topic: 'travelling', zh: '汽车', en: 'car', ipa: '/ˈɑuto/', motif: 'car',
    n: { strong: 'auto-', weak: 'auto-', gradation: null, harmony: 'back', kotusType: 1, declensionClass: 'valo 型', forms: ['auton', 'autoa', 'autossa', 'autosta', 'autoon'], plural: 'autot' } },

  // ── A1 · group 2: food and drink ────────────────────────────────────────
  { id: 'vesi', lemma: 'vesi', pos: 'noun', cefr: 'A1', topic: 'food', zh: '水', en: 'water', ipa: '/ˈʋesi/', motif: 'water',
    n: { strong: 'vesi-', weak: 'vede-', gradation: 't~d', harmony: 'front', kotusType: 27, declensionClass: 'vesi 型', forms: ['veden', 'vettä', 'vedessä', 'vedestä', 'veteen'], plural: 'vedet', suffix: { par: '-ttä', ill: '-Vn' } } },
  { id: 'kahvi', lemma: 'kahvi', pos: 'noun', cefr: 'A1', topic: 'food', zh: '咖啡', en: 'coffee', ipa: '/ˈkɑhʋi/', motif: 'coffee',
    n: { strong: 'kahvi-', weak: 'kahvi-', gradation: null, harmony: 'back', kotusType: 5, declensionClass: 'risti 型', forms: ['kahvin', 'kahvia', 'kahvissa', 'kahvista', 'kahviin'], plural: 'kahvit' } },
  { id: 'maito', lemma: 'maito', pos: 'noun', cefr: 'A1', topic: 'food', zh: '牛奶', en: 'milk', ipa: '/ˈmɑito/', motif: 'milk',
    n: { strong: 'maito-', weak: 'maido-', gradation: 't~d', harmony: 'back', kotusType: 1, declensionClass: 'valo 型（带强弱变换）', forms: ['maidon', 'maitoa', 'maidossa', 'maidosta', 'maitoon'], plural: 'maidot' } },
  { id: 'leipa', lemma: 'leipä', pos: 'noun', cefr: 'A1', topic: 'food', zh: '面包', en: 'bread', ipa: '/ˈleipæ/', motif: 'bread',
    n: { strong: 'leipä-', weak: 'leivä-', gradation: 'p~v', harmony: 'front', kotusType: 10, declensionClass: 'koira 型', forms: ['leivän', 'leipää', 'leivässä', 'leivästä', 'leipään'], plural: 'leivät' } },
  { id: 'ruoka', lemma: 'ruoka', pos: 'noun', cefr: 'A1', topic: 'food', zh: '食物；饭菜', en: 'food, meal', ipa: '/ˈruokɑ/', motif: 'food',
    n: { strong: 'ruoka-', weak: 'ruoa-', gradation: 'k~∅', harmony: 'back', kotusType: 9, declensionClass: 'kala 型（带强弱变换）', forms: ['ruoan', 'ruokaa', 'ruoassa', 'ruoasta', 'ruokaan'], plural: 'ruoat' } },

  // ── A1 · group 3: core verbs ────────────────────────────────────────────
  { id: 'olla', lemma: 'olla', pos: 'verb', cefr: 'A1', topic: 'actions', zh: '是；在；有', en: 'to be', ipa: '/ˈolːɑ/', motif: 'being',
    v: { verbType: 3, kotusType: null, infinitiveEnding: '-lla', presentStem: 'ole-', present1sg: 'olen', past3sg: 'oli', nutParticiple: 'ollut', irregular: true, note: '不规则动词，on / olen / olla 需单独记忆，不走 6 类规则派生' } },
  { id: 'puhua', lemma: 'puhua', pos: 'verb', cefr: 'A1', topic: 'actions', zh: '说；讲话', en: 'to speak', ipa: '/ˈpuhuɑ/', motif: 'speech', image: 'assets/illustrations/puhua.png',
    v: { verbType: 1, kotusType: 52, infinitiveEnding: '元音 + -a/-ä', presentStem: 'puhu-', present1sg: 'puhun', past3sg: 'puhui', nutParticiple: 'puhunut' } },
  { id: 'syoda', lemma: 'syödä', pos: 'verb', cefr: 'A1', topic: 'food', zh: '吃', en: 'to eat', ipa: '/ˈsyø̯dæ/', motif: 'eat',
    v: { verbType: 2, kotusType: 64, infinitiveEnding: '-da/-dä', presentStem: 'syö-', present1sg: 'syön', past3sg: 'söi', nutParticiple: 'syönyt' } },
  { id: 'tulla', lemma: 'tulla', pos: 'verb', cefr: 'A1', topic: 'actions', zh: '来；到来', en: 'to come', ipa: '/ˈtulːɑ/', motif: 'come',
    v: { verbType: 3, kotusType: 67, infinitiveEnding: '辅音 + -la/-na/-ra/-sta', presentStem: 'tule-', present1sg: 'tulen', past3sg: 'tuli', nutParticiple: 'tullut' } },
  { id: 'haluta', lemma: 'haluta', pos: 'verb', cefr: 'A1', topic: 'actions', zh: '想要；希望', en: 'to want', ipa: '/ˈhɑlutɑ/', motif: 'want',
    v: { verbType: 4, kotusType: 73, infinitiveEnding: '元音 + -ta/-tä', presentStem: 'halua-', present1sg: 'haluan', past3sg: 'halusi', nutParticiple: 'halunnut' } },

  // ── A2 · group 1: everyday verbs ────────────────────────────────────────
  { id: 'tarvita', lemma: 'tarvita', pos: 'verb', cefr: 'A2', topic: 'actions', zh: '需要', en: 'to need', ipa: '/ˈtɑrʋitɑ/', motif: 'need',
    v: { verbType: 5, kotusType: 69, infinitiveEnding: '-ita/-itä', presentStem: 'tarvitse-', present1sg: 'tarvitsen', past3sg: 'tarvitsi', nutParticiple: 'tarvinnut' } },
  { id: 'kysya', lemma: 'kysyä', pos: 'verb', cefr: 'A2', topic: 'communication', zh: '问；询问', en: 'to ask', ipa: '/ˈkysyæ/', motif: 'ask',
    v: { verbType: 1, kotusType: 52, infinitiveEnding: '元音 + -a/-ä', presentStem: 'kysy-', present1sg: 'kysyn', past3sg: 'kysyi', nutParticiple: 'kysynyt' } },
  { id: 'vastata', lemma: 'vastata', pos: 'verb', cefr: 'A2', topic: 'communication', zh: '回答；答复', en: 'to answer', ipa: '/ˈʋɑstɑtɑ/', motif: 'answer',
    v: { verbType: 4, kotusType: 73, infinitiveEnding: '元音 + -ta/-tä', presentStem: 'vastaa-', present1sg: 'vastaan', past3sg: 'vastasi', nutParticiple: 'vastannut' } },
  { id: 'asua', lemma: 'asua', pos: 'verb', cefr: 'A2', topic: 'home', zh: '居住；住在', en: 'to live (in)', ipa: '/ˈɑsuɑ/', motif: 'house',
    v: { verbType: 1, kotusType: 52, infinitiveEnding: '元音 + -a/-ä', presentStem: 'asu-', present1sg: 'asun', past3sg: 'asui', nutParticiple: 'asunut' } },
  { id: 'opiskella', lemma: 'opiskella', pos: 'verb', cefr: 'A2', topic: 'study', zh: '学习；求学', en: 'to study', ipa: '/ˈopiskelːɑ/', motif: 'school',
    v: { verbType: 3, kotusType: 67, infinitiveEnding: '辅音 + -la/-na/-ra/-sta', presentStem: 'opiskele-', present1sg: 'opiskelen', past3sg: 'opiskeli', nutParticiple: 'opiskellut' } },

  // ── A2 · group 2: people and time ───────────────────────────────────────
  { id: 'ystava', lemma: 'ystävä', pos: 'noun', cefr: 'A2', topic: 'people', zh: '朋友', en: 'friend', ipa: '/ˈystæʋæ/', motif: 'friend',
    n: { strong: 'ystävä-', weak: 'ystävä-', gradation: null, harmony: 'front', kotusType: 10, declensionClass: 'koira 型', forms: ['ystävän', 'ystävää', 'ystävässä', 'ystävästä', 'ystävään'], plural: 'ystävät' } },
  { id: 'perhe', lemma: 'perhe', pos: 'noun', cefr: 'A2', topic: 'people', zh: '家庭；家人', en: 'family', ipa: '/ˈperhe/', motif: 'family',
    n: { strong: 'perhe-', weak: 'perhe-', gradation: null, harmony: 'front', kotusType: 8, declensionClass: 'nalle 型', forms: ['perheen', 'perhettä', 'perheessä', 'perheestä', 'perheeseen'], plural: 'perheet', suffix: { par: '-ttä', ill: '-seen' } } },
  { id: 'aika', lemma: 'aika', pos: 'noun', cefr: 'A2', topic: 'time', zh: '时间', en: 'time', ipa: '/ˈɑikɑ/', motif: 'clock',
    n: { strong: 'aika-', weak: 'aja-', gradation: 'k~∅', harmony: 'back', kotusType: 9, declensionClass: 'kala 型（带强弱变换）', forms: ['ajan', 'aikaa', 'ajassa', 'ajasta', 'aikaan'], plural: 'ajat' } },
  { id: 'tyo', lemma: 'työ', pos: 'noun', cefr: 'A2', topic: 'work', zh: '工作；劳动', en: 'work, job', ipa: '/ˈtyø̯/', motif: 'work',
    n: { strong: 'työ-', weak: 'työ-', gradation: null, harmony: 'front', kotusType: 19, declensionClass: 'työ 型', forms: ['työn', 'työtä', 'työssä', 'työstä', 'työhön'], plural: 'työt', suffix: { par: '-tä', ill: '-hön' } } },
  { id: 'kaupunki', lemma: 'kaupunki', pos: 'noun', cefr: 'A2', topic: 'travelling', zh: '城市', en: 'city, town', ipa: '/ˈkɑupuŋki/', motif: 'city',
    n: { strong: 'kaupunki-', weak: 'kaupungi-', gradation: 'nk~ng', harmony: 'back', kotusType: 5, declensionClass: 'risti 型', forms: ['kaupungin', 'kaupunkia', 'kaupungissa', 'kaupungista', 'kaupunkiin'], plural: 'kaupungit' } },

  // ── B1 ──────────────────────────────────────────────────────────────────
  { id: 'kieli', lemma: 'kieli', pos: 'noun', cefr: 'B1', topic: 'language', zh: '语言；舌头', en: 'language, tongue', ipa: '/ˈkieli/', motif: 'language',
    n: { strong: 'kieli-', weak: 'kiele-', gradation: null, harmony: 'front', kotusType: 28, declensionClass: 'kieli 型', forms: ['kielen', 'kieltä', 'kielessä', 'kielestä', 'kieleen'], plural: 'kielet', suffix: { par: '-tä', ill: '-Vn' } } },
  { id: 'ihminen', lemma: 'ihminen', pos: 'noun', cefr: 'B1', topic: 'people', zh: '人；人类', en: 'human being', ipa: '/ˈihminen/', motif: 'person',
    n: { strong: 'ihminen-', weak: 'ihmise-', gradation: null, harmony: 'front', kotusType: 38, declensionClass: 'nainen 型', forms: ['ihmisen', 'ihmistä', 'ihmisessä', 'ihmisestä', 'ihmiseen'], plural: 'ihmiset', suffix: { par: '-tä', ill: '-seen' } } },
  { id: 'vuosi', lemma: 'vuosi', pos: 'noun', cefr: 'B1', topic: 'time', zh: '年；年份', en: 'year', ipa: '/ˈʋuosi/', motif: 'calendar',
    n: { strong: 'vuosi-', weak: 'vuode-', gradation: 't~d', harmony: 'back', kotusType: 27, declensionClass: 'vesi 型', forms: ['vuoden', 'vuotta', 'vuodessa', 'vuodesta', 'vuoteen'], plural: 'vuodet', suffix: { par: '-tta', ill: '-Vn' } } },
  { id: 'muistaa', lemma: 'muistaa', pos: 'verb', cefr: 'B1', topic: 'cognition', zh: '记得；记住', en: 'to remember', ipa: '/ˈmuistɑː/', motif: 'brain',
    v: { verbType: 1, kotusType: 53, infinitiveEnding: '元音 + -a/-ä（-aa）', presentStem: 'muista-', present1sg: 'muistan', past3sg: 'muisti', nutParticiple: 'muistanut' } },
  { id: 'kertoa', lemma: 'kertoa', pos: 'verb', cefr: 'B1', topic: 'communication', zh: '讲述；告诉', en: 'to tell', ipa: '/ˈkertoɑ/', motif: 'speech',
    v: { verbType: 1, kotusType: 52, infinitiveEnding: '元音 + -a/-ä', presentStem: 'kerro-', present1sg: 'kerron', past3sg: 'kertoi', nutParticiple: 'kertonut' } },

  // ── B1 · group 2: verb types 2-6 in one place ───────────────────────────
  { id: 'juoda', lemma: 'juoda', pos: 'verb', cefr: 'B1', topic: 'food', zh: '喝', en: 'to drink', ipa: '/ˈjuodɑ/', motif: 'water',
    v: { verbType: 2, kotusType: 64, infinitiveEnding: '-da/-dä', presentStem: 'juo-', present1sg: 'juon', past3sg: 'joi', nutParticiple: 'juonut' } },
  { id: 'nousta', lemma: 'nousta', pos: 'verb', cefr: 'B1', topic: 'actions', zh: '起身；上升', en: 'to rise, to get up', ipa: '/ˈnounstɑ/', motif: 'come',
    v: { verbType: 3, kotusType: 67, infinitiveEnding: '辅音 + -la/-na/-ra/-sta', presentStem: 'nouse-', present1sg: 'nousen', past3sg: 'nousi', nutParticiple: 'noussut' } },
  { id: 'tavata', lemma: 'tavata', pos: 'verb', cefr: 'B1', topic: 'people', zh: '遇见；会面', en: 'to meet', ipa: '/ˈtɑʋɑtɑ/', motif: 'friend',
    v: { verbType: 4, kotusType: 73, infinitiveEnding: '元音 + -ta/-tä', presentStem: 'tapaa-', present1sg: 'tapaan', past3sg: 'tapasi', nutParticiple: 'tavannut' } },
  { id: 'valita', lemma: 'valita', pos: 'verb', cefr: 'B1', topic: 'cognition', zh: '选择', en: 'to choose', ipa: '/ˈʋɑlitɑ/', motif: 'tools',
    v: { verbType: 5, kotusType: 69, infinitiveEnding: '-ita/-itä', presentStem: 'valitse-', present1sg: 'valitsen', past3sg: 'valitsi', nutParticiple: 'valinnut' } },
  { id: 'vanheta', lemma: 'vanheta', pos: 'verb', cefr: 'B1', topic: 'time', zh: '变老；老化', en: 'to age, to get older', ipa: '/ˈʋɑnhetɑ/', motif: 'calendar',
    v: { verbType: 6, kotusType: 72, infinitiveEnding: '-eta/-etä', presentStem: 'vanhene-', present1sg: 'vanhenen', past3sg: 'vanheni', nutParticiple: 'vanhennut' } },

  // ── B2 ──────────────────────────────────────────────────────────────────
  { id: 'mahdollisuus', lemma: 'mahdollisuus', pos: 'noun', cefr: 'B2', topic: 'society', zh: '可能性；机会', en: 'opportunity, possibility', ipa: '/ˈmɑhdolːisuːs/', motif: 'idea',
    n: { strong: 'mahdollisuus-', weak: 'mahdollisuude-', gradation: 's~d', harmony: 'back', kotusType: 40, declensionClass: 'kalleus 型', forms: ['mahdollisuuden', 'mahdollisuutta', 'mahdollisuudessa', 'mahdollisuudesta', 'mahdollisuuteen'], plural: 'mahdollisuudet', suffix: { par: '-tta', ill: '-seen' } } },
  { id: 'tutkimus', lemma: 'tutkimus', pos: 'noun', cefr: 'B2', topic: 'study', zh: '研究；调查', en: 'research, study', ipa: '/ˈtutkimus/', motif: 'research',
    n: { strong: 'tutkimus-', weak: 'tutkimukse-', gradation: 's~ks', harmony: 'back', kotusType: 39, declensionClass: 'vastaus 型', forms: ['tutkimuksen', 'tutkimusta', 'tutkimuksessa', 'tutkimuksesta', 'tutkimukseen'], plural: 'tutkimukset', suffix: { par: '-ta', ill: '-seen' } } },
  { id: 'yhteiskunta', lemma: 'yhteiskunta', pos: 'noun', cefr: 'B2', topic: 'society', zh: '社会', en: 'society', ipa: '/ˈyhteiskuntɑ/', motif: 'globe',
    n: { strong: 'yhteiskunta-', weak: 'yhteiskunna-', gradation: 'nt~nn', harmony: 'back', kotusType: 10, declensionClass: 'koira 型', forms: ['yhteiskunnan', 'yhteiskuntaa', 'yhteiskunnassa', 'yhteiskunnasta', 'yhteiskuntaan'], plural: 'yhteiskunnat' } },
  { id: 'vaikutus', lemma: 'vaikutus', pos: 'noun', cefr: 'B2', topic: 'society', zh: '影响；作用', en: 'effect, impact', ipa: '/ˈʋɑikutus/', motif: 'chart',
    n: { strong: 'vaikutus-', weak: 'vaikutukse-', gradation: 's~ks', harmony: 'back', kotusType: 39, declensionClass: 'vastaus 型', forms: ['vaikutuksen', 'vaikutusta', 'vaikutuksessa', 'vaikutuksesta', 'vaikutukseen'], plural: 'vaikutukset', suffix: { par: '-ta', ill: '-seen' } } },
  { id: 'arvioida', lemma: 'arvioida', pos: 'verb', cefr: 'B2', topic: 'cognition', zh: '评估；评价', en: 'to evaluate, to assess', ipa: '/ˈɑrʋioidɑ/', motif: 'chart',
    v: { verbType: 2, kotusType: 62, infinitiveEnding: '-da/-dä', presentStem: 'arvioi-', present1sg: 'arvioin', past3sg: 'arvioi', nutParticiple: 'arvioinut' } },

  // ── C1 ──────────────────────────────────────────────────────────────────
  { id: 'kasite', lemma: 'käsite', pos: 'noun', cefr: 'C1', topic: 'abstract', zh: '概念', en: 'concept', ipa: '/ˈkæsite/', motif: 'idea',
    n: { strong: 'käsite-', weak: 'käsitte-', gradation: 't~tt', harmony: 'front', kotusType: 8, declensionClass: 'nalle 型', forms: ['käsitteen', 'käsitettä', 'käsitteessä', 'käsitteestä', 'käsitteeseen'], plural: 'käsitteet', suffix: { par: '-ttä', ill: '-seen' } } },
  { id: 'ilmio', lemma: 'ilmiö', pos: 'noun', cefr: 'C1', topic: 'abstract', zh: '现象', en: 'phenomenon', ipa: '/ˈilmiø/', motif: 'globe',
    n: { strong: 'ilmiö-', weak: 'ilmiö-', gradation: null, harmony: 'front', kotusType: 19, declensionClass: 'työ 型', forms: ['ilmiön', 'ilmiötä', 'ilmiössä', 'ilmiöstä', 'ilmiöön'], plural: 'ilmiöt', suffix: { par: '-tä', ill: '-Vn' } } },
  { id: 'nakokulma', lemma: 'näkökulma', pos: 'noun', cefr: 'C1', topic: 'abstract', zh: '视角；角度', en: 'point of view', ipa: '/ˈnækøkulmɑ/', motif: 'eye',
    n: { strong: 'näkökulma-', weak: 'näkökulma-', gradation: null, harmony: 'front', kotusType: 10, declensionClass: 'koira 型（复合词按首部和谐）', forms: ['näkökulman', 'näkökulmaa', 'näkökulmassa', 'näkökulmasta', 'näkökulmaan'], plural: 'näkökulmat', suffix: { par: '-a', ine: '-ssa', ela: '-sta' } } },
  { id: 'perustella', lemma: 'perustella', pos: 'verb', cefr: 'C1', topic: 'communication', zh: '论证；说明理由', en: 'to justify, to give reasons', ipa: '/ˈperustelːɑ/', motif: 'speech',
    v: { verbType: 3, kotusType: 67, infinitiveEnding: '辅音 + -la/-na/-ra/-sta', presentStem: 'perustele-', present1sg: 'perustelen', past3sg: 'perusteli', nutParticiple: 'perustellut' } },
  { id: 'pohtia', lemma: 'pohtia', pos: 'verb', cefr: 'C1', topic: 'cognition', zh: '深思；琢磨', en: 'to ponder, to reflect', ipa: '/ˈpohtiɑ/', motif: 'brain',
    v: { verbType: 1, kotusType: 52, infinitiveEnding: '元音 + -a/-ä', presentStem: 'pohdi-', present1sg: 'pohdin', past3sg: 'pohti', nutParticiple: 'pohtinut' } },

  // ── C2 ──────────────────────────────────────────────────────────────────
  { id: 'vivahteinen', lemma: 'vivahteinen', pos: 'adjective', cefr: 'C2', topic: 'abstract', zh: '有细微差别的', en: 'nuanced', ipa: '/ˈʋiʋɑhteinen/', motif: 'idea',
    n: { strong: 'vivahteinen-', weak: 'vivahteise-', gradation: null, harmony: 'back', kotusType: 38, declensionClass: 'nainen 型', forms: ['vivahteisen', 'vivahteista', 'vivahteisessa', 'vivahteisesta', 'vivahteiseen'], plural: 'vivahteiset', suffix: { par: '-ta', ill: '-seen' } } },
  { id: 'monitulkintainen', lemma: 'monitulkintainen', pos: 'adjective', cefr: 'C2', topic: 'abstract', zh: '可作多种解读的', en: 'open to multiple interpretations', ipa: '/ˈmonitulkintɑinen/', motif: 'eye',
    n: { strong: 'monitulkintainen-', weak: 'monitulkintaise-', gradation: null, harmony: 'back', kotusType: 38, declensionClass: 'nainen 型', forms: ['monitulkintaisen', 'monitulkintaista', 'monitulkintaisessa', 'monitulkintaisesta', 'monitulkintaiseen'], plural: 'monitulkintaiset', suffix: { par: '-ta', ill: '-seen' } } },
  { id: 'yhteisymmarrys', lemma: 'yhteisymmärrys', pos: 'noun', cefr: 'C2', topic: 'society', zh: '共识；相互理解', en: 'mutual understanding, consensus', ipa: '/ˈyhteisymːærːys/', motif: 'people',
    n: { strong: 'yhteisymmärrys-', weak: 'yhteisymmärrykse-', gradation: 's~ks', harmony: 'front', kotusType: 39, declensionClass: 'vastaus 型', forms: ['yhteisymmärryksen', 'yhteisymmärrystä', 'yhteisymmärryksessä', 'yhteisymmärryksestä', 'yhteisymmärrykseen'], plural: 'yhteisymmärrykset', suffix: { par: '-tä', ill: '-seen' } } },
  { id: 'kriittinen', lemma: 'kriittinen', pos: 'adjective', cefr: 'C2', topic: 'abstract', zh: '批判性的', en: 'critical', ipa: '/ˈkriːtːinen/', motif: 'eye',
    n: { strong: 'kriittinen-', weak: 'kriittise-', gradation: null, harmony: 'front', kotusType: 38, declensionClass: 'nainen 型', forms: ['kriittisen', 'kriittistä', 'kriittisessä', 'kriittisestä', 'kriittiseen'], plural: 'kriittiset', suffix: { par: '-tä', ill: '-seen' } } },
  { id: 'soveltaa', lemma: 'soveltaa', pos: 'verb', cefr: 'C2', topic: 'cognition', zh: '应用；运用', en: 'to apply, to adapt', ipa: '/ˈsoʋeltɑː/', motif: 'tools',
    v: { verbType: 1, kotusType: 53, infinitiveEnding: '元音 + -a/-ä（-aa）', presentStem: 'sovella-', present1sg: 'sovellan', past3sg: 'sovelsi', nutParticiple: 'soveltanut' } },
]

/**
 * Sentences. gloss[].senseId=null means "not in the graded word list yet";
 * grammarPoints drive the build-time CEFR gate. A1 sentences may only use
 * A1 cases and A1 senses. Higher-level sentence packs are still being written.
 */
export const SENTENCE_SEED = [
  { id: 'a1-s01', fi: 'Kirja on talossa.', zh: '书在房子里。', en: 'The book is in the house.', cefr: 'A1', grammarPoints: ['ine'],
    gloss: [{ token: 'Kirja', senseId: 'kirja-1' }, { token: 'on', senseId: 'olla-1' }, { token: 'talossa', senseId: 'talo-1', caseForm: 'ine' }] },
  { id: 'a1-s02', fi: 'Minä haluan kirjan.', zh: '我想要一本书。', en: 'I want a book.', cefr: 'A1', grammarPoints: ['gen'],
    gloss: [{ token: 'Minä', senseId: null }, { token: 'haluan', senseId: 'haluta-1' }, { token: 'kirjan', senseId: 'kirja-1', caseForm: 'gen' }] },
  { id: 'a1-s03', fi: 'Minä juon kahvia.', zh: '我喝咖啡。', en: 'I drink coffee.', cefr: 'A1', grammarPoints: ['par'],
    gloss: [{ token: 'Minä', senseId: null }, { token: 'juon', senseId: null }, { token: 'kahvia', senseId: 'kahvi-1', caseForm: 'par' }] },
  { id: 'a1-s04', fi: 'Minä olen talossa.', zh: '我在房子里。', en: 'I am in the house.', cefr: 'A1', grammarPoints: ['ine'],
    gloss: [{ token: 'Minä', senseId: null }, { token: 'olen', senseId: 'olla-1' }, { token: 'talossa', senseId: 'talo-1', caseForm: 'ine' }] },
  { id: 'a1-s05', fi: 'Minä juon vettä.', zh: '我喝水。', en: 'I drink water.', cefr: 'A1', grammarPoints: ['par'],
    gloss: [{ token: 'Minä', senseId: null }, { token: 'juon', senseId: null }, { token: 'vettä', senseId: 'vesi-1', caseForm: 'par' }] },
  { id: 'a1-s06', fi: 'Kirja on autossa.', zh: '书在车里。', en: 'The book is in the car.', cefr: 'A1', grammarPoints: ['ine'],
    gloss: [{ token: 'Kirja', senseId: 'kirja-1' }, { token: 'on', senseId: 'olla-1' }, { token: 'autossa', senseId: 'auto-1', caseForm: 'ine' }] },
  { id: 'a1-s07', fi: 'Minä tulen kaupasta.', zh: '我从商店来。', en: 'I come from the shop.', cefr: 'A1', grammarPoints: ['ela'],
    gloss: [{ token: 'Minä', senseId: null }, { token: 'tulen', senseId: 'tulla-1' }, { token: 'kaupasta', senseId: 'kauppa-1', caseForm: 'ela' }] },
  { id: 'a1-s08', fi: 'Minä menen taloon.', zh: '我走进房子。', en: 'I go into the house.', cefr: 'A1', grammarPoints: ['ill'],
    gloss: [{ token: 'Minä', senseId: null }, { token: 'menen', senseId: null }, { token: 'taloon', senseId: 'talo-1', caseForm: 'ill' }] },
  { id: 'a1-s09', fi: 'Haluan leipää.', zh: '我想要面包。', en: 'I want some bread.', cefr: 'A1', grammarPoints: ['par'],
    gloss: [{ token: 'Haluan', senseId: 'haluta-1' }, { token: 'leipää', senseId: 'leipa-1', caseForm: 'par' }] },
  { id: 'a1-s10', fi: 'Puhun kirjasta.', zh: '我在谈这本书。', en: 'I am talking about the book.', cefr: 'A1', grammarPoints: ['ela'],
    gloss: [{ token: 'Puhun', senseId: 'puhua-1' }, { token: 'kirjasta', senseId: 'kirja-1', caseForm: 'ela' }] },
  { id: 'a2-s01', fi: 'Talo on kadulla.', zh: '房子在街上。', en: 'The house is on the street.', cefr: 'A2', grammarPoints: ['ade'],
    gloss: [{ token: 'Talo', senseId: 'talo-1' }, { token: 'on', senseId: 'olla-1' }, { token: 'kadulla', senseId: 'katu-1', caseForm: 'ade' }] },
  { id: 'a2-s02', fi: 'Minä asun kaupungissa.', zh: '我住在城里。', en: 'I live in the city.', cefr: 'A2', grammarPoints: ['ine'],
    gloss: [{ token: 'Minä', senseId: null }, { token: 'asun', senseId: 'asua-1' }, { token: 'kaupungissa', senseId: 'kaupunki-1', caseForm: 'ine' }] },
  { id: 'a2-s03', fi: 'Ystävä tulee kaupasta.', zh: '朋友从商店来。', en: 'A friend comes from the shop.', cefr: 'A2', grammarPoints: ['ela'],
    gloss: [{ token: 'Ystävä', senseId: 'ystava-1' }, { token: 'tulee', senseId: 'tulla-1' }, { token: 'kaupasta', senseId: 'kauppa-1', caseForm: 'ela' }] },
  { id: 'a2-s04', fi: 'Minä vastaan ystävälle.', zh: '我回答朋友。', en: 'I answer my friend.', cefr: 'A2', grammarPoints: ['all'],
    gloss: [{ token: 'Minä', senseId: null }, { token: 'vastaan', senseId: 'vastata-1' }, { token: 'ystävälle', senseId: 'ystava-1', caseForm: 'all' }] },
  { id: 'a2-s05', fi: 'Tarvitsen aikaa.', zh: '我需要时间。', en: 'I need time.', cefr: 'A2', grammarPoints: ['par'],
    gloss: [{ token: 'Tarvitsen', senseId: 'tarvita-1' }, { token: 'aikaa', senseId: 'aika-1', caseForm: 'par' }] },

  // ── B1 · sample sentences ───────────────────────────────────────────────
  { id: 'b1-s01', fi: 'Minä muistan kielen.', zh: '我记得这门语言。', en: 'I remember the language.', cefr: 'B1', grammarPoints: ['gen'],
    gloss: [{ token: 'Minä', senseId: null }, { token: 'muistan', senseId: 'muistaa-1' }, { token: 'kielen', senseId: 'kieli-1', caseForm: 'gen' }] },
  { id: 'b1-s02', fi: 'Ihminen kertoo vuodesta.', zh: '这个人讲述这一年。', en: 'The person tells about the year.', cefr: 'B1', grammarPoints: ['ela'],
    gloss: [{ token: 'Ihminen', senseId: 'ihminen-1' }, { token: 'kertoo', senseId: 'kertoa-1' }, { token: 'vuodesta', senseId: 'vuosi-1', caseForm: 'ela' }] },
  { id: 'b1-s03', fi: 'Vuosi on pitkä.', zh: '这一年很漫长。', en: 'The year is long.', cefr: 'B1', grammarPoints: [],
    gloss: [{ token: 'Vuosi', senseId: 'vuosi-1' }, { token: 'on', senseId: 'olla-1' }, { token: 'pitkä', senseId: null }] },
  { id: 'b1-s04', fi: 'Minä valitsen kirjan.', zh: '我选一本书。', en: 'I choose a book.', cefr: 'B1', grammarPoints: ['gen'],
    gloss: [{ token: 'Minä', senseId: null }, { token: 'valitsen', senseId: 'valita-1' }, { token: 'kirjan', senseId: 'kirja-1', caseForm: 'gen' }] },
  { id: 'b1-s05', fi: 'Ystävä vanhenee.', zh: '朋友渐渐变老。', en: 'The friend is getting older.', cefr: 'B1', grammarPoints: [],
    gloss: [{ token: 'Ystävä', senseId: 'ystava-1' }, { token: 'vanhenee', senseId: 'vanheta-1' }] },

  // ── B2 · sample sentences ───────────────────────────────────────────────
  { id: 'b2-s01', fi: 'Tutkimus on mahdollisuus.', zh: '这项研究是一个机会。', en: 'The study is an opportunity.', cefr: 'B2', grammarPoints: [],
    gloss: [{ token: 'Tutkimus', senseId: 'tutkimus-1' }, { token: 'on', senseId: 'olla-1' }, { token: 'mahdollisuus', senseId: 'mahdollisuus-1' }] },
  { id: 'b2-s02', fi: 'Minä arvioin vaikutusta.', zh: '我在评估影响。', en: 'I am assessing the impact.', cefr: 'B2', grammarPoints: ['par'],
    gloss: [{ token: 'Minä', senseId: null }, { token: 'arvioin', senseId: 'arvioida-1' }, { token: 'vaikutusta', senseId: 'vaikutus-1', caseForm: 'par' }] },
  { id: 'b2-s03', fi: 'Yhteiskunta muuttuu.', zh: '社会在变化。', en: 'Society is changing.', cefr: 'B2', grammarPoints: [],
    gloss: [{ token: 'Yhteiskunta', senseId: 'yhteiskunta-1' }, { token: 'muuttuu', senseId: null }] },
  { id: 'b2-s04', fi: 'Vaikutus on suuri.', zh: '影响很大。', en: 'The impact is significant.', cefr: 'B2', grammarPoints: [],
    gloss: [{ token: 'Vaikutus', senseId: 'vaikutus-1' }, { token: 'on', senseId: 'olla-1' }, { token: 'suuri', senseId: null }] },
  { id: 'b2-s05', fi: 'Mahdollisuus on tutkimuksessa.', zh: '机会存在于这项研究中。', en: 'The opportunity lies in the study.', cefr: 'B2', grammarPoints: ['ine'],
    gloss: [{ token: 'Mahdollisuus', senseId: 'mahdollisuus-1' }, { token: 'on', senseId: 'olla-1' }, { token: 'tutkimuksessa', senseId: 'tutkimus-1', caseForm: 'ine' }] },

  // ── C1 · sample sentences ───────────────────────────────────────────────
  { id: 'c1-s01', fi: 'Minä pohdin käsitettä.', zh: '我在琢磨这个概念。', en: 'I am reflecting on the concept.', cefr: 'C1', grammarPoints: ['par'],
    gloss: [{ token: 'Minä', senseId: null }, { token: 'pohdin', senseId: 'pohtia-1' }, { token: 'käsitettä', senseId: 'kasite-1', caseForm: 'par' }] },
  { id: 'c1-s02', fi: 'Ilmiö on monimutkainen.', zh: '这一现象很复杂。', en: 'The phenomenon is complex.', cefr: 'C1', grammarPoints: [],
    gloss: [{ token: 'Ilmiö', senseId: 'ilmio-1' }, { token: 'on', senseId: 'olla-1' }, { token: 'monimutkainen', senseId: null }] },
  { id: 'c1-s03', fi: 'Näkökulma on tärkeä.', zh: '视角很重要。', en: 'The point of view matters.', cefr: 'C1', grammarPoints: [],
    gloss: [{ token: 'Näkökulma', senseId: 'nakokulma-1' }, { token: 'on', senseId: 'olla-1' }, { token: 'tärkeä', senseId: null }] },
  { id: 'c1-s04', fi: 'Minä perustelen vastausta.', zh: '我为这个回答说明理由。', en: 'I justify the answer.', cefr: 'C1', grammarPoints: ['par'],
    gloss: [{ token: 'Minä', senseId: null }, { token: 'perustelen', senseId: 'perustella-1' }, { token: 'vastausta', senseId: null, caseForm: 'par' }] },
  { id: 'c1-s05', fi: 'Käsite on ilmiössä.', zh: '概念体现在现象之中。', en: 'The concept is present in the phenomenon.', cefr: 'C1', grammarPoints: ['ine'],
    gloss: [{ token: 'Käsite', senseId: 'kasite-1' }, { token: 'on', senseId: 'olla-1' }, { token: 'ilmiössä', senseId: 'ilmio-1', caseForm: 'ine' }] },

  // ── C2 · sample sentences ───────────────────────────────────────────────
  { id: 'c2-s01', fi: 'Minä sovellan käsitettä.', zh: '我把这个概念加以运用。', en: 'I apply the concept.', cefr: 'C2', grammarPoints: ['par'],
    gloss: [{ token: 'Minä', senseId: null }, { token: 'sovellan', senseId: 'soveltaa-1' }, { token: 'käsitettä', senseId: 'kasite-1', caseForm: 'par' }] },
  { id: 'c2-s02', fi: 'Vastaus on monitulkintainen.', zh: '这个回答可作多种解读。', en: 'The answer is open to multiple interpretations.', cefr: 'C2', grammarPoints: [],
    gloss: [{ token: 'Vastaus', senseId: null }, { token: 'on', senseId: 'olla-1' }, { token: 'monitulkintainen', senseId: 'monitulkintainen-1' }] },
  { id: 'c2-s03', fi: 'Yhteisymmärrys on tärkeää.', zh: '达成共识很重要。', en: 'Mutual understanding is important.', cefr: 'C2', grammarPoints: ['par'],
    gloss: [{ token: 'Yhteisymmärrys', senseId: 'yhteisymmarrys-1' }, { token: 'on', senseId: 'olla-1' }, { token: 'tärkeää', senseId: null, caseForm: 'par' }] },
  { id: 'c2-s04', fi: 'Minä olen kriittinen.', zh: '我持批判态度。', en: 'I take a critical stance.', cefr: 'C2', grammarPoints: [],
    gloss: [{ token: 'Minä', senseId: null }, { token: 'olen', senseId: 'olla-1' }, { token: 'kriittinen', senseId: 'kriittinen-1' }] },
  { id: 'c2-s05', fi: 'Kieli on vivahteinen.', zh: '语言充满细微差别。', en: 'Language is nuanced.', cefr: 'C2', grammarPoints: [],
    gloss: [{ token: 'Kieli', senseId: 'kieli-1' }, { token: 'on', senseId: 'olla-1' }, { token: 'vivahteinen', senseId: 'vivahteinen-1' }] },
]

/** Hand-authored group titles; anything missing falls back to "第 N 组". */
export const GROUP_TITLES = {
  'A1-W-01': '生活场所与物件', 'A1-W-02': '饮食', 'A1-W-03': '常用动词',
  'A1-S-01': 'A1 日常句 · 上', 'A1-S-02': 'A1 日常句 · 下',
  'A2-W-01': '日常动作', 'A2-W-02': '人与时间', 'A2-S-01': 'A2 场景句',
  'B1-W-01': '语言与思维', 'B1-W-02': '动词类型 2–6', 'B1-S-01': 'B1 叙述句',
  'B2-W-01': '社会与研究', 'B2-S-01': 'B2 论述句',
  'C1-W-01': '抽象概念', 'C1-S-01': 'C1 抽象句',
  'C2-W-01': '精细表达', 'C2-S-01': 'C2 精微句',
}
