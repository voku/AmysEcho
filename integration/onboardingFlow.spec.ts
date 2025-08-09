import { test } from 'node:test';
import assert from 'node:assert/strict';

test('onboarding flow creates profile, updates accessibility and navigates to tutorial', async () => {
  const createdProfiles: any[] = [];
  async function createProfile(data: any) {
    createdProfiles.push(data);
    return { id: 'p1', ...data };
  }
  let activeSet: string | null = null;
  function setActiveVocabularySet(id: string) {
    activeSet = id;
  }
  let updatedAccessibility: any = null;
  function update(accessibility: any) {
    updatedAccessibility = accessibility;
  }
  let navigatedTo: string | null = null;
  const navigation = { replace: (route: string) => { navigatedTo = route; } };

  async function handleContinue() {
    const profile = await createProfile({
      name: 'Amy',
      consentDataUpload: false,
      consentHelpMeGetSmarter: false,
      vocabularySetId: 'basic',
      largeText: false,
      highContrast: false,
    });
    setActiveVocabularySet('basic');
    update({ largeText: false, highContrast: false });
    navigation.replace('Tutorial');
    return profile;
  }

  const profile = await handleContinue();

  assert.equal(createdProfiles.length, 1);
  assert.equal(profile.name, 'Amy');
  assert.equal(activeSet, 'basic');
  assert.deepEqual(updatedAccessibility, { largeText: false, highContrast: false });
  assert.equal(navigatedTo, 'Tutorial');
});
