/**
 * Tests for StatusCapsule component
 */

import React from 'react';
import renderer from 'react-test-renderer';
import { Text } from 'react-native';
import StatusCapsule from '../../src/components/StatusCapsule';

describe('StatusCapsule', () => {
  it('renders with basic props', () => {
    let tree;
    renderer.act(() => {
      tree = renderer.create(
        <StatusCapsule text="Bereit" category="idle" />
      );
    });
    expect(tree).toBeTruthy();
  });

  it('renders with detail text', () => {
    let tree;
    renderer.act(() => {
      tree = renderer.create(
        <StatusCapsule 
          text="Hört zu" 
          category="listening" 
          detail="Hand erkannt"
        />
      );
    });
    expect(tree).toBeTruthy();
  });

  it('renders in compact mode', () => {
    let tree;
    renderer.act(() => {
      tree = renderer.create(
        <StatusCapsule 
          text="Bereit" 
          category="idle" 
          compact
        />
      );
    });
    expect(tree).toBeTruthy();
  });

  it('supports all status categories', () => {
    const categories: Array<'idle' | 'listening' | 'recognized' | 'updating' | 'error'> = [
      'idle',
      'listening',
      'recognized',
      'updating',
      'error',
    ];
    
    categories.forEach(category => {
      let tree;
      renderer.act(() => {
        tree = renderer.create(
          <StatusCapsule text={`Status: ${category}`} category={category} />
        );
      });
      expect(tree).toBeTruthy();
    });
  });

  it('renders text content', () => {
    let component;
    renderer.act(() => {
      component = renderer.create(
        <StatusCapsule text="Test Status" category="idle" />
      );
    });
    const root = component.root;
    const textElements = root.findAllByType(Text);
    expect(textElements.length).toBeGreaterThan(0);
    expect(textElements[0].props.children).toBe('Test Status');
  });
});
