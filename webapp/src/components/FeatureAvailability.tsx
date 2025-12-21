import { useMemo } from 'react';

type FeatureFlag = {
  id: string;
  name: string;
  available: boolean;
  description: string;
};

export function FeatureAvailability() {
  const features = useMemo<FeatureFlag[]>(
    () => [
      {
        id: 'secure-store',
        name: 'Sicherer Speicher',
        available: false,
        description:
          'SecureStore steht im Browser nicht zur Verfügung. Stattdessen speichern wir nur flüchtige Daten im Arbeitsspeicher.',
      },
      {
        id: 'haptics',
        name: 'Haptisches Feedback',
        available: typeof navigator !== 'undefined' && 'vibrate' in navigator,
        description: 'Vibration steht nur auf einigen Endgeräten zur Verfügung. Falls möglich, wird ein kurzes Vibrationssignal beim Start genutzt.',
      },
      {
        id: 'camera',
        name: 'Kamera',
        available: typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia),
        description:
          'Kamera-Zugriff ist erforderlich, um Gebärden live zu erkennen. Ohne Freigabe laufen die Algorithmen im Leerlauf.',
      },
      {
        id: 'filesystem',
        name: 'Datei-Downloads',
        available: typeof window !== 'undefined' && 'showSaveFilePicker' in window,
        description:
          'Das Teilen von Clips wird im Web auf einfache Downloads beschränkt. Native Mediatheken werden nicht angesprochen.',
      },
    ],
    [],
  );

  return (
    <section className="card">
      <p className="eyebrow">Leitplanken</p>
      <h2>Web-spezifische Grenzen</h2>
      <p className="muted">
        Manche native Funktionen aus der Expo-App gibt es hier nicht. Wir zeigen klar, welche Alternativen greifen oder ob eine
        Funktion abgeschaltet bleibt.
      </p>

      <ul className="feature-list">
        {features.map((feature) => (
          <li key={feature.id} className={feature.available ? 'ok' : 'disabled'}>
            <div className="feature-heading">
              <strong>{feature.name}</strong>
              <span className={`pill ${feature.available ? 'pill-ok' : 'pill-off'}`}>
                {feature.available ? 'im Browser verfügbar' : 'deaktiviert'}
              </span>
            </div>
            <p className="muted">{feature.description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
