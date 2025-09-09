import React, { useState, useEffect, ComponentType } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { lazyLoadingService } from '../services/lazyLoadingService';
import { logger } from '../utils/logger';

interface LazyComponentProps {
  componentName: string;
  fallback?: React.ComponentType<any>;
  loadingProps?: any;
  [key: string]: any;
}

interface LazyComponentState {
  Component: ComponentType<any> | null;
  isLoading: boolean;
  error: string | null;
}

// Lazy component loader
export class LazyComponent extends React.Component<LazyComponentProps, LazyComponentState> {
  constructor(props: LazyComponentProps) {
    super(props);
    this.state = {
      Component: null,
      isLoading: true,
      error: null
    };
  }

  async componentDidMount() {
    const { componentName } = this.props;

    try {
      // Try to get component synchronously first
      let Component = lazyLoadingService.getComponentSync(componentName);

      if (Component) {
        this.setState({ Component, isLoading: false });
      } else {
        // Load asynchronously
        Component = await lazyLoadingService.getComponent(componentName);
        this.setState({ Component, isLoading: false });
      }
    } catch (error) {
      logger.error(`Failed to load component ${componentName}:`, error);
      this.setState({
        isLoading: false,
        error: `Failed to load ${componentName}`
      });
    }
  }

  render() {
    const { Component, isLoading, error } = this.state;
    const { componentName, fallback: Fallback, loadingProps, ...otherProps } = this.props;

    if (error) {
      if (Fallback) {
        return <Fallback {...otherProps} />;
      }
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Component konnte nicht geladen werden</Text>
        </View>
      );
    }

    if (isLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#007AFF" />
          {loadingProps?.showText && (
            <Text style={styles.loadingText}>Lade {componentName}...</Text>
          )}
        </View>
      );
    }

    if (!Component) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Component nicht verfügbar</Text>
        </View>
      );
    }

    return <Component {...otherProps} />;
  }
}

// Hook version for functional components
export function useLazyComponent(componentName: string) {
  const [Component, setComponent] = useState<ComponentType<any> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadComponent = async () => {
      try {
        // Try sync first
        let component = lazyLoadingService.getComponentSync(componentName);

        if (!component) {
          // Load async
          component = await lazyLoadingService.getComponent(componentName);
        }

        if (isMounted) {
          setComponent(() => component);
          setIsLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load component');
          setIsLoading(false);
        }
      }
    };

    loadComponent();

    return () => {
      isMounted = false;
    };
  }, [componentName]);

  return { Component, isLoading, error };
}

// Preload components hook
export function usePreloadComponents(componentNames: string[]) {
  useEffect(() => {
    componentNames.forEach(componentName => {
      lazyLoadingService.preloadComponent(componentName);
    });
  }, [componentNames]);
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});