import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import NewBottomNav from '../src/components/NewBottomNav';

type RouteParams = Partial<Record<'Recognition' | 'History' | 'Lernen', Record<string, unknown>>>;

type TestNavigation = {
  emit: jest.Mock<[{ defaultPrevented: boolean }?, any?], any>;
  navigate: jest.Mock;
};

type BuildResult = {
  props: BottomTabBarProps;
  navigation: TestNavigation;
};

const buildProps = (activeIndex = 0, params: RouteParams = {}): BuildResult => {
  const routes = [
    { key: 'Recognition', name: 'Recognition' as const, params: params.Recognition },
    { key: 'History', name: 'History' as const, params: params.History },
    { key: 'Lernen', name: 'Lernen' as const, params: params.Lernen },
  ];

  const navigation: TestNavigation = {
    emit: jest.fn(() => ({ defaultPrevented: false })),
    navigate: jest.fn(),
  } as unknown as TestNavigation;

  const descriptors = Object.fromEntries(
    routes.map(route => [
      route.key,
      {
        navigation,
        options: {
          tabBarLabel:
            route.name === 'Recognition'
              ? 'Kamera'
              : route.name === 'History'
              ? 'Verlauf'
              : route.name,
        },
        route,
      },
    ]),
  );

  const props: BottomTabBarProps = {
    state: {
      index: activeIndex,
      key: 'tab-root',
      routeNames: routes.map(route => route.name),
      history: [],
      type: 'tab',
      stale: false,
      routes,
    } as any,
    descriptors: descriptors as any,
    navigation: navigation as any,
  };

  return { props, navigation };
};

describe('NewBottomNav', () => {
  it('renders accessible tabs with the expected labels', () => {
    const { props } = buildProps();
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(<NewBottomNav {...props} />);
    });
    const pressables = (component as renderer.ReactTestRenderer).root.findAllByType(Pressable);

    expect(pressables).toHaveLength(3);
    const labels = pressables.map(p => p.props.accessibilityLabel);
    expect(labels).toEqual(['Kamera', 'Verlauf', 'Lernen']);

    const hints = pressables.map(p => p.props.accessibilityHint);
    expect(hints).toEqual([
      'Zurück zur Gestenerkennung',
      'Gestenverlauf und Ereignisse ansehen',
      'Gesten aufnehmen oder üben',
    ]);

    const selectedStates = pressables.map(p => p.props.accessibilityState?.selected ?? false);
    expect(selectedStates).toEqual([true, false, false]);
  });

  it('navigates to other tabs when pressed', () => {
    const { props, navigation } = buildProps(0);
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(<NewBottomNav {...props} />);
    });
    const pressables = (component as renderer.ReactTestRenderer).root.findAllByType(Pressable);

    act(() => {
      pressables[1].props.onPress();
    });

    expect(navigation.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tabPress', target: 'History' }),
    );
    expect(navigation.navigate).toHaveBeenCalledWith('History', undefined);
  });

  it('does not navigate when the tab is already focused', () => {
    const { props, navigation } = buildProps(2);
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(<NewBottomNav {...props} />);
    });
    const pressables = (component as renderer.ReactTestRenderer).root.findAllByType(Pressable);

    act(() => {
      pressables[2].props.onPress();
    });

    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('preserves route params when navigating between tabs', () => {
    const routeParams: RouteParams = {
      Recognition: { profileId: 'amy', simulateLowConfidence: true },
    };
    const { props, navigation } = buildProps(1, routeParams);
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(<NewBottomNav {...props} />);
    });
    const pressables = (component as renderer.ReactTestRenderer).root.findAllByType(Pressable);

    act(() => {
      pressables[0].props.onPress();
    });

    expect(navigation.navigate).toHaveBeenCalledWith('Recognition', routeParams.Recognition);
  });

  it('uses the dark teal palette in standard contrast mode', () => {
    const { props } = buildProps(1);
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(<NewBottomNav {...props} />);
    });

    const view = (component as renderer.ReactTestRenderer).root.findByType(View);
    const containerStyle = StyleSheet.flatten(view.props.style);
    expect(containerStyle?.backgroundColor).toBe('#0F3A3B');

    const pressables = (component as renderer.ReactTestRenderer).root.findAllByType(Pressable);
    const inactiveTabStyle = StyleSheet.flatten(pressables[0].props.style({ pressed: false }));
    expect(inactiveTabStyle?.backgroundColor).toBeUndefined();

    const activeTabStyle = StyleSheet.flatten(pressables[1].props.style({ pressed: false }));
    expect(activeTabStyle?.backgroundColor).toBe('#25706F');

    const inactiveIconStyle = StyleSheet.flatten(pressables[0].findAllByType(Text)[0].props.style);
    expect(inactiveIconStyle?.color).toBe('#FFFFFF');

    const inactiveLabelStyle = StyleSheet.flatten(pressables[0].findAllByType(Text)[1].props.style);
    expect(inactiveLabelStyle?.color).toBe('#FFFFFF');

    expect(pressables[0].props.android_ripple?.color).toBe('rgba(255, 255, 255, 0.16)');
  });
});
