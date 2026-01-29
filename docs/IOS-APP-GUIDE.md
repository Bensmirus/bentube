# Ben.Tube iOS App Guide

Your web app has been successfully configured as an iOS app! Here's what was set up and how to use it.

## What Was Done

1. **Capacitor Installed** - A tool that wraps your web app into a native iOS app
2. **iOS Project Created** - An Xcode project was generated in the `ios/` folder
3. **Plugins Added**:
   - Status Bar control
   - Splash Screen support
   - App Preferences storage
4. **Server Connection** - The app connects to your live website (https://bentube-h8oc.vercel.app)

## How It Works

The iOS app is a native wrapper around your website. This means:
- ✅ All features work exactly like the web version
- ✅ No need to rebuild the app when you update your website
- ✅ Users always get the latest version
- ✅ Can be submitted to the App Store
- ✅ Works like a real iOS app with native features

## Next Steps

### 1. Open the iOS App in Xcode

Run this command:
```bash
npm run ios:open
```

This will open Xcode with your iOS project.

### 2. Configure Your App in Xcode

Once Xcode opens, you'll need to set up a few things:

**a) Set Your Team (Required for running on device)**
1. Click on "App" in the left sidebar (top item)
2. Go to "Signing & Capabilities"
3. Select your Apple Developer account under "Team"

**b) Change Bundle Identifier (Optional)**
- The default is `com.bentube.app`
- You can change this to match your Apple Developer account
- Example: `com.yourname.bentube`

**c) Add App Icon (Optional)**
1. Find `ios/App/App/Assets.xcassets/AppIcon.appiconset/`
2. Replace the default icon with your custom icons
3. You'll need various sizes (see Apple's icon requirements)

### 3. Test the App

**Option A: On Simulator (No Apple Developer Account Needed)**
1. In Xcode, select a simulator from the device dropdown (top left)
2. Click the Play button (or press Cmd + R)
3. The app will launch in the iOS simulator

**Option B: On Your iPhone**
1. Connect your iPhone via USB
2. Select your iPhone from the device dropdown in Xcode
3. Click the Play button
4. You may need to trust the developer certificate on your iPhone (Settings > General > Device Management)

### 4. Make Changes

If you want to update the app:

**For website changes:**
- Just update your website - the app will automatically show the changes
- No need to rebuild or resubmit to the App Store

**For native features (icons, splash screens, etc.):**
1. Make changes in Xcode or the Capacitor config
2. Run: `npm run ios:sync`
3. Rebuild in Xcode

## Useful Commands

- `npm run ios:open` - Open the project in Xcode
- `npm run ios:sync` - Sync changes to the iOS project
- `npm run ios:run` - Build and run on a connected device

## Submitting to the App Store

When you're ready to publish:

1. **Join the Apple Developer Program** ($99/year)
2. **Configure your app** in App Store Connect
3. **Create app screenshots and description**
4. **Archive the app** in Xcode (Product > Archive)
5. **Submit for review** via Xcode

Apple typically takes 1-2 days to review apps.

## Important Notes

- The app requires an internet connection (it loads from your website)
- If your website goes down, the app won't work
- Keep your website URL the same, or you'll need to update the app
- The app will work on iPhone and iPad

## Configuration Files

- `capacitor.config.ts` - Main Capacitor configuration
- `ios/` folder - The Xcode project (don't delete this!)
- App connects to: https://bentube-h8oc.vercel.app

## Need Help?

- [Capacitor iOS Documentation](https://capacitorjs.com/docs/ios)
- [Apple Developer Documentation](https://developer.apple.com/documentation/)

---

Your app is ready to test! Run `npm run ios:open` to get started.
