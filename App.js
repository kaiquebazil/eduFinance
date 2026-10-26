import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';

const APP_URL = 'https://kaiquebazil.github.io/eduFinance/';
const STORAGE_KEY = '@edufinance/web-local-storage-v1';
const ALLOWED_HOST = 'kaiquebazil.github.io';

export default function App() {
  const webView = useRef(null);
  const saveQueue = useRef(Promise.resolve());
  const [localStorageData, setLocalStorageData] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);

  const loadNativeStorage = useCallback(async () => {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed = saved ? JSON.parse(saved) : {};
      const safeData = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? Object.fromEntries(Object.entries(parsed).filter(([key, value]) =>
            typeof key === 'string' && typeof value === 'string'))
        : {};
      setLocalStorageData(safeData);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    loadNativeStorage();
  }, [loadNativeStorage]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack && webView.current) {
        webView.current.goBack();
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [canGoBack]);

  const persistMessage = useCallback(({ nativeEvent }) => {
    try {
      const message = JSON.parse(nativeEvent.data);
      if (message?.type !== 'edufinance-localstorage' ||
          !message.data || typeof message.data !== 'object' || Array.isArray(message.data)) return;

      const safeData = Object.fromEntries(Object.entries(message.data).filter(([key, value]) =>
        typeof key === 'string' && typeof value === 'string'));
      setLocalStorageData(safeData);
      const serialized = JSON.stringify(safeData);
      saveQueue.current = saveQueue.current
        .catch(() => {})
        .then(() => AsyncStorage.setItem(STORAGE_KEY, serialized));
      saveQueue.current.catch(() => {});
    } catch {
      // Ignore malformed messages from the web page.
    }
  }, []);

  const allowNavigation = useCallback((request) => {
    try {
      const url = new URL(request.url);
      return url.protocol === 'https:' && url.hostname === ALLOWED_HOST &&
        url.pathname.startsWith('/eduFinance/');
    } catch {
      return false;
    }
  }, []);

  if (loadError) {
    return (
      <SafeAreaView style={styles.center}>
        <StatusBar style="dark" backgroundColor="#f0f4fa" />
        <Text style={styles.title}>Não foi possível abrir o EduFinance</Text>
        <Text style={styles.message} onPress={() => {
          setLoadError(false);
          loadNativeStorage();
        }}>Toque para tentar novamente</Text>
      </SafeAreaView>
    );
  }

  if (localStorageData === null) {
    return (
      <SafeAreaView style={styles.center}>
        <StatusBar style="dark" backgroundColor="#f0f4fa" />
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.message}>Carregando seus dados…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" backgroundColor="#f0f4fa" />
      <WebView
        ref={webView}
        source={{ uri: APP_URL }}
        style={styles.webView}
        originWhitelist={[`https://${ALLOWED_HOST}`]}
        onShouldStartLoadWithRequest={allowNavigation}
        onMessage={persistMessage}
        onError={() => setLoadError(true)}
        onNavigationStateChange={({ canGoBack: hasHistory }) => setCanGoBack(hasHistory)}
        onHttpError={({ nativeEvent }) => {
          if (nativeEvent.statusCode >= 500) setLoadError(true);
        }}
        injectedJavaScriptObject={{ edufinanceLocalStorage: localStorageData }}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        setSupportMultipleWindows={false}
        pullToRefreshEnabled
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4fa' },
  webView: { flex: 1, backgroundColor: '#f0f4fa' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#f0f4fa',
  },
  title: { color: '#0f172a', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  message: { color: '#64748b', fontSize: 15, marginTop: 12, textAlign: 'center' },
});
