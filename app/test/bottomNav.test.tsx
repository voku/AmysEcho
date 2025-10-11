import React from 'react';
import { Pressable } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import NewBottomNav from '../src/components/NewBottomNav';

type TestNavigation = {
  emit: jest.Mock<[{ defaultPrevented: boolean }?, any?], any>;
  navigate: jest.Mock;
};

type BuildResult = {
  props: BottomTabBarProps;
  navigation: TestNavigation;
};

const buildProps = (activeIndex = 0): BuildResult => {
  const routes = [
    { key: 'Recognition', name: 'Recognition' as const },
    { key: 'History', name: 'History' as const },
    { key: 'Lernen', name: 'Lernen' as const },
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
    expect(navigation.navigate).toHaveBeenCalledWith('History');
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
});
