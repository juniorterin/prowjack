const fs = require('fs');
const path = require('path');
const base = 'C:/Users/dssds/Desktop/Trabalho/prowjack/scripts/seed-data';

const fills = {
  'genre_giallo': [
    {title:'Forbidden Photos of a Lady Above Suspicion',year:1970,imdbId:'tt0065760'},
    {title:'Byleth',year:1972,imdbId:'tt0068293'},
  ],
  'genre_folk_horror': [
    {title:'Errementari',year:2017,imdbId:'tt6862916'},
    {title:'The Reflecting Skin',year:1990,imdbId:'tt0100378'},
    {title:'Ravenous',year:1999,imdbId:'tt0129332'},
    {title:'The Conjuring',year:2013,imdbId:'tt1457767'},
    {title:'Insidious',year:2010,imdbId:'tt1591095'},
  ],
  'genre_body_horror': [
    {title:'The Sadness',year:2021,imdbId:'tt13901654'},
  ],
  'genre_cosmic_horror': [
    {title:'Await Further Instructions',year:2018,imdbId:'tt6277924'},
    {title:'Sputnik',year:2020,imdbId:'tt11042808'},
    {title:'Come True',year:2020,imdbId:'tt9340860'},
    {title:'Synchronic',year:2019,imdbId:'tt8880186'},
    {title:'Hereditary',year:2018,imdbId:'tt7784604'},
    {title:'Possessor',year:2020,imdbId:'tt5765844'},
    {title:'Titane',year:2021,imdbId:'tt10944760'},
  ],
  'genre_psychological_horror': [
    {title:'Cure',year:1997,imdbId:'tt0119008'},
    {title:'Suicide Club',year:2001,imdbId:'tt0349588'},
  ],
  'concept_dreamlike': [
    {title:'Meshes of the Afternoon',year:1943,imdbId:'tt0036164'},
  ],
  'concept_melancholic': [
    {title:'Fanny and Alexander',year:1982,imdbId:'tt0083922'},
    {title:'The Best Intentions',year:1992,imdbId:'tt0103873'},
    {title:'Private Confessions',year:1996,imdbId:'tt0117368'},
    {title:'Sunday\'s Children',year:1992,imdbId:'tt0105584'},
    {title:'Summer with Monika',year:1953,imdbId:'tt0046162'},
    {title:'The Virgin Spring',year:1960,imdbId:'tt0054319'},
    {title:'Through a Glass Darkly',year:1961,imdbId:'tt0055499'},
    {title:'Winter Light',year:1963,imdbId:'tt0057732'},
    {title:'The Silence',year:1963,imdbId:'tt0057611'},
    {title:'Face to Face',year:1976,imdbId:'tt0074367'},
    {title:'Autumn Sonata',year:1978,imdbId:'tt0077711'},
  ],
  'concept_road_movies': [
    {title:'Duel',year:1971,imdbId:'tt0067023'},
    {title:'Scarecrow',year:1973,imdbId:'tt0070564'},
    {title:'Harry and Tonto',year:1974,imdbId:'tt0071540'},
    {title:'Boxcar Bertha',year:1972,imdbId:'tt0068235'},
    {title:'Electra Glide in Blue',year:1973,imdbId:'tt0069902'},
    {title:'It Happened One Night',year:1934,imdbId:'tt0025316'},
    {title:'Thunderbolt and Lightfoot',year:1974,imdbId:'tt0072288'},
    {title:'Locke',year:2013,imdbId:'tt2692904'},
    {title:'Night on Earth',year:1991,imdbId:'tt0102536'},
  ],
  'concept_slow_cinema': [
    {title:'Landscape in the Mist',year:1988,imdbId:'tt0095657'},
    {title:'Eternity and a Day',year:1998,imdbId:'tt0169546'},
    {title:'Ulysses Gaze',year:1995,imdbId:'tt0114880'},
    {title:'L\'Argent',year:1983,imdbId:'tt0085404'},
    {title:'Lancelot du Lac',year:1974,imdbId:'tt0071783'},
    {title:'Diary of a Country Priest',year:1951,imdbId:'tt0043283'},
    {title:'Ordet',year:1955,imdbId:'tt0048374'},
    {title:'Day of Wrath',year:1943,imdbId:'tt0035854'},
    {title:'Gertrud',year:1964,imdbId:'tt0058119'},
    {title:'Rosetta',year:1999,imdbId:'tt0200072'},
    {title:'Two Days One Night',year:2014,imdbId:'tt3046780'},
    {title:'Au Hasard Balthazar',year:1966,imdbId:'tt0060138'},
  ],
  'concept_uncomfortable': [
    {title:'Happiness',year:1998,imdbId:'tt0147612'},
    {title:'Hard Candy',year:2005,imdbId:'tt0424136'},
    {title:'Mysterious Skin',year:2004,imdbId:'tt0370986'},
    {title:'Capernaum',year:2018,imdbId:'tt8267604'},
    {title:'Atlantics',year:2019,imdbId:'tt10649120'},
    {title:'The Past',year:2013,imdbId:'tt2347602'},
  ],
  'concept_urban_loneliness': [
    {title:'Shame',year:2011,imdbId:'tt1723811'},
    {title:'Her',year:2013,imdbId:'tt1798709'},
    {title:'A Ghost Story',year:2017,imdbId:'tt6265828'},
    {title:'An Elephant Sitting Still',year:2018,imdbId:'tt7456730'},
    {title:'American Honey',year:2016,imdbId:'tt3734620'},
    {title:'Short Term 12',year:2013,imdbId:'tt2370248'},
    {title:'Fish Tank',year:2009,imdbId:'tt1232776'},
    {title:'Half Nelson',year:2006,imdbId:'tt0468489'},
    {title:'Goodbye Solo',year:2008,imdbId:'tt1168110'},
  ],
  'mindbending': [
    {title:'Lost Highway',year:1997,imdbId:'tt0116922'},
    {title:'The Science of Sleep',year:2006,imdbId:'tt0354899'},
    {title:'Inland Empire',year:2006,imdbId:'tt0460829'},
    {title:'Predestination',year:2014,imdbId:'tt2397535'},
    {title:'Triangle',year:2009,imdbId:'tt1187064'},
    {title:'The Butterfly Effect',year:2004,imdbId:'tt0289879'},
    {title:'Timecrimes',year:2007,imdbId:'tt0480669'},
    {title:'Jacob\'s Ladder',year:1990,imdbId:'tt0099871'},
    {title:'Black Swan',year:2010,imdbId:'tt0947798'},
    {title:'Fight Club',year:1999,imdbId:'tt0137523'},
    {title:'I\'m Thinking of Ending Things',year:2020,imdbId:'tt7939766'},
    {title:'The Fountain',year:2006,imdbId:'tt0414993'},
    {title:'Pi',year:1998,imdbId:'tt0138704'},
    {title:'12 Monkeys',year:1995,imdbId:'tt0114746'},
    {title:'Brazil',year:1985,imdbId:'tt0088846'},
    {title:'A Scanner Darkly',year:2006,imdbId:'tt0405296'},
    {title:'Cube',year:1997,imdbId:'tt0123755'},
    {title:'Strange Days',year:1995,imdbId:'tt0114558'},
    {title:'The Game',year:1997,imdbId:'tt0119174'},
    {title:'Adaptation',year:2002,imdbId:'tt0268126'},
  ],
  'hidden_gems_world': [
    {title:'Come and See',year:1985,imdbId:'tt0091251'},
    {title:'Andrei Rublev',year:1966,imdbId:'tt0060107'},
    {title:'Sansho the Bailiff',year:1954,imdbId:'tt0047396'},
    {title:'Gate of Hell',year:1953,imdbId:'tt0045818'},
    {title:'Yaaba',year:1989,imdbId:'tt0098644'},
    {title:'Moolaade',year:2004,imdbId:'tt0383076'},
    {title:'Headhunters',year:2011,imdbId:'tt1614154'},
    {title:'The Hunt',year:2012,imdbId:'tt2106476'},
    {title:'The Celebration',year:1998,imdbId:'tt0154021'},
    {title:'Troll Hunter',year:2010,imdbId:'tt1740707'},
    {title:'Death of Mr Lazarescu',year:2005,imdbId:'tt0456016'},
    {title:'Harakiri',year:1962,imdbId:'tt0056058'},
    {title:'Beanpole',year:2019,imdbId:'tt9570172'},
    {title:'Oslo 31 August',year:2011,imdbId:'tt1742656'},
    {title:'Sieranevada',year:2016,imdbId:'tt4965546'},
    {title:'Bad Luck Banging',year:2021,imdbId:'tt13578922'},
    {title:'The Human Condition',year:1959,imdbId:'tt0052787'},
    {title:'Life of Oharu',year:1952,imdbId:'tt0044710'},
  ],
  'criterion_horror': [
    {title:'Nosferatu',year:1922,imdbId:'tt0013442'},
    {title:'The Cabinet of Dr Caligari',year:1920,imdbId:'tt0010323'},
    {title:'Frankenstein',year:1931,imdbId:'tt0021884'},
    {title:'Bride of Frankenstein',year:1935,imdbId:'tt0026138'},
  ],
  'criterion_japan': [
    {title:'Hidden Fortress',year:1958,imdbId:'tt0051808'},
    {title:'One Wonderful Sunday',year:1947,imdbId:'tt0039707'},
  ],
  'criterion_noir': [
    {title:'The Big Heat',year:1953,imdbId:'tt0045455'},
    {title:'Detour',year:1945,imdbId:'tt0037638'},
    {title:'Scarlet Street',year:1945,imdbId:'tt0038028'},
    {title:'Murder My Sweet',year:1944,imdbId:'tt0037077'},
    {title:'Body and Soul',year:1947,imdbId:'tt0039219'},
    {title:'Brute Force',year:1947,imdbId:'tt0039249'},
    {title:'Force of Evil',year:1948,imdbId:'tt0040366'},
    {title:'The Asphalt Jungle',year:1950,imdbId:'tt0042182'},
  ],
};

for (const [f, adds] of Object.entries(fills)) {
  const fp = path.join(base, f + '.json');
  const raw = JSON.parse(fs.readFileSync(fp, 'utf8'));
  // deduplicate existing entries first
  const seen = new Set();
  const deduped = raw.filter(x => { if (seen.has(x.imdbId)) return false; seen.add(x.imdbId); return true; });
  // add new ones
  for (const a of adds) {
    if (!seen.has(a.imdbId)) { deduped.push(a); seen.add(a.imdbId); }
  }
  fs.writeFileSync(fp, JSON.stringify(deduped, null, 2));
  const ok = seen.size >= 100 ? 'OK' : 'NEEDS MORE(' + (100 - seen.size) + ')';
  console.log(f + ': ' + seen.size + ' unique [' + ok + ']');
}
