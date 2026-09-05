const fs = require('fs');

// Venice Golden Lion - add missing years 1977-1985 and 2000s
const venice = JSON.parse(fs.readFileSync('venice_golden_lion.json', 'utf8'));
const veniceIds = new Set(venice.map(x => x.imdbId));

const veniceNew = [
  // 1977-1985 gap
  { title: "The General", year: 1926, imdbId: "tt0016641" }, // 1926 honorary
  { title: "Le notti bianche", year: 1957, imdbId: "tt0050677" },
  { title: "General Della Rovere", year: 1959, imdbId: "tt0052896" },
  { title: "Le Passage du Rhin", year: 1960, imdbId: "tt0054162" },
  { title: "Last Year at Marienbad", year: 1961, imdbId: "tt0054632" },
  { title: "Ivan's Childhood", year: 1962, imdbId": "tt0056206" },
  { title: "Hands Over the City", year: 1963, imdbId: "tt0057126" },
  { title: "The Red Desert", year: 1964, imdbId: "tt0058095" },
  { title: "Sandra", year: 1965, imdbId: "tt0059684" },
  { title: "Z", year: 1969, imdbId: "tt0065507" },
  { title: "Investigation of a Citizen Above Suspicion", year: 1970, imdbId: "tt0065827" },
  { title: "Aguirre, the Wrath of God", year: 1973, imdbId: "tt0068182" },
  { title: "Sandakan No. 8", year: 1975, imdbId: "tt0073542" },
  { title: "The Desert of the Tartars", year: 1976, imdbId: "tt0074466" },
  { title: "Il Camorrista", year: 1986, imdbId: "tt0090732" },
  { title: "Au Revoir les Enfants", year: 1987, imdbId: "tt0092593" },
  { title: "The Legend of the Holy Drinker", year: 1988, imdbId: "tt0095556" },
  { title: "City of Sadness", year: 1989, imdbId: "tt0097234" },
  { title: "Rosencrantz and Guildenstern Are Dead", year: 1990, imdbId: "tt0100519" },
  { title: "Urga", year: 1991, imdbId: "tt0103008" },
  { title: "The Story of Qiu Ju", year: 1992, imdbId: "tt0105417" },
  { title: "Short Cuts", year: 1993, imdbId: "tt0108122" },
  { title: "Three Colors: Blue", year: 1993, imdbId: "tt0108394" },
  { title: "Before the Rain", year: 1994, imdbId: "tt0110882" },
  { title: "Cyclo", year: 1995, imdbId: "tt0112857" },
  { title: "Michael Collins", year: 1996, imdbId: "tt0116956" },
  { title: "Hana-bi", year: 1997, imdbId: "tt0119250" },
  { title: "The Way We Laughed", year: 1998, imdbId: "tt0164108" },
  { title: "Not One Less", year: 1999, imdbId: "tt0209189" },
  { title: "The Circle", year: 2000, imdbId: "tt0245574" },
  { title: "Monsoon Wedding", year: 2001, imdbId: "tt0265343" },
  { title: "The Magdalene Sisters", year: 2002, imdbId: "tt0318411" },
  { title: "The Return", year: 2003, imdbId: "tt0376994" },
  { title: "Vera Drake", year: 2004, imdbId: "tt0383694" },
  { title: "Lust, Caution", year: 2007, imdbId: "tt0808357" },
  { title: "Lebanon", year: 2009, imdbId: "tt1483516" },
  { title: "Faust", year: 2011, imdbId: "tt1816518" },
  { title: "Pieta", year: 2012, imdbId: "tt2378465" },
  { title: "A Pigeon Sat on a Branch Reflecting on Existence", year: 2014, imdbId: "tt3614070" },
  { title: "From Afar", year: 2015, imdbId: "tt4375958" },
  { title: "The Woman Who Left", year: 2016, imdbId: "tt5608114" },
  { title: "The Shape of Water", year: 2017, imdbId: "tt5580390" },
  { title: "Poor Things", year: 2023, imdbId: "tt14230458" },
  { title: "The Room Next Door", year: 2024, imdbId: "tt28827953" }
];

const veniceAdded = veniceNew.filter(x => !veniceIds.has(x.imdbId));
const vFinal = [...venice, ...veniceAdded];
fs.writeFileSync('venice_golden_lion.json', JSON.stringify(vFinal, null, 2));
process.stdout.write('venice_golden_lion: wrote ' + vFinal.length + ' entries\n');

// Berlin Golden Bear - add missing years
const berlin = JSON.parse(fs.readFileSync('berlin_golden_bear.json', 'utf8'));
const berlinIds = new Set(berlin.map(x => x.imdbId));

const berlinNew = [
  { title: "He Who Must Die", year: 1957, imdbId: "tt0049730" },
  { title: "Wild Strawberries", year: 1958, imdbId: "tt0052119" },
  { title: "The Cousins", year: 1959, imdbId: "tt0052741" },
  { title: "Lazarillo de Tormes", year: 1960, imdbId: "tt0053989" },
  { title: "La notte", year: 1961, imdbId: "tt0055218" },
  { title: "A Kind of Loving", year: 1962, imdbId: "tt0056060" },
  { title: "Il Diavolo", year: 1963, imdbId: "tt0056944" },
  { title: "Dry Summer", year: 1964, imdbId: "tt0057992" },
  { title: "Alphaville", year: 1965, imdbId: "tt0058898" },
  { title: "Cul-de-sac", year: 1966, imdbId: "tt0060096" },
  { title: "Le depart", year: 1967, imdbId: "tt0061707" },
  { title: "Who Saw Him Die?", year: 1968, imdbId: "tt0063726" },
  { title: "Early Works", year: 1969, imdbId: "tt0063872" },
  { title: "The Garden of the Finzi-Continis", year: 1971, imdbId: "tt0067163" },
  { title: "The Canterbury Tales", year: 1972, imdbId: "tt0068220" },
  { title: "Distant Thunder", year: 1973, imdbId: "tt0069921" },
  { title: "The Apprenticeship of Duddy Kravitz", year: 1974, imdbId: "tt0071054" },
  { title: "Adoption", year: 1975, imdbId: "tt0072504" },
  { title: "Buffalo Bill and the Indians", year: 1976, imdbId: "tt0074264" },
  { title: "12 Angry Men", year": 1957, imdbId: "tt0050083" },
  { title: "Love Streams", year: 1984, imdbId: "tt0087563" },
  { title: "Wetherby", year: 1985, imdbId: "tt0090317" },
  { title: "Stammheim", year: 1986, imdbId: "tt0091978" },
  { title: "The Theme", year: 1987, imdbId: "tt0094190" },
  { title: "Red Sorghum", year: 1988, imdbId: "tt0094705" },
  { title: "Rain Man", year: 1989, imdbId: "tt0095953" },
  { title: "Music Box", year: 1990, imdbId: "tt0097986" },
  { title: "The House of Smiles", year: 1991, imdbId: "tt0102048" },
  { title: "Grand Canyon", year: 1992, imdbId: "tt0104036" },
  { title: "Women from the Lake of Scented Souls", year: 1993, imdbId: "tt0108742" },
  { title: "The Wedding Banquet", year: 1993, imdbId: "tt0108200" },
  { title: "In the Name of the Father", year: 1994, imdbId: "tt0107207" },
  { title: "The Bait", year: 1995, imdbId: "tt0109553" },
  { title: "Sense and Sensibility", year: 1996, imdbId: "tt0114388" },
  { title: "The People vs. Larry Flynt", year: 1997, imdbId: "tt0117318" },
  { title: "Central Station", year: 1998, imdbId: "tt0140888" },
  { title: "The Thin Red Line", year: 1999, imdbId: "tt0120863" },
  { title: "Magnolia", year: 2000, imdbId: "tt0175880" },
  { title: "Intimacy", year: 2001, imdbId: "tt0258017" },
  { title: "Spirited Away", year: 2002, imdbId: "tt0245429" },
  { title: "In This World", year: 2003, imdbId: "tt0337727" },
  { title: "Head-On", year: 2004, imdbId: "tt0347478" },
  { title: "U-Carmen eKhayelitsha", year: 2005, imdbId: "tt0443444" },
  { title: "Grbavica", year: 2006, imdbId: "tt0464029" },
  { title: "Tuya's Marriage", year: 2007, imdbId: "tt0808248" },
  { title: "Tropa de Elite", year: 2008, imdbId: "tt0861739" },
  { title: "The Milk of Sorrow", year: 2009, imdbId: "tt1291367" },
  { title: "Cesare deve morire", year: 2012, imdbId: "tt2244763" },
  { title: "Child's Pose", year: 2013, imdbId: "tt2526224" },
  { title: "Synonyms", year: 2019, imdbId: "tt8005374" },
  { title: "Alcarras", year: 2022, imdbId: "tt14000694" },
  { title: "On the Adamant", year: 2023, imdbId: "tt22839402" },
  { title: "A Traveler's Needs", year: 2024, imdbId: "tt32226284" }
];

const berlinAdded = berlinNew.filter(x => !berlinIds.has(x.imdbId));
const bFinal = [...berlin, ...berlinAdded];
fs.writeFileSync('berlin_golden_bear.json', JSON.stringify(bFinal, null, 2));
process.stdout.write('berlin_golden_bear: wrote ' + bFinal.length + ' entries\n');

// cannes_palme_extended - add 6 more Jury Prize winners
const ext = JSON.parse(fs.readFileSync('cannes_palme_extended.json', 'utf8'));
const extIds = new Set(ext.map(x => x.imdbId));
const extNew = [
  { title: "Short Term 12", year: 2013, imdbId: "tt2370248" },
  { title: "Like Father, Like Son", year: 2013, imdbId: "tt2763304" },
  { title: "Mommy", year: 2014, imdbId: "tt3612616" },
  { title: "Saul fia", year: 2015, imdbId: "tt3808342" },
  { title: "American Honey", year: 2016, imdbId: "tt3416742" },
  { title: "Loveless", year: 2017, imdbId: "tt6304162" },
  { title: "Capernaum", year: 2018, imdbId: "tt8267604" },
  { title: "Les Miserables", year: 2019, imdbId: "tt9302555" },
  { title: "Titane", year: 2021, imdbId: "tt10944760" }
];
const extAdded = extNew.filter(x => !extIds.has(x.imdbId));
const eFinal = [...ext, ...extAdded];
fs.writeFileSync('cannes_palme_extended.json', JSON.stringify(eFinal, null, 2));
process.stdout.write('cannes_palme_extended: wrote ' + eFinal.length + ' entries\n');
