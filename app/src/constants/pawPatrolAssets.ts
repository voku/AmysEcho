// Paw Patrol themed assets and emojis
export const PAW_PATROL_ASSETS = {
  // Characters
  characters: {
    chase: '🐕‍🦺', // Police dog
    marshall: '🐕‍🚒', // Fire dog
    skye: '🐕‍🦼', // Cockapoo
    rocky: '🐕‍🔧', // Recycling pup
    rubble: '🐕‍🏗️', // Construction pup
    zuma: '🐕‍🏊', // Water rescue pup
  },

  // Paw Patrol themed emojis
  icons: {
    badge: '🏆',
    paw: '🐾',
    star: '⭐',
    heart: '💙', // Blue like Chase
    fire: '🔥',
    water: '💧',
    recycle: '♻️',
    build: '🏗️',
    home: '🏠',
    learn: '🎓',
    play: '🎮',
    help: '🆘',
    success: '🎉',
    celebrate: '🎊',
  },

  // Paw Patrol color palette
  colors: {
    chaseBlue: '#1E40AF',
    marshallRed: '#DC2626',
    skyePink: '#EC4899',
    rockyGreen: '#16A34A',
    rubbleYellow: '#EAB308',
    zumaOrange: '#EA580C',
    badgeGold: '#F59E0B',
    pawPrintGray: '#6B7280',
  },

  // Encouragement messages
  messages: {
    great: 'Großartig gemacht!',
    excellent: 'Ausgezeichnet!',
    perfect: 'Perfekt!',
    amazing: 'Unglaublich!',
    fantastic: 'Fantastisch!',
    pawSome: 'Paw-some!',
    super: 'Super!',
    awesome: 'Toll!',
  },

  // Sound effects (descriptions)
  sounds: {
    badge: 'Paw Patrol Badge Sound',
    siren: 'Paw Patrol Siren',
    bark: 'Pup Bark',
    cheer: 'Paw Patrol Cheer',
    mission: 'Mission Accomplished',
  },
} as const;

export type PawPatrolCharacter = keyof typeof PAW_PATROL_ASSETS.characters;
export type PawPatrolIcon = keyof typeof PAW_PATROL_ASSETS.icons;
export type PawPatrolMessage = keyof typeof PAW_PATROL_ASSETS.messages;