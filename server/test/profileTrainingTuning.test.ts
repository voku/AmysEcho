import { parseEpochSchedule, resolveTrainingScore } from '../src/services/profileTrainingTuning.js';

describe('profileTrainingTuning', () => {
	test('parseEpochSchedule falls back when env missing', () => {
		expect(parseEpochSchedule(undefined, [20, 40, 80])).toEqual([20, 40, 80]);
	});

	test('parseEpochSchedule parses valid positive ints', () => {
		expect(parseEpochSchedule('10, 30,90', [1])).toEqual([10, 30, 90]);
	});

	test('parseEpochSchedule ignores invalid values and falls back if empty', () => {
		expect(parseEpochSchedule('0,-2,foo', [20, 40, 80])).toEqual([20, 40, 80]);
	});

	test('resolveTrainingScore prefers profile accuracy for single-target profile', () => {
		const report = {
			global: { accuracy: 0.2 },
			profiles: {
				kidA: { accuracy: 0.51 },
			},
		};
		expect(resolveTrainingScore(report, 'kidA')).toBeCloseTo(0.51, 8);
	});

	test('resolveTrainingScore falls back to global accuracy', () => {
		const report = { global: { accuracy: 0.33 }, profiles: {} };
		expect(resolveTrainingScore(report, 'missing')).toBeCloseTo(0.33, 8);
	});
});
