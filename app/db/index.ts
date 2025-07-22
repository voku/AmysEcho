import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { mySchema } from './schema';
import {
  Profile,
  Symbol,
  VocabularySet,
  UsageStat,
  VocabularySetSymbol,
  GestureDefinition,
  GestureTrainingData,
  InteractionLog,
  LearningAnalytic,
  Correction,
} from './models';

const adapter = new SQLiteAdapter({
  schema: mySchema,
  jsi: true,
});

export const database = new Database({
  adapter,
  modelClasses: [
    Profile,
    Symbol,
    VocabularySet,
    UsageStat,
    VocabularySetSymbol,
    GestureDefinition,
    GestureTrainingData,
    InteractionLog,
    LearningAnalytic,
    Correction,
  ],
});

export const setupDatabase = async () => {
  const profileCollection = database.get<Profile>('profiles');
  const profiles = await profileCollection.query().fetch();

  if (profiles.length > 0) {
    console.log('Database already populated.');
    return profiles[0].id;
  }

  let amyProfileId = '';
  await database.write(async () => {
    console.log('Setting up database with initial data...');
    const now = Date.now();
    const symbolCollection = database.get<Symbol>('symbols');

    const trinkenSymbol = await symbolCollection.create(s => {
      s.name = 'Trinken';
      s.category = 'basic';
      s.iconName = 'trinken.png';
      s.videoAssetPath = 'trinken.mp4';
      s.dgsVideoAssetPath = 'trinken_dgs.mp4';
      s.contextTagsRaw = JSON.stringify(['Durst', 'Becher', 'mehr']);
      s.emoji = '🥛';
      s.priority = 1;
      s.isActive = true;
      s.healthScore = 100;
      s.color = '#AEDFF7';
      s.createdAt = new Date(now);
    });

    const essenSymbol = await symbolCollection.create(s => {
      s.name = 'Essen';
      s.category = 'basic';
      s.iconName = 'essen.png';
      s.videoAssetPath = 'essen.mp4';
      s.dgsVideoAssetPath = 'essen_dgs.mp4';
      s.contextTagsRaw = JSON.stringify(['Hunger', 'Teller', 'mehr']);
      s.emoji = '🍪';
      s.priority = 1;
      s.isActive = true;
      s.healthScore = 100;
      s.color = '#F7C5A8';
      s.createdAt = new Date(now);
    });

    const spielenSymbol = await symbolCollection.create(s => {
      s.name = 'Spielen';
      s.category = 'extra';
      s.iconName = 'spielen.png';
      s.videoAssetPath = 'spielen.mp4';
      s.dgsVideoAssetPath = 'spielen_dgs.mp4';
      s.contextTagsRaw = JSON.stringify(['Spaß', 'Freunde', 'Ball']);
      s.emoji = '⚽';
      s.priority = 2;
      s.isActive = true;
      s.healthScore = 100;
      s.color = '#A8F7A8';
      s.createdAt = new Date(now);
    });

    const setCollection = database.get<VocabularySet>('vocabulary_sets');
    const alltagSet = await setCollection.create(v => { v.name = 'Alltag'; });
    const kitaSet = await setCollection.create(v => { v.name = 'Kita'; });

    const vssCollection = database.get<VocabularySetSymbol>('vocabulary_set_symbols');
    await database.batch(
      vssCollection.prepareCreate(vs => {
        vs.vocabularySet.id = alltagSet.id;
        vs.symbol.id = trinkenSymbol.id;
      }),
      vssCollection.prepareCreate(vs => {
        vs.vocabularySet.id = alltagSet.id;
        vs.symbol.id = essenSymbol.id;
      }),
      vssCollection.prepareCreate(vs => {
        vs.vocabularySet.id = kitaSet.id;
        vs.symbol.id = spielenSymbol.id;
      }),
    );

    const amyProfile = await profileCollection.create(p => {
      p.name = 'Amy';
      (p as any).activeVocabularySet.id = alltagSet.id;
      p.consentHelpMeGetSmarter = true;
      p.consentHelpMeLearnOverTime = true;
      p.largeText = false;
      p.highContrast = false;
      p.createdAt = new Date(now);
      p.updatedAt = new Date(now);
    });
    amyProfileId = amyProfile.id;
  });

  return amyProfileId;
};
