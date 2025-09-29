export const getShortcutMessage = (action: string): string => {
    const messages: Record<string, string> = {
      // Core navigation shortcuts
      'help_screen': '🆘 Öffne Hilfeseite',
      'training_screen': '🎯 Starte Training',
      'practice_screen': '✨ Starte Übung',
      'parent_screen': '👨‍👩‍👧 Öffne Elternbereich',
      'profile_screen': '👤 Öffne Profile',
      'dashboard_screen': '📊 Öffne Auswertung',
      'progress_screen': '📈 Öffne Fortschritt',
      'schedule_screen': '📅 Öffne Tagesplan',

      // Celebration and success shortcuts
      'celebration_mode': '🎉 Super gemacht! Du bist toll!',

      // Enhanced shortcuts for Amy's needs
      'home_screen': '🏠 Du bist bereits zu Hause!',
      'confirm_action': '✅ Aktion bestätigt!',
      'cancel_action': '❌ Aktion abgebrochen',
      'repeat_last': '🔄 Letzte Geste wiederholt',
      'play_mode': '🎮 Spielmodus aktiviert!',

      // Quick action shortcuts
      'stop_current': '⏹️ Aktivität gestoppt',
      'pause_current': '⏸️ Aktivität pausiert',
      'start_current': '▶️ Aktivität gestartet',
      'next_item': '⏭️ Nächstes Element',
      'previous_item': '⏮️ Vorheriges Element',
    };
    return messages[action] || '⚡ Schnellaktion ausgeführt';
  };

export const getShortcutAction = (gesture: string): string | null => {
    const shortcutMap: Record<string, string> = {
      // Navigation shortcuts
      'help': 'help_screen',
      'hilfe': 'help_screen',
      'learn': 'training_screen',
      'lernen': 'training_screen',
      'practice': 'practice_screen',
      'üben': 'practice_screen',
      'übung': 'practice_screen',
      'parent': 'parent_screen',
      'eltern': 'parent_screen',
      'mama': 'parent_screen',
      'papa': 'parent_screen',
      'profile': 'profile_screen',
      'profil': 'profile_screen',
      'settings': 'profile_screen',
      'einstellungen': 'profile_screen',
      'dashboard': 'dashboard_screen',
      'stats': 'dashboard_screen',
      'statistik': 'dashboard_screen',
      'progress': 'progress_screen',
      'fortschritt': 'progress_screen',
      'schedule': 'schedule_screen',
      'plan': 'schedule_screen',
      'tagesplan': 'schedule_screen',

      // Action shortcuts
      'celebration': 'celebration_mode',
      'feiern': 'celebration_mode',
      'home': 'home_screen',
      'haus': 'home_screen',
      'confirm': 'confirm_action',
      'bestätigen': 'confirm_action',
      'ja': 'confirm_action',
      'cancel': 'cancel_action',
      'abbrechen': 'cancel_action',
      'nein': 'cancel_action',
      'repeat': 'repeat_last',
      'wiederholen': 'repeat_last',
      'nochmal': 'repeat_last',
      'play': 'play_mode',
      'spielen': 'play_mode',
      'spiel': 'play_mode',
      'stop': 'stop_current',
      'anhalten': 'stop_current',
      'pause': 'pause_current',
      'pausieren': 'pause_current',
      'start': 'start_current',
      'beginnen': 'start_current',
      'next': 'next_item',
      'nächste': 'next_item',
      'weiter': 'next_item',
      'previous': 'previous_item',
      'vorherige': 'previous_item',
      'zurück': 'previous_item',
    };

    return shortcutMap[gesture] || null;
  };

export const getShortcutDisplayName = (action: string): string => {
    const displayNames: Record<string, string> = {
      'help_screen': 'Hilfe',
      'training_screen': 'Lernen',
      'practice_screen': 'Üben',
      'parent_screen': 'Elternbereich',
      'profile_screen': 'Profile',
      'dashboard_screen': 'Auswertung',
      'progress_screen': 'Fortschritt',
      'schedule_screen': 'Tagesplan',
      'celebration_mode': 'Feiermodus',
      'home_screen': 'Startseite',
      'confirm_action': 'Bestätigung',
      'cancel_action': 'Abbruch',
      'repeat_last': 'Wiederholung',
      'play_mode': 'Spielmodus',
      'stop_current': 'Stopp',
      'pause_current': 'Pause',
      'start_current': 'Start',
      'next_item': 'Nächstes',
      'previous_item': 'Vorheriges',
    };

    return displayNames[action] || action;
  };