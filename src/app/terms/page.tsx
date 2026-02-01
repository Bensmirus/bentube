'use client'

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-muted-foreground mb-8">Last updated: February 2025</p>

        <div className="space-y-8 text-sm leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold mb-3">1. Acceptance of Terms</h2>
            <p className="text-muted-foreground">
              By accessing or using Ben.Tube, you agree to be bound by these Terms of Service.
              If you do not agree to these terms, please do not use the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Description of Service</h2>
            <p className="text-muted-foreground">
              Ben.Tube is a personal YouTube content manager that allows you to:
            </p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground mt-2">
              <li>Import and organize your YouTube subscriptions into groups</li>
              <li>Track your watch progress across devices</li>
              <li>Add personal notes and tags to videos</li>
              <li>Watch YouTube videos within the app</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Account Requirements</h2>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>You must have a valid Google account to use Ben.Tube</li>
              <li>You must be at least 13 years old to use this service</li>
              <li>You are responsible for maintaining the security of your account</li>
              <li>One Ben.Tube account corresponds to one Google/YouTube account</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. YouTube Content</h2>
            <p className="text-muted-foreground">
              Ben.Tube displays content from YouTube. All YouTube videos, channel names, thumbnails,
              and related content are the property of their respective owners. Ben.Tube does not
              host or store video content.
            </p>
            <p className="text-muted-foreground mt-3">
              By using Ben.Tube, you also agree to comply with the{' '}
              <a
                href="https://www.youtube.com/t/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                YouTube Terms of Service
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Acceptable Use</h2>
            <p className="text-muted-foreground mb-2">You agree NOT to:</p>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>Use the service for any illegal purpose</li>
              <li>Attempt to access other users&apos; accounts or data</li>
              <li>Interfere with or disrupt the service</li>
              <li>Use automated tools to scrape or abuse the service</li>
              <li>Resell or redistribute access to the service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Subscriptions & Payments</h2>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>Ben.Tube offers both free tier (invite-only) and paid subscription options</li>
              <li>Paid subscriptions are billed monthly through Lemon Squeezy</li>
              <li>You can cancel your subscription at any time from Settings</li>
              <li>Refunds are handled on a case-by-case basis</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Service Availability</h2>
            <p className="text-muted-foreground">
              We strive to keep Ben.Tube available 24/7, but we do not guarantee uninterrupted
              access. The service may be temporarily unavailable for maintenance, updates, or
              due to factors beyond our control.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Data & Privacy</h2>
            <p className="text-muted-foreground">
              Your use of Ben.Tube is also governed by our{' '}
              <a
                href="/privacy"
                className="text-accent hover:underline"
              >
                Privacy Policy
              </a>
              , which explains how we collect, use, and protect your data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Account Termination</h2>
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>You can delete your account at any time from Settings</li>
              <li>We may suspend or terminate accounts that violate these terms</li>
              <li>Upon termination, all your data will be permanently deleted</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. Disclaimer of Warranties</h2>
            <p className="text-muted-foreground">
              Ben.Tube is provided &quot;as is&quot; without warranties of any kind. We do not guarantee
              that the service will meet your requirements or be error-free.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">11. Limitation of Liability</h2>
            <p className="text-muted-foreground">
              To the maximum extent permitted by law, Ben.Tube shall not be liable for any
              indirect, incidental, or consequential damages arising from your use of the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">12. Changes to Terms</h2>
            <p className="text-muted-foreground">
              We may update these terms from time to time. Continued use of the service after
              changes constitutes acceptance of the new terms. We will notify users of
              significant changes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">13. Contact</h2>
            <p className="text-muted-foreground">
              For questions about these terms, contact us on Instagram:{' '}
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

        <div className="mt-12 pt-8 border-t border-border flex gap-4">
          <a
            href="/"
            className="text-accent hover:underline"
          >
            ← Back to Ben.Tube
          </a>
          <span className="text-muted-foreground">|</span>
          <a
            href="/privacy"
            className="text-accent hover:underline"
          >
            Privacy Policy
          </a>
        </div>
      </div>
    </div>
  )
}
