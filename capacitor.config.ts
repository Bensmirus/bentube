import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bentube.app',
  appName: 'Ben.Tube',
  webDir: 'out',
  server: {
    url: 'https://ben-tube.com',
    cleartext: true
  },
  ios: {
    contentInset: 'always'
  }
};

export default config;
