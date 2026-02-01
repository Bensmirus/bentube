'use client'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-muted-foreground mb-8">Last updated: February 2025</p>

        <div className="space-y-8 text-sm leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold mb-3">What is Ben.Tube?</h2>
            <p className="text-muted-foreground">
              Ben.Tube is a personal YouTube content manager that helps you organize your YouTube
              subscriptions into topic-based groups, track watch progress, and manage your video library.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">What Data We Collect</h2>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li><strong>Google Account Info:</strong> Your email address and name (for login)</li>
              <li><strong>YouTube Data:</strong> Your subscribed channels and their public videos (read-only access)</li>
              <li><strong>Usage Data:</strong> Watch progress, favorites, and notes you create within the app</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">How We Use Your Data</h2>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>To display your YouTube subscriptions and videos within the app</li>
              <li>To save your watch progress and sync it across your devices</li>
              <li>To organize channels into groups you create</li>
              <li>To store notes and tags you add to videos</li>
            </ul>
            <p className="mt-3 text-muted-foreground">
              We <strong>never</strong> modify your YouTube account. Access is read-only.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Data Storage & Security</h2>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>Your data is stored securely on Supabase (hosted on AWS)</li>
              <li>Each user&apos;s data is completely isolated from other users</li>
              <li>We use industry-standard encryption for data in transit (HTTPS)</li>
              <li>Your YouTube tokens are stored encrypted and never shared</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Data Sharing</h2>
            <p className="text-muted-foreground">
              We do <strong>not</strong> sell, rent, or share your personal data with any third parties.
              Your data is only used to provide the Ben.Tube service to you.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">YouTube API Services</h2>
            <p className="text-muted-foreground">
              Ben.Tube uses the YouTube API Services to access your subscriptions and video data.
              By using Ben.Tube, you also agree to be bound by the{' '}
              <a
                href="https://www.youtube.com/t/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                YouTube Terms of Service
              </a>
              {' '}and{' '}
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                Google Privacy Policy
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Your Rights</h2>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li><strong>Access:</strong> You can view all your data within the app</li>
              <li><strong>Delete:</strong> You can delete your account and all data from Settings</li>
              <li><strong>Revoke:</strong> You can revoke YouTube access anytime via your{' '}
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  Google Account settings
                </a>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Data Retention</h2>
            <p className="text-muted-foreground">
              We retain your data for as long as you have an active account. When you delete your
              account, all your data is permanently erased immediately.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Cookies</h2>
            <p className="text-muted-foreground">
              We use essential cookies only for authentication (keeping you logged in).
              We do not use tracking cookies or analytics that follow you across the web.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Children&apos;s Privacy</h2>
            <p className="text-muted-foreground">
              Ben.Tube is not intended for children under 13. We do not knowingly collect
              data from children under 13.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Changes to This Policy</h2>
            <p className="text-muted-foreground">
              We may update this policy from time to time. We will notify users of significant
              changes via the app or email.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">Contact</h2>
            <p className="text-muted-foreground">
              For privacy questions or concerns, contact us on Instagram:{' '}
              <a
                href="https://www.instagram.com/ben.ware_tools/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                @ben.ware_tools
              </a>
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-border">
          <a
            href="/"
            className="text-accent hover:underline"
          >
            ← Back to Ben.Tube
          </a>
        </div>
      </div>
    </div>
  )
}
