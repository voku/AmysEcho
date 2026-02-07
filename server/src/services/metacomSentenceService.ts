import config from "../config/index.js";
import logger from "./logger.js";

const DEFAULT_LOCALE = "de";
const MAX_SENTENCE_LENGTH = 200;

type SentenceImproveInput = {
	sentence: string;
	locale?: string;
	userId?: string;
};

type OpenAiMessage = {
	role: "system" | "user";
	content: string;
};

type OpenAiResponse = {
	choices?: Array<{
		message?: {
			content?: string;
		};
	}>;
};

export class SentenceImprovementError extends Error {
	statusCode: number;

	constructor(message: string, statusCode = 500) {
		super(message);
		this.statusCode = statusCode;
	}
}

function buildPrompt(sentence: string, locale: string): OpenAiMessage[] {
	const normalizedLocale = locale === "de" ? "de" : DEFAULT_LOCALE;
	return [
		{
			role: "system",
			content:
				"Du bist eine freundliche Satzbau-Hilfe für Kinder. " +
				"Forme die Eingabe zu einem kurzen, klaren Satz in einfachem Deutsch. " +
				"Verwende nur Wörter aus der Eingabe (du darfst sie beugen), " +
				"füge keine neuen Inhalte hinzu und antworte nur mit dem fertigen Satz.",
		},
		{
			role: "user",
			content: `Sprache: ${normalizedLocale}\nEingabe: ${sentence}`,
		},
	];
}

function normalizeSentence(input: string): string {
	return input.replace(/\s+/g, " ").trim();
}

export async function improveMetacomSentence({
	sentence,
	locale = DEFAULT_LOCALE,
	userId,
}: SentenceImproveInput): Promise<string> {
	const trimmed = normalizeSentence(sentence);
	if (!trimmed) {
		throw new SentenceImprovementError("Leerer Satz.", 400);
	}
	if (trimmed.length > MAX_SENTENCE_LENGTH) {
		throw new SentenceImprovementError("Satz ist zu lang.", 400);
	}
	if (!config.openAiApiKey) {
		throw new SentenceImprovementError(
			"Satzverbesserung ist gerade nicht verfügbar.",
			503,
		);
	}

	const response = await fetch(`${config.openAiBaseUrl}/chat/completions`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${config.openAiApiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model: config.openAiModel,
			temperature: 0.2,
			max_tokens: 80,
			messages: buildPrompt(trimmed, locale),
		}),
		signal: AbortSignal.timeout(15000),
	});

	if (!response.ok) {
		const errorText = await response.text().catch(() => "Unbekannter Fehler");
		logger.warn("OpenAI sentence improvement failed", {
			status: response.status,
			error: errorText,
			userId,
		});
		throw new SentenceImprovementError(
			"Satzverbesserung konnte nicht abgeschlossen werden.",
			502,
		);
	}

	const payload = (await response.json()) as OpenAiResponse;
	const content = payload.choices?.[0]?.message?.content;
	const normalized = content ? normalizeSentence(content) : "";

	if (!normalized) {
		throw new SentenceImprovementError(
			"Satzverbesserung konnte nicht abgeschlossen werden.",
			502,
		);
	}

	return normalized;
}
