import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.com.edufinance.app',
  appName: 'EduFinance',
  webDir: 'www',
  backgroundColor: '#f0f4fa',
  ios: {
    contentInset: 'automatic'
  },
  android: {
    allowMixedContent: false
  }
};

export default config;
