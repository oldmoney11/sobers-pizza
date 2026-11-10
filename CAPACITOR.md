# Sobers Pizza — Capacitor app wrapper

This wraps the existing Sobers website so it can be built for the Play Store and App Store. The live website is unchanged.

## App identity
- App ID: com.soberspizza.app
- App name: Sobers Pizza
- Web assets: dist/

## After a website update
```bash
npx cap sync
```

## Android (Play Store)
1. Install Android Studio.
2. Open the `android` folder in Android Studio.
3. Build > Generate Signed Bundle / APK > Android App Bundle.
4. Upload the AAB in Google Play Console.

## iOS (App Store)
1. You need a Mac with Xcode.
2. Open `ios/App/App.xcworkspace` in Xcode.
3. Set your Team and Bundle Identifier.
4. Archive and upload with Xcode or Transporter.

## Store accounts still required
- Google Play Console: $25 one-time
- Apple Developer Program: $99 per year

## Listing assets still needed
- App icon 512×512 (Play) and 1024×1024 (App Store)
- Phone screenshots
- Privacy policy URL
- Short and full description
