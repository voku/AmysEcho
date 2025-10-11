import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Video } from 'expo-video';
import Colors from '../constants/colors';
import { spacing } from '../constants/spacing';
import typography from '../constants/typography';

type HeroScreenProps = {
  navigation: any;
};

const HeroScreen: React.FC<HeroScreenProps> = ({ navigation }) => {
  return (
    <View style={styles.container}>
      <Video
        source={{ uri: 'http://d23dyxeqlo5psv.cloudfront.net/big_buck_bunny.mp4' }}
        rate={1.0}
        volume={1.0}
        isMuted
        shouldPlay
        isLooping
        resizeMode="cover"
        style={styles.video}
      />
      <View style={styles.overlay}>
        <Text style={styles.title}>Amy&apos;s Echo</Text>
        <Text style={styles.subtitle}>Gesten. Verstanden. Ohne Unterbrechung.</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.replace('App')}
          accessibilityRole="button"
          accessibilityLabel="Zur Kamera wechseln"
        >
          <Text style={styles.buttonText}>Los geht&apos;s</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  video: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing['2xl'],
  },
  title: {
    fontSize: typography.sizes.titleLg,
    fontWeight: typography.weights.extrabold as any,
    color: Colors.inverseText,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: typography.sizes.subtitle,
    color: Colors.inverseText,
    marginBottom: spacing['2xl'],
    textAlign: 'center',
  },
  button: {
    backgroundColor: Colors.primary,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing['2xl'],
    borderRadius: 32,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  buttonText: {
    color: Colors.inverseText,
    fontSize: typography.sizes.subtitle,
    fontWeight: typography.weights.semibold as any,
  },
});

export default HeroScreen;
