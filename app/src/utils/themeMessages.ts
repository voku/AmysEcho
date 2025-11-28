import { useTheme } from '../context/ThemeContext';
import { PAW_PATROL_ASSETS } from '../constants/pawPatrolAssets';

// Theme-based encouragement messages
const THEME_MESSAGES = {
  pawPatrol: {
    success: [
      `${PAW_PATROL_ASSETS.characters.chase} Großartig! Du bist ein Super-Pup!`,
      `${PAW_PATROL_ASSETS.characters.marshall} Wow! Das war paw-some!`,
      `${PAW_PATROL_ASSETS.characters.skye} Hoch in der Luft! Du bist fantastisch!`,
      `${PAW_PATROL_ASSETS.characters.rocky} Recycling-Star! Du bist toll!`,
      `${PAW_PATROL_ASSETS.characters.rubble} Bauarbeiter-Star! Super gemacht!`,
      `${PAW_PATROL_ASSETS.characters.zuma} Wasserratte! Du bist der Beste!`,
      `${PAW_PATROL_ASSETS.icons.badge} Mission erfüllt! Du bist ein Held!`,
      `${PAW_PATROL_ASSETS.icons.paw} Paw-some! Du hast es geschafft!`,
    ],
    tryAgain: [
      `${PAW_PATROL_ASSETS.characters.chase} Das war ein guter Versuch! Lass uns das zusammen machen:`,
      `${PAW_PATROL_ASSETS.characters.marshall} Super probiert! Schau, so geht's:`,
      `${PAW_PATROL_ASSETS.characters.skye} Du bist auf dem richtigen Weg! Hier ist die Geste:`,
      `${PAW_PATROL_ASSETS.characters.rocky} Prima Versuch! Lass uns das nochmal anschauen:`,
      `${PAW_PATROL_ASSETS.characters.rubble} Toll, dass du es versucht hast! So sieht es aus:`,
      `${PAW_PATROL_ASSETS.characters.zuma} Du schaffst das! Lass uns das zusammen üben:`,
    ],
    celebration: [
      `${PAW_PATROL_ASSETS.characters.chase} Chase ist stolz auf dich!`,
      `${PAW_PATROL_ASSETS.characters.marshall} Marshall freut sich mit dir!`,
      `${PAW_PATROL_ASSETS.characters.skye} Skye ist beeindruckt!`,
      `${PAW_PATROL_ASSETS.characters.rocky} Rocky ist stolz!`,
      `${PAW_PATROL_ASSETS.characters.rubble} Rubble applaudiert!`,
      `${PAW_PATROL_ASSETS.characters.zuma} Zuma ist happy!`,
    ],
  },
  rainbow: {
    success: [
      '🌈 Regenbogen-Star! Du bist bunt und toll!',
      '✨ Glitzer-Zauber! Du bist magisch!',
      '🎨 Kunstwerk! Du bist kreativ!',
      '🌟 Sternschnuppe! Du leuchtest!',
      '🎭 Schauspieler-Star! Du bist super!',
      '🎪 Zirkus-Star! Du bist der Beste!',
      '🎊 Party-Time! Du bist fantastisch!',
      '🎉 Feierstimmung! Du hast es geschafft!',
    ],
    tryAgain: [
      '🌈 Das war bunt und schön! Lass uns das zusammen malen:',
      '✨ Glitzer-Versuch! Schau, so geht\'s:',
      '🎨 Kreativer Versuch! Hier ist die Geste:',
      '🌟 Leuchtender Versuch! Lass uns das üben:',
      '🎭 Toller Auftritt! So sieht es aus:',
      '🎪 Zirkus-Nummer! Lass uns das zusammen machen:',
    ],
    celebration: [
      '🌈 Regenbogen-Feuerwerk für dich!',
      '✨ Glitzer-Party!',
      '🎨 Farbenexplosion!',
      '🌟 Sternenregen!',
      '🎭 Standing Ovations!',
      '🎪 Zirkus-Applaus!',
    ],
  },
  ocean: {
    success: [
      '🌊 Wellenreiter! Du bist super!',
      '🐠 Fisch-Freund! Du schwimmst toll!',
      '🐚 Muschel-Zauber! Du bist magisch!',
      '🐳 Wal-Gesang! Du bist fantastisch!',
      '🦈 Hai-Held! Du bist stark!',
      '🐢 Schildkröten-Star! Du bist weise!',
      '🏄‍♀️ Surfer-Star! Du reitest die Wellen!',
      '🎣 Angler-Glück! Du hast den Fisch gefangen!',
    ],
    tryAgain: [
      '🌊 Wellen-Versuch! Lass uns das zusammen surfen:',
      '🐠 Fischiger Versuch! Schau, so geht\'s:',
      '🐚 Muschel-Versuch! Hier ist die Geste:',
      '🐳 Wal-Versuch! Lass uns das üben:',
      '🦈 Hai-Versuch! So sieht es aus:',
      '🐢 Schildkröten-Versuch! Lass uns das machen:',
    ],
    celebration: [
      '🌊 Ozean-Party für dich!',
      '🐠 Fisch-Schwarm feiert!',
      '🐚 Muschel-Tanz!',
      '🐳 Wal-Gesänge!',
      '🦈 Hai-Applaus!',
      '🐢 Schildkröten-Jubel!',
    ],
  },
  forest: {
    success: [
      '🌳 Baum-Held! Du bist stark!',
      '🐿️ Eichhörnchen-Star! Du bist schnell!',
      '🦌 Hirsch-Freund! Du bist elegant!',
      '🐦 Vogel-Sänger! Du bist melodisch!',
      '🌸 Blumen-Zauber! Du bist schön!',
      '🍄 Pilz-Zauberer! Du bist magisch!',
      '🦊 Fuchs-Freund! Du bist schlau!',
      '🐻 Bären-Kraft! Du bist stark!',
    ],
    tryAgain: [
      '🌳 Baum-Versuch! Lass uns das zusammen wachsen:',
      '🐿️ Eichhörnchen-Versuch! Schau, so geht\'s:',
      '🦌 Hirsch-Versuch! Hier ist die Geste:',
      '🐦 Vogel-Versuch! Lass uns das üben:',
      '🌸 Blumen-Versuch! So sieht es aus:',
      '🍄 Pilz-Versuch! Lass uns das machen:',
    ],
    celebration: [
      '🌳 Wald-Feuerwerk!',
      '🐿️ Eichhörnchen-Party!',
      '🦌 Hirsch-Tanz!',
      '🐦 Vogel-Chor!',
      '🌸 Blumen-Regen!',
      '🍄 Pilz-Fest!',
    ],
  },
  classic: {
    success: [
      '⭐ Super gemacht! Du bist toll!',
      '🎯 Volltreffer! Du bist der Beste!',
      '🏆 Champion! Du hast gewonnen!',
      '🎉 Feierstimmung! Du bist fantastisch!',
      '✨ Glanzleistung! Du strahlst!',
      '💫 Wunderbar! Du bist magisch!',
      '🌟 Sternstunde! Du leuchtest!',
      '🎊 Party! Du bist super!',
    ],
    tryAgain: [
      '⭐ Guter Versuch! Lass uns das zusammen machen:',
      '🎯 Fast getroffen! Schau, so geht\'s:',
      '🏆 Champion-Versuch! Hier ist die Geste:',
      '🎉 Toller Versuch! Lass uns das üben:',
      '✨ Glänzender Versuch! So sieht es aus:',
      '💫 Wunder-Versuch! Lass uns das probieren:',
    ],
    celebration: [
      '⭐ Sternen-Feuerwerk!',
      '🎯 Ziel erreicht!',
      '🏆 Champion-Party!',
      '🎉 Mega-Feier!',
      '✨ Glitzer-Show!',
      '💫 Wunder-Party!',
    ],
  },
} as const;

export type MessageType = 'success' | 'tryAgain' | 'celebration';

export function getThemeMessage(themeName: string, type: MessageType): string {
  const themeMessages = THEME_MESSAGES[themeName as keyof typeof THEME_MESSAGES];
  if (!themeMessages) {
    // Fallback to classic theme
    const classicMessages = THEME_MESSAGES.classic[type] ?? THEME_MESSAGES.classic.success;
    const fallbackMessages = classicMessages ?? [];
    const randomIndex = Math.floor(Math.random() * Math.max(1, fallbackMessages.length));
    return fallbackMessages[randomIndex] ?? 'Super gemacht!';
  }

  const messages = themeMessages[type];
  const pool = messages ?? THEME_MESSAGES.classic[type] ?? THEME_MESSAGES.classic.success;
  const randomIndex = Math.floor(Math.random() * Math.max(1, pool.length));
  return pool[randomIndex] ?? 'Super gemacht!';
}

// Hook for components to get theme-based messages
export function useThemeMessages() {
  const { themeName } = useTheme();

  return {
    getSuccessMessage: () => getThemeMessage(themeName, 'success'),
    getTryAgainMessage: () => getThemeMessage(themeName, 'tryAgain'),
    getCelebrationMessage: () => getThemeMessage(themeName, 'celebration'),
    getMessage: (type: MessageType) => getThemeMessage(themeName, type),
  };
}