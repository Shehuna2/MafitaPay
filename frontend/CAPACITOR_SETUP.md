# Capacitor Native App Setup

This document describes the Capacitor integration for building native iOS and Android apps from the MafitaPay web application.

## Overview

MafitaPay now supports native mobile apps using Capacitor, with enhanced biometric authentication (fingerprint/Face ID) for iOS and Android platforms. The web application continues to work unchanged in browsers using WebAuthn.

## Features

- **Native Biometric Authentication**: Uses platform-native biometric APIs (Touch ID, Face ID, fingerprint)
- **Automatic Platform Detection**: Seamlessly switches between native and web implementations
- **Backward Compatible**: Existing web functionality remains unchanged
- **Build for App Stores**: Ready to build and publish to Apple App Store and Google Play Store

## Prerequisites

- Node.js and npm installed
- For iOS development: macOS with Xcode installed
- For Android development: Android Studio installed

## Building the Apps

### 1. Install Dependencies

```bash
cd frontend
npm install
```

### 2. Build the Web App

```bash
npm run build
```

### 3. Sync Native Projects

```bash
npm run cap:sync
```

This copies the web build to the native platforms and updates dependencies.

### 4. Open in Native IDEs

For iOS:
```bash
npm run cap:ios
```
This opens the project in Xcode where you can build and run on iOS simulator or device.

For Android:
```bash
npm run cap:android
```
This opens the project in Android Studio where you can build and run on Android emulator or device.

## Biometric Authentication

### How It Works

The `useBiometricAuth` hook automatically detects the platform:

- **Native Platforms (iOS/Android)**: Uses Capacitor's `@aparajita/capacitor-biometric-auth` plugin
  - Leverages native biometric APIs (Touch ID, Face ID, fingerprint)
  - More reliable and consistent than WebAuthn on mobile devices
  
- **Web Browsers**: Uses WebAuthn API
  - Works in modern browsers that support biometric authentication
  - Backward compatible with existing implementation

### Platform Detection

```javascript
import { Capacitor } from "@capacitor/core";

const isNativePlatform = Capacitor.isNativePlatform();
```

### Permissions

**iOS** (Info.plist):
- `NSFaceIDUsageDescription`: Required for Face ID usage

**Android** (AndroidManifest.xml):
- `android.permission.USE_BIOMETRIC`: For biometric authentication
- `android.permission.USE_FINGERPRINT`: For fingerprint authentication (legacy)

## Configuration

### Capacitor Config

Configuration is in `capacitor.config.ts`:

```typescript
{
  appId: 'com.mafitapay.app',
  appName: 'MafitaPay',
  webDir: 'dist',
  // ... other settings
}
```

### App ID and Name

Before publishing:
1. Change `appId` in `capacitor.config.ts` to your unique identifier
2. Update `appName` as needed
3. Update bundle identifiers in native projects

## Development Workflow

1. Make changes to web code in `src/`
2. Test in browser: `npm run dev`
3. Build: `npm run build`
4. Sync to native: `npm run cap:sync`
5. Open in IDE and test on device/emulator

## Live Reload for Development

To enable live reload on device during development:

```bash
npx cap run ios --livereload --external
# or
npx cap run android --livereload --external
```

## Publishing

### iOS App Store

1. Open in Xcode: `npm run cap:ios`
2. Configure signing and certificates
3. Archive and upload to App Store Connect
4. Submit for review

### Google Play Store

1. Open in Android Studio: `npm run cap:android`
2. Configure signing key
3. Build signed APK/AAB
4. Upload to Google Play Console
5. Submit for review

## Troubleshooting

### Build Fails

Ensure all dependencies are installed:
```bash
npm install
npm run build
npx cap sync
```

### Biometric Not Working

1. Check device has biometric hardware
2. Verify permissions in Info.plist (iOS) and AndroidManifest.xml (Android)
3. Ensure biometric is enrolled on the device

### Native Platforms Not Found

Re-add platforms:
```bash
npx cap add ios
npx cap add android
```

## Additional Resources

- [Capacitor Documentation](https://capacitorjs.com/docs)
- [Biometric Auth Plugin](https://github.com/aparajita/capacitor-biometric-auth)
- [iOS App Distribution](https://developer.apple.com/app-store/)
- [Android App Distribution](https://developer.android.com/distribute)
