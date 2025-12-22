import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mafitapay.app',
  appName: 'MafitaPay',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https'
  },
  plugins: {
    BiometricAuth: {
      androidTitle: "MafitaPay Authentication",
      androidSubtitle: "Verify your identity",
      androidConfirmationRequired: true,
      androidNegativeButtonText: "Cancel"
    }
  }
};

export default config;
